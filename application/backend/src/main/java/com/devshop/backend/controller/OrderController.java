package com.devshop.backend.controller;

import com.devshop.backend.model.Order;
import com.devshop.backend.model.OrderStatus;
import com.devshop.backend.model.PaymentMethod;
import com.devshop.backend.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/orders")
    public List<Order> getAllOrders() {
        return orderService.getAllOrders();
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<Order> getOrderById(@PathVariable Long id) {
        return orderService.getOrderById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/orders")
    public ResponseEntity<?> createOrder(@RequestBody CreateOrderRequest request, Authentication authentication) {
        try {
            String authenticatedUserid = null;
            if (authentication != null && authentication.getAuthorities().stream()
                    .anyMatch(a -> a.getAuthority().equals("ROLE_CUSTOMER"))) {
                authenticatedUserid = authentication.getName();
            }
            Order order = orderService.createOrder(
                    request.customer(),
                    request.items(),
                    request.paymentMethod(),
                    request.address(),
                    request.city(),
                    request.state(),
                    request.postalCode(),
                    authenticatedUserid);
            return ResponseEntity.status(HttpStatus.CREATED).body(order);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
        }
    }

    /**
     * The authenticated customer's own order history. Authorized purely off the
     * JWT identity; never from a client-supplied id.
     */
    @GetMapping("/customers/me/orders")
    public List<Order> myOrders(Authentication authentication) {
        return orderService.getOrdersByCustomerUserid(authentication.getName());
    }

    @PatchMapping("/orders/{id}/status")
    public ResponseEntity<?> updateOrderStatus(@PathVariable Long id, @RequestBody StatusUpdateRequest request) {
        try {
            return ResponseEntity.ok(orderService.updateStatus(id, request.status()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
        }
    }

    public record CreateOrderRequest(
            com.devshop.backend.model.Customer customer,
            List<OrderService.OrderItemRequest> items,
            PaymentMethod paymentMethod,
            String address,
            String city,
            String state,
            String postalCode
    ) {}

    public record StatusUpdateRequest(OrderStatus status) {}

    public record ErrorResponse(String message) {}
}
