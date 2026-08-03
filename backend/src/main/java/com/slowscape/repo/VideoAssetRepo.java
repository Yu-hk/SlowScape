package com.slowscape.repo;

import com.slowscape.entity.VideoAssetEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VideoAssetRepo extends JpaRepository<VideoAssetEntity, String> {
    List<VideoAssetEntity> findBySourceOrderByCreatedAtDesc(String source, Pageable pageable);
    List<VideoAssetEntity> findBySourceOrderByCreatedAtDesc(String source);
    List<VideoAssetEntity> findBySource(String source);
    Optional<VideoAssetEntity> findTop1ByPoster(String posterUrl);
    long countBySource(String source);
}
