package com.slowscape.controller;

import com.slowscape.model.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/healthz")
    public ApiResponse<Map<String, String>> health() {
        return ApiResponse.ok(Map.of("status", "ok"));
    }

    @GetMapping("/")
    public void index(HttpServletResponse resp) throws IOException {
        resp.sendRedirect("/index.html");
    }
}
