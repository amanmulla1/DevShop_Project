package com.devshop.backend.config;

import com.devshop.backend.model.Admin;
import com.devshop.backend.repository.AdminRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the bootstrap admin seed is duplicate-safe: invoking the seeder a
 * second time must not insert a second admin row.
 *
 * Uses a dedicated profile (not "test") so {@link DataInitializer} is active.
 */
@SpringBootTest
@ActiveProfiles("seedtest")
class AdminSeedTest {

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    @Qualifier("seedAdmin")
    private CommandLineRunner seedAdmin;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Value("${app.admin.password}")
    private String configuredPassword;

    @Test
    void adminSeedIsDuplicateSafe() throws Exception {
        // DataInitializer runs on startup, so exactly one admin should exist.
        long afterStartup = adminRepository.count();
        assertEquals(1, afterStartup, "Seed should have created exactly one admin on startup");

        // Running the seeder again must NOT create a duplicate.
        seedAdmin.run();

        assertEquals(1, adminRepository.count(),
                "Re-running the seed must not create a duplicate admin");
    }

    @Test
    void staleAdminPasswordIsSyncedToEnvironmentWithoutDuplicate() throws Exception {
        // Simulate a pre-existing admin row holding a stale (non-authoritative)
        // password hash, e.g. from an earlier deployment.
        Admin admin = adminRepository.findByEmail("seedadmin@test.com").orElseThrow();
        admin.setPasswordHash(passwordEncoder.encode("SomeOldPassword123!"));
        adminRepository.save(admin);

        seedAdmin.run();

        assertEquals(1, adminRepository.count(),
                "Re-syncing the admin password must not create a duplicate admin");

        Admin refreshed = adminRepository.findByEmail("seedadmin@test.com").orElseThrow();
        assertTrue(passwordEncoder.matches(configuredPassword, refreshed.getPasswordHash()),
                "Existing admin password should be re-hashed to match the configured ADMIN_PASSWORD");
    }

    @Test
    void staleEmailIsMigratedToConfiguredEmailWithoutDuplicate() throws Exception {
        // Simulate the AWS state: a legacy admin row under an older default email
        // (e.g. admin@devshop.com) with no row under the configured target email.
        Admin legacy = adminRepository.findByEmail("seedadmin@test.com").orElseThrow();
        legacy.setEmail("admin@devshop.com");
        legacy.setPasswordHash(passwordEncoder.encode("SomeOldPassword123!"));
        adminRepository.save(legacy);

        assertEquals(false, adminRepository.findByEmail("seedadmin@test.com").isPresent(),
                "Precondition: no admin exists yet under the configured email");

        seedAdmin.run();

        assertEquals(1, adminRepository.count(),
                "Migration must leave exactly one admin (no duplicate, no data loss)");

        Admin migrated = adminRepository.findByEmail("seedadmin@test.com").orElseThrow();
        assertTrue(passwordEncoder.matches(configuredPassword, migrated.getPasswordHash()),
                "Migrated admin password should be re-hashed to match the configured ADMIN_PASSWORD");
    }
}
