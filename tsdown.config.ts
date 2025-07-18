import { defineConfig } from 'tsdown'

export default defineConfig({
  // Entry points for different usage scenarios
  entry: {
    // Main server entry point
    index: './index.ts',
    // API server for library usage
    'api/server': './src/api/server/server.ts',
    // GraphQL schema for library usage
    'api/schema': './src/api/schema/schema.ts',
    'api/schema/queries': './src/api/schema/queries/index.ts',
    'api/schema/mutations': './src/api/schema/mutations/index.ts',
    // Domain layer for library usage
    'domain/index': './src/domain/index.ts',
    // Application layer for library usage
    'application/index': './src/application/index.ts',
    // Infrastructure layer for library usage
    'infrastructure/index': './src/infrastructure/index.ts',
    // CLI commands
    'commands/index': './src/commands/index.ts',
    'commands/interactive': './src/commands/interactive.ts',
    'commands/status': './src/commands/status.ts',
    'commands/build/index': './src/commands/build/index.ts',
    'commands/build/menu': './src/commands/build/menu.ts',
    'commands/check/index': './src/commands/check/index.ts',
    'commands/check/menu': './src/commands/check/menu.ts',
    'commands/db/index': './src/commands/db/index.ts',
    'commands/db/menu': './src/commands/db/menu.ts',
    'commands/dev/start': './src/commands/dev/start.ts',
    'commands/dev/dist': './src/commands/dev/dist.ts',
    'commands/dev/menu': './src/commands/dev/menu.ts',
    'commands/services/index': './src/commands/services/index.ts',
    'commands/services/menu': './src/commands/services/menu.ts',
    'lib/utils': './src/lib/utils.ts',
    'logger': './src/logger.ts'
  },
  
  // Output formats
  format: ['esm', 'cjs'],
  
  // Platform and target
  platform: 'node',
  target: 'node18',
  
  // Output configuration
  outDir: 'dist',
  clean: true,
  
  // TypeScript settings
  dts: true,
  tsconfig: './tsconfig.json',
  
  // Development settings
  sourcemap: true,
  
  // Optimization settings
  treeshake: true,
  minify: false, // Keep readable for debugging
  
  // Validation (disabled for private packages)
  publint: false,
  
  // External dependencies (don't bundle these)
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
    /@pothos\/.*/,
    
    // CLI dependencies
    /@oclif\/.*/,
    'execa',
    'inquirer',
    'chalk',
    'boxen',
    'figlet',
    'ora',
    'listr2',
    'winston'
  ],
  
  // Skip bundling node_modules for server usage
  skipNodeModulesBundle: true,
  
  // Reporting
  report: true,
  
  // Watch mode configuration
  watch: process.env.NODE_ENV === 'development',
  
  // Hooks for custom build steps
  hooks: {
    'build:prepare': async () => {
      console.log('🔧 Preparing build...')
    },
    'build:done': async () => {
      console.log('✅ Build completed successfully!')
    }
  }
})