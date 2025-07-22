-- PostgreSQL initialization script for Pothos GraphQL API
-- This script sets up the database with proper configurations

-- Create database if it doesn't exist (handled by POSTGRES_DB env var)

-- Connect to the application database
\c pothos_todo;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Performance optimizations
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Connection pooling settings
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '128MB';
ALTER SYSTEM SET effective_cache_size = '512MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';

-- WAL settings for better performance
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET checkpoint_segments = 32;
ALTER SYSTEM SET checkpoint_completion_target = 0.7;

-- Create application user with limited privileges (if needed)
-- This is handled by the main database user from environment variables

-- Grant necessary privileges
GRANT CONNECT ON DATABASE pothos_todo TO postgres;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT CREATE ON SCHEMA public TO postgres;

-- Create monitoring view for health checks
CREATE OR REPLACE VIEW health_check AS
SELECT 
    'database' as component,
    'healthy' as status,
    now() as checked_at,
    current_database() as database_name,
    current_user as user_name,
    version() as version;

-- Grant access to health check view
GRANT SELECT ON health_check TO postgres;