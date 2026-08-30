# DevShop — Running Both Applications

This guide explains how to run the customer frontend, admin frontend, and backend together.

## Prerequisites

- Node.js 18+ with npm
- Java 21 with Maven
- PostgreSQL 14+ (for running with real database)
- Port availability: 5173 (customer), 5174 (admin), 8080 (backend)

## Architecture

The DevShop platform consists of three independent services:

```
Customer Frontend (React)          Admin Frontend (React)          Backend (Spring Boot)
Port: 5173                         Port: 5174                      Port: 8080
┌─────────────────────────┐       ┌─────────────────────────┐      ┌──────────────────────┐
│ Customer Storefront     │       │ Admin Dashboard         │      │ REST API             │
│ - Product catalog       │       │ - Product CRUD          │      │ - Database: PG       │
│ - Shopping cart         │       │ - Customer mgmt         │      │ - CORS multi-origin  │
│ - Checkout              │ ───→  │ - Order mgmt            │  ←─  │ - Metrics/Health     │
│                         │       │ - Dashboard metrics     │      │                      │
└─────────────────────────┘       └─────────────────────────┘      └──────────────────────┘
        │                                  │                              │
        └──────────────────────────────────┴──────────────────────────────┘
         (Both frontends communicate with the same backend via REST API)
```

## Step 1: Start Backend

### Option A: In-Memory H2 Database (Quick Testing)
```bash
cd application/backend
mvn spring-boot:run
```
- Uses H2 in-memory database (no PostgreSQL needed)
- Seeded with sample data automatically
- Ideal for testing without external dependencies
- Health check: http://localhost:8080/actuator/health

### Option B: PostgreSQL Database (Production-Like)
First, ensure PostgreSQL is running, then:
```bash
cd application/backend
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=devshop
export DB_USERNAME=postgres
export DB_PASSWORD=yourpassword
mvn spring-boot:run
```

### Verify Backend is Running
```bash
# Should return: {"status":"UP","database":"PostgreSQL"}
curl http://localhost:8080/actuator/health

# See available products
curl http://localhost:8080/api/products
```

---

## Step 2: Start Customer Frontend

```bash
cd application/frontend
npm run dev
```
- Runs on http://localhost:5173
- Automatically configured to call backend at http://localhost:8080
- If backend is not running, you'll see an error state with a retry button
- Hot reload enabled for development

### Environment Variables
The frontend looks for API base URL in this order:
1. `VITE_API_BASE_URL` environment variable
2. Default: `http://localhost:8080`

To use a different backend:
```bash
export VITE_API_BASE_URL=http://api.example.com
npm run dev
```

---

## Step 3: Start Admin Frontend

```bash
cd application/admin-frontend
npm run dev
```
- Runs on http://localhost:5174
- Completely independent from customer frontend
- Also calls backend at http://localhost:8080
- Hot reload enabled for development

### Key Admin Routes
- `/` — Dashboard with metrics and recent orders
- `/products` — Product CRUD interface
- `/customers` — Customer management
- `/orders` — Order management with status updates

---

## Testing Both Together

Once all three services are running:

### Test Customer Frontend
1. Open http://localhost:5173 in your browser
2. Browse products
3. Click a product to see details
4. Add to cart
5. Click cart icon to open cart drawer

### Test Admin Frontend
1. Open http://localhost:5174 in your browser
2. Dashboard shows metrics from the backend API
3. Manage products, customers, and orders
4. Click any dashboard link to navigate sections

### Test CORS
Both frontends should be able to fetch data from the backend without CORS errors.

Check browser console for any errors:
```
GET http://localhost:8080/api/products (200 OK means CORS works!)
```

---

## Running Tests

### Backend Tests
```bash
cd application/backend
mvn clean test
```
- Uses H2 in-memory database
- No PostgreSQL required
- Expected: 8/8 tests passing ✅

### Customer Frontend Tests
```bash
cd application/frontend
npm test
```
- Uses Vitest + React Testing Library
- Expected: 13/13 tests passing ✅

### Admin Frontend Tests (when available)
```bash
cd application/admin-frontend
npm test
```

---

## Building for Production

### Backend
```bash
cd application/backend
mvn clean package
# Creates: target/backend-0.1.0-SNAPSHOT.jar
java -jar target/backend-0.1.0-SNAPSHOT.jar
```

### Customer Frontend
```bash
cd application/frontend
npm run build
# Creates: dist/ folder ready for static hosting
```

### Admin Frontend
```bash
cd application/admin-frontend
npm run build
# Creates: dist/ folder ready for static hosting
```

---

## Environment Configuration

### Backend (application.properties)
```properties
# Server
server.port=8080

# Database (PostgreSQL)
spring.datasource.url=jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:devshop}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}

# CORS (supports both frontends)
cors.allowed-origins=${CORS_ALLOWED_ORIGINS:http://localhost:5173,http://localhost:5174}
```

### Customer Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:8080
```

### Admin Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:8080
```

---

## Troubleshooting

### "Port 5173 already in use"
```bash
# Kill the process using port 5173
# On Windows:
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Then restart customer frontend
```

### "Port 5174 already in use"
Same as above, but for port 5174 (admin frontend)

### "Cannot reach backend from frontend"
1. Ensure backend is running on port 8080
2. Check: http://localhost:8080/actuator/health
3. Check browser console for CORS errors
4. Verify CORS_ALLOWED_ORIGINS includes the frontend origin

### "Database connection refused"
1. Ensure PostgreSQL is running
2. Verify credentials (DB_USERNAME, DB_PASSWORD)
3. Check database exists (create with `CREATE DATABASE devshop;`)

### Tests Failing
```bash
# Clear dependencies and reinstall
rm -rf node_modules package-lock.json
npm install
npm test
```

---

## Quick Reference Commands

```bash
# Terminal 1: Backend
cd application/backend && mvn spring-boot:run

# Terminal 2: Customer Frontend
cd application/frontend && npm run dev

# Terminal 3: Admin Frontend
cd application/admin-frontend && npm run dev
```

Then open:
- Customer: http://localhost:5173
- Admin: http://localhost:5174
- Backend Health: http://localhost:8080/actuator/health
- Backend API: http://localhost:8080/api/products

---

## Next Steps

1. ✅ Run both frontends with backend
2. Test functionality in both apps
3. Verify CORS works correctly
4. Continue to Phase 3: Docker containerization
