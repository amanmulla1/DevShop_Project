package com.devshop.backend.auth;

/**
 * Request payloads and response DTOs for customer/admin authentication.
 */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            String name,
            String email,
            String phone,
            String password,
            String confirmPassword,
            String deliveryAddress,
            String city,
            String state,
            String postalCode
    ) {
    }

    public record LoginRequest(String email, String password) {
    }

    /**
     * Non-sensitive identity returned after login/registration and on /me.
     * Never contains a password, passwordHash, or token secret.
     */
    public record AuthResponse(
            String token,
            String tokenType,
            String role,
            String userid,
            String name,
            String email
    ) {
    }
}
