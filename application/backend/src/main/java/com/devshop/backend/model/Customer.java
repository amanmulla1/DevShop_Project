package com.devshop.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A DevShop customer (shopper) account.
 *
 * Passwords are stored ONLY as a BCrypt hash in {@code passwordHash}. The legacy
 * plaintext {@code password} column is retained solely to migrate existing rows
 * on startup and is cleared immediately after hashing. Neither field is ever
 * serialized to JSON.
 */
@Entity
@Table(
    name = "customers",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_customers_userid", columnNames = "userid"),
        @UniqueConstraint(name = "uk_customers_email", columnNames = "email")
    }
)
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String userid;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column
    private String phone;

    @Column
    private String address;

    @Column
    private String city;

    @Column
    private String state;

    @Column
    private String postalCode;

    /**
     * BCrypt hash of the customer's password. Never serialized. Only available
     * to the server for authentication.
     */
    @Column(name = "password_hash", length = 100)
    @JsonIgnore
    private String passwordHash;

    /**
     * Legacy plaintext password column. Retained only to read/migrate
     * pre-auth rows to {@code passwordHash} on startup, then cleared to null.
     * Write-only: accepted on request bodies (e.g. admin-created customers so it
     * can be hashed) but never serialized in responses.
     */
    @Column(name = "password")
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password;

    /**
     * Authorization role for this customer. Always CUSTOMER.
     */
    @Column(nullable = false, length = 20)
    private String role = "CUSTOMER";

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "customer")
    @JsonIgnore
    private List<Order> orders = new ArrayList<>();

    public Customer() {
    }

    public Customer(String name, String email, String phone, String address, String city, String state, String postalCode) {
        this.name = name;
        this.email = email;
        this.phone = phone;
        this.address = address;
        this.city = city;
        this.state = state;
        this.postalCode = postalCode;
    }

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
        if ((this.userid == null || this.userid.isBlank())) {
            this.userid = generateUserId();
        }
        if (this.role == null || this.role.isBlank()) {
            this.role = "CUSTOMER";
        }
    }

    public static String generateUserId() {
        String randomPart = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        return "CUS-" + randomPart;
    }

    public static final String ROLE_CUSTOMER = "CUSTOMER";
    public static final String ROLE_ADMIN = "ADMIN";

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUserid() { return userid; }
    public void setUserid(String userid) { this.userid = userid; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getPostalCode() { return postalCode; }
    public void setPostalCode(String postalCode) { this.postalCode = postalCode; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public List<Order> getOrders() { return orders; }
    public void setOrders(List<Order> orders) { this.orders = orders; }
}
