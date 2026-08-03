package com.slowscape.model;

/** 登录请求体。 */
public class LoginRequest {
    private String login;    // 邮箱或用户名
    private String password;

    public String getLogin() { return login; }
    public String getPassword() { return password; }
    public void setLogin(String v) { this.login = v; }
    public void setPassword(String v) { this.password = v; }
}
