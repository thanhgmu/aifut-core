-- ── AIFUT On-Premise: Initial Database Setup ──
-- Runs once on first PostgreSQL container start.
-- This creates extensions and baseline config before Prisma migrations.

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- For query performance monitoring (optional, requires superuser)
-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Connection pool tuning (adjust based on available RAM)
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';

-- Note: Prisma migrations will create all application tables.
-- This script only handles PostgreSQL-level setup.
