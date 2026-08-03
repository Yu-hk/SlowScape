package com.slowscape.service;

import com.slowscape.entity.VideoAssetEntity;
import com.slowscape.model.VideoAsset;
import com.slowscape.repo.VideoAssetRepo;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.*;

/** 舒缓素材库 — 从 DB 读取。启动时若库为空则自动初始化 8 个 Mixkit 素材。 */
@Service
public class LibraryService {
    private static final Logger log = LoggerFactory.getLogger(LibraryService.class);
    private static final String MX = "https://assets.mixkit.co/videos";

    private final VideoAssetRepo repo;
    private final ImageAnalyzerService imageAnalyzer;

    public LibraryService(VideoAssetRepo repo, ImageAnalyzerService imageAnalyzer) {
        this.repo = repo;
        this.imageAnalyzer = imageAnalyzer;
    }

    @PostConstruct
    void init() {
        if (repo.countBySource("library") > 0) {
            log.info("[Library] DB 中已存在库素材，跳过初始化");
            return;
        }
        log.info("[Library] DB 为空，初始化 8 个 Mixkit 库素材");
        seed("529",  "雨后森林小径",   List.of("rainy_forest", "mist", "forest"),       List.of("森林","雾气","小径","雨后","绿色"),      12, "1080p");
        seed("1082", "黄昏的海岸线",   List.of("dusk_coast", "coast", "dusk"),           List.of("海岸","黄昏","天空","晚霞","大海"),      15, "1080p");
        seed("3350", "飘雪的松林",     List.of("snowy_pine", "snow", "forest"),          List.of("雪地","松林","飘雪","白色","冬季"),      10, "720p");
        seed("1173", "晨雾里的麦田",   List.of("misty_wheat", "wheat", "mist"),         List.of("麦田","晨雾","田野","金黄色","辽阔"),    12, "1080p");
        seed("1013", "海面初阳，浪很轻", List.of("still_lake", "lake", "calm"),          List.of("湖泊","日出","水面","宁静","倒影"),      15, "1080p");
        seed("570",  "雨后的针叶林",   List.of("autumn_grove", "forest", "autumn"),       List.of("针叶林","秋天","雨后","湿润","绿色"),    10, "720p");
        seed("3317", "雪落山脊",       List.of("starry_night", "night", "calm"),         List.of("星空","山脊","雪地","夜晚","宁静"),      12, "1080p");
        seed("513",  "风过整片草甸",   List.of("foggy_mountain", "mountain", "mist"),    List.of("山脉","草甸","风","开阔","绿色"),        15, "1080p");
        // 异步 VL 分析
        asyncDeepAnalyze();
    }

    private void seed(String id, String title, List<String> tags, List<String> elements, int dur, String res) {
        String base = MX + "/" + id;
        VideoAsset a = new VideoAsset();
        a.setVideo_id(UUID.randomUUID().toString());
        a.setTitle(title);
        a.setPoster(base + "/" + id + "-thumb-720-0.jpg");
        a.setPreview(base + "/" + id + "-360.mp4");
        a.setMaster(base + "/" + id + "-1080.mp4");
        a.setDuration(dur);
        a.setWidth(res.equals("1080p") ? 1920 : 1280);
        a.setHeight(res.equals("1080p") ? 1080 : 720);
        a.setResolution(res);
        a.setLoop(true);
        a.setScene_tags(tags);
        a.setKey_elements(elements);
        a.setCreated_at(new Date().toInstant().toString());
        a.setSource("library");
        repo.save(VideoAssetEntity.fromModel(a));
    }

    private void asyncDeepAnalyze() {
        if (!imageAnalyzer.isConfigured()) return;
        new Thread(() -> {
            for (VideoAssetEntity e : repo.findBySource("library")) {
                try {
                    List<String> vl = imageAnalyzer.analyzeImage(e.getMaster());
                    if (!vl.isEmpty()) {
                        e.setKeyElements(String.join("|", vl));
                        repo.save(e);
                        log.info("[Library] VL 分析 {} → {}", e.getTitle(), vl);
                    }
                    Thread.sleep(1000);
                } catch (Exception ex) {
                    log.warn("[Library] VL 分析失败 {}: {}", e.getTitle(), ex.getMessage());
                }
            }
        }, "library-analyzer").start();
    }

    public Map<String, Object> list(int page, int limit, String scene, String sort) {
        List<VideoAssetEntity> all = repo.findBySource("library");
        List<VideoAsset> items = all.stream().map(VideoAssetEntity::toModel).toList();
        int total = items.size();
        int start = (page - 1) * limit;
        int end = Math.min(start + limit, total);
        List<VideoAsset> paged = start >= total ? List.of() : items.subList(start, end);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("items", paged);
        r.put("total", total);
        r.put("page", page);
        r.put("limit", limit);
        r.put("has_more", end < total);
        return r;
    }

    public VideoAsset get(String videoId) {
        return repo.findById(videoId).map(VideoAssetEntity::toModel).orElse(null);
    }

    public VideoAsset getByPoster(String posterUrl) {
        return repo.findTop1ByPoster(posterUrl).map(VideoAssetEntity::toModel).orElse(null);
    }

    public VideoAsset pickByScene(String stylePreset) {
        List<VideoAssetEntity> all = repo.findBySource("library");
        if (all.isEmpty()) return null;
        if (stylePreset != null && !"free".equals(stylePreset)) {
            for (VideoAssetEntity e : all) {
                if (e.getSceneTags() != null && e.getSceneTags().contains(stylePreset))
                    return e.toModel();
            }
        }
        return all.get(new Random().nextInt(all.size())).toModel();
    }

    public List<VideoAsset> allItems() {
        return repo.findBySource("library").stream().map(VideoAssetEntity::toModel).toList();
    }
}
