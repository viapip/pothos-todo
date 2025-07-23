# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an enterprise-grade Pothos GraphQL API built with Domain-Driven Design (DDD) architecture and CQRS pattern. It uses Bun as the JavaScript runtime, H3 as the HTTP framework, and includes advanced features like AI/ML integration, real-time collaboration, comprehensive monitoring, and enterprise security. The project has undergone extensive modernization to include next-generation capabilities.

## Development Commands

### Essential Commands
```bash
# Install dependencies
bun install

# Start development server (with watch mode)
bun run dev

# Start production server
bun run start

# Type checking (critical - run before commits)
bun run check:types

# Build project
bun run build

# Validate project (types + linting)
bun run validate
```

### Database Commands
```bash
# Start PostgreSQL container
bun run db:up

# Start all services (PostgreSQL + Qdrant for AI features)
bun run services:up

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
# Start all Docker services (PostgreSQL + Qdrant)
bun run services:up

# Stop all Docker services
bun run services:down

# Start only Qdrant (for AI features)
bun run qdrant:up
```

### CLI Commands
The project includes a comprehensive CLI built with OCLIF:
```bash
bun run cli <command>

# Available topics:
# - build: Build project commands
# - check: Validation and check commands  
# - config: Configuration management commands
# - db: Database management commands
# - dev: Development commands
# - services: Docker services management
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
   - **AI Services**: Advanced AI/ML capabilities (EmbeddingService, NLPService, RAGService)
   - **Monitoring**: Comprehensive observability (MetricsCollector, PerformanceMonitor)
   - **Security**: Enterprise security features (rate limiting, threat detection)

4. **API Layer** (`src/api/`)
   - **GraphQL Schema**: Pothos-based type-safe schema definitions
   - **Mutations**: GraphQL mutations mapped to application commands
   - **Queries**: GraphQL queries for data retrieval
   - **Server**: GraphQL Yoga server configuration
   - **DataLoaders**: N+1 query optimization

### Key Architectural Decisions

- **Event Sourcing**: All domain changes emit events stored in DomainEvent table
- **Repository Pattern**: Domain logic isolated from persistence details
- **Dependency Injection**: IoC container manages dependencies
- **Type Safety**: End-to-end type safety from database to GraphQL API
- **Advanced Caching**: Multi-layer caching with Redis and intelligent warming
- **AI Integration**: Vector embeddings with Qdrant for semantic search
- **Real-time Features**: WebSocket subscriptions for live updates

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

### Schema Development Workflow
1. Define domain models in `prisma/schema.prisma`
2. Run `bun run db:generate` to update Prisma client
3. Create/update GraphQL types in `src/api/schema/types/`
4. Add mutations in `src/api/schema/mutations/`
5. Add queries in `src/api/schema/queries/`
6. **Always run `bun run check:types` before committing**

### Pothos Builder Configuration
The schema builder in `src/api/schema/builder.ts` includes plugins:
- Prisma integration for automatic type generation
- DataLoader for N+1 query optimization
- Error handling with typed errors
- Relay-style connections and nodes
- Validation with Zod schemas
- Tracing and performance monitoring

### GraphQL Endpoints
- **Primary**: `http://localhost:4000/graphql`
- **WebSocket**: `ws://localhost:4000/graphql` (for subscriptions)
- **Health Check**: `http://localhost:4000/health`
- **Metrics**: `http://localhost:4000/metrics`

## Database Management

### Prisma Workflow
1. Modify schema in `prisma/schema.prisma`
2. Create migration: `bun run db:migrate`
3. Generate types: `bun run db:generate`
4. Update GraphQL schema accordingly
5. Test with `bun run check:types`

### Event Sourcing
All domain mutations emit events stored in the DomainEvent table:
- Automatic event capture via domain aggregates
- Event replay capabilities
- Audit trail for all changes
- Real-time subscriptions based on events

## AI and Vector Search Features

### Infrastructure Components
1. **Vector Database**: Qdrant for storing and searching embeddings
2. **Embedding Service**: OpenAI text-embedding-3-small model
3. **NLP Service**: OpenAI GPT-4 mini for natural language processing
4. **Cache Layer**: Redis for query result caching
5. **Event-Driven Embedding**: Automatic embedding generation on todo/list changes

### AI-Powered GraphQL Operations

#### Queries
- `searchTodos`: Semantic search across user's todos
- `findSimilarTodos`: Find todos similar to a specific todo
- `suggestTodos`: AI-powered task suggestions based on user patterns
- `askAboutTodos`: Ask questions about your todos using natural language
- `getUserInsights`: Get AI-generated insights about productivity patterns
- `predictCompletionTime`: Estimate task completion time based on historical data

#### Mutations
- `executeNLPCommand`: Process natural language commands
  - Examples: "Create a todo to buy groceries tomorrow with high priority"
  - Supports: create, update, complete, delete, and list actions
- `createTodoWithAI`: Create todos with AI-suggested priority and completion time
- `createTodosFromSuggestions`: Batch create todos from AI suggestions

### AI Configuration
Set these environment variables for AI features:
```bash
# OpenAI Configuration
OPENAI_API_KEY=your-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536

# Qdrant Configuration  
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional-api-key

# Enable/Disable AI
AI_ENABLED=true
```

## Real-time Features

### WebSocket Subscriptions
- Todo updates and completion notifications
- Real-time collaboration features
- User presence tracking
- Live todo list changes

### Subscription Examples
```graphql
subscription TodoUpdates {
  todoUpdated {
    id
    title
    status
    updatedAt
  }
}

subscription CollaborationEvents {
  collaborationEvent {
    type
    userId
    todoId
    timestamp
  }
}
```

## Monitoring and Observability

### Health Checks
- `/health` - Basic health check
- `/health/ready` - Readiness probe
- `/health/detailed` - Comprehensive system health

### Metrics and Monitoring
- `/metrics` - System metrics
- `/metrics/prometheus` - Prometheus-compatible metrics
- OpenTelemetry distributed tracing
- Performance monitoring with custom metrics

### Key Performance Indicators
- GraphQL query complexity analysis
- Database connection pooling metrics
- Cache hit/miss rates
- AI service response times
- WebSocket connection health

## Development Guidelines

### Adding New Features
1. Start with domain model (aggregate, value objects)
2. Define repository interface in domain layer
3. Implement repository in infrastructure layer
4. Create command and handler in application layer
5. Expose via GraphQL mutation/query in API layer
6. Add appropriate DataLoader if needed
7. Consider AI integration opportunities
8. **Always run `bun run check:types` before committing**

### Code Organization Principles
- Keep domain logic in aggregates, not in GraphQL resolvers
- Use commands for all state-changing operations
- Repository implementations should only handle data access
- GraphQL layer should be thin, delegating to application layer
- AI services should be event-driven and asynchronous
- Cache invalidation should follow domain events

### Type Safety Requirements
- Leverage Pothos for GraphQL type generation
- Use Prisma's generated types for database operations
- Define explicit types for all command/query parameters
- Never use `any` types - use proper generics instead
- Import types using `type` keyword when appropriate (e.g., `import type { Span }`)

## Common Development Issues

### TypeScript Compilation
- The project is in active modernization with some remaining TypeScript errors
- Always check `bun run check:types` before making changes
- Federation components are currently simplified (placeholder implementations)
- Date objects need `.toISOString()` when passing to domain constructors

### Performance Considerations
- Use DataLoaders for any database queries in GraphQL resolvers
- AI operations are cached - check cache invalidation logic
- Database queries should go through repository pattern
- Complex queries should use query complexity analysis

### AI Feature Development
- Embeddings are generated automatically via domain events
- Vector searches are user-scoped for security
- NLP commands follow specific parsing patterns
- RAG responses include source attribution

## Testing

### Performance Testing
The project includes trace-based performance testing:
```bash
# Run performance tests (when test infrastructure is completed)
bun test src/tests/performance/
```

### Testing Guidelines
- Domain value objects use specific enum values (e.g., `Priority.medium` not `Priority.Medium`)
- Use `undefined` instead of `null` for optional parameters
- Performance tests require specific trace expectations

## Environment Setup

1. Copy `.env.example` to `.env`
2. Configure OAuth credentials (Google, GitHub)
3. Set OpenAI API key for AI features
4. Configure Qdrant URL for vector search
5. Set session encryption key
6. Run `bun run services:up` to start all services
7. Run `bun run db:migrate` to initialize database
8. Run `bun run dev` to start development server

## Production Deployment

### Build Process
- Uses `tsdown` for optimized TypeScript compilation
- Build artifacts go to `dist/` directory
- Production build: `bun run build:prod`

### Service Dependencies
- PostgreSQL database
- Redis for caching
- Qdrant for vector search
- OpenAI API access

### Monitoring Setup
- OpenTelemetry instrumentation
- Prometheus metrics export
- Health check endpoints for load balancers
- Structured logging with correlation IDs

## Architecture Highlights

### Advanced Caching Strategy
- Intelligent cache warming based on usage patterns
- Multi-strategy caching (cache, static, simplified, disabled)
- Tag-based invalidation with dependency tracking
- Performance analytics with hit/miss rates

### Enterprise Security
- Advanced rate limiting (per-endpoint, per-user, global)
- Content Security Policy with GraphQL compatibility
- Request validation and sanitization
- Audit logging for all mutations

### Microservices Readiness
- Federation gateway architecture (currently simplified)
- Service discovery and health monitoring capabilities
- Load balancing preparation
- Distributed tracing across services

## Important Notes

- Server runs on port 4000 by default (configurable)
- Hot reload enabled in development mode
- GraphQL code generation runs automatically via Pothos
- All async operations use Bun's optimized runtime
- Federation support is prepared but currently uses placeholder implementations
- The project prioritizes type safety - compilation errors should be resolved before deployment