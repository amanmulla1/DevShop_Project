package com.devshop.backend.config;

import com.devshop.backend.repository.AdminRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.CommandLineRunner;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
