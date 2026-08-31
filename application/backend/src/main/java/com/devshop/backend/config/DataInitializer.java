package com.devshop.backend.config;

import com.devshop.backend.model.Customer;
import com.devshop.backend.model.Admin;
import com.devshop.backend.model.Order;
import com.devshop.backend.model.OrderItem;
import com.devshop.backend.model.OrderStatus;
import com.devshop.backend.model.PaymentMethod;
import com.devshop.backend.model.Product;
import com.devshop.backend.repository.AdminRepository;
import com.devshop.backend.repository.CustomerRepository;
import com.devshop.backend.repository.OrderRepository;
import com.devshop.backend.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * Seeds the database with demo products on startup while avoiding duplicates.
 * Intended for local development. In production, data is managed externally.
 */
@Configuration
@Profile("!test")
public class DataInitializer {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    @org.springframework.beans.factory.annotation.Value("${app.admin.email}")
    private String appAdminEmail = "admin@ds.com";

    @org.springframework.beans.factory.annotation.Value("${app.admin.name}")
    private String appAdminName = "DevShop Admin";

    @org.springframework.beans.factory.annotation.Value("${app.admin.password}")
    private String appAdminPassword = "ChangeMe123!";

    private static final List<Product> DEMO_PRODUCTS = List.of(
            new Product("Cloud Server T2", "Entry-level cloud server suitable for small workloads.", "Cloud", new BigDecimal("29.99"), 100),
            new Product("DevOps Toolkit Pro", "Complete toolkit for CI/CD pipeline setup and automation.", "DevOps", new BigDecimal("149.99"), 50),
            new Product("Kubernetes Cluster Pack", "Self-managed Kubernetes cluster configuration bundle.", "Kubernetes", new BigDecimal("499.99"), 25),
            new Product("Monitoring Dashboard", "Pre-configured Prometheus and Grafana observability stack.", "Monitoring", new BigDecimal("79.99"), 200),
            new Product("AWS Cloud Server Pro", "Scalable cloud compute environment for production workloads.", "Cloud", new BigDecimal("89.99"), 40),
            new Product("Cloud Storage Vault", "Secure and scalable object storage solution for application data and backups.", "Cloud", new BigDecimal("39.99"), 75),
            new Product("CI/CD Pipeline Pro", "Automated continuous integration and deployment pipeline toolkit.", "DevOps", new BigDecimal("129.99"), 35),
            new Product("Terraform Infrastructure Pack", "Infrastructure-as-code templates for repeatable cloud deployments.", "DevOps", new BigDecimal("99.99"), 50),
            new Product("Kubernetes Production Cluster", "Production-ready Kubernetes cluster configuration and deployment package.", "Kubernetes", new BigDecimal("399.99"), 20),
            new Product("Kubernetes Helm Bundle", "Reusable Helm charts for deploying modern cloud-native applications.", "Kubernetes", new BigDecimal("149.99"), 30),
            new Product("Prometheus Monitoring Pro", "Metrics collection and alerting stack for cloud infrastructure and applications.", "Monitoring", new BigDecimal("109.99"), 45),
            new Product("Grafana Observability Suite", "Pre-configured dashboards for infrastructure and application observability.", "Monitoring", new BigDecimal("119.99"), 40),
            new Product("Docker Deployment Kit", "Containerization toolkit for building and deploying application workloads.", "Containers", new BigDecimal("79.99"), 60),
            new Product("Container Registry Pro", "Private container image registry for secure application deployments.", "Containers", new BigDecimal("59.99"), 55),
            new Product("Ansible Automation Pack", "Configuration management and infrastructure automation toolkit.", "Infrastructure", new BigDecimal("89.99"), 50),
            new Product("Linux Server Management", "Server administration and automation package for Linux infrastructure.", "Infrastructure", new BigDecimal("69.99"), 80)
    );

    /**
     * Mapping of product names to their correct categories.
     * Used to migrate existing NULL category values and ensure consistency.
     * Categories: Cloud, DevOps, Kubernetes, Monitoring, Containers, Infrastructure
     */
    private static final Map<String, String> PRODUCT_CATEGORIES = Map.ofEntries(
            Map.entry("Cloud Server T2", "Cloud"),
            Map.entry("DevOps Toolkit Pro", "DevOps"),
            Map.entry("Kubernetes Cluster Pack", "Kubernetes"),
            Map.entry("Monitoring Dashboard", "Monitoring"),
            Map.entry("AWS Cloud Server Pro", "Cloud"),
            Map.entry("Cloud Storage Vault", "Cloud"),
            Map.entry("CI/CD Pipeline Pro", "DevOps"),
            Map.entry("Terraform Infrastructure Pack", "DevOps"),
            Map.entry("Kubernetes Production Cluster", "Kubernetes"),
            Map.entry("Kubernetes Helm Bundle", "Kubernetes"),
            Map.entry("Prometheus Monitoring Pro", "Monitoring"),
            Map.entry("Grafana Observability Suite", "Monitoring"),
            Map.entry("Docker Deployment Kit", "Containers"),
            Map.entry("Container Registry Pro", "Containers"),
            Map.entry("Ansible Automation Pack", "Infrastructure"),
            Map.entry("Linux Server Management", "Infrastructure")
    );

    /**
     * Demo customers seeded for the admin dashboard's customer management page.
     * Inserted only if their email does not already exist (idempotent).
     */
    private static final List<Customer> DEMO_CUSTOMERS = List.of(
            new Customer("Alice Johnson", "alice.johnson@example.com", "+1 555-0101", "42 Maple Street", "Springfield", "IL", "62701"),
            new Customer("Bob Martin", "bob.martin@example.com", "+1 555-0102", "78 Oak Avenue", "Riverside", "CA", "92501"),
            new Customer("Carol White", "carol.white@example.com", "+1 555-0103", "105 Pine Road", "Austin", "TX", "73301"),
            new Customer("David Brown", "david.brown@example.com", "+1 555-0104", "230 Birch Lane", "Denver", "CO", "80201"),
            new Customer("Emma Davis", "emma.davis@example.com", "+1 555-0105", "61 Cedar Drive", "Seattle", "WA", "98101")
    );

    /**
     * Line item descriptor for a seeded historical order.
     */
    public record OrderLine(String productName, int quantity) {
    }

    /**
     * Descriptor for a historical demo order, spread across past days so the
     * admin Sales Overview chart shows meaningful time-series data.
     * orderNumber is deterministic so seeding is idempotent across restarts.
     */
    public record HistoricalOrder(String customerEmail, int daysAgo, String orderNumber, OrderStatus status,
                                  String address, String city, String state, String postalCode,
                                  List<OrderLine> lines) {
    }

    private static final List<HistoricalOrder> HISTORICAL_ORDERS = List.of(
            new HistoricalOrder("alice.johnson@example.com", 45, "ORD-HIST-001", OrderStatus.DELIVERED,
                    "42 Maple Street", "Springfield", "IL", "62701", List.of(new OrderLine("Cloud Server T2", 2))),
            new HistoricalOrder("bob.martin@example.com", 38, "ORD-HIST-002", OrderStatus.DELIVERED,
                    "78 Oak Avenue", "Riverside", "CA", "92501", List.of(new OrderLine("Kubernetes Cluster Pack", 1))),
            new HistoricalOrder("carol.white@example.com", 34, "ORD-HIST-003", OrderStatus.DELIVERED,
                    "105 Pine Road", "Austin", "TX", "73301", List.of(new OrderLine("Monitoring Dashboard", 2))),
            new HistoricalOrder("alice.johnson@example.com", 30, "ORD-HIST-004", OrderStatus.DELIVERED,
                    "42 Maple Street", "Springfield", "IL", "62701", List.of(new OrderLine("DevOps Toolkit Pro", 1))),
            new HistoricalOrder("david.brown@example.com", 26, "ORD-HIST-005", OrderStatus.DELIVERED,
                    "230 Birch Lane", "Denver", "CO", "80201", List.of(new OrderLine("Docker Deployment Kit", 3))),
            new HistoricalOrder("emma.davis@example.com", 22, "ORD-HIST-006", OrderStatus.DELIVERED,
                    "61 Cedar Drive", "Seattle", "WA", "98101", List.of(new OrderLine("Prometheus Monitoring Pro", 1))),
            new HistoricalOrder("bob.martin@example.com", 18, "ORD-HIST-007", OrderStatus.DELIVERED,
                    "78 Oak Avenue", "Riverside", "CA", "92501", List.of(new OrderLine("AWS Cloud Server Pro", 2))),
            new HistoricalOrder("carol.white@example.com", 14, "ORD-HIST-008", OrderStatus.DELIVERED,
                    "105 Pine Road", "Austin", "TX", "73301", List.of(new OrderLine("Terraform Infrastructure Pack", 2))),
            new HistoricalOrder("alice.johnson@example.com", 11, "ORD-HIST-009", OrderStatus.DELIVERED,
                    "42 Maple Street", "Springfield", "IL", "62701", List.of(new OrderLine("Cloud Storage Vault", 4))),
            new HistoricalOrder("david.brown@example.com", 8, "ORD-HIST-010", OrderStatus.DELIVERED,
                    "230 Birch Lane", "Denver", "CO", "80201", List.of(new OrderLine("Grafana Observability Suite", 1))),
            new HistoricalOrder("emma.davis@example.com", 5, "ORD-HIST-011", OrderStatus.DELIVERED,
                    "61 Cedar Drive", "Seattle", "WA", "98101", List.of(new OrderLine("CI/CD Pipeline Pro", 2))),
            new HistoricalOrder("bob.martin@example.com", 3, "ORD-HIST-012", OrderStatus.DELIVERED,
                    "78 Oak Avenue", "Riverside", "CA", "92501", List.of(new OrderLine("Kubernetes Helm Bundle", 1)))
    );

    @Bean
    @org.springframework.core.annotation.Order(1)
    CommandLineRunner seedProducts(ProductRepository repository) {
        return args -> {
            int inserted = 0;
            int migrated = 0;

            // Insert new products and skip existing ones
            for (Product product : DEMO_PRODUCTS) {
                if (repository.findByName(product.getName()).isEmpty()) {
                    repository.save(product);
                    inserted++;
                }
            }

            // Migrate existing products with NULL or missing categories
            for (Product existing : repository.findAll()) {
                if (existing.getCategory() == null || existing.getCategory().isBlank()) {
                    String newCategory = PRODUCT_CATEGORIES.getOrDefault(existing.getName(), "General");
                    existing.setCategory(newCategory);
                    repository.save(existing);
                    migrated++;
                    log.debug("Migrated product '{}' to category '{}", existing.getName(), newCategory);
                }
            }

            long total = repository.count();
            log.info("Seed check complete. Inserted {} new products. Migrated {} products with missing categories. Total products: {}", inserted, migrated, total);
        };
    }

    @Bean
    @org.springframework.core.annotation.Order(2)
    CommandLineRunner seedCustomers(CustomerRepository repository,
                                    org.springframework.security.crypto.password.PasswordEncoder passwordEncoder) {
        return args -> {
            int inserted = 0;
            for (Customer customer : DEMO_CUSTOMERS) {
                if (repository.findByEmail(customer.getEmail().trim().toLowerCase()).isEmpty()) {
                    repository.save(customer);
                    inserted++;
                }
            }

            // Migration: hash any legacy plaintext password into passwordHash and
            // clear the plaintext column. BCrypt-encoded values are left untouched
            // and never stored as plaintext.
            int hashed = 0;
            for (Customer existing : repository.findAll()) {
                if ((existing.getPasswordHash() == null || existing.getPasswordHash().isBlank())
                        && existing.getPassword() != null && !existing.getPassword().isBlank()) {
                    existing.setPasswordHash(passwordEncoder.encode(existing.getPassword()));
                    existing.setPassword(null);
                    repository.save(existing);
                    hashed++;
                }
            }

            long total = repository.count();
            log.info("Customer seed check complete. Inserted {} new customers, hashed {} legacy passwords. Total customers: {}", inserted, hashed, total);
        };
    }

    @Bean
    @org.springframework.core.annotation.Order(5)
    CommandLineRunner seedAdmin(AdminRepository repository,
                                org.springframework.security.crypto.password.PasswordEncoder passwordEncoder) {
        return args -> {
            String targetEmail = appAdminEmail.trim().toLowerCase();
            Admin admin = repository.findByEmail(targetEmail).orElse(null);
            if (admin != null) {
                if (!passwordEncoder.matches(appAdminPassword, admin.getPasswordHash())) {
                    // Env-driven provisioning: keep the configured ADMIN_PASSWORD
                    // authoritative for the bootstrap admin so a password change in
                    // .env applies to an already-seeded row.
                    admin.setPasswordHash(passwordEncoder.encode(appAdminPassword));
                    repository.save(admin);
                    log.info("Bootstrap admin password synced to environment: {}", targetEmail);
                } else {
                    log.info("Bootstrap admin already present with matching password: {}", targetEmail);
                }
                return;
            }

            // No admin exists under the configured target email. In this
            // development deployment a stale admin was previously seeded under a
            // different default email (e.g. admin@devshop.com). Migrate that row
            // to the configured email so exactly one admin@ds.com always exists.
            // The seeder only ever creates a single admin, so the first row with a
            // non-target email is the legacy one to update in place.
            Admin stale = repository.findAll().stream()
                    .filter(a -> !a.getEmail().trim().equalsIgnoreCase(targetEmail))
                    .findFirst()
                    .orElse(null);
            if (stale != null) {
                String previousEmail = stale.getEmail();
                stale.setEmail(targetEmail);
                stale.setPasswordHash(passwordEncoder.encode(appAdminPassword));
                repository.save(stale);
                log.info("Bootstrap admin migrated from {} to {}", previousEmail, targetEmail);
                return;
            }

            Admin created = new Admin(targetEmail, appAdminName, passwordEncoder.encode(appAdminPassword));
            repository.save(created);
            log.info("Bootstrap admin seeded: {}", targetEmail);
        };
    }

    @Bean
    @org.springframework.core.annotation.Order(3)
    CommandLineRunner seedOrders(OrderRepository orderRepository,
                                 CustomerRepository customerRepository,
                                 ProductRepository productRepository) {
        return args -> {
            int inserted = 0;

            Customer c1 = customerRepository.findByEmail("alice.johnson@example.com").orElse(null);
            Customer c2 = customerRepository.findByEmail("bob.martin@example.com").orElse(null);
            if (c1 == null || c2 == null) {
                log.info("Order seed skipped: demo customers not present yet.");
                return;
            }

            if (orderRepository.count() == 0) {
                Product cloud = productRepository.findByName("Cloud Server T2").orElse(null);
                Product k8s = productRepository.findByName("Kubernetes Cluster Pack").orElse(null);
                Product monitoring = productRepository.findByName("Monitoring Dashboard").orElse(null);

                if (cloud != null) {
                    createOrder(orderRepository, c1, cloud, 3, PaymentMethod.PAY_ON_DELIVERY, OrderStatus.DELIVERED,
                            "42 Maple Street", "Springfield", "IL", "62701");
                    inserted++;
                }

                Order o2 = newOrder(c2, PaymentMethod.PAY_ON_DELIVERY, OrderStatus.PROCESSING,
                        "78 Oak Avenue", "Riverside", "CA", "92501");
                if (k8s != null) {
                    addLine(o2, k8s, 1);
                }
                if (monitoring != null) {
                    addLine(o2, monitoring, 2);
                }
                if (!o2.getItems().isEmpty()) {
                    orderRepository.save(o2);
                    inserted++;
                }
            }

            long total = orderRepository.count();
            log.info("Order seed check complete. Inserted {} new orders. Total orders: {}", inserted, total);
        };
    }

    @Bean
    @org.springframework.core.annotation.Order(4)
    CommandLineRunner seedHistoricalOrders(OrderRepository orderRepository,
                                           CustomerRepository customerRepository,
                                           ProductRepository productRepository) {
        return args -> {
            int inserted = 0;

            for (HistoricalOrder spec : HISTORICAL_ORDERS) {
                if (orderRepository.findByOrderNumber(spec.orderNumber()).isPresent()) {
                    continue;
                }
                Customer customer = customerRepository.findByEmail(spec.customerEmail()).orElse(null);
                if (customer == null) {
                    log.debug("Historical order skipped: customer {} not found.", spec.customerEmail());
                    continue;
                }

                Order order = newOrder(customer, PaymentMethod.PAY_ON_DELIVERY, spec.status(),
                        spec.address(), spec.city(), spec.state(), spec.postalCode());
                order.setOrderNumber(spec.orderNumber());
                order.setOrderDate(LocalDate.now().minusDays(spec.daysAgo()).atTime(12, 0).toInstant(ZoneOffset.UTC));

                for (OrderLine line : spec.lines()) {
                    Product product = productRepository.findByName(line.productName()).orElse(null);
                    if (product != null) {
                        addLine(order, product, line.quantity());
                    }
                }
                if (!order.getItems().isEmpty()) {
                    orderRepository.save(order);
                    inserted++;
                }
            }

            long total = orderRepository.count();
            log.info("Historical order seed complete. Inserted {} new historical orders. Total orders: {}", inserted, total);
        };
    }

    private Order newOrder(Customer customer, PaymentMethod payment,
                           OrderStatus status, String address, String city, String state, String postal) {
        Order order = new Order();
        order.setOrderNumber("ORD-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase());
        order.setCustomer(customer);
        order.setStatus(status);
        order.setPaymentMethod(payment);
        order.setDeliveryAddress(address);
        order.setDeliveryCity(city);
        order.setDeliveryState(state);
        order.setDeliveryPostalCode(postal);
        order.setSubtotal(BigDecimal.ZERO);
        order.setTotal(BigDecimal.ZERO);
        return order;
    }

    private void addLine(Order order, Product product, int quantity) {
        OrderItem item = new OrderItem(product, quantity, product.getPrice());
        order.addItem(item);
        order.setSubtotal(order.getSubtotal().add(item.getSubtotal()));
        order.setTotal(order.getTotal().add(item.getSubtotal()));
    }

    private void createOrder(OrderRepository orderRepository, Customer customer, Product product, int quantity,
                             PaymentMethod payment, OrderStatus status, String address, String city, String state, String postal) {
        Order order = newOrder(customer, payment, status, address, city, state, postal);
        if (product != null) {
            addLine(order, product, quantity);
        }
        orderRepository.save(order);
    }
}
