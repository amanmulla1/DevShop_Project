package com.devshop.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration for the DevShop backend.
 *
 * Supports both customer frontend (port 5173) and admin frontend (port 5174).
 *
 * The allowed origins are read from the CORS_ALLOWED_ORIGINS environment variable
 * as a comma-separated list, so values can be changed per environment without recompiling.
 *
 * Default: http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174
 * - http://localhost:5173 / http://127.0.0.1:5173: Customer storefront (Vite dev server)
 * - http://localhost:5174 / http://127.0.0.1:5174: Admin dashboard (Vite dev server)
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${cors.allowed-origins:http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] origins = allowedOrigins.split(",");
        registry.addMapping("/api/**")
                .allowedOrigins(origins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
