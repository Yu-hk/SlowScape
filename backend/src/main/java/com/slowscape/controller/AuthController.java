package com.slowscape.controller;

import com.slowscape.model.ApiResponse;
import com.slowscape.model.LoginRequest;
import com.slowscape.model.RegisterRequest;
import com.slowscape.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 认证控制层：注册 / 登录 / 当前用户。 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    public ApiResponse<Map<String, Object>> register(@RequestBody RegisterRequest body) {
        // 校验
        String username = body.getUsername() != null ? body.getUsername().trim() : "";
        String email = body.getEmail() != null ? body.getEmail().trim() : "";
        String password = body.getPassword() != null ? body.getPassword() : "";

        if (username.isBlank() || username.length() < 2)
            return ApiResponse.fail(4001, "用户名至少 2 个字符");
        if (email.isBlank() || !email.contains("@"))
            return ApiResponse.fail(4002, "请输入合法邮箱");
        if (password.length() < 6)
            return ApiResponse.fail(4003, "密码至少 6 个字符");

        AuthService.UserProfile profile = auth.register(username, email, password);
        if (profile == null)
            return ApiResponse.fail(4004, "用户名或邮箱已被注册");

        String token = auth.createToken(profile);
        return ApiResponse.ok(Map.of(
            "token", token,
            "user", Map.of("id", profile.id(), "username", profile.username(), "email", profile.email())
        ));
    }

    @PostMapping("/login")
    public ApiResponse<Map<String, Object>> login(@RequestBody LoginRequest body) {
        String login = body.getLogin() != null ? body.getLogin().trim() : "";
        String password = body.getPassword() != null ? body.getPassword() : "";

        if (login.isBlank() || password.isBlank())
            return ApiResponse.fail(4010, "请输入账号和密码");

        AuthService.UserProfile profile = auth.login(login, password);
        if (profile == null)
            return ApiResponse.fail(4011, "账号或密码错误");

        String token = auth.createToken(profile);
        return ApiResponse.ok(Map.of(
            "token", token,
            "user", Map.of("id", profile.id(), "username", profile.username(), "email", profile.email())
        ));
    }

    @GetMapping("/me")
    public ApiResponse<Map<String, Object>> me(@RequestHeader("Authorization") String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer "))
            return ApiResponse.fail(4010, "未登录或 token 已过期");

        String token = authHeader.substring(7);
        AuthService.UserProfile profile = auth.verifyToken(token);
        if (profile == null)
            return ApiResponse.fail(4010, "未登录或 token 已过期");

        return ApiResponse.ok(Map.of(
            "id", profile.id(), "username", profile.username(), "email", profile.email()
        ));
    }
}
