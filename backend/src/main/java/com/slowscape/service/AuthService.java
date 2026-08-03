package com.slowscape.service;

import at.favre.lib.crypto.bcrypt.BCrypt;
import com.slowscape.entity.UserEntity;
import com.slowscape.repo.UserRepo;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class AuthService {

    private final UserRepo userRepo;
    private SecretKey jwtKey;

    public AuthService(UserRepo userRepo) {
        this.userRepo = userRepo;
    }

    @PostConstruct
    void init() {
        String secret = System.getenv("JWT_TOKEN_SECRET");
        if (secret == null || secret.isBlank()) secret = "SlowScape-MVP-JWT-Secret-Key-2026-07-28-Temp";
        this.jwtKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        // 种子管理员
        if (!userRepo.existsByUsername("admin")) {
            String hash = BCrypt.withDefaults().hashToString(10, "admin123".toCharArray());
            UserEntity admin = new UserEntity(UUID.randomUUID().toString(), "admin", "admin@mansu.app", hash);
            admin.setRole("admin");
            userRepo.save(admin);
        }
    }

    public UserProfile register(String username, String email, String password) {
        if (userRepo.existsByEmail(normalizeEmail(email))) return null;
        if (userRepo.existsByUsername(username)) return null;
        String id = UUID.randomUUID().toString();
        String hash = BCrypt.withDefaults().hashToString(10, password.toCharArray());
        UserEntity u = new UserEntity(id, username, normalizeEmail(email), hash);
        userRepo.save(u);
        return new UserProfile(id, username, email, "user");
    }

    public UserProfile login(String emailOrUsername, String password) {
        UserEntity user = userRepo.findByEmail(normalizeEmail(emailOrUsername)).orElse(null);
        if (user == null) user = userRepo.findByUsername(emailOrUsername).orElse(null);
        if (user == null) return null;
        BCrypt.Result r = BCrypt.verifyer().verify(password.toCharArray(), user.getPasswordHash());
        if (!r.verified) return null;
        return new UserProfile(user.getId(), user.getUsername(), user.getEmail(), user.getRole());
    }

    public String createToken(UserProfile profile) {
        Date now = new Date();
        return Jwts.builder()
                .subject(profile.id())
                .claim("username", profile.username())
                .claim("email", profile.email())
                .claim("role", profile.role())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 48 * 3_600_000L))
                .signWith(jwtKey)
                .compact();
    }

    public UserProfile verifyToken(String token) {
        try {
            Claims c = Jwts.parser().verifyWith(jwtKey).build().parseSignedClaims(token).getPayload();
            return new UserProfile(c.getSubject(),
                c.get("username", String.class), c.get("email", String.class), c.get("role", String.class));
        } catch (Exception e) {
            return null;
        }
    }

    private static String normalizeEmail(String e) {
        return e == null ? "" : e.trim().toLowerCase();
    }

    public record UserProfile(String id, String username, String email, String role) {
        public boolean isAdmin() { return "admin".equals(role); }
    }
}
