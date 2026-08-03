package com.slowscape.service.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.slowscape.service.ConfigService;
import com.slowscape.service.MetricsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** HappyHorse 文生视频（阿里云百炼 DashScope）。纯文本 prompt，无须首尾帧。 */
@Service
public class HappyHorseProvider implements VideoProvider {
    private static final Logger log = LoggerFactory.getLogger(HappyHorseProvider.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String apiKey;
    private final String baseUrl;
    private final String defaultModel;
    private final long pollInterval;
    private final long pollTimeout;
    private final ConfigService config;
    private final MetricsService metrics;

    public HappyHorseProvider(
            @Value("${slowscape.happyhorse.api-key}") String apiKey,
            @Value("${slowscape.happyhorse.base-url}") String baseUrl,
            @Value("${slowscape.happyhorse.model}") String model,
            @Value("${slowscape.happyhorse.poll-interval}") long pollInterval,
            @Value("${slowscape.happyhorse.poll-timeout}") long pollTimeout,
            ConfigService config, MetricsService metrics) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.defaultModel = model;
        this.pollInterval = pollInterval;
        this.pollTimeout = pollTimeout;
        this.config = config;
        this.metrics = metrics;
    }

    @Override public String name() { return "happyhorse"; }

    @Override public boolean isConfigured() { return apiKey != null && !apiKey.isBlank(); }

    @Override
    public String submit(String prompt, List<String> references, String duration, String resolution, String aspectRatio) throws Exception {
        String ratio = (aspectRatio == null || aspectRatio.isBlank()) ? "16:9" : aspectRatio;

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("model", currentModel());
        Map<String, Object> inputData = new LinkedHashMap<>();
        inputData.put("prompt", enhancePrompt(prompt));
        // i2v → first_frame, r2v → reference_image
        String mediaType = currentModel().contains("r2v") ? "reference_image" : "first_frame";
        if (references != null && !references.isEmpty()) {
            List<Map<String, String>> media = new ArrayList<>();
            for (String ref : references) {
                if (ref != null && !ref.isBlank()) {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("type", mediaType);
                    m.put("url", ref);
                    media.add(m);
                }
            }
            if (!media.isEmpty()) inputData.put("media", media);
        }
        input.put("input", inputData);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("resolution", mapResolution(resolution));
        params.put("ratio", ratio);
        if (duration != null && !duration.isBlank()) {
            try { params.put("duration", Integer.parseInt(duration)); } catch (NumberFormatException e) { params.put("duration", 5); }
        }
        input.put("parameters", params);

        String body = JSON.writeValueAsString(input);
        long t0 = System.currentTimeMillis();
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/services/aigc/video-generation/video-synthesis"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .header("X-DashScope-Async", "enable")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(30))
                .build();

        HttpResponse<String> resp = newClient().send(req, HttpResponse.BodyHandlers.ofString());
        long latencyMs = System.currentTimeMillis() - t0;
        JsonNode root = JSON.readTree(resp.body());

        if (root.has("code") && !root.get("code").asText().equals("0")) {
            String code = root.get("code").asText();
            metrics.recordLlmCall(currentModel(), false, latencyMs, 0, 0, code);
            throw new BusinessError("HappyHorse 业务错误 [" + code + "]", root.path("message").asText(""), code);
        }
        JsonNode output = root.get("output");
        String taskId = output != null && output.has("task_id") ? output.get("task_id").asText() : null;
        if (taskId == null || taskId.isBlank()) {
            metrics.recordLlmCall(currentModel(), false, latencyMs, 0, 0, "no_task_id");
            throw new RuntimeException("HappyHorse submit 未返回 task_id: " + resp.body());
        }
        metrics.recordLlmCall(currentModel(), true, latencyMs, 0, 0, null);
        return taskId;
    }

    @Override
    public PollResult poll(String providerTaskId) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/tasks/" + providerTaskId))
                .header("Authorization", "Bearer " + apiKey)
                .GET()
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> resp = newClient().send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode root = JSON.readTree(resp.body());
        JsonNode output = root.get("output");
        String taskStatus = output != null && output.has("task_status") ? output.get("task_status").asText() : "PENDING";

        switch (taskStatus.toUpperCase()) {
            case "SUCCEEDED": {
                String videoUrl = null;
                if (output != null) {
                    if (output.has("video_url")) videoUrl = output.get("video_url").asText();
                    else if (output.has("video_urls")) {
                        JsonNode arr = output.get("video_urls");
                        if (arr.isArray() && arr.size() > 0) videoUrl = arr.get(0).asText();
                    }
                }
                return new PollResult("succeeded", videoUrl);
            }
            case "FAILED":
            case "CANCELED":
                return new PollResult("failed", null);
            default:
                return new PollResult("processing", null);
        }
    }

    @Override
    public Map<String, Object> meta() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", "happyhorse");
        m.put("displayName", "HappyHorse 1.1（图生视频）");
        m.put("baseUrl", baseUrl);
        m.put("model", currentModel());
        m.put("hasAudio", false);
        m.put("pollInterval", pollInterval);
        m.put("pollTimeout", pollTimeout);
        Map<String, Double> cost = new LinkedHashMap<>();
        cost.put("720p", 0.54);
        cost.put("1080p", 0.72);
        m.put("costPerSec", cost);
        return m;
    }

    public long getPollInterval() { return pollInterval; }
    public long getPollTimeout() { return pollTimeout; }

    /** 每次新建 HTTP/1.1 客户端，避免 keep-alive 连接复用导致的偶发 header parser / 半开连接错误。 */
    private HttpClient newClient() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    /** 模型名从配置热读，支持运行时在 i2v / r2v 间切换，无需重启。 */
    private String currentModel() {
        return config.get("happyhorse.model", defaultModel);
    }

    private static String mapResolution(String res) {
        if (res == null) return "720P";
        return switch (res) {
            case "1080p" -> "1080P";
            case "480p" -> "480P";
            default -> "720P";
        };
    }

    /** 增强 prompt：r2v 额外追加"参考图之间自然过渡"后缀，固化渐进式切换手感。 */
    private String enhancePrompt(String raw) {
        String empty = config.get("prompt.happyhorse.empty", "舒缓宁静的风景，缓慢推移");
        String suffix = config.get("prompt.happyhorse.suffix", "，舒缓宁静、缓慢流动、自然过渡、电影感");
        String r2vSuffix = config.get("prompt.happyhorse.r2v.suffix", "，画面在参考图之间缓缓自然过渡、同一景有机生长");
        if (raw == null || raw.isBlank()) return empty + r2vSuffix;
        String trimmed = raw.trim();
        return trimmed + suffix + (currentModel().contains("r2v") ? r2vSuffix : "");
    }

    public static class BusinessError extends RuntimeException {
        public final String providerCode;
        public BusinessError(String message, String userMsg, String providerCode) {
            super(userMsg);
            this.providerCode = providerCode;
        }
        public boolean isProviderError() { return true; }
    }
}