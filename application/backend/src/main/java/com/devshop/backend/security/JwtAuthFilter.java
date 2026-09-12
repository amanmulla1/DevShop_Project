package com.devshop.backend.security;

import com.devshop.backend.repository.AdminRepository;
import com.devshop.backend.repository.CustomerRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Reads a {@code Authorization: Bearer <jwt>} header, validates it, and if
 * valid populates the Spring Security context with the authenticated principal
 * and its authorities (ROLE_CUSTOMER or ROLE_ADMIN).
 *
 * Authorization is always derived from the token identity — never from a
 * client-supplied user id.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final CustomerRepository customerRepository;
    private final AdminRepository adminRepository;

    public JwtAuthFilter(JwtTokenProvider tokenProvider,
                         CustomerRepository customerRepository,
                         AdminRepository adminRepository) {
        this.tokenProvider = tokenProvider;
        this.customerRepository = customerRepository;
        this.adminRepository = adminRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (tokenProvider.isValid(token)) {
                try {
                    Claims claims = tokenProvider.parseClaims(token);
                    String type = claims.get("type") != null ? claims.get("type").toString() : "CUSTOMER";
                    String subject = claims.getSubject();
                    String role = claims.get("role") != null ? claims.get("role").toString() : "CUSTOMER";
                    boolean principalFound = false;

                    if ("CUSTOMER".equals(type)) {
                        principalFound = customerRepository.findByUserid(subject).isPresent();
                    } else if ("ADMIN".equals(type)) {
                        principalFound = adminRepository.findById(Long.valueOf(subject)).isPresent();
                    }

                    if (principalFound) {
                        var authentication = new UsernamePasswordAuthenticationToken(
                                subject,
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_" + role))
                        );
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    }
                } catch (Exception ex) {
                    SecurityContextHolder.clearContext();
                }
            }
        }
        filterChain.doFilter(request, response);
    }
}
