# tsdown Build System

tsdown is a blazing-fast, elegant bundler for TypeScript/JavaScript libraries powered by Rolldown and Oxc. This documentation covers the build system setup for the Pothos GraphQL Federation project.

## Overview

This project uses tsdown to build both server applications and library packages with the following features:

- **Multiple Entry Points**: Server, API, Schema, and layer-specific exports
- **Dual Format Support**: ESM and CommonJS outputs
- **TypeScript Declaration Files**: Auto-generated `.d.ts` files
- **Development Watch Mode**: Hot reloading during development
- **Production Optimization**: Tree-shaking and validation
- **Package Validation**: Publint and type checking integration

## Quick Start

### Installation

Dependencies are already installed, but for reference:

```bash
bun add -D tsdown publint @arethetypeswrong/core
```

### Basic Usage

```bash
# Development build
bun run build

# Watch mode (rebuilds on file changes)
bun run build:watch

# Production build
bun run build:prod

# Clean build (removes dist folder first)
bun run build:clean
```

### Running Built Application

```bash
# Run the built server
bun run start:dist

# Or with Node.js
node dist/index.js
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `build` | Standard build with ESM and CJS outputs |
| `build:watch` | Build with watch mode for development |
| `build:prod` | Production build with optimizations |
| `build:clean` | Clean build directory and rebuild |
| `check:types` | Run TypeScript type checking |
| `check:publint` | Validate package.json and exports |
| `check:attw` | Check if types are wrong |
| `validate` | Run all validation checks |
| `start:dist` | Start the server from built files |

## Entry Points

The build system creates multiple entry points for different use cases:

- `index` - Main server application
- `api/server` - GraphQL server for library usage
- `api/schema` - GraphQL schema for library usage
- `domain/index` - Domain layer exports
- `application/index` - Application layer exports
- `infrastructure/index` - Infrastructure layer exports

## Output Structure

```
dist/
├── index.js                    # Main server (ESM)
├── index.cjs                   # Main server (CJS)
├── index.d.ts                  # TypeScript definitions
├── api/
│   ├── server.js              # GraphQL server
│   ├── server.cjs             # GraphQL server (CJS)
│   ├── server.d.ts            # TypeScript definitions
│   ├── schema.js              # GraphQL schema
│   ├── schema.cjs             # GraphQL schema (CJS)
│   └── schema.d.ts            # TypeScript definitions
├── domain/
│   ├── index.js               # Domain exports
│   ├── index.cjs              # Domain exports (CJS)
│   └── index.d.ts             # TypeScript definitions
├── application/
│   ├── index.js               # Application exports
│   ├── index.cjs              # Application exports (CJS)
│   └── index.d.ts             # TypeScript definitions
└── infrastructure/
    ├── index.js               # Infrastructure exports
    ├── index.cjs              # Infrastructure exports (CJS)
    └── index.d.ts             # TypeScript definitions
```

## Configuration

The build system is configured in `tsdown.config.ts`. See [Configuration Guide](./configuration.md) for detailed options.

## Development Workflow

See [Development Guide](./development.md) for detailed development workflow.

## Production Deployment

See [Deployment Guide](./deployment.md) for production deployment instructions.

## Build Process

See [Build Process Guide](./build-process.md) for detailed information about the build process.

## External Dependencies

The following dependencies are marked as external and won't be bundled:

- Node.js built-ins (e.g., `fs`, `path`, `http`)
- Prisma and database dependencies
- GraphQL ecosystem packages
- Pothos plugins

This ensures the built application remains lightweight and allows for proper dependency management.