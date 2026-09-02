package com.devshop.backend;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        // Set timezone to Asia/Kolkata for PostgreSQL compatibility
        // PostgreSQL server is configured with Asia/Kolkata timezone
        // and rejects the deprecated "Asia/Calcutta" identifier
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        
        SpringApplication.run(BackendApplication.class, args);
    }
}
