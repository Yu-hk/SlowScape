package com.slowscape.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.slowscape.model.VideoAsset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 图片视觉元素分析服务 — 用 Qwen-VL 分析图片内容，提取关键元素。
 * 元素用于自动匹配首帧→最合适的尾帧。
 *
 * 调用 DashScope Qwen-VL API：
 * POST /api/v1/services/aigc/multimodal-generation/generation
 * { model, input: { messages: [{ role: "user", content: [{ text, image_url }] }] } }
 */
@Service
public class ImageAnalyzerService {
    private static final Logger log = LoggerFactory.getLogger(ImageAnalyzerService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String apiKey;
    private final String baseUrl;
    private final String vlModel;
    private final ConfigService config;
    private final HttpClient http;

    public ImageAnalyzerService(
            @Value("${slowscape.wan.api-key:}") String apiKey,
            @Value("${slowscape.wan.base-url:https://dashscope.aliyuncs.com}") String baseUrl,
            @Value("${slowscape.image-analyzer.vl-model:qwen-vl-plus}") String vlModel,
            ConfigService config) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.vlModel = vlModel;
        this.config = config;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 分析一张图片，返回提取的关键元素列表。
     * 失败时返回空列表（不影响主流程）。
     */
    public List<String> analyzeImage(String imageUrl) {
        if (!isConfigured()) return List.of();
        try {
            String prompt = config.get("prompt.analyzer.image", "请识别这张风景图片中的关键视觉元素");

            Map<String, Object> msgContent = new LinkedHashMap<>();
            msgContent.put("role", "user");

            List<Map<String, Object>> content = new ArrayList<>();
            content.add(Map.of("text", prompt));
            content.add(Map.of("image_url", imageUrl));
            msgContent.put("content", content);

            Map<String, Object> input = new LinkedHashMap<>();
            input.put("model", vlModel);
            input.put("input", Map.of("messages", List.of(msgContent)));

            String body = JSON.writeValueAsString(input);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/v1/services/aigc/multimodal-generation/generation"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode root = JSON.readTree(resp.body());

            // 从输出中提取文本
            JsonNode output = root.get("output");
            if (output == null) return List.of();
            JsonNode choices = output.get("choices");
            if (choices == null || !choices.isArray() || choices.size() == 0) return List.of();
            String text = choices.get(0).path("message").path("content").asText("");

            // 解析逗号分隔的关键词
            return Arrays.stream(text.split("[,，、]"))
                    .map(String::trim)
                    .filter(s -> s.length() >= 2)
                    .limit(6)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[ImageAnalyzer] 分析图片失败 {}: {}", imageUrl, e.getMessage());
            return List.of();
        }
    }

    /**
     * 从首帧图片自动匹配最佳尾帧。
     * 匹配策略：
     * 1. 分析首帧元素（可先从库中查，未命中再调 API）
     * 2. 在素材库中按元素重叠度排序（排除自身）
     * 3. 返回最匹配的尾帧 URL
     */
    public String autoMatchLastFrame(String firstFrameUrl, LibraryService library) {
        // 1. 先看 firstFrame 是不是已有库素材（直接拿元素）
        VideoAsset firstAsset = library.getByPoster(firstFrameUrl);
        List<String> firstElements = (firstAsset != null && firstAsset.getKey_elements() != null)
                ? firstAsset.getKey_elements()
                : List.of();

        // 2. 如果不是库素材，调 VL 分析
        // 但对于 MVP，优先用库内已有的元素匹配；外部图回退随机挑
        if (firstElements.isEmpty()) {
            firstElements = List.of("自然", "风景"); // fallback 通用元素
        }

        // 3. 在库中按元素重叠度排序（排除自身）
        Set<String> firstSet = new HashSet<>(firstElements);
        List<VideoAsset> candidates = library.allItems().stream()
                .filter(a -> !a.getPoster().equals(firstFrameUrl)) // 排除自身
                .collect(Collectors.toList());

        if (candidates.isEmpty()) return null;

        // 按元素重叠度排序
        candidates.sort((a, b) -> {
            int scoreA = elementOverlap(firstSet, a.getKey_elements());
            int scoreB = elementOverlap(firstSet, b.getKey_elements());
            return Integer.compare(scoreB, scoreA); // 降序
        });

        // 如果最佳匹配重合度为 0，且有原始库可依，按场景互补而非随机
        VideoAsset best = candidates.get(0);
        if (elementOverlap(firstSet, best.getKey_elements()) == 0 && firstAsset != null) {
            // 首帧有 scene_tags，找一个互补场景
            List<String> firstTags = firstAsset.getScene_tags();
            if (firstTags != null && !firstTags.isEmpty()) {
                for (VideoAsset c : candidates) {
                    if (c.getScene_tags() != null &&
                            !c.getScene_tags().stream().anyMatch(firstTags::contains)) {
                        best = c;
                        break;
                    }
                }
            }
        }

        log.info("[ImageAnalyzer] 自动匹配尾帧: first={}, last={}, 元素={}",
                firstFrameUrl, best.getPoster(), firstElements);
        return best.getPoster(); // 返回 poster（图片 URL）而非 master（视频 URL），供 Wan KF2V 使用
    }

    /** 计算元素集与库素材标签的重叠度（加权：场景名4分、其他1分） */
    private int elementOverlap(Set<String> firstSet, List<String> candidateElements) {
        if (candidateElements == null) return 0;
        int score = 0;
        for (String ce : candidateElements) {
            if (firstSet.contains(ce)) {
                // 命名场景标签（scene_tags 中的词）加权
                if (ce.length() <= 4) score += 4;
                else score += 1;
            }
        }
        return score;
    }
}
