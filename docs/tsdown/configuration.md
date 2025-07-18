# tsdown Configuration Guide

This guide explains the tsdown configuration used in the Pothos GraphQL Federation project.

## Configuration File

The configuration is located in `tsdown.config.ts` at the project root.

## Configuration Options

### Entry Points

```typescript
entry: {
  // Main server entry point
  index: './index.ts',
  // API server for library usage
  'api/server': './src/api/server/server.ts',
  // GraphQL schema for library usage
  'api/schema': './src/api/schema/schema.ts',
  // Domain layer for library usage
  'domain/index': './src/domain/index.ts',
  // Application layer for library usage
  'application/index': './src/application/index.ts',
  // Infrastructure layer for library usage
  'infrastructure/index': './src/infrastructure/index.ts'
}
```

**Purpose**: Multiple entry points allow the project to be used both as a complete server application and as a library where consumers can import specific layers or components.

### Output Formats

```typescript
format: ['esm', 'cjs']
```

**Purpose**: Generates both ESM (ES Modules) and CommonJS formats for maximum compatibility.

### Platform and Target

```typescript
platform: 'node',
target: 'node18'
```

**Purpose**: Optimizes the build for Node.js runtime, targeting Node.js 18+ features.

### Output Configuration

```typescript
outDir: 'dist',
clean: true
```

**Purpose**: Outputs built files to the `dist` directory and cleans it before each build.

### TypeScript Settings

```typescript
dts: true,
tsconfig: './tsconfig.json'
```

**Purpose**: Generates TypeScript declaration files (`.d.ts`) and uses the project's TypeScript configuration.

### Development Settings

```typescript
sourcemap: true
```

**Purpose**: Generates source maps for debugging built code.

### Optimization Settings

```typescript
treeshake: true,
minify: false
```

**Purpose**: Removes unused code (tree-shaking) but keeps the output readable for debugging.

### External Dependencies

```typescript
external: [
  // Node.js built-ins
  /^node:/,
  
  // Database
  '@prisma/client',
  'prisma',
  
  // GraphQL ecosystem
  'graphql',
  'graphql-yoga',
  '@apollo/subgraph',
  
  // Pothos plugins
  /@pothos\/.*/
]
```

**Purpose**: These dependencies are not bundled and remain as external dependencies in the built output.

### Skip Node Modules Bundling

```typescript
skipNodeModulesBundle: true
```

**Purpose**: Prevents bundling of node_modules, keeping the build size smaller and allowing for proper dependency management.

### Validation

```typescript
publint: true
```

**Purpose**: Runs `publint` after build to validate package.json and exports.

### Watch Mode

```typescript
watch: process.env.NODE_ENV === 'development'
```

**Purpose**: Automatically enables watch mode in development environment.

### Build Hooks

```typescript
hooks: {
  'build:prepare': async () => {
    console.log('🔧 Preparing build...')
  },
  'build:done': async () => {
    console.log('✅ Build completed successfully!')
  }
}
```

**Purpose**: Custom hooks for build lifecycle events.

## Environment Variables

### NODE_ENV

- `development`: Enables watch mode
- `production`: Optimizes for production build

### Usage

```bash
# Development build
NODE_ENV=development bun run build

# Production build
NODE_ENV=production bun run build:prod
```

## Customization

### Adding New Entry Points

To add a new entry point, update the `entry` configuration:

```typescript
entry: {
  // ... existing entries
  'new-module': './src/new-module/index.ts'
}
```

### Modifying External Dependencies

To add or remove external dependencies:

```typescript
external: [
  // ... existing externals
  'new-external-package',
  /^@my-scope\/.*/  // All packages in @my-scope
]
```

### Changing Output Formats

To modify output formats:

```typescript
format: ['esm']  // ESM only
// or
format: ['cjs']  // CommonJS only
// or
format: ['esm', 'cjs', 'iife']  // Multiple formats
```

### Platform-Specific Builds

To target different platforms:

```typescript
platform: 'browser'  // For browser usage
// or
platform: 'neutral'  // Platform-agnostic
```

## Advanced Configuration

### Rolldown Options

You can override Rolldown input and output options:

```typescript
inputOptions: {
  // Custom Rolldown input options
},
outputOptions: {
  // Custom Rolldown output options
}
```

### Plugins

Add custom plugins:

```typescript
plugins: [
  // Custom plugins
]
```

### Minification

Enable minification for production:

```typescript
minify: process.env.NODE_ENV === 'production'
```

## Troubleshooting

### Common Issues

1. **Build fails with module resolution errors**: Check `external` configuration
2. **Large bundle size**: Verify `skipNodeModulesBundle` is enabled
3. **Missing types**: Ensure `dts: true` is set
4. **Watch mode not working**: Check `NODE_ENV` environment variable

### Debug Options

Enable verbose logging:

```typescript
silent: false,
report: true
```