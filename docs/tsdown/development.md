# Development Workflow Guide

This guide explains how to use tsdown effectively during development of the Pothos GraphQL Federation project.

## Development Setup

### Prerequisites

1. **Dependencies Installed**
   ```bash
   bun install
   ```

2. **Database Setup**
   ```bash
   bun run services:up
   bun run db:generate
   bun run db:migrate
   ```

3. **Build Tools Ready**
   ```bash
   # Verify tsdown is installed
   bunx tsdown --version
   ```

## Development Workflows

### 1. Source Development (Recommended)

**Use Case**: Active development with frequent changes

```bash
# Start development server with source files
bun run dev

# In another terminal, watch for build changes
bun run build:watch
```

**Benefits**:
- Fastest reload times
- Direct TypeScript execution
- Immediate feedback on changes
- Full debugging capabilities

### 2. Built Development

**Use Case**: Testing built output during development

```bash
# Build with watch mode
bun run build:watch

# In another terminal, run built server
bun run start:dist
```

**Benefits**:
- Tests the actual build output
- Validates build configuration
- Simulates production environment

### 3. Hybrid Development

**Use Case**: Developing library components

```bash
# Terminal 1: Source development
bun run dev

# Terminal 2: Build watching
bun run build:watch

# Terminal 3: Type checking
bun run check:types --watch
```

**Benefits**:
- Develops server with hot reload
- Builds library exports continuously
- Validates types in real-time

## Watch Mode Features

### Automatic Rebuilds

Watch mode monitors these file patterns:
- `**/*.ts` - TypeScript files
- `**/*.js` - JavaScript files
- `tsconfig.json` - TypeScript configuration
- `tsdown.config.ts` - Build configuration

### Incremental Building

- Only rebuilds changed entry points
- Faster subsequent builds
- Preserves build state between changes

### Error Handling

- Continues watching on build errors
- Displays clear error messages
- Recovers automatically when errors are fixed

## Development Commands

### Core Development

```bash
# Start development server (source files)
bun run dev

# Start built server
bun run start:dist

# Build once
bun run build

# Build with watch
bun run build:watch
```

### Quality Checks

```bash
# Type checking
bun run check:types

# Package validation
bun run check:publint

# Type correctness check
bun run check:attw

# Run all validations
bun run validate
```

### Database Operations

```bash
# Start database
bun run db:up

# Generate Prisma client
bun run db:generate

# Run migrations
bun run db:migrate

# Reset database
bun run db:migrate:reset
```

## File Organization

### Source Structure

```
src/
├── api/                    # GraphQL API layer
│   ├── resolvers/         # GraphQL resolvers
│   ├── schema/            # GraphQL schema
│   └── server/            # Server setup
├── application/           # Application services
│   ├── commands/          # Command objects
│   ├── handlers/          # Command handlers
│   └── queries/           # Query handlers
├── domain/                # Domain models
│   ├── aggregates/        # Domain aggregates
│   ├── events/            # Domain events
│   ├── repositories/      # Repository interfaces
│   └── value-objects/     # Value objects
└── infrastructure/        # Infrastructure layer
    ├── container/         # DI container
    ├── events/            # Event handling
    ├── persistence/       # Data persistence
    └── projections/       # Read models
```

### Build Output

```
dist/
├── index.js               # Main server (ESM)
├── index.cjs              # Main server (CJS)
├── index.d.ts             # Type declarations
├── api/
│   ├── server.js          # API server
│   ├── schema.js          # GraphQL schema
│   └── *.d.ts             # Type declarations
├── domain/
│   ├── index.js           # Domain exports
│   └── index.d.ts         # Type declarations
├── application/
│   ├── index.js           # Application exports
│   └── index.d.ts         # Type declarations
└── infrastructure/
    ├── index.js           # Infrastructure exports
    └── index.d.ts         # Type declarations
```

## Development Best Practices

### 1. Layer-Based Development

**Domain Layer** (Core Business Logic):
```typescript
// src/domain/aggregates/Todo.ts
export class Todo extends AggregateRoot {
  // Business logic here
}
```

**Application Layer** (Use Cases):
```typescript
// src/application/handlers/CreateTodoHandler.ts
export class CreateTodoHandler {
  async handle(command: CreateTodoCommand): Promise<void> {
    // Application logic here
  }
}
```

**Infrastructure Layer** (Technical Details):
```typescript
// src/infrastructure/persistence/PrismaTodoRepository.ts
export class PrismaTodoRepository implements TodoRepository {
  // Data access logic here
}
```

**API Layer** (External Interface):
```typescript
// src/api/resolvers/TodoResolver.ts
export const TodoResolver = builder.prismaObject('Todo', {
  // GraphQL resolvers here
})
```

### 2. Import/Export Patterns

**Layer Index Files**:
```typescript
// src/domain/index.ts
export { Todo } from './aggregates/Todo.js'
export { TodoRepository } from './repositories/TodoRepository.js'
export type { TodoCreated } from './events/TodoCreated.js'
```

**Proper Import Syntax**:
```typescript
// Use .js extensions for imports
import { Todo } from './domain/aggregates/Todo.js'
import type { TodoRepository } from './domain/repositories/TodoRepository.js'
```

### 3. Type Safety

**Enable Strict Mode**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true
  }
}
```

**Use Type-Only Imports**:
```typescript
import type { User } from './User.js'
import { createUser } from './UserService.js'
```

## Debugging

### Source Maps

Built files include source maps for debugging:

```bash
# Start built server with debugging
node --inspect dist/index.js

# Or with Bun
bun --inspect run start:dist
```

### Error Handling

Common development errors and solutions:

1. **Module Resolution**:
   ```bash
   # Check TypeScript compilation
   bun run check:types
   ```

2. **Build Errors**:
   ```bash
   # Clean build
   bun run build:clean
   ```

3. **Type Errors**:
   ```bash
   # Regenerate Prisma client
   bun run db:generate
   ```

### Performance Monitoring

Monitor build performance:

```bash
# Build with timing information
time bun run build

# Watch build times
bun run build:watch
```

## Testing with Built Output

### Unit Testing

```bash
# Build before testing
bun run build

# Test built modules
import { Todo } from './dist/domain/index.js'
```

### Integration Testing

```bash
# Start built server for testing
bun run start:dist

# Run integration tests against built server
npm test -- --baseUrl=http://localhost:4000
```

## Hot Reloading

### Development Server

The development server (`bun run dev`) provides hot reloading:

- Automatic restart on file changes
- Preserves process state when possible
- Fast reload times with Bun

### Build Watch

The build watch mode (`bun run build:watch`) provides:

- Incremental rebuilds
- TypeScript declaration updates
- Build error notifications

## Environment Configuration

### Development Environment

```bash
# .env.development
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://localhost:5432/dev
```

### Build Environment

```bash
# Set environment for build
NODE_ENV=production bun run build:prod
```

## Common Development Tasks

### Adding New Features

1. **Domain Model**:
   ```typescript
   // src/domain/aggregates/NewFeature.ts
   export class NewFeature extends AggregateRoot {
     // Implementation
   }
   ```

2. **Export from Layer**:
   ```typescript
   // src/domain/index.ts
   export { NewFeature } from './aggregates/NewFeature.js'
   ```

3. **Build and Test**:
   ```bash
   bun run build:watch
   bun run check:types
   ```

### Updating Dependencies

1. **Update package.json**:
   ```bash
   bun add new-dependency
   bun add -D new-dev-dependency
   ```

2. **Update External Dependencies**:
   ```typescript
   // tsdown.config.ts
   external: [
     // ... existing
     'new-external-dependency'
   ]
   ```

3. **Rebuild**:
   ```bash
   bun run build:clean
   ```

## Troubleshooting

### Common Issues

1. **Watch Mode Not Working**:
   - Check file permissions
   - Verify file patterns
   - Restart watch mode

2. **Build Errors After Changes**:
   - Run `bun run build:clean`
   - Check for TypeScript errors
   - Verify import paths

3. **Type Errors**:
   - Run `bun run db:generate`
   - Check tsconfig.json
   - Verify import/export syntax

### Performance Issues

1. **Slow Builds**:
   - Use incremental builds
   - Check external dependencies
   - Optimize entry points

2. **Large Bundle Sizes**:
   - Review imports
   - Check external configuration
   - Enable tree-shaking