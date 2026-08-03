package com.slowscape.model;

/** 注册请求体。 */
public class RegisterRequest {
    private String username;
    private String email;
    private String password;

    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPassword() { return password; }
    public void setUsername(String v) { this.username = v; }
    public void setEmail(String v) { this.email = v; }
    public void setPassword(String v) { this.password = v; }
}
