package com.slowscape.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 视频评论实体：归属某条视频（videoId），记录评论用户与内容。
 * createdAt 用 ISO-8601 字符串，规避时区/序列化差异。
 */
@Entity
@Table(name = "comments", indexes = {
    @Index(name = "idx_comment_video", columnList = "videoId"),
    @Index(name = "idx_comment_created", columnList = "createdAt")
})
public class CommentEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String videoId;

    @Column(nullable = false, length = 64)
    private String userId;

    @Column(nullable = false, length = 64)
    private String username;

    @Column(nullable = false, length = 1000)
    private String content;

    @Column(nullable = false)
    private String createdAt;

    public CommentEntity() {}

    public CommentEntity(String videoId, String userId, String username, String content, String createdAt) {
        this.videoId = videoId;
        this.userId = userId;
        this.username = username;
        this.content = content;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getVideoId() { return videoId; }
    public void setVideoId(String v) { this.videoId = v; }
    public String getUserId() { return userId; }
    public void setUserId(String v) { this.userId = v; }
    public String getUsername() { return username; }
    public void setUsername(String v) { this.username = v; }
    public String getContent() { return content; }
    public void setContent(String v) { this.content = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
