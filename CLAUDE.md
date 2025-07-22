# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **production-ready Pothos GraphQL Federation server** with enterprise-grade features including multi-level caching, distributed tracing, authentication, and real-time subscriptions. Built with modern technologies: Bun, H3, TypeScript 5+, PostgreSQL, Redis, and OpenTelemetry.

## Development Commands

### Essential Commands
```bash
bun install                # Install dependencies
bun run start              # Start development server
bun run dev                # Start with hot reload
bun run check:types        # TypeScript type checking
bun run build              # Build for production
```

### Database & Services
```bash
bun run db:up              # Start PostgreSQL container
bun run redis:up           # Start Redis container  
bun run services:up        # Start all services (PostgreSQL + Redis)
bun run db:migrate         # Run Prisma migrations
bun run db:generate        # Generate Prisma client
bun run db:studio          # Open Prisma Studio
```

### Testing & Validation
```bash
bun run test               # Run test suite
bun run test:watch         # Run tests in watch mode
bun run test:coverage      # Generate coverage report (80% threshold)
bun run test:ui            # Launch Vitest UI
bun run test:e2e           # Run end-to-end tests
bun run validate           # Full validation (types + tests)

# Run specific test patterns
bunx vitest run src/domain/aggregates/User.test.ts    # Single test file
bunx vitest run --grep "should create user"           # Test by name pattern
VITEST_QUIET=true bun run test                        # Suppress console output
```

### Code Quality & Build
```bash
bun run build:prod         # Production build
bun run build:watch        # Build in watch mode
bun run check:publint      # Check package publishing
bun run check:attw         # Are The Types Wrong check

# Linting & Formatting (Biome)
bunx biome check --apply   # Auto-fix linting issues
bunx biome format          # Format code
bunx biome lint            # Lint only
```

## Architecture Overview

### Multi-Layered Architecture
The codebase follows **Domain-Driven Design (DDD)** with clear separation:

- **`index.ts`** - Main server entry point with H3 application setup
- **`src/api/`** - GraphQL layer (Pothos schema, resolvers, federation)
- **`src/domain/`** - Domain layer (aggregates, events, repositories, value objects)
- **`src/infrastructure/`** - Infrastructure layer (Prisma repositories, event handlers, DI container)
- **`src/lib/`** - Shared libraries (auth, cache, monitoring, database utilities)
- **`src/application/`** - Application services (CQRS commands/handlers)

### Key Components

#### GraphQL Schema (Pothos-based)
- **Auto-generated CRUD**: `src/graphql/__generated__/` - Prisma-Pothos codegen
- **Federation Support**: Apollo Federation v2 compatible
- **Type Safety**: Full TypeScript integration throughout
- **Plugin Architecture**: Extensive use of Pothos plugins (relay, auth, tracing, etc.)

#### Multi-Level Caching System
- **L1 Cache**: DataLoader (request-scoped, eliminates N+1 queries)
- **L2 Cache**: In-memory LRU cache
- **L3 Cache**: Redis distributed cache
- **Cache Manager**: `src/lib/cache/manager.ts` - Orchestrates all cache levels
- **Integration**: `src/lib/cache/integration.ts` - GraphQL resolver integration

#### Advanced Authentication
- **OAuth**: Google/GitHub providers via Arctic
- **JWT Management**: Access/refresh tokens with rotation (`src/lib/auth/jwt-manager.ts`)
- **RBAC**: Role-based access control (`src/lib/auth/rbac.ts`)
- **Session Management**: H3-based encrypted sessions

#### Enterprise Monitoring
- **OpenTelemetry**: Distributed tracing configuration (`src/lib/tracing/config.ts`)
- **Prometheus**: Metrics collection (`src/lib/monitoring/metrics.ts`)
- **Health Checks**: Comprehensive system monitoring (`src/lib/monitoring/health.ts`)

#### Real-time Features
- **Subscriptions**: GraphQL subscriptions with SSE/WebSocket (`src/lib/subscriptions/manager.ts`)
- **Event System**: Domain events with handlers (`src/domain/events/`, `src/infrastructure/events/`)

## Configuration System

**Uses c12 for environment-aware configuration management:**

- **`config/base.config.ts`** - Base configuration
- **`config/development.config.ts`** - Development overrides
- **`config/production.config.ts`** - Production overrides

### Critical Configuration Rules
- **Never access `process.env` directly** - Use config functions from `src/config/index.ts`
- **Environment variables** centralized through config files
- **Runtime validation** with configuration validation on startup

```typescript
// ✅ Correct
import { getServerConfig, getDatabaseConfig } from './src/config/index.js';
const config = getServerConfig();

// ❌ Wrong - never access process.env directly
const port = process.env.PORT;
```

## Domain Architecture

### Domain Layer Structure
- **Aggregates**: `src/domain/aggregates/` - Todo, TodoList, User entities
- **Events**: `src/domain/events/` - Domain events (TodoCreated, TodoCompleted, etc.)
- **Repositories**: `src/domain/repositories/` - Repository interfaces
- **Value Objects**: `src/domain/value-objects/` - Priority, DueDate, TodoStatus

### CQRS Pattern
- **Commands**: `src/application/commands/` - Command objects
- **Handlers**: `src/application/handlers/` - Command handlers
- **Event Handling**: `src/infrastructure/events/handlers/` - Domain event handlers

## Development Guidelines

### Code Quality Standards
- **Linting**: Biome with strict rules (unused variables as errors)
- **Formatting**: 2-space indents, 100 char line width, single quotes
- **TypeScript**: Strict mode with exhaustive dependency warnings
- **Security**: No dangerous innerHTML, explicit any warnings

### Generated Code
- **Never edit** files in `src/graphql/__generated__/` - these are auto-generated
- **Regenerate** after Prisma schema changes: `bun run db:generate`
- **Excluded from**: Linting, testing, coverage reports
- **Current issue**: Generated files have type compatibility issues with Pothos plugins

### Database Operations
- **Use connection pooling**: Enhanced database client in `src/lib/database/`
- **Optimize queries**: Query optimizer analyzes performance
- **Health monitoring**: Automatic connection health checks

### Error Handling
- **Result types**: Use neverthrow for error handling (`src/lib/result/`)
- **Comprehensive logging**: Structured logging with context
- **Graceful degradation**: System continues with reduced functionality on component failures

### Testing Approach
- **Unit tests**: Domain logic and utilities (`tests/unit/`)
- **Integration tests**: GraphQL resolvers and database operations (`tests/integration/`)
- **E2E tests**: Full application workflows (`tests/e2e/`)
- **Test setup**: Global test environment with mocked env vars (`tests/setup.ts`)
- **Coverage requirements**: 80% threshold for branches/functions/lines/statements
- **Test isolation**: Single fork pool for database test isolation
- **Path aliases**: `@/` for src, `~/` for root directory

## Known Issues & Workarounds

### TypeScript Compilation Errors
- **Generated files**: Some Pothos plugin compatibility issues in `src/graphql/__generated__/`
- **Runtime impact**: Server runs successfully despite compilation errors
- **Workaround**: Errors are in generated code, not application logic

### Cache Manager
- **Redis connection**: Temporarily disabled due to connection configuration issues
- **Current status**: Server runs without Redis caching (L1/L2 cache still functional)
- **Location**: Cache initialization commented out in `index.ts:81`

### Disabled Features (Temporarily)
- **Tracing system**: OpenTelemetry configuration issues (lines 72-78 in index.ts)
- **API versioning**: Plugin compatibility (lines 58-65, 274-279 in index.ts)
- **Graceful shutdown**: Handlers commented out (lines 398-416 in index.ts)

## CLI Development

### Interactive CLI (oclif-based)
- **CLI Binary**: `pothos-cli` available after build
- **Commands**: Organized by topic (build, check, config, db, dev, services)
- **Development**: Commands in `src/commands/` with menu-driven interfaces
- **Usage**: Type-safe command definitions with help integration

## Server Endpoints

### GraphQL
- **Main endpoint**: `/graphql` - GraphQL Yoga server
- **Subscriptions**: SSE/WebSocket support for real-time features
- **Introspection**: Available in development

### Authentication
- **OAuth flows**: `/auth/google`, `/auth/github` with callback endpoints
- **Session management**: `/auth/logout`, `/auth/logout/all`

### Management API
- **Health**: `/health` - Comprehensive system health
- **Metrics**: `/metrics` - Prometheus metrics
- **Cache stats**: `/api/cache/*` - Cache management endpoints
- **Database**: `/api/database/*` - Database health and statistics

## Technology Stack

- **Runtime**: Bun v1.2.15+ (JavaScript runtime)
- **HTTP Framework**: H3 v1.15.3 (Universal HTTP server)
- **GraphQL**: GraphQL Yoga + Pothos schema builder
- **Database**: PostgreSQL + Prisma ORM
- **Cache**: Redis + ioredis + DataLoader
- **Authentication**: Lucia + Arctic (OAuth) + JWT
- **Monitoring**: OpenTelemetry + Prometheus
- **Language**: TypeScript 5+ with strict mode
- **Configuration**: c12 (unified config system)

## Documentation

**Comprehensive documentation** available in `docs/`:
- Architecture, authentication, caching, database, monitoring
- Docker deployment, performance tuning, subscriptions
- Plugin-specific documentation for all major components

## Production Deployment

### Docker Support
- **Development**: `docker-compose.yml`
- **Production**: `docker-compose.prod.yml` with full infrastructure stack
- **Services**: PostgreSQL, Redis, Nginx, monitoring stack

### Health Checks
- **Startup validation**: Comprehensive health check on server start
- **Runtime monitoring**: Continuous health monitoring
- **Dependency checking**: Database, Redis, external service health