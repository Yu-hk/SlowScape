package com.slowscape.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "users")
public class UserEntity {
    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, unique = true, length = 64)
    private String username;

    @Column(nullable = false, unique = true, length = 128)
    private String email;

    @Column(nullable = false, length = 128)
    private String passwordHash;

    @Column(nullable = false, length = 32)
    private String role = "user";

    @Column(nullable = false)
    private String createdAt;

    public UserEntity() {}
    public UserEntity(String id, String username, String email, String passwordHash) {
        this.id = id; this.username = username; this.email = email;
        this.passwordHash = passwordHash; this.role = "user"; this.createdAt = Instant.now().toString();
    }

    public String getRole() { return role; }
    public void setRole(String v) { this.role = v; }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getCreatedAt() { return createdAt; }

    public void setId(String v) { this.id = v; }
    public void setUsername(String v) { this.username = v; }
    public void setEmail(String v) { this.email = v; }
    public void setPasswordHash(String v) { this.passwordHash = v; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
