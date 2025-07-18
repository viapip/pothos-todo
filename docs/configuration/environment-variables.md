# Environment Variables Reference

This document provides a comprehensive reference for all environment variables used in the Pothos GraphQL Federation project.

## Table of Contents

- [Environment Configuration](#environment-configuration)
- [Server Configuration](#server-configuration)
- [Database Configuration](#database-configuration)
- [Logger Configuration](#logger-configuration)
- [Build Configuration](#build-configuration)
- [Docker Configuration](#docker-configuration)
- [Testing Configuration](#testing-configuration)

## Environment Configuration

### `NODE_ENV`
- **Type**: `string`
- **Default**: `development`
- **Values**: `development`, `production`, `test`
- **Description**: Determines the application environment and triggers environment-specific configuration

```bash
NODE_ENV=development
```

## Server Configuration

### `PORT`
- **Type**: `number`
- **Default**: `4000`
- **Description**: Port number for the HTTP server

```bash
PORT=4000
```

### `HOST`
- **Type**: `string`
- **Default**: `localhost`
- **Description**: Host address for the HTTP server

```bash
HOST=0.0.0.0
```

### `FRONTEND_URL`
- **Type**: `string`
- **Default**: `http://localhost:3000`
- **Description**: Frontend URL for CORS configuration

```bash
FRONTEND_URL=https://myapp.com
```

## Database Configuration

### `DATABASE_URL`
- **Type**: `string`
- **Default**: `postgresql://postgres:password@localhost:5432/pothos_todo`
- **Description**: Complete database connection string

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

### `TEST_DATABASE_URL`
- **Type**: `string`
- **Default**: `postgresql://postgres:password@localhost:5432/pothos_todo_test`
- **Description**: Test database connection string

```bash
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/test_database
```

## Logger Configuration

### `LOG_LEVEL`
- **Type**: `string`
- **Default**: `info`
- **Values**: `error`, `warn`, `info`, `debug`, `silent`
- **Description**: Minimum log level to output

```bash
LOG_LEVEL=debug
```

### `LOG_DIR`
- **Type**: `string`
- **Default**: `.out/logs`
- **Description**: Directory for log files

```bash
LOG_DIR=./logs
```

## Build Configuration

### `BUILD_MINIFY`
- **Type**: `boolean`
- **Default**: `false` (development), `true` (production)
- **Description**: Enable code minification

```bash
BUILD_MINIFY=true
```

### `BUILD_SOURCEMAP`
- **Type**: `boolean`
- **Default**: `true` (development), `false` (production)
- **Description**: Generate source maps

```bash
BUILD_SOURCEMAP=true
```

### `BUILD_TARGET`
- **Type**: `string`
- **Default**: `node18`
- **Description**: Build target for TypeScript compilation

```bash
BUILD_TARGET=node20
```

### `BUILD_PLATFORM`
- **Type**: `string`
- **Default**: `node`
- **Description**: Build platform

```bash
BUILD_PLATFORM=node
```

### `BUILD_OUT_DIR`
- **Type**: `string`
- **Default**: `dist`
- **Description**: Output directory for build files

```bash
BUILD_OUT_DIR=build
```

### `BUILD_CLEAN`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Clean output directory before build

```bash
BUILD_CLEAN=false
```

### `BUILD_DTS`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Generate TypeScript declaration files

```bash
BUILD_DTS=false
```

### `BUILD_TREESHAKE`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable tree shaking for dead code elimination

```bash
BUILD_TREESHAKE=false
```

### `BUILD_REPORT`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Generate build reports

```bash
BUILD_REPORT=false
```

## Docker Configuration

### PostgreSQL Configuration

### `POSTGRES_IMAGE`
- **Type**: `string`
- **Default**: `postgres:15-alpine`
- **Description**: PostgreSQL Docker image

```bash
POSTGRES_IMAGE=postgres:16-alpine
```

### `POSTGRES_CONTAINER`
- **Type**: `string`
- **Default**: `pothos-todo-postgres`
- **Description**: PostgreSQL container name

```bash
POSTGRES_CONTAINER=my-postgres
```

### `POSTGRES_DB`
- **Type**: `string`
- **Default**: `pothos_todo`
- **Description**: PostgreSQL database name

```bash
POSTGRES_DB=my_database
```

### `POSTGRES_USER`
- **Type**: `string`
- **Default**: `postgres`
- **Description**: PostgreSQL username

```bash
POSTGRES_USER=my_user
```

### `POSTGRES_PASSWORD`
- **Type**: `string`
- **Default**: `password`
- **Description**: PostgreSQL password

```bash
POSTGRES_PASSWORD=secure_password
```

### `POSTGRES_PORT`
- **Type**: `number`
- **Default**: `5432`
- **Description**: PostgreSQL port

```bash
POSTGRES_PORT=5433
```

### Qdrant Configuration

### `QDRANT_IMAGE`
- **Type**: `string`
- **Default**: `qdrant/qdrant:latest`
- **Description**: Qdrant Docker image

```bash
QDRANT_IMAGE=qdrant/qdrant:v1.7.0
```

### `QDRANT_CONTAINER`
- **Type**: `string`
- **Default**: `pothos-todo-qdrant`
- **Description**: Qdrant container name

```bash
QDRANT_CONTAINER=my-qdrant
```

### `QDRANT_PORT`
- **Type**: `number`
- **Default**: `6333`
- **Description**: Qdrant HTTP port

```bash
QDRANT_PORT=6334
```

### `QDRANT_HTTP_PORT`
- **Type**: `number`
- **Default**: `6333`
- **Description**: Qdrant HTTP service port

```bash
QDRANT_HTTP_PORT=6333
```

### `QDRANT_GRPC_PORT`
- **Type**: `number`
- **Default**: `6334`
- **Description**: Qdrant gRPC service port

```bash
QDRANT_GRPC_PORT=6335
```

## Testing Configuration

### `CI`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Indicates if running in CI environment

```bash
CI=true
```

### `TEST_TIMEOUT`
- **Type**: `number`
- **Default**: `30000`
- **Description**: Test timeout in milliseconds

```bash
TEST_TIMEOUT=60000
```

## Environment Files

### `.env`
Local development environment variables (not committed to version control)

### `.env.example`
Template for environment variables (committed to version control)

### `.env.local`
Local overrides (not committed to version control)

### `.env.development.local`
Development-specific local overrides

### `.env.production.local`
Production-specific local overrides

### `.env.test.local`
Test-specific local overrides

## Best Practices

### 1. Use Environment-Specific Files

Create separate `.env` files for different environments:

```bash
# Development
.env.development

# Production
.env.production

# Testing
.env.test
```

### 2. Never Commit Sensitive Data

Add sensitive environment files to `.gitignore`:

```gitignore
.env
.env.local
.env.*.local
```

### 3. Document All Variables

Always document new environment variables in this file and provide examples.

### 4. Use Defaults

Provide sensible defaults for all environment variables:

```typescript
const port = parseInt(process.env.PORT || '4000');
```

### 5. Validate Environment Variables

Validate critical environment variables on startup:

```typescript
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
```

## Loading Environment Variables

### Development

```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env

# Start application
bun run dev
```

### Production

```bash
# Set environment variables
export NODE_ENV=production
export PORT=8080
export DATABASE_URL=postgresql://...

# Start application
bun run start
```

### Docker

```bash
# Using docker-compose
docker-compose up

# Using environment file
docker-compose --env-file .env.production up
```

## Configuration Priority

Environment variables are loaded in the following order (highest to lowest priority):

1. Command line arguments
2. Environment variables set in the shell
3. `.env.local`
4. `.env.development.local`, `.env.production.local`, `.env.test.local`
5. `.env.development`, `.env.production`, `.env.test`
6. `.env`
7. Configuration file defaults

## Troubleshooting

### Variable Not Loading

```bash
# Check if variable is set
echo $MY_VARIABLE

# Check .env file
cat .env | grep MY_VARIABLE

# Check environment file is loaded
node -e "console.log(process.env.MY_VARIABLE)"
```

### Type Errors

Ensure environment variables are properly typed:

```typescript
// Wrong
const port = process.env.PORT;

// Correct
const port = parseInt(process.env.PORT || '4000');
```

### Missing Variables

Use the configuration validation to check for missing variables:

```bash
pothos config:validate
```

## Related Documentation

- [Configuration Overview](./README.md) - Main configuration documentation
- [Development Setup](./development.md) - Development environment setup
- [Production Deployment](./production.md) - Production deployment guide
- [Docker Configuration](./docker.md) - Docker and containerization