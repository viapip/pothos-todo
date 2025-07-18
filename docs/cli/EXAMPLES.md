# CLI Examples

Practical examples and workflows for using the Pothos CLI in different scenarios.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Workflows](#development-workflows)
- [Build and Deployment](#build-and-deployment)
- [Database Management](#database-management)
- [Service Management](#service-management)
- [Testing and Validation](#testing-and-validation)
- [Monitoring and Debugging](#monitoring-and-debugging)
- [Advanced Scenarios](#advanced-scenarios)

## Quick Start

### First Time Setup
```bash
# Install dependencies
bun install

# Start the interactive CLI
./bin/run.js

# Or check system status
./bin/run.js status
```

### Common Commands
```bash
# Start development server
./bin/run.js dev:start

# Build project
./bin/run.js build

# Check everything
./bin/run.js check

# Start database
./bin/run.js db --up
```

## Development Workflows

### Standard Development Flow
```bash
# 1. Start database services
./bin/run.js db --up

# 2. Start development server
./bin/run.js dev:start

# 3. In another terminal, monitor status
./bin/run.js status --watch
```

### Interactive Development
```bash
# Use the main menu for guided workflow
./bin/run.js

# Select "Development" -> "Start Development Server"
# The CLI will handle everything with confirmation prompts
```

### Hot Reload Development
```bash
# Start with hot reload (default)
./bin/run.js dev:start

# Or explicitly use watch mode
./bin/run.js dev:watch
```

### Test Built Version
```bash
# Build first
./bin/run.js build

# Start from dist/
./bin/run.js dev:dist
```

## Build and Deployment

### Production Build
```bash
# Clean production build
./bin/run.js build --clean --prod

# Validate the build
./bin/run.js check

# Check build status
./bin/run.js status
```

### Continuous Build
```bash
# Watch mode build
./bin/run.js build --watch

# Monitor in another terminal
./bin/run.js status --watch
```

### Build Pipeline
```bash
#!/bin/bash
# build-pipeline.sh

echo "Starting build pipeline..."

# Clean build
./bin/run.js build --clean
if [ $? -ne 0 ]; then
    echo "Build failed"
    exit 1
fi

# Run all checks
./bin/run.js check
if [ $? -ne 0 ]; then
    echo "Validation failed"
    exit 1
fi

echo "Build pipeline completed successfully"
```

### Interactive Build Management
```bash
# Use build menu for guided experience
./bin/run.js build:menu

# Options include:
# - Standard build
# - Watch mode
# - Production build
# - Clean build
# - Build info
# - Build validation
```

## Database Management

### Database Setup
```bash
# Start database containers
./bin/run.js db --up

# Run migrations
./bin/run.js db --migrate

# Seed with test data
./bin/run.js db --seed

# Open database studio
./bin/run.js db --studio
```

### Database Development Workflow
```bash
# Interactive database menu
./bin/run.js db:menu

# Quick status check
./bin/run.js db --status

# Reset database for clean state
./bin/run.js db --reset
```

### Migration Management
```bash
# Interactive migration menu
./bin/run.js db:menu
# Select "Migration Menu"

# Available options:
# - Run migrations
# - Migration status
# - Create new migration
# - Rollback migration
# - Reset migrations
```

### Database Troubleshooting
```bash
# Check database status
./bin/run.js db --status

# If issues, try restarting
./bin/run.js services --restart

# Or reset completely
./bin/run.js db --reset
```

## Service Management

### Start All Services
```bash
# Start all Docker services
./bin/run.js services --up

# Check status
./bin/run.js services --status

# View logs
./bin/run.js services --logs
```

### Service Monitoring
```bash
# Follow live logs
./bin/run.js services --follow

# Or use interactive menu
./bin/run.js services:menu
# Select "Follow Logs" -> Choose service
```

### Service Development
```bash
# Build services
./bin/run.js services --build

# Rebuild without cache
./bin/run.js services --rebuild

# Restart services
./bin/run.js services --restart
```

### Service Cleanup
```bash
# Stop all services
./bin/run.js services --down

# Clean everything (containers + volumes)
./bin/run.js services --clean
```

## Testing and Validation

### Complete Validation
```bash
# Run all checks
./bin/run.js check

# Or use interactive menu
./bin/run.js check:menu
```

### Specific Checks
```bash
# Only TypeScript
./bin/run.js check --types

# Only package validation
./bin/run.js check --publint

# Only type correctness
./bin/run.js check --attw
```

### Custom Validation
```bash
# Interactive custom selection
./bin/run.js check:menu
# Select "Custom Check"
# Choose specific checks to run
```

### Pre-commit Workflow
```bash
#!/bin/bash
# pre-commit.sh

echo "Running pre-commit checks..."

# Type check
./bin/run.js check --types
if [ $? -ne 0 ]; then
    echo "TypeScript errors found"
    exit 1
fi

# Package validation
./bin/run.js check --publint
if [ $? -ne 0 ]; then
    echo "Package validation failed"
    exit 1
fi

echo "Pre-commit checks passed"
```

## Monitoring and Debugging

### System Status Dashboard
```bash
# Full status dashboard
./bin/run.js status

# Watch mode (auto-refresh every 5 seconds)
./bin/run.js status --watch

# Minimal status
./bin/run.js status --minimal
```

### JSON Status for Scripts
```bash
# Get JSON status
./bin/run.js status --json

# Parse with jq
./bin/run.js status --json | jq '.docker.running'
./bin/run.js status --json | jq '.build.status'
./bin/run.js status --json | jq '.git.branch'
```

### Debugging Services
```bash
# Check service status
./bin/run.js services --status

# View logs
./bin/run.js services --logs

# Follow specific service logs
./bin/run.js services:menu
# Select "Follow Logs" -> Choose service
```

### Build Debugging
```bash
# Check build status
./bin/run.js build:menu
# Select "Build Info"

# Or use status dashboard
./bin/run.js status

# Validate build
./bin/run.js build:menu
# Select "Validate Build"
```

## Advanced Scenarios

### CI/CD Integration
```bash
#!/bin/bash
# ci-cd.sh

# Set up environment
export NODE_ENV=production

# Install dependencies
bun install

# Start services
./bin/run.js services --up

# Wait for services to be ready
sleep 10

# Run migrations
./bin/run.js db --migrate

# Build
./bin/run.js build --prod

# Run tests/validation
./bin/run.js check

# Check final status
./bin/run.js status --json

# Cleanup
./bin/run.js services --down
```

### Development Team Workflow
```bash
# Morning routine
./bin/run.js services --up
./bin/run.js db --migrate
./bin/run.js dev:start

# Before commits
./bin/run.js check

# End of day
./bin/run.js services --down
```

### Docker Development
```bash
# Start with fresh containers
./bin/run.js services --clean
./bin/run.js services --up

# Build services
./bin/run.js services --build

# Monitor logs
./bin/run.js services --follow
```

### Performance Monitoring
```bash
# Watch system status
./bin/run.js status --watch

# Monitor services
./bin/run.js services:menu
# Select "View Logs" for performance logs
```

### Automation Scripts

#### Health Check Script
```bash
#!/bin/bash
# health-check.sh

echo "Performing health check..."

# Get status as JSON
STATUS=$(./bin/run.js status --json)

# Check Docker
DOCKER_RUNNING=$(echo $STATUS | jq -r '.docker.running')
if [ "$DOCKER_RUNNING" != "true" ]; then
    echo "❌ Docker not running"
    exit 1
fi

# Check build
BUILD_STATUS=$(echo $STATUS | jq -r '.build.status')
if [ "$BUILD_STATUS" != "success" ]; then
    echo "❌ Build issues detected"
    exit 1
fi

echo "✅ Health check passed"
```

#### Setup Script
```bash
#!/bin/bash
# setup.sh

echo "Setting up development environment..."

# Install dependencies
bun install

# Start services
./bin/run.js services --up

# Wait for services
sleep 5

# Run migrations
./bin/run.js db --migrate

# Seed data
./bin/run.js db --seed

# Build project
./bin/run.js build

# Verify everything
./bin/run.js status

echo "Setup complete!"
```

#### Cleanup Script
```bash
#!/bin/bash
# cleanup.sh

echo "Cleaning up development environment..."

# Stop services
./bin/run.js services --down

# Clean containers and volumes
./bin/run.js services --clean

# Remove build artifacts
rm -rf dist/

echo "Cleanup complete!"
```

### Interactive Workflows

#### New Developer Onboarding
```bash
# 1. Start main CLI
./bin/run.js

# 2. Follow menu prompts:
#    - Select "Services" -> "Start All Services"
#    - Select "Database" -> "Migration Menu" -> "Run Migrations"
#    - Select "Database" -> "Seed Database"
#    - Select "Development" -> "Start Development Server"
```

#### Daily Development
```bash
# Start with interactive menu
./bin/run.js

# Common flow:
# 1. Check status
# 2. Start services if needed
# 3. Run any pending migrations
# 4. Start development server
```

#### Pre-deployment Checklist
```bash
# Interactive build menu
./bin/run.js build:menu

# Build for production
# Validate build
# Run all checks
# Confirm everything is ready
```

### Error Handling Examples

#### Build Failure Recovery
```bash
# If build fails
./bin/run.js build --clean  # Clean build
./bin/run.js check --types  # Check TypeScript
./bin/run.js status         # Check overall status
```

#### Service Issues
```bash
# If services won't start
./bin/run.js services --clean    # Clean everything
./bin/run.js services --build    # Rebuild
./bin/run.js services --up       # Start fresh
```

#### Database Issues
```bash
# If database issues
./bin/run.js db --down     # Stop database
./bin/run.js db --up       # Start fresh
./bin/run.js db --migrate  # Run migrations
```

These examples demonstrate the flexibility and power of the Pothos CLI for various development scenarios. The interactive menus provide guidance for new users, while direct commands offer efficiency for experienced developers and automation scripts.