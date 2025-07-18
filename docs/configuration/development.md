# Development Configuration

This guide covers setting up and configuring the development environment for the Pothos GraphQL Federation project.

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Install dependencies
bun install

# Start development services
bun run services:up

# Start development server
bun run dev
```

### 2. Development Configuration

The development environment uses `config/development.config.ts` for configuration overrides:

```typescript
export default {
  extends: ['./base.config'],
  
  server: {
    port: 4000,
    host: '0.0.0.0', // Allow external connections
  },
  
  logger: {
    level: 'debug', // Verbose logging
  },
  
  build: {
    minify: false,
    sourcemap: true,
    watch: true, // Hot reloading
  },
  
  graphql: {
    introspection: true,
    playground: true,
  },
};
```

## Development Environment Variables

### Required Variables

```bash
# Database connection
DATABASE_URL=postgresql://postgres:password@localhost:5432/pothos_todo

# Server configuration
PORT=4000
HOST=localhost
```

### Optional Variables

```bash
# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000

# Log level (debug for development)
LOG_LEVEL=debug

# Build configuration
BUILD_MINIFY=false
BUILD_SOURCEMAP=true
```

## Configuration Features

### Hot Reloading

The development server supports hot reloading for both:

- **Server Code**: Automatically restarts on file changes
- **Configuration**: Reloads configuration without restart

```bash
# Start with hot reloading
bun run dev

# Watch configuration changes
bun run dev --watch-config
```

### Configuration Watching

Enable configuration watching for development:

```typescript
import { watchAppConfig } from './src/config/index.js';

if (process.env.NODE_ENV === 'development') {
  await watchAppConfig({
    onUpdate: (newConfig) => {
      console.log('Configuration updated:', newConfig);
    },
  });
}
```

### Debug Logging

Development environment enables debug logging:

```typescript
// All log levels visible
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

## Development Services

### Database

Start PostgreSQL for development:

```bash
# Start PostgreSQL container
bun run db:up

# Run migrations
bun run db:migrate

# Seed development data
bun run db:seed

# Open database studio
bun run db:studio
```

### Vector Database

Start Qdrant for development:

```bash
# Start Qdrant container
bun run qdrant:up

# Or start all services
bun run services:up
```

## Development Workflow

### 1. Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd pothos-todo

# Copy environment template
cp .env.example .env

# Install dependencies
bun install

# Start services
bun run services:up

# Run migrations
bun run db:migrate
```

### 2. Daily Development

```bash
# Start development server
bun run dev

# In another terminal, run tests
bun run test:watch

# Check types
bun run check:types
```

### 3. Configuration Changes

```bash
# Edit configuration
nano config/development.config.ts

# Validate configuration
pothos config:validate

# Restart if needed
bun run dev
```

## CLI Development

### Interactive Mode

The CLI provides an interactive development interface:

```bash
# Start interactive CLI
bun run bin/run.js

# Or use the installed CLI
pothos
```

### CLI Commands

```bash
# Show configuration
pothos config:show

# Validate configuration
pothos config:validate

# Development server
pothos dev:start

# Build project
pothos build

# Run tests
pothos test
```

## Development Scripts

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "bun run --watch index.ts",
    "dev:debug": "NODE_ENV=development LOG_LEVEL=debug bun run --watch index.ts",
    "dev:config": "pothos config:show",
    "dev:validate": "pothos config:validate"
  }
}
```

### Custom Development Tasks

```bash
# Development with custom port
PORT=3000 bun run dev

# Development with debug logging
LOG_LEVEL=debug bun run dev

# Development with configuration watching
WATCH_CONFIG=true bun run dev
```

## Development Tools

### TypeScript

Development configuration includes:

```typescript
// tsconfig.json development overrides
{
  "compilerOptions": {
    "sourceMap": true,
    "declaration": true,
    "strict": true,
    "noUnusedLocals": false, // Relaxed for development
    "noUnusedParameters": false
  }
}
```

### Build Tools

Development build configuration:

```bash
# Watch mode build
bun run build:watch

# Development build
NODE_ENV=development bun run build

# Clean build
bun run build:clean
```

## GraphQL Development

### GraphQL Playground

Available at: `http://localhost:4000/graphql`

Development features:
- Schema introspection enabled
- GraphQL Playground enabled
- Detailed error messages
- Query validation

### Schema Development

```bash
# Generate schema
bun run graphql:schema

# Validate schema
bun run graphql:validate

# Test queries
bun run graphql:test
```

## Testing in Development

### Unit Tests

```bash
# Run tests
bun run test

# Watch mode
bun run test:watch

# Coverage
bun run test:coverage
```

### Integration Tests

```bash
# Start test database
TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/pothos_todo_test bun run test:integration

# Full test suite
bun run test:all
```

## Debugging

### Server Debugging

```bash
# Debug mode
NODE_ENV=development LOG_LEVEL=debug bun run dev

# Inspect mode
bun run --inspect dev
```

### Configuration Debugging

```bash
# Show current configuration
pothos config:show

# Validate configuration
pothos config:validate

# Debug configuration loading
DEBUG=config:* bun run dev
```

### Database Debugging

```bash
# Database logs
docker-compose logs -f postgres

# Query logs
LOG_LEVEL=debug bun run dev
```

## Performance Monitoring

### Development Metrics

```bash
# Bundle analysis
bun run build:analyze

# Performance profiling
bun run dev:profile

# Memory usage
bun run dev:memory
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Check what's using the port
lsof -i :4000

# Kill process
kill -9 <PID>

# Or use different port
PORT=4001 bun run dev
```

#### Database Connection Issues

```bash
# Check database status
bun run db:status

# Restart database
bun run db:down && bun run db:up

# Check connection
psql $DATABASE_URL
```

#### Configuration Issues

```bash
# Validate configuration
pothos config:validate

# Check environment variables
env | grep -E "(NODE_ENV|PORT|DATABASE_URL)"

# Reset configuration
rm -rf .env && cp .env.example .env
```

### Development Logging

Enable verbose logging for troubleshooting:

```bash
# All debug logs
LOG_LEVEL=debug bun run dev

# Configuration debug
DEBUG=config:* bun run dev

# Database debug
DEBUG=db:* bun run dev
```

## Best Practices

### 1. Use Environment Files

Keep development settings in `.env`:

```bash
# Development specific
NODE_ENV=development
LOG_LEVEL=debug
PORT=4000
```

### 2. Validate Configuration

Always validate configuration changes:

```bash
pothos config:validate
```

### 3. Use Hot Reloading

Take advantage of hot reloading:

```bash
bun run dev --watch
```

### 4. Test Configuration Changes

Test configuration in isolation:

```bash
# Test specific environment
NODE_ENV=test pothos config:show
```

### 5. Document Changes

Document any configuration changes in this file or commit messages.

## Related Documentation

- [Configuration Overview](./README.md) - Main configuration documentation
- [Environment Variables](./environment-variables.md) - Environment variable reference
- [Production Deployment](./production.md) - Production configuration
- [Docker Configuration](./docker.md) - Docker setup and configuration