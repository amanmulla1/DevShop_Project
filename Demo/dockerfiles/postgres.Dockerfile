# =============================================================================
# DevShop PostgreSQL - Dockerfile
#
# Customizes the official postgres:16 image for the DevShop demo:
#   - Defaults for the DB name / role / password (override via env at run time:
#     POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD).
#   - An init SQL script that creates the `devshop` database and the `devshop`
#     role so the app can connect on first boot. The backend then auto-seeds
#     tables, products, customers, orders and the admin account.
#
# Build:
#     docker build -f Demo/dockerfiles/postgres.Dockerfile -t <hub>/devshop-postgres:16 Demo/dockerfiles
#
# Run on port 5432.
# =============================================================================

FROM postgres:16

ENV POSTGRES_DB=devshop \
    POSTGRES_USER=devshop \
    POSTGRES_PASSWORD=devshop

# Init scripts are run once, alphabetically, on an empty data directory
# (i.e. on the very first boot / first volume initialization).
COPY postgres-init.sql /docker-entrypoint-initdb.d/10-devshop.sql

EXPOSE 5432

VOLUME ["/var/lib/postgresql/data"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD ["pg_isready", "-U", "${POSTGRES_USER}", "-d", "${POSTGRES_DB}"]
