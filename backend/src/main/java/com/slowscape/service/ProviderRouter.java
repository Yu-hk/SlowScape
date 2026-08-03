package com.slowscape.service;

import com.slowscape.service.provider.VideoProvider;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

/** 多模型路由器 — 按品质档 + 是否已配置选择 provider。 */
@Service
public class ProviderRouter {

    private final List<VideoProvider> providers;

    // 由 Spring 自动注入所有 VideoProvider bean
    public ProviderRouter(List<VideoProvider> providers) {
        this.providers = providers;
    }

    /** 品质档 → provider 名称偏好顺序（前者为首选）。HappyHorse 图生视频作为主推（10 免费额度）。 */
    private static final List<List<String>> TIER_PREFERENCE = List.of(
        List.of("happyhorse", "hailuo", "kling"),
        List.of("happyhorse", "kling", "hailuo"),
        List.of("happyhorse", "kling", "hailuo")
    );

    public VideoProvider selectProvider(String qualityTier) {
        int idx = switch (qualityTier != null ? qualityTier : "standard") {
            case "draft" -> 0;
            case "premium" -> 2;
            default -> 1;
        };
        List<String> order = TIER_PREFERENCE.get(Math.min(idx, TIER_PREFERENCE.size() - 1));
        for (String name : order) {
            VideoProvider p = findBy(name);
            if (p != null && p.isConfigured()) return p;
        }
        // fallback: 任意已配置的
        return providers.stream().filter(VideoProvider::isConfigured).findFirst().orElse(null);
    }

    public List<String> listConfigured() {
        return providers.stream().filter(VideoProvider::isConfigured).map(VideoProvider::name).toList();
    }

    private VideoProvider findBy(String name) {
        return providers.stream().filter(p -> p.name().equals(name)).findFirst().orElse(null);
    }
}
