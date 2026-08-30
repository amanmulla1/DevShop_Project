package com.devshop.backend.controller;

import com.devshop.backend.model.Admin;
import com.devshop.backend.model.Customer;
import com.devshop.backend.repository.AdminRepository;
import com.devshop.backend.repository.CustomerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private String adminEmail = "admin@test.com";

    @BeforeEach
    void setUp() {
        customerRepository.deleteAll();
        adminRepository.deleteAll();
        adminRepository.save(new Admin(adminEmail, "Test Admin", passwordEncoder.encode("TestAdmin123!")));
    }

    private String registerCustomer(String body) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        String json = result.getResponse().getContentAsString();
        return objectMapper.readTree(json).get("token").asText();
    }

    @Test
    void register_createsAccountAndReturnsJwtWithoutPassword() throws Exception {
        String body = """
                {
                  "name": "Test User",
                  "email": "test.user@example.com",
                  "phone": "555-1234",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!",
                  "deliveryAddress": "1 Main St",
                  "city": "Metropolis",
                  "state": "NY",
                  "postalCode": "10001"
                }
                """;

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token", not(blankOrNullString())))
                .andExpect(jsonPath("$.role", is("CUSTOMER")))
                .andExpect(jsonPath("$.userid", startsWith("CUS-")))
                .andExpect(jsonPath("$.name", is("Test User")))
                .andExpect(jsonPath("$.email", is("test.user@example.com")))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        Customer saved = customerRepository.findByEmail("test.user@example.com").orElseThrow();
        assert saved.getPasswordHash() != null && saved.getPasswordHash().startsWith("$2");
        assert saved.getPassword() == null;
    }

    @Test
    void register_mismatchedPasswords_isRejected() throws Exception {
        String body = """
                {
                  "name": "Test User",
                  "email": "mismatch@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "Different123!"
                }
                """;
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("Passwords do not match")));
    }

    @Test
    void register_duplicateEmail_isRejected() throws Exception {
        registerCustomer("""
                {
                  "name": "First",
                  "email": "dupe@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Second",
                                  "email": "dupe@example.com",
                                  "password": "SecurePass123!",
                                  "confirmPassword": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("already exists")));
    }

    @Test
    void login_withValidCredentials_returnsJwt() throws Exception {
        registerCustomer("""
                {
                  "name": "Login User",
                  "email": "login@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"login@example.com\",\"password\":\"SecurePass123!\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", not(blankOrNullString())))
                .andExpect(jsonPath("$.role", is("CUSTOMER")));
    }

    @Test
    void login_withWrongPassword_isRejected() throws Exception {
        registerCustomer("""
                {
                  "name": "Login User",
                  "email": "wrongpass@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"wrongpass@example.com\",\"password\":\"nope\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void me_withCustomerToken_returnsIdentity() throws Exception {
        String token = registerCustomer("""
                {
                  "name": "Me User",
                  "email": "me@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userid", startsWith("CUS-")))
                .andExpect(jsonPath("$.email", is("me@example.com")))
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void me_withoutToken_isUnauthorized() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminLogin_withValidCredentials_returnsAdminRole() throws Exception {
        mockMvc.perform(post("/api/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + adminEmail + "\",\"password\":\"TestAdmin123!\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role", is("ADMIN")))
                .andExpect(jsonPath("$.token", not(blankOrNullString())))
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void adminLogin_withWrongPassword_isRejected() throws Exception {
        mockMvc.perform(post("/api/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + adminEmail + "\",\"password\":\"bad\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void guestCanListProductsWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk());
    }

    @Test
    void customersEndpoint_requiresAdmin() throws Exception {
        String customerToken = registerCustomer("""
                {
                  "name": "Blocked",
                  "email": "blocked@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);

        mockMvc.perform(get("/api/customers").header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void customersEndpoint_allowedForAdmin() throws Exception {
        String token = mockMvc.perform(post("/api/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + adminEmail + "\",\"password\":\"TestAdmin123!\"}"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String adminToken = objectMapper.readTree(token).get("token").asText();

        registerCustomer("""
                {
                  "name": "Listed",
                  "email": "listed@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);

        mockMvc.perform(get("/api/customers").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void logout_returnsOk() throws Exception {
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isOk());
    }

    @Test
    void registration_generatesUniqueUserids() throws Exception {
        MvcResult first = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"One","email":"unique1@example.com","password":"SecurePass123!",
                                 "confirmPassword":"SecurePass123!"}"""))
                .andExpect(status().isCreated())
                .andReturn();
        MvcResult second = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Two","email":"unique2@example.com","password":"SecurePass123!",
                                 "confirmPassword":"SecurePass123!"}"""))
                .andExpect(status().isCreated())
                .andReturn();

        String userid1 = objectMapper.readTree(first.getResponse().getContentAsString()).get("userid").asText();
        String userid2 = objectMapper.readTree(second.getResponse().getContentAsString()).get("userid").asText();

        assert userid1.startsWith("CUS-");
        assert userid2.startsWith("CUS-");
        assert !userid1.equals(userid2);
    }

    @Test
    void login_preservesTheSameUserid() throws Exception {
        String token = registerCustomer("""
                {
                  "name": "Persist",
                  "email": "persist@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);
        MvcResult firstMe = mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        String userid = objectMapper.readTree(firstMe.getResponse().getContentAsString()).get("userid").asText();

        // Re-login after "logging out": the userid must be unchanged.
        MvcResult login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"persist@example.com\",\"password\":\"SecurePass123!\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String token2 = objectMapper.readTree(login.getResponse().getContentAsString()).get("token").asText();
        MvcResult secondMe = mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token2))
                .andExpect(status().isOk())
                .andReturn();
        String userid2 = objectMapper.readTree(secondMe.getResponse().getContentAsString()).get("userid").asText();

        assert userid.equals(userid2);
    }

    @Test
    void me_returnsFullSafeProfileForCustomer() throws Exception {
        String token = registerCustomer("""
                {
                  "name": "Full User",
                  "email": "full@example.com",
                  "phone": "555-0000",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!",
                  "deliveryAddress": "10 Main St",
                  "city": "Springfield",
                  "state": "IL",
                  "postalCode": "62701"
                }
                """);

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userid", startsWith("CUS-")))
                .andExpect(jsonPath("$.name", is("Full User")))
                .andExpect(jsonPath("$.phone", is("555-0000")))
                .andExpect(jsonPath("$.address", is("10 Main St")))
                .andExpect(jsonPath("$.city", is("Springfield")))
                .andExpect(jsonPath("$.state", is("IL")))
                .andExpect(jsonPath("$.postalCode", is("62701")))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void customerBlockedFromAdminProductsEndpoint() throws Exception {
        String customerToken = registerCustomer("""
                {
                  "name": "Blocked",
                  "email": "blockedadmin@example.com",
                  "password": "SecurePass123!",
                  "confirmPassword": "SecurePass123!"
                }
                """);

        mockMvc.perform(get("/api/admin/products").header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/admin/products").header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hack\",\"price\":1}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedRequestToProtectedEndpointReturns401() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/products"))
                .andExpect(status().isUnauthorized());
    }
}
