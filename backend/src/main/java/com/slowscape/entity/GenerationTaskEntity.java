package com.slowscape.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "generation_tasks")
public class GenerationTaskEntity {
    @Id @Column(length = 64)
    private String taskId;

    @Column(length = 512)
    private String prompt;

    @Column(length = 32)
    private String status;

    @Column(length = 32)
    private String provider;

    @Column(length = 128)
    private String providerTaskId;

    @Column(length = 64)
    private String errorCode;

    @Column(length = 256)
    private String errorMessage;

    @Column(nullable = false)
    private String createdAt;

    private String updatedAt;

    @Column(length = 64)
    private String assetVideoId;  // 关联 feed 视频

    public GenerationTaskEntity() {}

    public String getTaskId() { return taskId; }
    public void setTaskId(String v) { this.taskId = v; }
    public String getPrompt() { return prompt; }
    public void setPrompt(String v) { this.prompt = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getProvider() { return provider; }
    public void setProvider(String v) { this.provider = v; }
    public String getProviderTaskId() { return providerTaskId; }
    public void setProviderTaskId(String v) { this.providerTaskId = v; }
    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String v) { this.errorCode = v; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String v) { this.errorMessage = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
    public String getAssetVideoId() { return assetVideoId; }
    public void setAssetVideoId(String v) { this.assetVideoId = v; }
}
