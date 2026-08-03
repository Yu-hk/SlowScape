package com.slowscape.repo;

import com.slowscape.entity.AppConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppConfigRepo extends JpaRepository<AppConfigEntity, String> {
    Optional<AppConfigEntity> findByConfigKey(String configKey);
}
