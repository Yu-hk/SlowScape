package com.slowscape.config;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 数据库初始化器 — Hibernate DDL 完成后，添加 pgvector 向量列。
 * 避免 JPA 的 ddl-auto 把 vector 类型转回 varchar。
 */
@Component
public class DatabaseInitializer {
    private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);

    private final EntityManager entityManager;

    public DatabaseInitializer(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 应用启动后执行 */
    public void ensureVectorColumn() {
        try {
            entityManager.createNativeQuery(
                "ALTER TABLE video_assets ADD COLUMN IF NOT EXISTS embedding vector(1536)")
                .executeUpdate();
            log.info("[DB] pgvector 列已就绪");
        } catch (Exception e) {
            // 第一次跑可能已有该列，忽略重复错误
            log.info("[DB] pgvector 列已存在或创建失败: {}", e.getMessage());
        }
    }
}
