# Build Process Guide

This guide explains how the tsdown build process works in the Pothos GraphQL Federation project.

## Overview

The build process transforms TypeScript source code into optimized JavaScript bundles with TypeScript declaration files, supporting both ESM and CommonJS formats.

## Build Steps

### 1. Preparation (`build:prepare` hook)

- Cleans the output directory (`dist/`)
- Prepares build environment
- Validates configuration

### 2. Entry Point Processing

tsdown processes multiple entry points simultaneously:

```
src/
├── index.ts                    → dist/index.js + dist/index.cjs
├── api/server/server.ts        → dist/api/server.js + dist/api/server.cjs
├── api/schema/schema.ts        → dist/api/schema.js + dist/api/schema.cjs
├── domain/index.ts             → dist/domain/index.js + dist/domain/index.cjs
├── application/index.ts        → dist/application/index.js + dist/application/index.cjs
└── infrastructure/index.ts     → dist/infrastructure/index.js + dist/infrastructure/index.cjs
```

### 3. TypeScript Compilation

- Reads `tsconfig.json` for TypeScript configuration
- Compiles TypeScript to JavaScript
- Generates type declaration files (`.d.ts`)
- Handles module resolution and imports

### 4. Module Processing

- Resolves module dependencies
- Handles external dependencies (marks them as external)
- Processes internal modules and dependencies

### 5. Code Transformation

- **Tree Shaking**: Removes unused code
- **Module Format**: Generates ESM and CJS versions
- **Import/Export**: Transforms module syntax
- **Node.js Compatibility**: Handles Node.js specific features

### 6. Bundle Generation

For each entry point and format combination:

```
Entry: index.ts
├── dist/index.js       (ESM)
├── dist/index.cjs      (CJS)
├── dist/index.d.ts     (TypeScript declarations)
└── dist/index.js.map   (Source map)
```

### 7. Validation (`build:done` hook)

- Runs `publint` to validate package structure
- Generates build report
- Completes build process

## Build Modes

### Development Build

```bash
bun run build
```

**Characteristics:**
- Preserves readable code structure
- Includes source maps for debugging
- No minification
- Fast build times

### Production Build

```bash
bun run build:prod
```

**Characteristics:**
- Optimized for production
- Tree-shaking enabled
- Validation checks
- Smaller bundle sizes

### Watch Mode

```bash
bun run build:watch
```

**Characteristics:**
- Monitors file changes
- Incremental rebuilds
- Development-optimized
- Fast rebuild times

## File Processing

### TypeScript Files

1. **Parsing**: TypeScript AST generation
2. **Type Checking**: Type validation and inference
3. **Compilation**: JavaScript generation
4. **Declaration**: `.d.ts` file generation

### Module Resolution

1. **Internal Modules**: Bundled and processed
2. **External Dependencies**: Marked as external
3. **Node.js Built-ins**: Handled specially for Node.js platform

### Import/Export Processing

```typescript
// Source
import { Todo } from './domain/aggregates/Todo.js'
export { Todo }

// ESM Output
import { Todo } from './domain/aggregates/Todo.js'
export { Todo }

// CJS Output
const { Todo } = require('./domain/aggregates/Todo.js')
module.exports = { Todo }
```

## External Dependencies

The following dependencies are treated as external:

### Node.js Built-ins

```typescript
// Input
import { readFile } from 'node:fs/promises'

// Output (both ESM and CJS)
import { readFile } from 'node:fs/promises'
```

### Database Dependencies

```typescript
// Input
import { PrismaClient } from '@prisma/client'

// Output - Not bundled, remains as external import
import { PrismaClient } from '@prisma/client'
```

### GraphQL Ecosystem

```typescript
// Input
import { GraphQLSchema } from 'graphql'

// Output - Not bundled, remains as external import
import { GraphQLSchema } from 'graphql'
```

## Bundle Analysis

### Size Reporting

tsdown generates a build report showing:

- Bundle sizes for each entry point
- Compression ratios
- Tree-shaking effectiveness
- Build time metrics

### Debug Information

- Source maps for debugging
- Module dependency graphs
- Build performance metrics

## Optimization Strategies

### Tree Shaking

- Removes unused exports
- Eliminates dead code
- Reduces bundle size

### Module Splitting

- Separates entry points
- Allows selective imports
- Improves load performance

### External Dependencies

- Reduces bundle size
- Improves build speed
- Maintains proper dependency management

## Build Artifacts

### JavaScript Files

- **`.js`**: ESM format
- **`.cjs`**: CommonJS format
- **`.js.map`**: Source maps

### TypeScript Declarations

- **`.d.ts`**: Type declarations
- **`.d.ts.map`**: Declaration source maps

### Build Reports

- Bundle size analysis
- Performance metrics
- Validation results

## Performance Considerations

### Build Speed

- Incremental builds in watch mode
- Parallel processing of entry points
- Efficient module resolution

### Bundle Size

- Tree-shaking eliminates unused code
- External dependencies reduce bundle size
- Optimal module splitting

### Runtime Performance

- Node.js platform optimization
- Efficient module loading
- Minimal runtime overhead

## Troubleshooting

### Common Build Issues

1. **Module Resolution Errors**
   - Check import paths
   - Verify external dependencies configuration

2. **Type Errors**
   - Run `bun run check:types` for detailed errors
   - Check TypeScript configuration

3. **Large Bundle Sizes**
   - Review external dependencies
   - Enable tree-shaking
   - Check for unused imports

4. **Build Performance**
   - Use watch mode for development
   - Consider reducing entry points
   - Optimize TypeScript configuration

### Debug Build Process

Enable verbose logging:

```bash
DEBUG=tsdown:* bun run build
```

View build report:

```bash
bun run build --report
```