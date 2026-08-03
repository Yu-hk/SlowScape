package com.slowscape.controller;

import com.slowscape.model.ApiResponse;
import com.slowscape.model.GenerationTask;
import com.slowscape.service.GenerationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** 生成任务提交 + 状态轮询 + 取消。 */
@RestController
@RequestMapping("/api/v1/videos")
public class GenerationController {

    private static final Set<String> BLOCKED_WORDS = Set.of("暴力", "血腥", "色情", "porn");
    private static final int MAX_CONCURRENT = 3;

    private final GenerationService generation;

    public GenerationController(GenerationService generation) {
        this.generation = generation;
    }

    @PostMapping("/generate")
    public ApiResponse<Map<String, Object>> generate(@RequestBody Map<String, Object> body) {
        String prompt = body.containsKey("prompt") ? ((String) body.get("prompt")).trim() : "";
        if (prompt.isBlank())
            return ApiResponse.fail(2001, "景色描述不能为空");
        if (prompt.length() > 200)
            return ApiResponse.fail(2001, "景色描述过长（最多 200 字）");
        if (BLOCKED_WORDS.stream().anyMatch(w -> prompt.toLowerCase().contains(w)))
            return ApiResponse.fail(2003, "内容未通过安全审核");

        if (generation.activeCount() >= MAX_CONCURRENT)
            return ApiResponse.fail(2409, "同时进行中的任务过多，请稍候");

        @SuppressWarnings("unchecked")
        List<String> refs = body.containsKey("references") && body.get("references") instanceof List
                ? ((List<String>) body.get("references")).stream().filter(r -> r instanceof String).map(r -> (String) r).limit(4).toList()
                : List.of();

        int duration = body.containsKey("duration") && body.get("duration") instanceof Number
                ? ((Number) body.get("duration")).intValue() : 5;
        String resolution = (String) body.getOrDefault("resolution", "720p");
        String qualityTier = (String) body.getOrDefault("quality_tier", "standard");
        String aspectRatio = (String) body.getOrDefault("aspect_ratio", "16:9");

        GenerationTask task = generation.createTask(prompt, duration, resolution, qualityTier, aspectRatio, refs);
        return ApiResponse.ok(Map.of("task_id", task.getTask_id(), "status", task.getStatus()));
    }

    @PostMapping("/suggest-references")
    public ApiResponse<Map<String, Object>> suggestReferences(@RequestBody Map<String, Object> body) {
        String prompt = body.containsKey("prompt") ? ((String) body.get("prompt")).trim() : "";
        Map<String, Object> r = generation.suggestReferences(prompt);
        return ApiResponse.ok(r);
    }

    @GetMapping("/tasks/{taskId}")
    public ApiResponse<GenerationTask> getTask(@PathVariable String taskId) {
        GenerationTask t = generation.getTask(taskId);
        if (t == null) return ApiResponse.fail(4040, "任务不存在");
        return ApiResponse.ok(t);
    }

    @DeleteMapping("/tasks/{taskId}")
    public ApiResponse<Map<String, Object>> cancelTask(@PathVariable String taskId) {
        GenerationTask t = generation.cancelTask(taskId);
        if (t == null) return ApiResponse.fail(4040, "任务不存在");
        return ApiResponse.ok(Map.of("task_id", t.getTask_id(), "status", t.getStatus()));
    }
}
