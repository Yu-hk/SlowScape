package com.slowscape.service;

import com.slowscape.model.VideoAsset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * r2v 参考图自动挑选服务 — 在生成 r2v 视频前，从素材库自动挑选
 * 与起始图/描述互补的参考图，让画面在两张图之间自然过渡。
 *
 * 策略（按可用性逐级降级）：
 * 1. 用户已提供 >=2 张 → 尊重用户选择，原样返回。
 * 2. 用户 1 张（起始图）+ prompt → 用 prompt 文本做向量相似度搜索，从库中选互补的过渡景。
 * 3. 用户 0 张 → 自动挑起始图 + 互补过渡景（均来自素材库）。
 * 4. 向量服务不可用 → 退化为按场景标签互补 / 随机不同景。
 */
@Service
public class ReferenceSelectorService {
    private static final Logger log = LoggerFactory.getLogger(ReferenceSelectorService.class);

    private final LibraryService library;
    private final EmbeddingService embedding;
    private final ConfigService config;

    public ReferenceSelectorService(LibraryService library, EmbeddingService embedding, ConfigService config) {
        this.library = library;
        this.embedding = embedding;
        this.config = config;
    }

    public boolean isEnabled() {
        return "true".equalsIgnoreCase(config.get("feature.r2v.auto-select", "true"));
    }

    /** 主入口：返回最终用于 r2v 提交的参考图列表（poster URL）。 */
    public List<String> selectForR2V(String prompt, List<String> userRefs) {
        if (!isEnabled()) return clean(userRefs);

        List<String> refs = clean(userRefs);
        if (refs.size() >= 2) {
            log.info("[RefSelect] 用户已提供 {} 张参考图，尊重原选择", refs.size());
            return refs;
        }

        if (refs.size() == 1) {
            String end = pickComplementary(refs.get(0), prompt);
            if (end != null && !end.equals(refs.get(0))) {
                List<String> enriched = new ArrayList<>(refs);
                enriched.add(end);
                log.info("[RefSelect] 自动补全过渡参考图: start={}, end={}", refs.get(0), end);
                return enriched;
            }
            return refs; // 没挑到，退化为单图（i2v 行为）
        }

        // 0 张：从库挑起止
        String start = pickStart(prompt);
        if (start == null) return List.of();
        List<String> chosen = new ArrayList<>();
        chosen.add(start);
        String end = pickComplementary(start, prompt);
        if (end != null && !end.equals(start)) chosen.add(end);
        log.info("[RefSelect] 自动挑选起止参考图: start={}, end={}", start, end);
        return chosen;
    }

    /** 给前端预览用：返回 AI 将使用的起止参考图 + 理由 + 建议 prompt。 */
    public Map<String, Object> preview(String prompt) {
        List<String> chosen = selectForR2V(prompt, List.of());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("start", chosen.isEmpty() ? null : chosen.get(0));
        r.put("end", chosen.size() > 1 ? chosen.get(1) : null);
        r.put("references", chosen);
        r.put("strategy", embedding.isConfigured() ? "embedding" : "fallback");
        r.put("reason", chosen.size() > 1
                ? "基于素材库挑选起始景与互补过渡景，让画面在参考图之间自然演变"
                : "素材库暂无足够素材，将使用单图生成");
        r.put("suggested_prompt", buildR2VPrompt(prompt));
        return r;
    }

    private String pickStart(String prompt) {
        List<VideoAsset> items = library.allItems();
        if (items.isEmpty()) return null;
        if (embedding.isConfigured() && prompt != null && !prompt.isBlank()) {
            String p = embedding.searchByText(prompt, null);
            if (p != null) return p;
        }
        return items.get(new Random().nextInt(items.size())).getPoster();
    }

    private String pickComplementary(String startPoster, String prompt) {
        VideoAsset startAsset = library.getByPoster(startPoster);
        String startVideoId = startAsset != null ? startAsset.getVideo_id() : null;

        String concept;
        if (prompt != null && !prompt.isBlank()) {
            concept = prompt;
        } else if (startAsset != null && startAsset.getKey_elements() != null && !startAsset.getKey_elements().isEmpty()) {
            concept = "从" + String.join("、", startAsset.getKey_elements()) + "缓缓过渡到另一季节的同一类风景";
        } else {
            concept = "舒缓自然风景";
        }

        if (embedding.isConfigured()) {
            String match = embedding.searchByText(concept, startVideoId);
            if (match != null && !match.equals(startPoster)) return match;
        }

        // fallback：挑一张场景标签与起始图不同的库素材
        List<VideoAsset> items = library.allItems();
        for (VideoAsset a : items) {
            if (a.getPoster().equals(startPoster)) continue;
            if (startAsset != null && startAsset.getScene_tags() != null && a.getScene_tags() != null
                    && !a.getScene_tags().stream().anyMatch(startAsset.getScene_tags()::contains)) {
                return a.getPoster();
            }
        }
        // 再退一步：任意不同的图
        for (VideoAsset a : items) {
            if (!a.getPoster().equals(startPoster)) return a.getPoster();
        }
        return null;
    }

    /** 构造 r2v 专用过渡 prompt（供 preview 与 provider 共用语义）。 */
    public String buildR2VPrompt(String raw) {
        String empty = config.get("prompt.happyhorse.empty", "舒缓宁静的风景，缓慢推移");
        String suffix = config.get("prompt.happyhorse.suffix", "，舒缓宁静、缓慢流动、自然过渡、电影感");
        String r2vSuffix = config.get("prompt.happyhorse.r2v.suffix", "，画面在参考图之间缓缓自然过渡、同一景有机生长");
        String base = (raw == null || raw.isBlank()) ? empty : raw.trim();
        return base + suffix + r2vSuffix;
    }

    private static List<String> clean(List<String> refs) {
        if (refs == null) return new ArrayList<>();
        return refs.stream().filter(Objects::nonNull).filter(r -> !r.isBlank()).collect(Collectors.toList());
    }
}
