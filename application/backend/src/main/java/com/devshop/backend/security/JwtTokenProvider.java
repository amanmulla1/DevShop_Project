package com.devshop.backend.security;

import com.devshop.backend.model.Admin;
import com.devshop.backend.model.Customer;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

/**
 * Issues and validates signed JWTs for both customers and admins.
 *
 * The token carries:
 *  - {@code sub}   : the authenticated principal's logical id
 *    (customer {@code userid} like CUS-XXXXXXXX, or admin id)
 *  - {@code role}  : CUSTOMER or ADMIN
 *  - {@code type}  : CUSTOMER or ADMIN (used to look up the right principal)
 *
 * The signing secret comes ONLY from the {@code JWT_SECRET} environment
 * variable — never hardcoded.
 */
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long validityMillis;

    public JwtTokenProvider(@Value("${app.jwt.secret}") String secret,
                            @Value("${app.jwt.expiration-ms:86400000}") long validityMillis) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.validityMillis = validityMillis;
    }

    public String generateToken(Customer customer) {
        return buildToken(customer.getUserid(), "CUSTOMER", customer.getName());
    }

    public String generateToken(Admin admin) {
        return buildToken(String.valueOf(admin.getId()), "ADMIN", admin.getName());
    }

    private String buildToken(String subject, String type, String name) {
        Instant now = Instant.now();
        Instant expiry = now.plusMillis(validityMillis);
        return Jwts.builder()
                .subject(subject)
                .claim("role", type)
                .claim("type", type)
                .claim("name", name != null ? name : "")
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(key)
                .compact();
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String getSubject(String token) {
        return parseClaims(token).getSubject();
    }

    public String getType(String token) {
        Claims claims = parseClaims(token);
        Object type = claims.get("type");
        return type != null ? type.toString() : "CUSTOMER";
    }

    public boolean isValid(String token) {
        try {
            Claims claims = parseClaims(token);
            return claims.getExpiration().after(Date.from(Instant.now()));
        } catch (Exception ex) {
            return false;
        }
    }
}
