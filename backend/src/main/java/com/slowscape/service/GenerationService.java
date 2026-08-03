package com.slowscape.service;

import com.slowscape.entity.GenerationTaskEntity;
import com.slowscape.entity.VideoAssetEntity;
import com.slowscape.model.GenerationTask;
import com.slowscape.model.VideoAsset;
import com.slowscape.repo.GenerationTaskRepo;
import com.slowscape.repo.VideoAssetRepo;
import com.slowscape.service.provider.VideoProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

import jakarta.persistence.EntityManager;

@Service
public class GenerationService {
    private static final Logger log = LoggerFactory.getLogger(GenerationService.class);

    private final ProviderRouter router;
    private final LibraryService library;
    private final ImageAnalyzerService imageAnalyzer;
    private final GenerationTaskRepo taskRepo;
    private final VideoAssetRepo assetRepo;
    private final MetricsService metrics;
    private final ConfigService config;
    private final ReferenceSelectorService refSelector;

    private final Semaphore concurrencyLimit = new Semaphore(3);
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(5);
    private final EntityManager entityManager;

    public GenerationService(ProviderRouter router, LibraryService library,
                              ImageAnalyzerService imageAnalyzer, GenerationTaskRepo taskRepo,
                              VideoAssetRepo assetRepo, EntityManager entityManager,
                              MetricsService metrics, ConfigService config,
                              ReferenceSelectorService refSelector) {
        this.router = router; this.library = library;
        this.imageAnalyzer = imageAnalyzer; this.taskRepo = taskRepo; this.assetRepo = assetRepo;
        this.entityManager = entityManager; this.metrics = metrics;
        this.config = config; this.refSelector = refSelector;
    }

    /** 创建并调度生成任务。自动补全尾帧（仅对需要首尾帧的模型）。 */
    public GenerationTask createTask(String prompt, int duration, String resolution, String qualityTier,
                                      String aspectRatio, List<String> references) {
        String taskId = UUID.randomUUID().toString();
        GenerationTask task = new GenerationTask(taskId, prompt);
        task.setCreated_at(Instant.now().toString());

        // 先选 provider，按需决定要不要补尾帧
        VideoProvider provider = router.selectProvider(qualityTier);
        boolean needsKeyframe = provider != null && "wan".equals(provider.name());

        if (needsKeyframe && references != null && references.size() == 1) {
            String matched = imageAnalyzer.autoMatchLastFrame(references.get(0), library);
            if (matched != null) {
                List<String> enriched = new ArrayList<>(references);
                enriched.add(matched);
                references = enriched;
                log.info("[Generation] 自动补全尾帧: first={}, last={}", enriched.get(0), enriched.get(1));
            }
        }

        // r2v 自动挑选互补参考图（happyhorse + r2v 模型 + 用户未给满 2 张）
        if (provider != null && "happyhorse".equals(provider.name())) {
            String hhModel = config.get("happyhorse.model", "happyhorse-1.1-i2v");
            if (hhModel.contains("r2v") && refSelector.isEnabled()
                    && (references == null || references.size() < 2)) {
                references = refSelector.selectForR2V(prompt, references);
                log.info("[Generation] r2v 自动选参考图完成: count={}", references == null ? 0 : references.size());
            }
        }

        // 存 task 到 DB
        saveTask(task);
        metrics.recordTaskCreated();
        schedule(task, duration, resolution, qualityTier, aspectRatio, references);
        return task;
    }

    private void saveTask(GenerationTask task) {
        GenerationTaskEntity e = new GenerationTaskEntity();
        e.setTaskId(task.getTask_id());
        e.setPrompt(task.getPrompt());
        e.setStatus(task.getStatus());
        e.setProvider(task.getProvider());
        e.setProviderTaskId(task.getProvider_task_id());
        e.setErrorCode(task.getError() != null ? task.getError().getCode() : null);
        e.setErrorMessage(task.getError() != null ? task.getError().getMessage() : null);
        e.setCreatedAt(task.getCreated_at());
        e.setUpdatedAt(task.getUpdated_at());
        taskRepo.save(e);
    }

    private void updateTaskStatus(GenerationTask task) {
        taskRepo.findById(task.getTask_id()).ifPresent(e -> {
            e.setStatus(task.getStatus());
            e.setProvider(task.getProvider());
            e.setProviderTaskId(task.getProvider_task_id());
            e.setErrorCode(task.getError() != null ? task.getError().getCode() : null);
            e.setErrorMessage(task.getError() != null ? task.getError().getMessage() : null);
            e.setUpdatedAt(task.getUpdated_at());
            taskRepo.save(e);
        });
    }

    private void addToFeed(VideoAsset asset, GenerationTask task) {
        assetRepo.save(VideoAssetEntity.fromModel(asset));
        taskRepo.findById(task.getTask_id()).ifPresent(e -> {
            e.setAssetVideoId(asset.getVideo_id());
            taskRepo.save(e);
        });
    }

    private void schedule(GenerationTask task, int duration, String resolution,
                          String qualityTier, String aspectRatio, List<String> references) {
        VideoProvider provider = router.selectProvider(qualityTier);
        if (provider != null && provider.isConfigured()) {
            runProvider(provider, task, duration, resolution, aspectRatio, references);
        } else {
            scheduleMock(task, duration, resolution, references);
        }
    }

    private void scheduleMock(GenerationTask task, int duration, String resolution, List<String> references) {
        scheduler.schedule(() -> {
            if (isTerminal(task)) return;
            task.setStatus("processing"); task.setUpdated_at(Instant.now().toString());
            updateTaskStatus(task);
            scheduler.schedule(() -> {
                if (isTerminal(task)) return;
                VideoAsset mock = buildMockAsset(task, duration, resolution, references);
                addToFeed(mock, task);
                task.setAsset(mock); task.setStatus("succeeded");
                task.setUpdated_at(Instant.now().toString()); updateTaskStatus(task);
                metrics.recordTaskSucceeded();
            }, 3000, TimeUnit.MILLISECONDS);
        }, 1500, TimeUnit.MILLISECONDS);
    }

    private void runProvider(VideoProvider provider, GenerationTask task, int duration,
                              String resolution, String aspectRatio, List<String> references) {
        scheduler.submit(() -> {
            try {
                String providerTaskId = provider.submit(task.getPrompt(), references,
                        String.valueOf(duration), resolution, aspectRatio);
                task.setProvider(provider.name()); task.setProvider_task_id(providerTaskId);
                task.setStatus("processing"); task.setUpdated_at(Instant.now().toString()); updateTaskStatus(task);

                long pollInterval = provider.getPollInterval();
                long pollTimeout = provider.getPollTimeout();
                long startedAt = System.currentTimeMillis();

                ScheduledFuture<?>[] handle = new ScheduledFuture<?>[1];
                handle[0] = scheduler.scheduleAtFixedRate(() -> {
                    try {
                        if (isTerminal(task)) return;
                        if (System.currentTimeMillis() - startedAt > pollTimeout) {
                            fallbackToMock(task, duration, resolution, references, provider.name() + " 超时");
                            return;
                        }
                        VideoProvider.PollResult pr = provider.poll(providerTaskId);
                        if ("succeeded".equals(pr.status)) {
                            if (pr.videoUrl == null || pr.videoUrl.isBlank()) {
                                fallbackToMock(task, duration, resolution, references, provider.name() + " 无视频 URL");
                                return;
                            }
                            VideoAsset asset = buildAssetFromProvider(task, duration, resolution, references, pr.videoUrl, provider.name());
                            addToFeed(asset, task);
                            task.setAsset(asset); task.setStatus("succeeded");
                            task.setUpdated_at(Instant.now().toString()); updateTaskStatus(task);
                            metrics.recordTaskSucceeded();
                        } else if ("failed".equals(pr.status)) {
                            fallbackToMock(task, duration, resolution, references, provider.name() + " 任务失败");
                        }
                    } catch (Exception e) { log.warn("[generation] poll error: {}", e.getMessage()); }
                }, 0, pollInterval, TimeUnit.MILLISECONDS);

                final ScheduledFuture<?> hf = handle[0];
                scheduler.schedule(() -> { if (hf != null && !hf.isDone()) hf.cancel(false); }, pollTimeout + 1000, TimeUnit.MILLISECONDS);
            } catch (RuntimeException e) {
                String msg = e.getMessage() != null ? e.getMessage() : "";
                if (msg.contains("业务错误")) {
                    log.warn("[generation] 业务错误: {}", msg);
                    failTask(task, "PROVIDER_BUSINESS_ERROR", msg);
                } else {
                    log.warn("[generation] 提交失败: {}", msg);
                    fallbackToMock(task, duration, resolution, references, provider.name() + " 提交失败");
                }
            } catch (Exception e) {
                log.warn("[generation] 提交失败: {}", e.getMessage());
                fallbackToMock(task, duration, resolution, references, provider.name() + " 提交失败");
            }
        });
    }

    // ---- fallback / fail ----
    private void fallbackToMock(GenerationTask task, int duration, String resolution, List<String> references, String reason) {
        if (isTerminal(task)) return;
        log.warn("[generation] 回退 Mock: {}", reason);
        metrics.recordTaskMocked();
        VideoAsset mock = buildMockAsset(task, duration, resolution, references);
        addToFeed(mock, task);
        task.setAsset(mock); task.setStatus("succeeded"); task.setUpdated_at(Instant.now().toString());
        updateTaskStatus(task);
    }

    private void failTask(GenerationTask task, String code, String message) {
        if (isTerminal(task)) return;
        metrics.recordTaskFailed();
        task.setStatus("failed"); task.setError(new GenerationTask.TaskError(code, message));
        task.setUpdated_at(Instant.now().toString()); updateTaskStatus(task);
    }

    // ---- asset builders ----
    private VideoAsset buildMockAsset(GenerationTask task, int duration, String resolution, List<String> references) {
        VideoAsset base = library.pickByScene(null);
        VideoAsset a = deepCopy(base);
        a.setVideo_id(UUID.randomUUID().toString());
        String title = task.getPrompt() != null ? task.getPrompt().trim() : "";
        if (title.length() > 16) title = title.substring(0, 16);
        if (title.isBlank()) title = "AI 渐变风景 #" + (assetRepo.countBySource("wan") + 1);
        a.setTitle(title);
        a.setCreated_at(Instant.now().toString());
        a.setSource(null);
        return a;
    }

    private VideoAsset buildAssetFromProvider(GenerationTask task, int duration, String resolution,
                                                List<String> references, String videoUrl, String providerName) {
        String title = "";
        String raw = task.getPrompt() != null ? task.getPrompt().trim() : "";
        if (!raw.isBlank()) {
            String slice = raw.substring(0, Math.min(raw.length(), 16));
            if (!slice.chars().anyMatch(c -> c == '\uFFFD')) title = slice;
        }
        if (title.isBlank()) title = "AI 渐变风景 #" + (assetRepo.countBySource(providerName) + 1);
        VideoAsset a = new VideoAsset();
        a.setVideo_id(UUID.randomUUID().toString());
        a.setTitle(title);
        a.setPoster(references != null && !references.isEmpty() ? references.get(0) : videoUrl);
        a.setPreview(videoUrl); a.setMaster(videoUrl);
        a.setDuration(duration > 0 ? duration : 5);
        a.setWidth(1920); a.setHeight(1080);
        a.setResolution(resolution != null ? resolution : "1080p");
        a.setLoop(false);
        a.setScene_tags(List.of("ai_generated", providerName));
        a.setReferences(references != null ? references : List.of());
        a.setCreated_at(Instant.now().toString());
        a.setSource(providerName);
        if (references != null && !references.isEmpty()) {
            try {
                VideoAsset ref = library.getByPoster(references.get(0));
                if (ref != null) a.setKey_elements(ref.getKey_elements());
            } catch (Exception ex) {
                log.warn("[generation] 参考图元数据查询失败（忽略，不影响成片）: {}", ex.getMessage());
            }
        }
        return a;
    }

    // ---- query ----
    public GenerationTask getTask(String taskId) {
        return taskRepo.findById(taskId).map(e -> {
            GenerationTask t = new GenerationTask(e.getTaskId(), e.getPrompt());
            t.setStatus(e.getStatus());
            t.setProvider(e.getProvider());
            t.setProvider_task_id(e.getProviderTaskId());
            t.setCreated_at(e.getCreatedAt());
            t.setUpdated_at(e.getUpdatedAt());
            if (e.getErrorCode() != null) t.setError(new GenerationTask.TaskError(e.getErrorCode(), e.getErrorMessage()));
            if (e.getAssetVideoId() != null) {
                assetRepo.findById(e.getAssetVideoId()).ifPresent(ae -> t.setAsset(ae.toModel()));
            }
            return t;
        }).orElse(null);
    }

    public GenerationTask cancelTask(String taskId) {
        GenerationTask t = getTask(taskId);
        if (t == null) return null;
        if (!List.of("queued", "processing").contains(t.getStatus())) return t;
        t.setStatus("cancelled"); t.setUpdated_at(Instant.now().toString());
        updateTaskStatus(t);
        return t;
    }

    /** 预览 r2v 自动选图结果（供前端在生成前展示 AI 将使用的起止参考图）。 */
    public Map<String, Object> suggestReferences(String prompt) {
        return refSelector.preview(prompt);
    }

    public VideoAsset getVideo(String videoId) {
        return assetRepo.findById(videoId).map(VideoAssetEntity::toModel).orElse(null);
    }

    public VideoAsset removeFromFeed(String videoId) {
        return assetRepo.findById(videoId).map(e -> {
            entityManager.remove(e);  // 直接删实体
            return e.toModel();
        }).orElse(null);
    }

    public Map<String, Object> listFeed(int page, int limit) {
        var pageable = org.springframework.data.domain.PageRequest.of(page - 1, limit,
                org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "createdAt"));
        var pg = assetRepo.findAll(pageable);
        List<VideoAsset> items = pg.getContent().stream().map(VideoAssetEntity::toModel).collect(Collectors.toList());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("items", items); r.put("total", pg.getTotalElements());
        r.put("page", page); r.put("limit", limit);
        r.put("has_more", pg.hasNext());
        return r;
    }

    public int activeCount() {
        List<String> active = List.of("queued", "processing");
        return taskRepo.findAll().stream()
            .map(e -> e.getStatus() != null ? e.getStatus() : "")
            .filter(active::contains)
            .mapToInt(x -> 1).sum();
    }

    private boolean isTerminal(GenerationTask t) {
        return List.of("succeeded", "failed", "cancelled").contains(t.getStatus());
    }

    private static VideoAsset deepCopy(VideoAsset src) {
        VideoAsset a = new VideoAsset();
        a.setVideo_id(src.getVideo_id()); a.setTitle(src.getTitle());
        a.setPoster(src.getPoster()); a.setPreview(src.getPreview()); a.setMaster(src.getMaster());
        a.setDuration(src.getDuration()); a.setWidth(src.getWidth()); a.setHeight(src.getHeight());
        a.setResolution(src.getResolution()); a.setLoop(src.isLoop());
        a.setScene_tags(new ArrayList<>(src.getScene_tags() != null ? src.getScene_tags() : List.of()));
        a.setReferences(new ArrayList<>(src.getReferences() != null ? src.getReferences() : List.of()));
        a.setCreated_at(src.getCreated_at()); a.setSource(src.getSource());
        a.setKey_elements(src.getKey_elements() != null ? new ArrayList<>(src.getKey_elements()) : null);
        return a;
    }
}
