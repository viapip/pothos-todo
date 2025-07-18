# Configuration System

This project uses [c12](https://github.com/unjs/c12) for smart configuration management, providing a hierarchical, environment-aware configuration system.

## Overview

The configuration system centralizes all application settings, environment variables, and build configurations in a type-safe, environment-aware manner.

### Key Features

- **Environment-Specific**: Automatic configuration per environment (development, production, test)
- **Hierarchical**: Configuration inheritance and merging
- **Type-Safe**: Full TypeScript support with strict typing
- **Hot Reloading**: Development-time configuration updates
- **Validation**: Built-in configuration validation
- **CLI Integration**: Configuration commands for inspection and validation

## Configuration Structure

```
config/
├── base.config.ts          # Base configuration with defaults
├── development.config.ts   # Development environment overrides
├── production.config.ts    # Production environment overrides
├── test.config.ts         # Test environment overrides
└── types.ts               # TypeScript type definitions

src/config/
└── index.ts               # Configuration loader and utilities

config.ts                  # Main configuration file with environment detection
.env.example              # Environment variables template
```

## Quick Start

### 1. Environment Setup

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` with your specific values:

```bash
# Environment Configuration
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/pothos_todo
```

### 2. Using Configuration

```typescript
import { loadAppConfig, getServerConfig } from './src/config/index.js';

// Load configuration
await loadAppConfig();

// Get specific configuration sections
const serverConfig = getServerConfig();
const databaseConfig = getDatabaseConfig();
```

### 3. Environment-Specific Values

The system automatically detects the environment and applies appropriate overrides:

```typescript
// config/base.config.ts
export default {
  logger: {
    level: 'info',
  },
  
  // Development override
  $development: {
    logger: {
      level: 'debug',
    },
  },
  
  // Production override
  $production: {
    logger: {
      level: 'warn',
    },
  },
};
```

## Configuration Sections

### Server Configuration
- Port and host settings
- CORS configuration
- GraphQL endpoint settings

### Database Configuration
- Database connection settings
- Docker container configuration
- Migration settings

### Logger Configuration
- Log levels and formats
- File output locations
- Console formatting

### Build Configuration
- TypeScript build settings
- Minification and optimization
- Development vs production builds

## Environment Variables

All configuration can be overridden via environment variables. See [Environment Variables](./environment-variables.md) for a complete reference.

## Documentation

- [Environment Variables](./environment-variables.md) - Complete environment variable reference
- [Development Setup](./development.md) - Development environment configuration
- [Production Deployment](./production.md) - Production deployment configuration
- [Docker Configuration](./docker.md) - Docker and containerization settings

## CLI Commands

```bash
# Show current configuration
pothos config:show

# Validate configuration
pothos config:validate

# Show configuration help
pothos config --help
```

## Advanced Usage

### Configuration Watching

In development, you can watch for configuration changes:

```typescript
import { watchAppConfig } from './src/config/index.js';

const watcher = await watchAppConfig({
  onUpdate: (newConfig) => {
    console.log('Configuration updated:', newConfig);
  },
});
```

### Custom Configuration

You can extend the configuration system:

```typescript
// custom.config.ts
export default {
  extends: ['./config/base.config'],
  
  // Custom settings
  myFeature: {
    enabled: true,
    apiKey: process.env.MY_API_KEY,
  },
};
```

### Configuration Validation

The system includes built-in validation:

```typescript
import { validateConfig } from './src/config/index.js';

const config = await loadAppConfig();
const result = validateConfig(config);

if (!result.valid) {
  console.error('Configuration errors:', result.errors);
}
```

## Best Practices

1. **Use Environment Variables**: Store sensitive data in environment variables
2. **Validate Early**: Validate configuration on application startup
3. **Type Safety**: Use TypeScript types for configuration access
4. **Documentation**: Document all configuration options
5. **Defaults**: Provide sensible defaults for all settings

## Migration Guide

If you're migrating from hardcoded configuration:

1. Move hardcoded values to configuration files
2. Update imports to use configuration utilities
3. Add environment variable overrides
4. Test in all environments

## Troubleshooting

### Configuration Not Loading

```bash
# Check configuration files exist
ls -la config/

# Validate configuration syntax
pothos config:validate
```

### Environment Variables Not Working

```bash
# Check environment variables are set
env | grep -E "(NODE_ENV|PORT|DATABASE_URL)"

# Check .env file is loaded
cat .env
```

### Type Errors

Ensure you're using the correct configuration types:

```typescript
import type { AppConfig } from '../config/types.js';
```

## Related Documentation

- [c12 Documentation](https://github.com/unjs/c12) - Configuration loader library
- [Environment Variables](./environment-variables.md) - Complete variable reference
- [CLI Commands](../cli/COMMANDS.md) - Command-line interface documentation