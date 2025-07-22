# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Pothos GraphQL Federation project built with Domain-Driven Design (DDD) architecture and CQRS pattern. It uses Bun as the JavaScript runtime, H3 as the HTTP framework, and provides comprehensive authentication with OAuth support.

## Development Commands

### Essential Commands
```bash
# Install dependencies
bun install

# Start development server (with watch mode)
bun run dev

# Start production server
bun run start

# Type checking
bun run check:types

# Build project
bun run build
```

### Database Commands
```bash
# Start PostgreSQL container
bun run db:up

# Run Prisma migrations
bun run db:migrate

# Generate Prisma client (required after schema changes)
bun run db:generate

# Open Prisma Studio (database GUI)
bun run db:studio

# Reset database (caution: deletes all data)
bun run db:reset

# Seed database with initial data
bun run db:seed
```

### Service Management
```bash
# Start all Docker services
bun run services:up

# Stop all Docker services
bun run services:down
```

### CLI Commands
The project includes a custom CLI accessible via:
```bash
bun run cli <command>
```

## Architecture Overview

### Domain-Driven Design Structure

The codebase follows DDD principles with clear separation of concerns:

1. **Domain Layer** (`src/domain/`)
   - **Aggregates**: User, Todo, TodoList - core business entities with business logic
   - **Events**: Domain events for state changes (UserCreated, TodoCreated, etc.)
   - **Value Objects**: Priority, TodoStatus, UserId - immutable domain concepts
   - **Repositories**: Interfaces defining data access contracts

2. **Application Layer** (`src/application/`)
   - **Commands**: Command objects representing user intentions
   - **Handlers**: Command handlers implementing business use cases
   - Uses CQRS pattern - commands for writes, direct queries for reads

3. **Infrastructure Layer** (`src/infrastructure/`)
   - **Persistence**: Prisma-based repository implementations
   - **Container**: Dependency injection setup
   - **Events**: Event publishing and handling infrastructure

4. **API Layer** (`src/api/`)
   - **GraphQL Schema**: Pothos-based type-safe schema definitions
   - **Mutations**: GraphQL mutations mapped to application commands
   - **Queries**: GraphQL queries for data retrieval
   - **Server**: GraphQL Yoga server configuration

### Key Architectural Decisions

- **Event Sourcing**: All domain changes emit events stored in DomainEvent table
- **Repository Pattern**: Domain logic isolated from persistence details
- **Dependency Injection**: IoC container manages dependencies
- **Type Safety**: End-to-end type safety from database to GraphQL API

## Configuration System

The project uses **c12** for configuration management with environment-specific overrides:

- `config/base.config.ts` - Base configuration
- `config/development.config.ts` - Development overrides
- `config/production.config.ts` - Production overrides
- `config/test.config.ts` - Test overrides

### Configuration Usage
```typescript
import { getServerConfig, getSessionConfig, getDatabaseConfig } from './src/config/index.js';

// ✅ Correct - use config functions
const serverConfig = getServerConfig();

// ❌ Wrong - never access process.env directly
const port = process.env.PORT; // Don't do this
```

## Authentication System

### OAuth Providers
- Google OAuth with PKCE support
- GitHub OAuth
- Routes: `/auth/google`, `/auth/github`, and respective callbacks

### Session Management
- H3 sessions with encrypted cookies
- Lucia for auth state management
- Secure session storage in database

### User Management
- Email/password authentication with bcrypt
- Provider account linking
- Session-based authentication for GraphQL

## GraphQL Development

### Schema Development
1. Define domain models in `prisma/schema.prisma`
2. Run `bun run db:generate` to update Prisma client
3. Create/update GraphQL types in `src/api/schema/types/`
4. Add mutations in `src/api/schema/mutations/`
5. Add queries in `src/api/schema/queries/`

### Pothos Builder Configuration
The schema builder in `src/api/schema/builder.ts` includes plugins:
- Prisma integration for automatic type generation
- DataLoader for N+1 query optimization
- Error handling with typed errors
- Relay-style connections and nodes
- Apollo Federation support

### GraphQL Endpoint
- Development: `http://localhost:4000/graphql`
- GraphQL Playground available in development mode

## Database Management

### Prisma Workflow
1. Modify schema in `prisma/schema.prisma`
2. Create migration: `bun run db:migrate`
3. Generate types: `bun run db:generate`
4. Update GraphQL schema accordingly

### Event Sourcing
All domain mutations emit events stored in the DomainEvent table:
- Automatic event capture via domain aggregates
- Event replay capabilities
- Audit trail for all changes

## Development Guidelines

### Adding New Features
1. Start with domain model (aggregate, value objects)
2. Define repository interface in domain layer
3. Implement repository in infrastructure layer
4. Create command and handler in application layer
5. Expose via GraphQL mutation/query in API layer

### Code Organization
- Keep domain logic in aggregates, not in GraphQL resolvers
- Use commands for all state-changing operations
- Repository implementations should only handle data access
- GraphQL layer should be thin, delegating to application layer

### Type Safety
- Leverage Pothos for GraphQL type generation
- Use Prisma's generated types for database operations
- Define explicit types for all command/query parameters
- Avoid `any` types - use proper generics instead

## Environment Setup

1. Copy `.env.example` to `.env`
2. Configure OAuth credentials (Google, GitHub)
3. Set session encryption key
4. Run `bun run db:up` to start PostgreSQL
5. Run `bun run db:migrate` to initialize database
6. Run `bun run dev` to start development server

## Common Tasks

### Running a Single Test
Currently no test infrastructure is set up, but when added:
```bash
bun test path/to/test.spec.ts
```

### Debugging GraphQL Queries
1. Open GraphQL Playground at `http://localhost:4000/graphql`
2. Use introspection to explore schema
3. Check server logs for resolver execution
4. Enable Prisma query logging in development config

### Adding a New Domain Entity
1. Define Prisma model in schema
2. Create aggregate class in `src/domain/aggregates/`
3. Define repository interface in `src/domain/repositories/`
4. Implement repository in `src/infrastructure/persistence/`
5. Register in dependency injection container
6. Create GraphQL types and resolvers

## Documentation

Detailed documentation available in `docs/` directory covering:
- Authentication implementation details
- CLI usage and custom commands
- Configuration management
- Pothos plugin documentation
- OAuth flow implementation
- Build process with tsdown

## Notes

- Server runs on port 4000 by default (configurable)
- Hot reload enabled in development mode
- GraphQL code generation runs automatically via Pothos
- All async operations use Bun's optimized runtime
- Federation support allows microservice architecture