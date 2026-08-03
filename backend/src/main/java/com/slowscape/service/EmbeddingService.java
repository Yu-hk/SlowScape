package com.slowscape.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.slowscape.entity.VideoAssetEntity;
import com.slowscape.repo.VideoAssetRepo;
import com.slowscape.config.DatabaseInitializer;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 向量嵌入服务 — 调用 DashScope text-embedding-v2 为素材生成 1536 维向量，
 * 存入 pgvector 列，用于图片元素相似度匹配。
 */
@Service
public class EmbeddingService {
    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String apiKey;
    private final String baseUrl;
    private final VideoAssetRepo assetRepo;
    private final EntityManager entityManager;
    private final DatabaseInitializer dbInit;
    private final ConfigService config;
    private final HttpClient http;

    public EmbeddingService(
            @Value("${slowscape.wan.api-key:}") String apiKey,
            @Value("${slowscape.wan.base-url:https://dashscope.aliyuncs.com}") String baseUrl,
            VideoAssetRepo assetRepo, EntityManager entityManager, DatabaseInitializer dbInit,
            ConfigService config) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.assetRepo = assetRepo;
        this.entityManager = entityManager;
        this.dbInit = dbInit;
        this.config = config;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 为文本生成嵌入向量（调用 DashScope text-embedding-v2）。
     * 返回 float[] 或 null。
     */
    public float[] embed(String text) {
        if (!isConfigured() || text == null || text.isBlank()) return null;
        try {
            var input = JSON.createObjectNode();
            input.put("model", "text-embedding-v2");
            var params = input.putObject("parameters");
            params.put("text_type", "document");

            var inputObj = input.putObject("input");
            var texts = inputObj.putArray("texts");
            String rawTemplates = config.get("prompt.embedding.texts",
                "为生成{prompt}的渐变视频,画面包含{prompt},{prompt}，舒缓自然风景");
            for (String tpl : rawTemplates.split(",")) {
                texts.add(tpl.replace("{prompt}", text));
            }

            String body = JSON.writeValueAsString(input);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/v1/services/embeddings/text-embedding/text-embedding"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode root = JSON.readTree(resp.body());
            JsonNode output = root.get("output");
            if (output == null || !output.has("embeddings")) return null;

            JsonNode emb = output.get("embeddings").get(0).get("embedding");
            if (emb == null || !emb.isArray()) return null;

            float[] vec = new float[emb.size()];
            for (int i = 0; i < emb.size(); i++) vec[i] = (float) emb.get(i).asDouble();
            return vec;
        } catch (Exception e) {
            log.warn("[Embedding] 生成失败: {}", e.getMessage());
            return null;
        }
    }

    /** 把 float[] 转为 pgvector 可识别的文本格式 '[0.1,0.2,...]' */
    private static String toVectorLiteral(float[] vec) {
        if (vec == null) return null;
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vec.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(vec[i]);
        }
        sb.append(']');
        return sb.toString();
    }

    /**
     * 为所有库素材生成并更新嵌入向量。
     * 用 key_elements 拼接为文本生成嵌入，存入 pgvector 列。
     */
    @PostConstruct
    void init() {
        if (!isConfigured()) {
            log.info("[Embedding] 无 API Key，跳过向量生成");
            return;
        }
        // 确保 pgvector 列存在
        dbInit.ensureVectorColumn();
        new Thread(() -> {
            List<VideoAssetEntity> items = assetRepo.findBySource("library");
            for (VideoAssetEntity item : items) {
                try {
                    // 用 key_elements + title + scene_tags 拼接描述
                    String text = item.getTitle();
                    if (item.getKeyElements() != null && !item.getKeyElements().isBlank())
                        text += "，" + item.getKeyElements().replace("|", "、");
                    if (item.getSceneTags() != null && !item.getSceneTags().isBlank())
                        text += "，" + item.getSceneTags().replace("|", "、");

                    float[] vec = embed(text);
                    if (vec != null && vec.length > 0) {
                        String literal = toVectorLiteral(vec);
                        // 用原生 SQL 写入 pgvector 列
                        entityManager.createNativeQuery(
                                "UPDATE video_assets SET embedding = CAST(:vec AS vector) WHERE video_id = :id")
                                .setParameter("vec", literal)
                                .setParameter("id", item.getVideoId())
                                .executeUpdate();
                        log.info("[Embedding] 已更新 {} → {} dims", item.getTitle(), vec.length);
                    }
                    Thread.sleep(1500); // 限流
                } catch (Exception e) {
                    log.warn("[Embedding] 处理失败 {}: {}", item.getTitle(), e.getMessage());
                }
            }
            log.info("[Embedding] 库素材向量生成完成");
        }, "embedding-init").start();
    }

    /**
     * 向量相似度搜索 — 按 key_elements 向量在库中找最相似的素材。
     * 返回最匹配的 poster URL。
     */
    public String searchByText(String text, String excludeVideoId) {
        if (!isConfigured() || text == null || text.isBlank()) return null;
        float[] queryVec = embed(text);
        if (queryVec == null) return null;

        String literal = toVectorLiteral(queryVec);
        try {
            @SuppressWarnings("unchecked")
            List<Object[]> rows = entityManager.createNativeQuery(
                    "SELECT video_id, poster, embedding <-> CAST(:vec AS vector) AS dist " +
                    "FROM video_assets WHERE source = 'library' AND embedding IS NOT NULL " +
                    "AND (:exclude IS NULL OR video_id != :exclude) " +
                    "ORDER BY dist ASC LIMIT 1")
                    .setParameter("vec", literal)
                    .setParameter("exclude", excludeVideoId)
                    .getResultList();

            if (!rows.isEmpty()) {
                String matchedPoster = (String) rows.get(0)[1];
                double dist = ((Number) rows.get(0)[2]).doubleValue();
                log.info("[Embedding] 向量搜索匹配: poster={}, dist={}", matchedPoster, String.format("%.4f", dist));
                return matchedPoster;
            }
        } catch (Exception e) {
            log.warn("[Embedding] 搜索失败: {}", e.getMessage());
        }
        return null;
    }
}
