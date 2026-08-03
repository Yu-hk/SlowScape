package com.slowscape.service.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/** 可灵 Kling（快手）占位适配器 — 有 key 时可集成。 */
@Service
public class KlingProvider implements VideoProvider {

    private final String apiKey;
    private final String baseUrl;
    private final String model;

    public KlingProvider(
            @Value("${slowscape.kling.api-key}") String apiKey,
            @Value("${slowscape.kling.base-url}") String baseUrl,
            @Value("${slowscape.kling.model}") String model) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.model = model;
    }

    @Override public String name() { return "kling"; }
    @Override public boolean isConfigured() { return apiKey != null && !apiKey.isBlank(); }

    @Override
    public String submit(String prompt, List<String> references, String duration, String resolution, String aspectRatio) {
        throw new UnsupportedOperationException("Kling 适配器待接入");
    }

    @Override
    public PollResult poll(String providerTaskId) {
        throw new UnsupportedOperationException("Kling 适配器待接入");
    }

    @Override
    public Map<String, Object> meta() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", "kling");
        m.put("displayName", "可灵 Kling（待接入）");
        m.put("baseUrl", baseUrl);
        m.put("model", model);
        return m;
    }
}
