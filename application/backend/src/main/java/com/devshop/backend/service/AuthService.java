package com.devshop.backend.service;

import com.devshop.backend.auth.AuthDtos;
import com.devshop.backend.model.Admin;
import com.devshop.backend.model.Customer;
import com.devshop.backend.repository.AdminRepository;
import com.devshop.backend.repository.CustomerRepository;
import com.devshop.backend.security.JwtTokenProvider;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Encapsulates registration and login for both customers and admins.
 *
 * Passwords are always BCrypt-encoded before persistence and verified against
 * the stored hash — plaintext is never stored or returned.
 */
@Service
public class AuthService {

    private final CustomerRepository customerRepository;
    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthService(CustomerRepository customerRepository,
                       AdminRepository adminRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider) {
        this.customerRepository = customerRepository;
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }

    @Transactional
    public AuthDtos.AuthResponse registerCustomer(AuthDtos.RegisterRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("Full Name is required");
        }
        if (request.email() == null || request.email().isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }
        if (request.password() == null || request.password().length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters");
        }
        if (!request.password().equals(request.confirmPassword())) {
            throw new IllegalArgumentException("Passwords do not match");
        }

        String normalizedEmail = request.email().trim().toLowerCase();
        if (!normalizedEmail.matches(".+@.+\\..+")) {
            throw new IllegalArgumentException("Please enter a valid email address");
        }
        if (customerRepository.findByEmail(normalizedEmail).isPresent()
                || adminRepository.findByEmail(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("An account with this email already exists");
        }

        Customer customer = new Customer();
        customer.setName(request.name().trim());
        customer.setEmail(normalizedEmail);
        customer.setPhone(request.phone() != null ? request.phone().trim() : null);
        customer.setAddress(request.deliveryAddress());
        customer.setCity(request.city());
        customer.setState(request.state());
        customer.setPostalCode(request.postalCode());
        customer.setUserid(Customer.generateUserId());
        customer.setPasswordHash(passwordEncoder.encode(request.password()));
        customer.setRole(Customer.ROLE_CUSTOMER);

        Customer saved = customerRepository.save(customer);
        String token = tokenProvider.generateToken(saved);

        return new AuthDtos.AuthResponse(
                token, "Bearer", saved.getRole(), saved.getUserid(), saved.getName(), saved.getEmail());
    }

    public AuthDtos.AuthResponse loginCustomer(String email, String password) {
        Customer customer = findByLoginEmail(email);
        if (customer == null || customer.getPasswordHash() == null
                || !passwordEncoder.matches(password, customer.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password");
        }
        String token = tokenProvider.generateToken(customer);
        return new AuthDtos.AuthResponse(
                token, "Bearer", customer.getRole(), customer.getUserid(), customer.getName(), customer.getEmail());
    }

    public AuthDtos.AuthResponse loginAdmin(String email, String password) {
        String normalizedEmail = email != null ? email.trim().toLowerCase() : "";
        Admin admin = adminRepository.findByEmail(normalizedEmail).orElse(null);
        if (admin == null || !passwordEncoder.matches(password, admin.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password");
        }
        String token = tokenProvider.generateToken(admin);
        return new AuthDtos.AuthResponse(
                token, "Bearer", Customer.ROLE_ADMIN, null, admin.getName(), admin.getEmail());
    }

    /**
     * Looks a customer up by email while tolerating case/whitespace variance.
     */
    private Customer findByLoginEmail(String email) {
        if (email == null) {
            return null;
        }
        Customer byExact = customerRepository.findByEmail(email.trim().toLowerCase()).orElse(null);
        // Existing data may have stored emails with mixed case; fall back to a
        // case-insensitive scan only if the normalized lookup missed.
        if (byExact == null) {
            return customerRepository.findAll().stream()
                    .filter(c -> email.trim().equalsIgnoreCase(c.getEmail()))
                    .findFirst()
                    .orElse(null);
        }
        return byExact;
    }
}
