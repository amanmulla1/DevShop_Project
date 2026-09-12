package com.devshop.backend.controller;

import com.devshop.backend.auth.AuthDtos;
import com.devshop.backend.repository.CustomerRepository;
import com.devshop.backend.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Authentication endpoints for customers and admins.
 *
 *  - POST /api/auth/register  : create a customer account (auto-login)
 *  - POST /api/auth/login     : login a customer
 *  - POST /api/auth/admin/login : login an admin (role ADMIN)
 *  - GET  /api/auth/me        : current identity (customer or admin)
 *  - POST /api/auth/logout    : stateless JWT — client discards token
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final CustomerRepository customerRepository;
    private final com.devshop.backend.repository.AdminRepository adminRepository;

    public AuthController(AuthService authService,
                          CustomerRepository customerRepository,
                          com.devshop.backend.repository.AdminRepository adminRepository) {
        this.authService = authService;
        this.customerRepository = customerRepository;
        this.adminRepository = adminRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody AuthDtos.RegisterRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(authService.registerCustomer(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthDtos.LoginRequest request) {
        try {
            return ResponseEntity.ok(authService.loginCustomer(request.email(), request.password()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
        }
    }

    @PostMapping("/admin/login")
    public ResponseEntity<?> adminLogin(@RequestBody AuthDtos.LoginRequest request) {
        try {
            return ResponseEntity.ok(authService.loginAdmin(request.email(), request.password()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
        }
    }

    /**
     * Returns the authenticated principal's non-sensitive identity based solely
     * on the JWT, never on a client-supplied identifier.
     */
    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        if (authentication == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Not authenticated"));
        }
        String subject = authentication.getName();
        boolean isAdmin = authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));

        if (isAdmin) {
            if (subject == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Account not found"));
            }
            return adminRepository.findById(Long.parseLong(subject))
                    .<ResponseEntity<?>>map(admin -> ResponseEntity.ok((Object) java.util.Map.of(
                            "role", "ADMIN",
                            "name", admin.getName(),
                            "email", admin.getEmail()
                    )))
                    .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Account not found")));
        }

        return customerRepository.findByUserid(subject)
                .<ResponseEntity<?>>map(customer -> {
                    Map<String, Object> body = new java.util.HashMap<>();
                    body.put("role", customer.getRole());
                    body.put("userid", customer.getUserid());
                    body.put("name", customer.getName());
                    body.put("email", customer.getEmail());
                    body.put("phone", customer.getPhone());
                    body.put("address", customer.getAddress());
                    body.put("city", customer.getCity());
                    body.put("state", customer.getState());
                    body.put("postalCode", customer.getPostalCode());
                    return ResponseEntity.ok((Object) body);
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Account not found")));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout() {
        // Stateless JWT: there is nothing to invalidate server-side. The client
        // simply discards the token. Returning 200 acknowledges the intent.
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    public record ErrorResponse(String message) {
    }
}
