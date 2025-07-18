# CLI Commands Reference

Complete reference for all available CLI commands with examples and flags.

## Table of Contents

- [Main Commands](#main-commands)
- [Development Commands](#development-commands)
- [Build Commands](#build-commands)
- [Check Commands](#check-commands)
- [Database Commands](#database-commands)
- [Services Commands](#services-commands)
- [Status Commands](#status-commands)
- [Utility Commands](#utility-commands)

## Main Commands

### `./bin/run.js`
Opens the main interactive menu with all available options.

**Features:**
- ASCII art banner
- Colored menu options
- Easy navigation
- Quick access to all functionality

**Example:**
```bash
./bin/run.js
```

## Development Commands

### `./bin/run.js dev:menu`
Interactive development menu with server options.

**Options:**
- Start development server (hot reload)
- Start built server from dist/
- Watch mode development
- Build and start workflow

**Example:**
```bash
./bin/run.js dev:menu
```

### `./bin/run.js dev:start`
Start development server with hot reload using Bun.

**Description:** Starts the development server with automatic reloading when files change.

**Example:**
```bash
./bin/run.js dev:start
```

### `./bin/run.js dev:dist`
Start server from built dist/ directory.

**Description:** Runs the built server from the dist/ directory. Builds first if needed.

**Example:**
```bash
./bin/run.js dev:dist
```

### `./bin/run.js dev:watch`
Start development server in watch mode.

**Description:** Similar to dev:start but with explicit watch mode configuration.

**Example:**
```bash
./bin/run.js dev:watch
```

## Build Commands

### `./bin/run.js build:menu`
Interactive build menu with comprehensive options.

**Options:**
- Standard build
- Watch mode build
- Production build
- Clean build
- Build info display
- Build validation

**Example:**
```bash
./bin/run.js build:menu
```

### `./bin/run.js build`
Build the project using tsdown.

**Flags:**
- `--watch, -w`: Watch for file changes and rebuild
- `--prod, -p`: Build for production
- `--clean, -c`: Clean build (remove dist/ first)

**Examples:**
```bash
./bin/run.js build
./bin/run.js build --watch
./bin/run.js build --prod
./bin/run.js build --clean
```

## Check Commands

### `./bin/run.js check:menu`
Interactive validation menu with custom check selection.

**Options:**
- TypeScript type check
- Package validation (publint)
- Type correctness check (attw)
- All checks
- Custom check selection

**Example:**
```bash
./bin/run.js check:menu
```

### `./bin/run.js check`
Run validation checks on the project.

**Flags:**
- `--types, -t`: Check TypeScript types only
- `--publint, -p`: Check package.json with publint only
- `--attw, -a`: Check if types are wrong only

**Examples:**
```bash
./bin/run.js check              # Run all checks
./bin/run.js check --types      # TypeScript only
./bin/run.js check --publint    # Package validation only
./bin/run.js check --attw       # Type correctness only
```

## Database Commands

### `./bin/run.js db:menu`
Interactive database management menu.

**Options:**
- Start/stop database containers
- Database status
- Migration management
- Database seeding
- Database studio
- Database reset

**Example:**
```bash
./bin/run.js db:menu
```

### `./bin/run.js db`
Database management commands.

**Flags:**
- `--up, -u`: Start database containers
- `--down, -d`: Stop database containers
- `--status, -s`: Show database status
- `--migrate, -m`: Run database migrations
- `--seed`: Seed database with test data
- `--studio`: Open database studio
- `--reset`: Reset database to clean state

**Examples:**
```bash
./bin/run.js db --up           # Start database
./bin/run.js db --down         # Stop database
./bin/run.js db --status       # Show status
./bin/run.js db --migrate      # Run migrations
./bin/run.js db --seed         # Seed data
./bin/run.js db --studio       # Open studio
./bin/run.js db --reset        # Reset database
```

## Services Commands

### `./bin/run.js services:menu`
Interactive Docker services management menu.

**Options:**
- Start/stop all services
- Services status
- View logs (static/live)
- Build services
- Restart services
- Clean services

**Example:**
```bash
./bin/run.js services:menu
```

### `./bin/run.js services`
Docker services management commands.

**Flags:**
- `--up, -u`: Start all services
- `--down, -d`: Stop all services
- `--status, -s`: Show services status
- `--logs, -l`: View service logs
- `--follow, -f`: Follow logs in real-time
- `--build, -b`: Build services
- `--rebuild`: Rebuild services (no cache)
- `--restart, -r`: Restart services
- `--clean`: Clean services (remove containers and volumes)

**Examples:**
```bash
./bin/run.js services --up        # Start all services
./bin/run.js services --down      # Stop all services
./bin/run.js services --status    # Show status
./bin/run.js services --logs      # View logs
./bin/run.js services --follow    # Follow live logs
./bin/run.js services --build     # Build services
./bin/run.js services --restart   # Restart services
```

## Status Commands

### `./bin/run.js status`
Show comprehensive system status dashboard.

**Flags:**
- `--watch, -w`: Watch mode (refresh every 5 seconds)
- `--minimal, -m`: Show minimal status info
- `--json, -j`: Output status as JSON

**Features:**
- System information (Node.js, platform, architecture)
- Docker status and running services
- Build status and TypeScript validation
- Git status and branch information
- Package information
- Disk usage statistics

**Examples:**
```bash
./bin/run.js status           # Full status dashboard
./bin/run.js status --watch   # Watch mode
./bin/run.js status --minimal # Minimal info
./bin/run.js status --json    # JSON output
```

## Utility Commands

### Help Commands
Get help for any command:

```bash
./bin/run.js --help                    # General help
./bin/run.js build --help              # Build command help
./bin/run.js dev:start --help          # Dev start command help
./bin/run.js db --help                 # Database command help
./bin/run.js services --help           # Services command help
./bin/run.js status --help             # Status command help
```

## Command Patterns

### Interactive vs Direct Commands

**Interactive Commands:**
- Use `:menu` suffix (e.g., `dev:menu`, `build:menu`)
- Provide guided menus with options
- Include confirmations for destructive actions
- Show progress indicators

**Direct Commands:**
- Use flags for specific actions
- Suitable for scripting and automation
- Faster execution for known operations
- Exit with appropriate status codes

### Error Handling

All commands include:
- **Graceful error handling** with descriptive messages
- **Appropriate exit codes** (0 for success, 1 for failure)
- **Helpful suggestions** for common issues
- **Dependency checks** (Docker, build status, etc.)

### Output Formatting

Commands use:
- **Colored output** with chalk for better readability
- **Icons and emojis** for visual distinction
- **Boxed output** for important information
- **Consistent formatting** across all commands

## Examples by Use Case

### Development Workflow
```bash
# Start development
./bin/run.js dev:start

# Or use interactive menu
./bin/run.js dev:menu
```

### Build and Deploy
```bash
# Build for production
./bin/run.js build --prod

# Validate build
./bin/run.js check

# Check status
./bin/run.js status
```

### Database Management
```bash
# Start database
./bin/run.js db --up

# Run migrations
./bin/run.js db --migrate

# Seed data
./bin/run.js db --seed
```

### Service Management
```bash
# Start all services
./bin/run.js services --up

# Check status
./bin/run.js services --status

# View logs
./bin/run.js services --logs
```

### Monitoring
```bash
# Watch system status
./bin/run.js status --watch

# Get JSON status for scripts
./bin/run.js status --json
```

## Advanced Usage

### Scripting
Commands can be used in scripts with proper error handling:

```bash
#!/bin/bash

# Build and check
./bin/run.js build --prod
if [ $? -eq 0 ]; then
    ./bin/run.js check
    if [ $? -eq 0 ]; then
        echo "Build and validation successful"
    else
        echo "Validation failed"
        exit 1
    fi
else
    echo "Build failed"
    exit 1
fi
```

### JSON Output
Use JSON output for integration with other tools:

```bash
# Get status as JSON
./bin/run.js status --json | jq '.docker.running'

# Check if build is successful
./bin/run.js status --json | jq '.build.status == "success"'
```

### Watch Mode
Use watch mode for continuous monitoring:

```bash
# Monitor system status
./bin/run.js status --watch

# Build in watch mode
./bin/run.js build --watch

# Follow service logs
./bin/run.js services --follow
```