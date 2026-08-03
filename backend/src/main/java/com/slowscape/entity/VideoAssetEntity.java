package com.slowscape.entity;

import com.slowscape.model.VideoAsset;
import jakarta.persistence.*;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 视频资产实体 — 同时服务库素材（source=library）和生成历史（source=wan/hailuo/kling）。
 */
@Entity
@Table(name = "video_assets", indexes = {
    @Index(name = "idx_source", columnList = "source"),
    @Index(name = "idx_created", columnList = "createdAt")
})
public class VideoAssetEntity {
    private static final String SEP = "|";

    @Id @Column(length = 64)
    private String videoId;

    @Column(length = 128)
    private String title;

    @Column(length = 512)
    private String poster;

    @Column(length = 512)
    private String preview;

    @Column(length = 512)
    private String master;

    private int duration;
    private int width;
    private int height;

    @Column(length = 16)
    private String resolution;

    private boolean looped;

    @Column(length = 512)
    private String sceneTags;       // 竖线分隔 forest|mist|rain

    @Column(length = 512)
    private String keyElements;     // 竖线分隔 森林|雾气|雨

    @Column(length = 1024, name = "ref_urls")
    private String refUrls;

    @Column(length = 64)
    private String source;

    @Transient
    private String embedding;

    @Column(nullable = false)
    private String createdAt;

    public VideoAssetEntity() {}

    /** 从 model 构建实体。 */
    public static VideoAssetEntity fromModel(VideoAsset a) {
        VideoAssetEntity e = new VideoAssetEntity();
        e.videoId = a.getVideo_id();
        e.title = a.getTitle();
        e.poster = a.getPoster();
        e.preview = a.getPreview();
        e.master = a.getMaster();
        e.duration = a.getDuration();
        e.width = a.getWidth();
        e.height = a.getHeight();
        e.resolution = a.getResolution();
        e.looped = a.isLoop();
        e.sceneTags = join(a.getScene_tags());
        e.keyElements = join(a.getKey_elements());
        e.refUrls = join(a.getReferences());
        e.source = a.getSource();
        e.createdAt = a.getCreated_at();
        return e;
    }

    /** 转回 model。 */
    public VideoAsset toModel() {
        VideoAsset a = new VideoAsset();
        a.setVideo_id(videoId);
        a.setTitle(title);
        a.setPoster(poster);
        a.setPreview(preview);
        a.setMaster(master);
        a.setDuration(duration);
        a.setWidth(width);
        a.setHeight(height);
        a.setResolution(resolution);
        a.setLoop(looped);
        a.setScene_tags(split(sceneTags));
        a.setKey_elements(split(keyElements));
        a.setReferences(split(refUrls));
        a.setCreated_at(createdAt);
        a.setSource(source);
        return a;
    }

    private static String join(List<String> list) {
        if (list == null || list.isEmpty()) return "";
        return list.stream().collect(Collectors.joining(SEP));
    }

    private static List<String> split(String s) {
        if (s == null || s.isBlank()) return List.of();
        return Arrays.asList(s.split("\\|"));
    }

    // getters / setters for JPA
    public String getVideoId() { return videoId; }
    public String getTitle() { return title; }
    public void setVideoId(String v) { this.videoId = v; }
    public void setTitle(String v) { this.title = v; }
    public String getPoster() { return poster; }
    public void setPoster(String v) { this.poster = v; }
    public String getPreview() { return preview; }
    public void setPreview(String v) { this.preview = v; }
    public String getMaster() { return master; }
    public void setMaster(String v) { this.master = v; }
    public int getDuration() { return duration; }
    public void setDuration(int v) { this.duration = v; }
    public int getWidth() { return width; }
    public void setWidth(int v) { this.width = v; }
    public int getHeight() { return height; }
    public void setHeight(int v) { this.height = v; }
    public String getResolution() { return resolution; }
    public void setResolution(String v) { this.resolution = v; }
    public boolean isLooped() { return looped; }
    public void setLooped(boolean v) { this.looped = v; }
    public String getSceneTags() { return sceneTags; }
    public void setSceneTags(String v) { this.sceneTags = v; }
    public String getKeyElements() { return keyElements; }
    public void setKeyElements(String v) { this.keyElements = v; }
    public String getRefUrls() { return refUrls; }
    public void setRefUrls(String v) { this.refUrls = v; }
    public String getEmbedding() { return embedding; }
    public void setEmbedding(String v) { this.embedding = v; }
    public void setSource(String v) { this.source = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
