package com.slowscape.repo;

import com.slowscape.entity.CommentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CommentRepo extends JpaRepository<CommentEntity, Long> {
    List<CommentEntity> findByVideoIdOrderByCreatedAtAsc(String videoId);
}
