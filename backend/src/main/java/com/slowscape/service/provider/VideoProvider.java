package com.slowscape.service.provider;

import java.util.List;
import java.util.Map;

/** 视频生成适配器统一契约 — 与 Node 版 (kling/hailuo/wan) 同语义。 */
public interface VideoProvider {

    /** 适配器名称（如 "wan", "kling", "hailuo"），与路由匹配。 */
    String name();

    /** 是否已配置（有 API Key、可调用）。 */
    boolean isConfigured();

    /** 提交异步生成任务，返回 provider 侧 taskId。 */
    String submit(String prompt, List<String> references, String duration, String resolution, String aspectRatio) throws Exception;

    /** 轮询任务状态，返回 status + videoUrl。 */
    PollResult poll(String providerTaskId) throws Exception;

    /** 元数据：displayName, baseUrl, model, hasAudio, costPerSec。 */
    Map<String, Object> meta();

    /** 轮询间隔（毫秒），默认 4s。 */
    default long getPollInterval() { return 4000; }

    /** 轮询超时（毫秒），默认 5min。 */
    default long getPollTimeout() { return 300000; }

    class PollResult {
        public final String status;  // "succeeded" / "failed" / "processing"
        public final String videoUrl;
        public PollResult(String status, String videoUrl) {
            this.status = status;
            this.videoUrl = videoUrl;
        }
    }
}
