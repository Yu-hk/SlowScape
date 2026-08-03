package com.slowscape.controller;

import com.slowscape.entity.CommentEntity;
import com.slowscape.model.ApiResponse;
import com.slowscape.model.VideoAsset;
import com.slowscape.repo.CommentRepo;
import com.slowscape.service.AuthService;
import com.slowscape.service.GenerationService;
import com.slowscape.service.LibraryService;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/** 视频查询 + 单条删除。 */
@RestController
@RequestMapping("/api/v1/videos")
public class VideoController {

    private final LibraryService library;
    private final GenerationService generation;
    private final CommentRepo commentRepo;
    private final AuthService auth;

    public VideoController(LibraryService library, GenerationService generation, CommentRepo commentRepo, AuthService auth) {
        this.library = library;
        this.generation = generation;
        this.commentRepo = commentRepo;
        this.auth = auth;
    }

    @GetMapping("/library")
    public ApiResponse<Map<String, Object>> library(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String scene,
            @RequestParam(defaultValue = "recent") String sort) {
        return ApiResponse.ok(library.list(page, limit, scene, sort));
    }

    @GetMapping("/feed")
    public ApiResponse<Map<String, Object>> feed(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.ok(generation.listFeed(page, limit));
    }

    @GetMapping("/{videoId}")
    public ApiResponse<VideoAsset> getVideo(@PathVariable String videoId) {
        VideoAsset a = generation.getVideo(videoId);
        if (a == null) return ApiResponse.fail(4040, "视频不存在");
        return ApiResponse.ok(a);
    }

    @DeleteMapping("/{videoId}")
    public ApiResponse<Map<String, Object>> deleteVideo(@PathVariable String videoId) {
        VideoAsset removed = generation.removeFromFeed(videoId);
        if (removed == null) return ApiResponse.fail(4040, "视频不在生成历史中");
        return ApiResponse.ok(Map.of("video_id", videoId, "removed", true));
    }

    @GetMapping("/{videoId}/comments")
    public ApiResponse<List<Map<String, Object>>> listComments(@PathVariable String videoId) {
        List<CommentEntity> list = commentRepo.findByVideoIdOrderByCreatedAtAsc(videoId);
        List<Map<String, Object>> data = list.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("video_id", c.getVideoId());
            m.put("user_id", c.getUserId());
            m.put("username", c.getUsername());
            m.put("content", c.getContent());
            m.put("created_at", c.getCreatedAt());
            return m;
        }).toList();
        return ApiResponse.ok(data);
    }

    @PostMapping("/{videoId}/comments")
    public ApiResponse<Map<String, Object>> addComment(
            @PathVariable String videoId,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ApiResponse.fail(4010, "请先登录后再评论");
        }
        AuthService.UserProfile profile = auth.verifyToken(authHeader.substring(7));
        if (profile == null) return ApiResponse.fail(4010, "登录已过期，请重新登录");
        String content = body.get("content");
        if (content == null || content.trim().length() == 0) return ApiResponse.fail(4001, "评论内容不能为空");
        if (content.length() > 500) return ApiResponse.fail(4002, "评论不能超过 500 字");
        CommentEntity c = new CommentEntity(videoId, profile.id(), profile.username(), content.trim(), Instant.now().toString());
        commentRepo.save(c);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("video_id", videoId);
        m.put("user_id", profile.id());
        m.put("username", profile.username());
        m.put("content", c.getContent());
        m.put("created_at", c.getCreatedAt());
        return ApiResponse.ok(m);
    }
}
