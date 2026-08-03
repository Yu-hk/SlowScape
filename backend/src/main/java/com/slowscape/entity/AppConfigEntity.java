package com.slowscape.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "app_config")
public class AppConfigEntity {
    @Id @Column(length = 128)
    private String configKey;

    @Column(length = 4096)
    private String configValue;

    public AppConfigEntity() {}
    public AppConfigEntity(String configKey, String configValue) {
        this.configKey = configKey;
        this.configValue = configValue;
    }

    public String getConfigKey() { return configKey; }
    public String getConfigValue() { return configValue; }
    public void setConfigKey(String v) { this.configKey = v; }
    public void setConfigValue(String v) { this.configValue = v; }
}
