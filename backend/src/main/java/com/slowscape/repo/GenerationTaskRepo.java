package com.slowscape.repo;

import com.slowscape.entity.GenerationTaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GenerationTaskRepo extends JpaRepository<GenerationTaskEntity, String> {
}
