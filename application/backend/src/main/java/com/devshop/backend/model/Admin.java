package com.devshop.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.Instant;

/**
 * A DevShop administrator (dashboard user).
 *
 * The password is stored ONLY as a BCrypt hash and is never serialized to JSON.
 * Admin credentials are provisioned from the {@code ADMIN_EMAIL} and
 * {@code ADMIN_PASSWORD} environment variables — never hardcoded.
 */
@Entity
@Table(
    name = "admins",
    uniqueConstraints = @UniqueConstraint(name = "uk_admins_email", columnNames = "email")
)
public class Admin {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String name;

    @Column(name = "password_hash", nullable = false, length = 100)
    @JsonIgnore
    private String passwordHash;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public Admin() {
    }

    public Admin(String email, String name, String passwordHash) {
        this.email = email;
        this.name = name;
        this.passwordHash = passwordHash;
    }

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
