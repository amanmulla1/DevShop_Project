# DevShop Backend

Spring Boot REST API for the DevShop Cloud-Native DevOps Platform.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Java | 21 (LTS) |
| Maven | 3.8+ |
| PostgreSQL | 14+ (for local run; not needed for tests) |

---

## Environment Variables

All database credentials are read from environment variables. **No secrets are hardcoded.**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | No | `devshop` | Database name |
| `DB_USERNAME` | **Yes** | — | PostgreSQL username |
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password |
| `SERVER_PORT` | No | `8080` | HTTP server port |
| `JPA_DDL_AUTO` | No | `update` | Hibernate DDL strategy (`update` / `validate` / `none`) |

---

## Running Locally

### 1. Start PostgreSQL

```bash
# Example using Docker (local dev only):
docker run -d \
  --name devshop-postgres \
  -e POSTGRES_DB=devshop \
  -e POSTGRES_USER=devshop \
  -e POSTGRES_PASSWORD=devshop \
  -p 5432:5432 \
  postgres:16
```

### 2. Set Environment Variables

```bash
export DB_USERNAME=devshop
export DB_PASSWORD=devshop
# Optional — these match the defaults:
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=devshop
```

### 3. Build and Run

```bash
cd application/backend

# Build (skip tests for a quick start):
mvn package -DskipTests

# Run:
java -jar target/backend-0.1.0-SNAPSHOT.jar
```

Or run directly with Maven:

```bash
mvn spring-boot:run
```

The application seeds 4 sample products into the database on first startup.

---

## Running Tests

Tests use an H2 in-memory database — **no PostgreSQL required**.

```bash
cd application/backend
mvn test
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/products` | List all products |
| `GET` | `/api/products/{id}` | Get product by ID (404 if not found) |

### Example Requests

```bash
# List all products
curl http://localhost:8080/api/products

# Get product with ID 1
curl http://localhost:8080/api/products/1

# Get non-existent product (returns 404)
curl -i http://localhost:8080/api/products/9999
```

### Example Response — `GET /api/products`

```json
[
  {
    "id": 1,
    "name": "Cloud Server T2",
    "description": "Entry-level cloud server suitable for small workloads.",
    "price": 29.99,
    "stock": 100
  }
]
```

---

## Health Endpoint

```bash
curl http://localhost:8080/actuator/health
```

Shows application and database health status.

---

## Prometheus Metrics

```bash
curl http://localhost:8080/actuator/prometheus
```

Exposes all Micrometer metrics in Prometheus text format. Intended to be scraped by a Prometheus server.

---

## Project Structure

```
src/
├── main/
│   ├── java/com/devshop/backend/
│   │   ├── BackendApplication.java   # Entry point
│   │   ├── config/
│   │   │   └── DataInitializer.java  # Seeds sample data on startup
│   │   ├── controller/
│   │   │   └── ProductController.java
│   │   ├── model/
│   │   │   └── Product.java
│   │   ├── repository/
│   │   │   └── ProductRepository.java
│   │   └── service/
│   │       └── ProductService.java
│   └── resources/
│       └── application.properties    # Config (env-var driven)
└── test/
    ├── java/com/devshop/backend/
    │   ├── controller/
    │   │   └── ProductControllerTest.java
    │   └── service/
    │       └── ProductServiceTest.java
    └── resources/
        └── application.properties    # H2 test config
```
