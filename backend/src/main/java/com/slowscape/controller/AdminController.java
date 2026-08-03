package com.slowscape.controller;

import com.slowscape.model.ApiResponse;
import com.slowscape.service.AuthService;
import com.slowscape.service.ConfigService;
import com.slowscape.service.MetricsService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 管理后台 API — 需要 admin 角色 JWT token。
 * POST /api/v1/admin/login → 获取 admin token
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final ConfigService configService;
    private final AuthService authService;
    private final MetricsService metricsService;

    public AdminController(ConfigService configService, AuthService authService, MetricsService metricsService) {
        this.configService = configService;
        this.authService = authService;
        this.metricsService = metricsService;
    }

    /** 管理员登录（账号 admin / 密码 admin123） */
    @PostMapping("/login")
    public ApiResponse<?> login(@RequestBody Map<String, String> body) {
        String login = body.getOrDefault("username", "");
        String password = body.getOrDefault("password", "");
        var profile = authService.login(login, password);
        if (profile == null || !profile.isAdmin())
            return ApiResponse.fail(4011, "管理员账号或密码错误");
        String token = authService.createToken(profile);
        return ApiResponse.ok(Map.of("token", token, "username", profile.username()));
    }

    /** 获取全部配置（需 admin token） */
    @GetMapping("/config")
    public ApiResponse<?> listConfig(@RequestHeader("Authorization") String auth) {
        var profile = verifyAdmin(auth);
        if (profile == null) return ApiResponse.fail(4011, "未授权");
        return ApiResponse.ok(configService.all());
    }

    /** 更新配置（需 admin token） */
    @PutMapping("/config/{key}")
    public ApiResponse<?> setConfig(@RequestHeader("Authorization") String auth,
                                     @PathVariable String key,
                                     @RequestBody Map<String, String> body) {
        var profile = verifyAdmin(auth);
        if (profile == null) return ApiResponse.fail(4011, "未授权");
        String value = body.get("value");
        if (value == null || value.isBlank()) return ApiResponse.fail(4001, "value 不能为空");
        configService.set(key, value);
        return ApiResponse.ok(value);
    }

    /** 获取监控指标（需 admin token） */
    @GetMapping("/metrics")
    public ApiResponse<?> metrics(@RequestHeader("Authorization") String auth) {
        var profile = verifyAdmin(auth);
        if (profile == null) return ApiResponse.fail(4011, "未授权");
        return ApiResponse.ok(metricsService.snapshot());
    }

    private AuthService.UserProfile verifyAdmin(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        var profile = authService.verifyToken(authHeader.substring(7));
        return (profile != null && profile.isAdmin()) ? profile : null;
    }
}
