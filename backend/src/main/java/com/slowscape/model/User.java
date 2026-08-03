package com.slowscape.model;

/** 用户模型。 */
public class User {
    private String id;
    private String username;
    private String email;
    private String passwordHash;

    public User() {}

    public User(String id, String username, String email, String passwordHash) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public void setId(String v) { this.id = v; }
    public void setUsername(String v) { this.username = v; }
    public void setEmail(String v) { this.email = v; }
    public void setPasswordHash(String v) { this.passwordHash = v; }
}
