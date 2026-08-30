package com.devshop.backend.service;

import com.devshop.backend.model.*;
import com.devshop.backend.repository.CustomerRepository;
import com.devshop.backend.repository.OrderRepository;
import com.devshop.backend.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final CustomerRepository customerRepository;
    private final ProductRepository productRepository;

    public OrderService(OrderRepository orderRepository,
                        CustomerRepository customerRepository,
                        ProductRepository productRepository) {
        this.orderRepository = orderRepository;
        this.customerRepository = customerRepository;
        this.productRepository = productRepository;
    }

    public List<Order> getAllOrders() {
        return orderRepository.findAll();
    }

    public Optional<Order> getOrderById(Long id) {
        return orderRepository.findById(id);
    }

    @Transactional
    public Order createOrder(Customer customer, List<OrderItemRequest> requestedItems, PaymentMethod paymentMethod,
                             String address, String city, String state, String postalCode,
                             String authenticatedUserid) {
        if (paymentMethod == null) {
            throw new IllegalArgumentException("Payment method is required");
        }
        if (paymentMethod == PaymentMethod.ONLINE_PAYMENT) {
            throw new IllegalArgumentException("Online payment is coming soon.");
        }
        if (requestedItems == null || requestedItems.isEmpty()) {
            throw new IllegalArgumentException("Order must contain at least one item");
        }

        Customer managedCustomer;
        if (authenticatedUserid != null && !authenticatedUserid.isBlank()) {
            // Authenticated purchase: always associate with the JWT identity,
            // never a client-supplied customer.
            managedCustomer = customerRepository.findByUserid(authenticatedUserid)
                    .orElseThrow(() -> new IllegalArgumentException("Account not found"));
            if (address != null && !address.isBlank()) {
                managedCustomer.setAddress(address);
                managedCustomer.setCity(city);
                managedCustomer.setState(state);
                managedCustomer.setPostalCode(postalCode);
                customerRepository.save(managedCustomer);
            }
        } else {
            managedCustomer = customerRepository.findByEmail(customer.getEmail().trim().toLowerCase())
                    .orElseGet(() -> {
                        Customer newCustomer = new Customer();
                        newCustomer.setName(customer.getName());
                        newCustomer.setEmail(customer.getEmail().trim().toLowerCase());
                        newCustomer.setPhone(customer.getPhone());
                        newCustomer.setAddress(address);
                        newCustomer.setCity(city);
                        newCustomer.setState(state);
                        newCustomer.setPostalCode(postalCode);
                        newCustomer.setUserid(Customer.generateUserId());
                        return customerRepository.save(newCustomer);
                    });

            if (managedCustomer.getAddress() == null || managedCustomer.getAddress().isBlank()) {
                managedCustomer.setAddress(address);
                managedCustomer.setCity(city);
                managedCustomer.setState(state);
                managedCustomer.setPostalCode(postalCode);
                customerRepository.save(managedCustomer);
            }
        }

        Order order = new Order();
        order.setOrderNumber(generateOrderNumber());
        order.setCustomer(managedCustomer);
        order.setStatus(OrderStatus.PENDING);
        order.setPaymentMethod(paymentMethod);
        order.setDeliveryAddress(address);
        order.setDeliveryCity(city);
        order.setDeliveryState(state);
        order.setDeliveryPostalCode(postalCode);

        BigDecimal subtotal = BigDecimal.ZERO;
        List<OrderItem> orderItems = new ArrayList<>();

        for (OrderItemRequest request : requestedItems) {
            Product product = productRepository.findById(request.getProductId())
                    .orElseThrow(() -> new IllegalArgumentException("Product not found: " + request.getProductId()));

            if (request.getQuantity() == null || request.getQuantity() <= 0) {
                throw new IllegalArgumentException("Invalid quantity for product: " + product.getName());
            }
            if (request.getQuantity() > product.getStock()) {
                throw new IllegalArgumentException("Requested quantity exceeds available stock for " + product.getName());
            }

            product.setStock(product.getStock() - request.getQuantity());
            productRepository.save(product);

            OrderItem item = new OrderItem(product, request.getQuantity(), product.getPrice());
            orderItems.add(item);
            subtotal = subtotal.add(item.getSubtotal());
        }

        order.setSubtotal(subtotal);
        order.setTotal(subtotal);
        for (OrderItem item : orderItems) {
            order.addItem(item);
        }

        return orderRepository.save(order);
    }

    public List<Order> getOrdersByCustomerId(Long customerId) {
        return orderRepository.findAll().stream()
                .filter(order -> order.getCustomer() != null && order.getCustomer().getId().equals(customerId))
                .toList();
    }

    public List<Order> getOrdersByCustomerUserid(String userid) {
        return orderRepository.findAll().stream()
                .filter(order -> order.getCustomer() != null && userid.equals(order.getCustomer().getUserid()))
                .toList();
    }

    public Order updateStatus(Long orderId, OrderStatus status) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found"));
        order.setStatus(status);
        return orderRepository.save(order);
    }

    private String generateOrderNumber() {
        return "ORD-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }

    public static class OrderItemRequest {
        private Long productId;
        private Integer quantity;

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }

        public Integer getQuantity() { return quantity; }
        public void setQuantity(Integer quantity) { this.quantity = quantity; }
    }
}
