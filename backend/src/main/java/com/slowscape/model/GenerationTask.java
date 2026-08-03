package com.slowscape.model;

import java.util.List;

/** 生成任务 — 与前端轮询契约一致。 */
public class GenerationTask {
    private String task_id;
    private String status; // queued / processing / succeeded / failed / cancelled
    private String prompt;
    private String provider;
    private String provider_task_id;
    private String created_at;
    private String updated_at;
    private VideoAsset asset;
    private TaskError error;

    public static class TaskError {
        private String code;
        private String message;
        public TaskError() {}
        public TaskError(String code, String message) { this.code = code; this.message = message; }
        public String getCode() { return code; }
        public String getMessage() { return message; }
        public void setCode(String c) { this.code = c; }
        public void setMessage(String m) { this.message = m; }
    }

    public GenerationTask() {}
    public GenerationTask(String taskId, String prompt) {
        this.task_id = taskId;
        this.prompt = prompt;
        this.status = "queued";
        this.created_at = java.time.Instant.now().toString();
        this.updated_at = this.created_at;
    }

    public String getTask_id() { return task_id; }
    public String getStatus() { return status; }
    public String getPrompt() { return prompt; }
    public String getProvider() { return provider; }
    public String getProvider_task_id() { return provider_task_id; }
    public String getCreated_at() { return created_at; }
    public String getUpdated_at() { return updated_at; }
    public VideoAsset getAsset() { return asset; }
    public TaskError getError() { return error; }

    public void setTask_id(String v) { this.task_id = v; }
    public void setStatus(String v) { this.status = v; }
    public void setPrompt(String v) { this.prompt = v; }
    public void setProvider(String v) { this.provider = v; }
    public void setProvider_task_id(String v) { this.provider_task_id = v; }
    public void setCreated_at(String v) { this.created_at = v; }
    public void setUpdated_at(String v) { this.updated_at = v; }
    public void setAsset(VideoAsset v) { this.asset = v; }
    public void setError(TaskError v) { this.error = v; }
}
