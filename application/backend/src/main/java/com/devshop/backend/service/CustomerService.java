package com.devshop.backend.service;

import com.devshop.backend.model.Customer;
import com.devshop.backend.repository.CustomerRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final PasswordEncoder passwordEncoder;

    public CustomerService(CustomerRepository customerRepository, PasswordEncoder passwordEncoder) {
        this.customerRepository = customerRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<Customer> getAllCustomers() {
        return customerRepository.findAll();
    }

    public Optional<Customer> getCustomerById(Long id) {
        return customerRepository.findById(id);
    }

    public Optional<Customer> getCustomerByUserid(String userid) {
        return customerRepository.findByUserid(userid);
    }

    public Optional<Customer> getCustomerByEmail(String email) {
        return customerRepository.findByEmail(email);
    }

    public Customer createCustomer(Customer customer) {
        String email = customer.getEmail();
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }
        if (customerRepository.findByEmail(email.toLowerCase().trim()).isPresent()) {
            throw new IllegalArgumentException("A customer with this email already exists");
        }
        if (customer.getName() == null || customer.getName().isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        customer.setEmail(email.trim().toLowerCase());
        if (customer.getUserid() == null || customer.getUserid().isBlank()) {
            customer.setUserid(Customer.generateUserId());
        }
        customer.setRole(Customer.ROLE_CUSTOMER);
        if (customer.getPasswordHash() == null && customer.getPassword() != null && !customer.getPassword().isBlank()) {
            customer.setPasswordHash(passwordEncoder.encode(customer.getPassword()));
            customer.setPassword(null);
        }
        return customerRepository.save(customer);
    }

    @Transactional
    public Customer updateCustomer(Long id, Customer updatedCustomer) {
        Customer existing = customerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Customer not found"));

        if (updatedCustomer.getName() == null || updatedCustomer.getName().isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        if (updatedCustomer.getEmail() == null || updatedCustomer.getEmail().isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }

        String normalizedEmail = updatedCustomer.getEmail().trim().toLowerCase();
        Optional<Customer> emailMatch = customerRepository.findByEmail(normalizedEmail);
        if (emailMatch.isPresent() && !emailMatch.get().getId().equals(id)) {
            throw new IllegalArgumentException("A customer with this email already exists");
        }

        existing.setName(updatedCustomer.getName());
        existing.setEmail(normalizedEmail);
        existing.setPhone(updatedCustomer.getPhone());
        existing.setAddress(updatedCustomer.getAddress());
        existing.setCity(updatedCustomer.getCity());
        existing.setState(updatedCustomer.getState());
        existing.setPostalCode(updatedCustomer.getPostalCode());

        // Password is optional on update: only re-hash when a new plaintext is supplied.
        if (updatedCustomer.getPassword() != null && !updatedCustomer.getPassword().isBlank()) {
            existing.setPasswordHash(passwordEncoder.encode(updatedCustomer.getPassword()));
            existing.setPassword(null);
        }

        return customerRepository.save(existing);
    }

    @Transactional
    public void deleteCustomer(Long id) {
        if (!customerRepository.existsById(id)) {
            throw new IllegalArgumentException("Customer not found");
        }
        customerRepository.deleteById(id);
    }
}
