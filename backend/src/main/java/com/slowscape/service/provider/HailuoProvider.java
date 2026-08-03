package com.slowscape.service.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/** 海螺 Hailuo（MiniMax）占位适配器 — 有 key 时可集成。 */
@Service
public class HailuoProvider implements VideoProvider {

    private final String apiKey;
    private final String baseUrl;
    private final String model;

    public HailuoProvider(
            @Value("${slowscape.hailuo.api-key}") String apiKey,
            @Value("${slowscape.hailuo.base-url}") String baseUrl,
            @Value("${slowscape.hailuo.model}") String model) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.model = model;
    }

    @Override public String name() { return "hailuo"; }
    @Override public boolean isConfigured() { return apiKey != null && !apiKey.isBlank(); }

    @Override
    public String submit(String prompt, List<String> references, String duration, String resolution, String aspectRatio) {
        throw new UnsupportedOperationException("Hailuo 适配器待接入");
    }

    @Override
    public PollResult poll(String providerTaskId) {
        throw new UnsupportedOperationException("Hailuo 适配器待接入");
    }

    @Override
    public Map<String, Object> meta() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", "hailuo");
        m.put("displayName", "海螺 Hailuo（待接入）");
        m.put("baseUrl", baseUrl);
        m.put("model", model);
        return m;
    }
}
