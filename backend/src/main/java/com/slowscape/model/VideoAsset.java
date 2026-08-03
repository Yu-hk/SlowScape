package com.slowscape.model;

import java.util.List;

/** 视频资产 — 与前端 VideoAsset 契约一致的数据模型。 */
public class VideoAsset {
    private String video_id;
    private String title;
    private String poster;
    private String preview;
    private String master;
    private int duration;
    private int width;
    private int height;
    private String resolution;
    private boolean loop;
    private List<String> scene_tags;
    private List<String> references;
    private String created_at;
    private String source;
    private List<String> key_elements;

    // 构造
    public VideoAsset() {}
    public VideoAsset(String videoId, String title, String poster, String preview, String master,
                      int duration, int width, int height, String resolution, boolean loop,
                      List<String> sceneTags, List<String> references, String createdAt, String source,
                      List<String> keyElements) {
        this.video_id = videoId;
        this.title = title;
        this.poster = poster;
        this.preview = preview;
        this.master = master;
        this.duration = duration;
        this.width = width;
        this.poster = poster;
        this.preview = preview;
        this.master = master;
        this.duration = duration;
        this.width = width;
        this.height = height;
        this.resolution = resolution;
        this.loop = loop;
        this.scene_tags = sceneTags;
        this.references = references;
        this.created_at = createdAt;
        this.source = source;
    }

    // getters / setters
    public String getVideo_id() { return video_id; }
    public String getTitle() { return title; }
    public String getPoster() { return poster; }
    public String getPreview() { return preview; }
    public String getMaster() { return master; }
    public int getDuration() { return duration; }
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public String getResolution() { return resolution; }
    public boolean isLoop() { return loop; }
    public List<String> getScene_tags() { return scene_tags; }
    public List<String> getReferences() { return references; }
    public String getCreated_at() { return created_at; }
    public String getSource() { return source; }
    public List<String> getKey_elements() { return key_elements; }

    public void setVideo_id(String v) { this.video_id = v; }
    public void setTitle(String v) { this.title = v; }
    public void setPoster(String v) { this.poster = v; }
    public void setPreview(String v) { this.preview = v; }
    public void setMaster(String v) { this.master = v; }
    public void setDuration(int v) { this.duration = v; }
    public void setWidth(int v) { this.width = v; }
    public void setHeight(int v) { this.height = v; }
    public void setResolution(String v) { this.resolution = v; }
    public void setLoop(boolean v) { this.loop = v; }
    public void setScene_tags(List<String> v) { this.scene_tags = v; }
    public void setReferences(List<String> v) { this.references = v; }
    public void setCreated_at(String v) { this.created_at = v; }
    public void setSource(String v) { this.source = v; }
    public void setKey_elements(List<String> v) { this.key_elements = v; }
}
