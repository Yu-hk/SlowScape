package com.slowscape.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * 应用监控指标采集服务 — 内存计数器。
 * 记录请求量、错误率、P50/P95/P99 延时、生成任务统计、上游 API 健康、大模型调用详细指标。
 */
@Service
public class MetricsService {
    private static final Logger log = LoggerFactory.getLogger(MetricsService.class);

    // 全局
    private final AtomicLong totalRequests = new AtomicLong(0);
    private final AtomicLong totalErrors = new AtomicLong(0);
    private final AtomicLong totalDuration = new AtomicLong(0);

    // 按路径
    private final ConcurrentHashMap<String, PathMetrics> perPath = new ConcurrentHashMap<>();

    // 生成任务
    private final AtomicLong totalTasks = new AtomicLong(0);
    private final AtomicLong succeededTasks = new AtomicLong(0);
    private final AtomicLong failedTasks = new AtomicLong(0);
    private final AtomicLong mockedTasks = new AtomicLong(0); // 回退 Mock

    // 上游 API 健康
    private volatile boolean dashscopeHealthy = false;
    private volatile Instant lastHealthCheck = Instant.now();

    // ======== 大模型调用监控 ========
    // 按模型名统计
    private final ConcurrentHashMap<String, LlmMetrics> llmStats = new ConcurrentHashMap<>();

    /** 预置模型定价（元/调用或元/秒），用于成本估算 */
    private static final Map<String, double[]> PRICING = new LinkedHashMap<>();
    static {
        PRICING.put("wan2.2-kf2v-flash", new double[]{0.20, 0});
        PRICING.put("wanx2.1-kf2v-plus", new double[]{0.48, 0});
        PRICING.put("wan2.7-t2v-2026-06-12", new double[]{0.20, 0});
        PRICING.put("wan2.7-t2v", new double[]{0.20, 0});
        PRICING.put("wan2.7-r2v-2026-06-12", new double[]{0.68, 0});
        PRICING.put("happyhorse-1.1-i2v", new double[]{0.54, 0});  // 图生视频 ¥0.54/s
        PRICING.put("qwen-vl-plus", new double[]{0, 0.003});
        PRICING.put("text-embedding-v2", new double[]{0, 0.0005});
    }

    private static class LlmMetrics {
        final AtomicLong calls = new AtomicLong(0);
        final AtomicLong succeeded = new AtomicLong(0);
        final AtomicLong failed = new AtomicLong(0);
        final AtomicLong totalLatencyMs = new AtomicLong(0);
        final AtomicLong totalInputTokens = new AtomicLong(0);
        final AtomicLong totalOutputTokens = new AtomicLong(0);
        final ConcurrentHashMap<String, AtomicInteger> errorCodes = new ConcurrentHashMap<>();

        void recordCall(boolean success, long latencyMs, int inputTokens, int outputTokens, String errorCode) {
            calls.incrementAndGet();
            totalLatencyMs.addAndGet(latencyMs);
            if (success) succeeded.incrementAndGet();
            else {
                failed.incrementAndGet();
                errorCodes.computeIfAbsent(errorCode != null ? errorCode : "unknown", k -> new AtomicInteger(0)).incrementAndGet();
            }
            if (inputTokens > 0) totalInputTokens.addAndGet(inputTokens);
            if (outputTokens > 0) totalOutputTokens.addAndGet(outputTokens);
        }
    }

    // 延时样本（用于百分位计算）
    private static final int MAX_SAMPLES = 2000;
    private final ConcurrentHashMap<String, List<Long>> latencySamples = new ConcurrentHashMap<>();

    private static class PathMetrics {
        final AtomicLong count = new AtomicLong(0);
        final AtomicLong errors = new AtomicLong(0);
        final AtomicLong totalMs = new AtomicLong(0);
    }

    // ---- 请求记录 ----
    public void recordRequest(String path, int statusCode, long durationMs) {
        totalRequests.incrementAndGet();
        totalDuration.addAndGet(durationMs);
        if (statusCode >= 400) totalErrors.incrementAndGet();

        PathMetrics pm = perPath.computeIfAbsent(path, k -> new PathMetrics());
        pm.count.incrementAndGet();
        pm.totalMs.addAndGet(durationMs);
        if (statusCode >= 400) pm.errors.incrementAndGet();

        // 采样延时（按路径）
        List<Long> samples = latencySamples.computeIfAbsent(path, k -> Collections.synchronizedList(new ArrayList<>()));
        synchronized (samples) {
            if (samples.size() < MAX_SAMPLES) samples.add(durationMs);
        }
    }

    // ---- 生成任务记录 ----
    public void recordTaskCreated() { totalTasks.incrementAndGet(); }
    public void recordTaskSucceeded() { succeededTasks.incrementAndGet(); }
    public void recordTaskFailed() { failedTasks.incrementAndGet(); }
    public void recordTaskMocked() { mockedTasks.incrementAndGet(); }

    // ---- DashScope 健康 ----
    public void setDashscopeHealthy(boolean healthy) {
        this.dashscopeHealthy = healthy;
        this.lastHealthCheck = Instant.now();
    }

    // ---- 大模型调用记录 ----
    /** 记录一次大模型 API 调用结果。modelName 如 wan2.2-kf2v-flash / qwen-vl-plus / text-embedding-v2 */
    public void recordLlmCall(String modelName, boolean success, long latencyMs,
                               int inputTokens, int outputTokens, String errorCode) {
        LlmMetrics stats = llmStats.computeIfAbsent(modelName, k -> new LlmMetrics());
        stats.recordCall(success, latencyMs, inputTokens, outputTokens, errorCode);
        // 任意模型调用成功 = DashScope 健康
        if (success) setDashscopeHealthy(true);
    }

    // ---- 查询 ----
    public Map<String, Object> snapshot() {
        long total = totalRequests.get();
        long duration = totalDuration.get();
        double avgMs = total > 0 ? (double) duration / total : 0;

        // 按路径
        List<Map<String, Object>> paths = perPath.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().count.get(), a.getValue().count.get()))
                .limit(20)
                .map(e -> {
                    var pm = e.getValue();
                    long c = pm.count.get();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("path", e.getKey());
                    m.put("count", c);
                    m.put("errors", pm.errors.get());
                    m.put("avg_ms", c > 0 ? Math.round(pm.totalMs.get() * 10.0 / c) / 10.0 : 0);
                    // 百分位
                    var samples = latencySamples.get(e.getKey());
                    if (samples != null && !samples.isEmpty()) {
                        synchronized (samples) {
                            int size = samples.size();
                            long[] sorted = samples.stream().mapToLong(Long::longValue).sorted().toArray();
                            m.put("p50_ms", sorted[(int) (size * 0.50)]);
                            m.put("p95_ms", sorted[(int) (size * 0.95)]);
                            m.put("p99_ms", sorted[(int) (size * 0.99)]);
                        }
                    }
                    return m;
                }).collect(Collectors.toList());

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("uptime", System.currentTimeMillis());
        r.put("total_requests", total);
        r.put("total_errors", totalErrors.get());
        r.put("error_rate", total > 0 ? Math.round(totalErrors.get() * 1000.0 / total) / 10.0 + "%" : "0%");
        r.put("avg_latency_ms", Math.round(avgMs * 10.0) / 10.0);

        // 延时分布（全局）
        long[] allSamples = latencySamples.values().stream()
                .flatMap(Collection::stream).mapToLong(Long::longValue).sorted().toArray();
        if (allSamples.length > 0) {
            r.put("global_p50_ms", allSamples[(int) (allSamples.length * 0.50)]);
            r.put("global_p95_ms", allSamples[(int) (allSamples.length * 0.95)]);
            r.put("global_p99_ms", allSamples[(int) (allSamples.length * 0.99)]);
        }

        // 生成任务
        Map<String, Object> tasks = new LinkedHashMap<>();
        tasks.put("total", totalTasks.get());
        tasks.put("succeeded", succeededTasks.get());
        tasks.put("failed", failedTasks.get());
        tasks.put("mocked", mockedTasks.get());
        long created = totalTasks.get();
        tasks.put("success_rate", created > 0 ? Math.round(succeededTasks.get() * 1000.0 / created) / 10.0 + "%" : "0%");
        r.put("generation_tasks", tasks);

        // 上游健康
        Map<String, Object> upstream = new LinkedHashMap<>();
        upstream.put("dashscope", dashscopeHealthy ? "healthy" : "unknown");
        upstream.put("last_check", lastHealthCheck.toString());
        r.put("upstream", upstream);

        // 大模型调用
        List<Map<String, Object>> llmModels = llmStats.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().calls.get(), a.getValue().calls.get()))
                .map(e -> {
                    var s = e.getValue();
                    long c = s.calls.get();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("model", e.getKey());
                    m.put("calls", c);
                    m.put("succeeded", s.succeeded.get());
                    m.put("failed", s.failed.get());
                    m.put("success_rate", c > 0 ? Math.round(s.succeeded.get() * 1000.0 / c) / 10.0 + "%" : "0%");
                    m.put("avg_latency_ms", c > 0 ? Math.round(s.totalLatencyMs.get() * 10.0 / c) / 10.0 : 0);
                    m.put("total_input_tokens", s.totalInputTokens.get());
                    m.put("total_output_tokens", s.totalOutputTokens.get());

                    // 成本估算
                    double[] price = PRICING.getOrDefault(e.getKey(), new double[]{0.005, 0.002});
                    double genCost = price[0] > 0 ? (c * 5 * price[0]) : 0; // wan 按 5s/条估算
                    double tokenCost = (s.totalInputTokens.get() + s.totalOutputTokens.get()) / 1000.0 * price[1];
                    m.put("estimated_cost_yuan", Math.round((genCost + tokenCost) * 100.0) / 100.0);

                    // 错误分布
                    Map<String, Integer> errors = new LinkedHashMap<>();
                    s.errorCodes.forEach((code, cnt) -> errors.put(code, cnt.get()));
                    m.put("error_breakdown", errors);
                    return m;
                }).collect(Collectors.toList());
        r.put("llm_models", llmModels);

        // 按路径
        r.put("paths", paths);
        return r;
    }
}
