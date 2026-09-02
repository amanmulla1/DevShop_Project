-- =============================================================================
-- DevShop PostgreSQL - init script (runs once on first boot / empty volume)
--
-- Ensures a dedicated `devshop` role and `devshop` database exist before the
-- backend connects. The backend (JPA with Hibernate) creates the tables and
-- auto-seeds products, customers, orders and the admin account on first start.
--
-- WARNING: On first run the official postgres:16 entrypoint ALREADY creates a
-- database + role from POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD. This
-- script is idempotent insurance so the expected objects always exist even if
-- those env vars are omitted or the data directory already contains data.
-- =============================================================================

-- Create the application role if it does not already exist.
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'devshop') THEN
      CREATE ROLE devshop LOGIN PASSWORD 'devshop';
   END IF;
END
$$;

-- Create the application database if it does not already exist.
SELECT 'CREATE DATABASE devshop OWNER devshop'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'devshop')
\gexec
