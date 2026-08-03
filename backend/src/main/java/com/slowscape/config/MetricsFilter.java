package com.slowscape.config;

import com.slowscape.service.MetricsService;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 请求指标采集过滤器 — 自动采集所有 API 请求的延时/状态码/路径。
 */
@Component
public class MetricsFilter implements Filter {

    private final MetricsService metrics;

    public MetricsFilter(MetricsService metrics) {
        this.metrics = metrics;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        long start = System.currentTimeMillis();
        try {
            chain.doFilter(request, response);
        } finally {
            long took = System.currentTimeMillis() - start;
            int status = ((HttpServletResponse) response).getStatus();
            String path = req.getRequestURI();
            // 排除静态资源
            if (!path.startsWith("/assets") && !path.equals("/")) {
                metrics.recordRequest(path, status, took);
            }
        }
    }
}
