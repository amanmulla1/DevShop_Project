package com.devshop.backend.controller;

import com.devshop.backend.model.Customer;
import com.devshop.backend.model.Product;
import com.devshop.backend.repository.CustomerRepository;
import com.devshop.backend.repository.OrderRepository;
import com.devshop.backend.repository.ProductRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OrderAuthTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private OrderRepository orderRepository;

    private Long productId;

    @BeforeEach
    void setUp() {
        orderRepository.deleteAll();
        productRepository.deleteAll();
        customerRepository.deleteAll();
        Product p = productRepository.save(new Product("Test Widget", "desc", new BigDecimal("9.99"), 100));
        productId = p.getId();
    }

    private String registerAndGetToken(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Order User",
                                  "email": "%s",
                                  "password": "SecurePass123!",
                                  "confirmPassword": "SecurePass123!"
                                }
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private String orderBody() {
        return """
                {
                  "customer": {"name":"Guest","email":"guest@example.com"},
                  "items": [{"productId": %d, "quantity": 2}],
                  "paymentMethod": "PAY_ON_DELIVERY",
                  "address":"1 Main St","city":"Metropolis","state":"NY","postalCode":"10001"
                }
                """.formatted(productId);
    }

    @Test
    void guestCheckout_createsOrderWithoutAuth() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(orderBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderNumber", not(blankOrNullString())));
    }

    @Test
    void authenticatedCheckout_associatesJwtCustomerServerSide() throws Exception {
        String token = registerAndGetToken("owner@example.com");

        MvcResult result = mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        // client lies about the customer identity
                        .content("""
                                {
                                  "customer": {"name":"Fake","email":"different@example.com"},
                                  "items": [{"productId": %d, "quantity": 1}],
                                  "paymentMethod": "PAY_ON_DELIVERY",
                                  "address":"2 Oak St","city":"Riverside","state":"CA","postalCode":"92501"
                                }
                                """.formatted(productId)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode order = objectMapper.readTree(result.getResponse().getContentAsString());
        String orderCustomerEmail = order.path("customer").path("email").asText();
        // Server-side association: order belongs to the JWT identity, not the fake one.
        assert orderCustomerEmail.equals("owner@example.com");
    }

    @Test
    void ownOrderHistory_onlyReturnsAuthenticatedCustomersOrders() throws Exception {
        String ownerToken = registerAndGetToken("owner2@example.com");
        String otherToken = registerAndGetToken("other@example.com");

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + ownerToken)
                        .content("""
                                {
                                  "customer": {"name":"X","email":"x@example.com"},
                                  "items": [{"productId": %d, "quantity": 1}],
                                  "paymentMethod": "PAY_ON_DELIVERY",
                                  "address":"1 A St","city":"C","state":"S","postalCode":"1"
                                }
                                """.formatted(productId)))
                .andExpect(status().isCreated());

        // Owner can see their own order.
        mockMvc.perform(get("/api/customers/me/orders").header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        // Other customer sees none.
        mockMvc.perform(get("/api/customers/me/orders").header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void ownOrderHistory_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/customers/me/orders"))
                .andExpect(status().isUnauthorized());
    }
}
