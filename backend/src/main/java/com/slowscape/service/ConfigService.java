package com.slowscape.service;

import com.slowscape.entity.AppConfigEntity;
import com.slowscape.repo.AppConfigRepo;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 运行时配置服务 — key-value 配表存 DB，启动时加载到内存缓存。
 * set() 同时更新 DB + 缓存，无需重启即时生效。
 */
@Service
public class ConfigService {
    private static final Logger log = LoggerFactory.getLogger(ConfigService.class);

    private final AppConfigRepo repo;
    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();

    /** 默认配置（DB 为空时填充）。也可从 application.properties 覆盖。 */
    private static final Map<String, String> DEFAULTS = new LinkedHashMap<>();
    static {
        DEFAULTS.put("prompt.wan.empty", "画面柔和过渡，一片风景自然流畅地变成另一片");
        DEFAULTS.put("prompt.wan.short-suffix", "，画面缓缓渐变、柔和自然、平滑过渡");
        DEFAULTS.put("prompt.wan.long-suffix", "，过渡柔和、平滑、渐进");
        DEFAULTS.put("prompt.happyhorse.empty", "舒缓宁静的风景，缓慢推移");
        DEFAULTS.put("prompt.happyhorse.suffix", "，舒缓宁静、缓慢流动、自然过渡、电影感");
        DEFAULTS.put("prompt.happyhorse.r2v.suffix", "，画面在参考图之间缓缓自然过渡、同一景有机生长");
        DEFAULTS.put("feature.r2v.auto-select", "true");
        DEFAULTS.put("happyhorse.model", "happyhorse-1.1-i2v");
        DEFAULTS.put("prompt.wan27.suffix", "，画面缓缓流动、宁静自然、电影感");
        DEFAULTS.put("prompt.analyzer.image",
            "请识别这张风景图片中的关键视觉元素，以逗号分隔的中文关键词输出" +
            "（例如：山脉、森林、雪地、星空、雾气、海岸、河流）。" +
            "只输出关键词，不要多余描述。最多输出6个关键词。");
        DEFAULTS.put("prompt.embedding.texts", "为生成{prompt}的渐变视频,画面包含{prompt},{prompt}，舒缓自然风景");
    }

    public ConfigService(AppConfigRepo repo) {
        this.repo = repo;
    }

    @PostConstruct
    void init() {
        for (var entry : DEFAULTS.entrySet()) {
            if (repo.findById(entry.getKey()).isEmpty()) {
                repo.save(new AppConfigEntity(entry.getKey(), entry.getValue()));
                log.info("[Config] 初始化: {}={}", entry.getKey(), entry.getValue().substring(0, Math.min(30, entry.getValue().length())));
            }
        }
        // 加载全部到缓存
        repo.findAll().forEach(e -> cache.put(e.getConfigKey(), e.getConfigValue()));
        log.info("[Config] 已加载 {} 条配置", cache.size());
    }

    /** 读配置，返回 null 表示不存在。 */
    public String get(String key) {
        return cache.get(key);
    }

    /** 读配置，带默认值。 */
    public String get(String key, String defaultValue) {
        return cache.getOrDefault(key, defaultValue);
    }

    /** 写配置，即时更新 DB + 缓存。 */
    public void set(String key, String value) {
        repo.save(new AppConfigEntity(key, value));
        cache.put(key, value);
    }

    /** 获取全部配置。 */
    public Map<String, String> all() {
        return new LinkedHashMap<>(cache);
    }
}
