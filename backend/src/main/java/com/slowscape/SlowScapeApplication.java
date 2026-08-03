package com.slowscape;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class SlowScapeApplication {
    public static void main(String[] args) {
        SpringApplication.run(SlowScapeApplication.class, args);
    }
}
