package com.slowscape.controller;

import com.slowscape.model.ApiResponse;
import com.slowscape.service.ConfigService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 运行时配置管理 API — 实时读写 prompt 模板等配置项，无需重启。
 */
@RestController
@RequestMapping("/api/v1/config")
public class ConfigController {

    private final ConfigService configService;

    public ConfigController(ConfigService configService) {
        this.configService = configService;
    }

    /** GET /api/v1/config — 获取全部配置。 */
    @GetMapping
    public ApiResponse<Map<String, String>> list() {
        return ApiResponse.ok(configService.all());
    }

    /** GET /api/v1/config/{key} — 读单条。 */
    @GetMapping("/{key:.+}")
    public ApiResponse<String> get(@PathVariable String key) {
        String val = configService.get(key);
        if (val == null) return ApiResponse.fail(4040, "配置项不存在: " + key);
        return ApiResponse.ok(val);
    }

    /** PUT /api/v1/config/{key} — 写单条，即时生效不重启。 */
    @PutMapping("/{key:.+}")
    public ApiResponse<String> set(@PathVariable String key, @RequestBody Map<String, String> body) {
        String value = body.get("value");
        if (value == null || value.isBlank())
            return ApiResponse.fail(4001, "value 不能为空");
        configService.set(key, value);
        return ApiResponse.ok(value);
    }
}
