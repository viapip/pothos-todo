# Pothos CLI Documentation

A powerful command-line interface for managing the Pothos GraphQL Federation project with interactive menus and comprehensive functionality.

## Installation

The CLI is already installed as part of the project dependencies. After running `bun install`, you can use the CLI immediately.

## Usage

```bash
# Interactive main menu
./bin/run.js

# Or use specific commands directly
./bin/run.js build
./bin/run.js dev:start
./bin/run.js db:up
./bin/run.js services:status
```

## Commands Overview

### Main Interactive Menu
- `./bin/run.js` - Opens the main interactive menu with all available options

### Development Commands
- `./bin/run.js dev:menu` - Interactive development menu
- `./bin/run.js dev:start` - Start development server with hot reload
- `./bin/run.js dev:dist` - Start server from built dist/ directory
- `./bin/run.js dev:watch` - Start development server in watch mode

### Build Commands
- `./bin/run.js build:menu` - Interactive build menu
- `./bin/run.js build` - Standard build
- `./bin/run.js build --watch` - Watch mode build
- `./bin/run.js build --prod` - Production build
- `./bin/run.js build --clean` - Clean build (removes dist/ first)

### Check/Validation Commands
- `./bin/run.js check:menu` - Interactive validation menu
- `./bin/run.js check` - Run all validation checks
- `./bin/run.js check --types` - Check TypeScript types only
- `./bin/run.js check --publint` - Check package.json with publint
- `./bin/run.js check --attw` - Check if types are wrong

### Database Commands
- `./bin/run.js db:menu` - Interactive database menu
- `./bin/run.js db --up` - Start database containers
- `./bin/run.js db --down` - Stop database containers
- `./bin/run.js db --status` - Show database status
- `./bin/run.js db --migrate` - Run database migrations
- `./bin/run.js db --seed` - Seed database with test data
- `./bin/run.js db --studio` - Open database studio

### Services Commands
- `./bin/run.js services:menu` - Interactive services menu
- `./bin/run.js services --up` - Start all services
- `./bin/run.js services --down` - Stop all services
- `./bin/run.js services --status` - Show services status
- `./bin/run.js services --logs` - View service logs
- `./bin/run.js services --follow` - Follow live logs
- `./bin/run.js services --build` - Build services
- `./bin/run.js services --restart` - Restart services

### Status Dashboard
- `./bin/run.js status` - Show comprehensive system status
- `./bin/run.js status --watch` - Watch mode (refreshes every 5 seconds)
- `./bin/run.js status --minimal` - Show minimal status info
- `./bin/run.js status --json` - Output status as JSON

## Interactive Features

### Main Menu
The CLI provides a beautiful interactive main menu with:
- ASCII art banner
- Colored icons and descriptions
- Easy navigation with arrow keys
- Organized by functionality

### Submenus
Each topic has its own interactive submenu:
- **Development Menu**: Start servers, watch modes, build options
- **Build Menu**: Various build types with confirmation prompts
- **Check Menu**: Validation options with custom selections
- **Database Menu**: Complete database management with Docker integration
- **Services Menu**: Docker services management with log viewing

### Smart Features
- **Docker Detection**: Automatically detects if Docker is running
- **Build Status**: Shows current build status in menus
- **Confirmation Prompts**: Asks for confirmation on destructive actions
- **Progress Indicators**: Shows spinners and progress for long operations
- **Error Handling**: Graceful error messages with helpful context

## Configuration

The CLI is configured in `package.json` under the `oclif` section:

```json
{
  "oclif": {
    "bin": "pothos-cli",
    "dirname": "pothos-cli",
    "commands": "./dist/commands",
    "plugins": [
      "@oclif/plugin-help",
      "@oclif/plugin-plugins"
    ],
    "topicSeparator": ":",
    "topics": {
      "build": { "description": "Build project commands" },
      "check": { "description": "Validation and check commands" },
      "db": { "description": "Database management commands" },
      "dev": { "description": "Development commands" },
      "services": { "description": "Docker services management" }
    }
  }
}
```

## Dependencies

The CLI uses the following key dependencies:
- **@oclif/core**: Core CLI framework
- **execa**: Cross-platform command execution
- **inquirer**: Interactive prompts
- **chalk**: Terminal colors
- **boxen**: Terminal boxes
- **figlet**: ASCII art
- **ora**: Spinners
- **listr2**: Task lists

## Development

### Adding New Commands

1. Create a new command file in `src/commands/`
2. Use the existing command structure as a template
3. Import and use utilities from `src/lib/utils.js`
4. Add the command to the appropriate topic in `package.json`

### Command Structure

```typescript
import { Command, Flags } from '@oclif/core';
import { executeCommand } from '../lib/utils.js';
import chalk from 'chalk';

export default class MyCommand extends Command {
  static override description = 'Description of the command';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static override flags = {
    flag: Flags.boolean({
      char: 'f',
      description: 'Flag description',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MyCommand);
    
    // Command implementation
  }
}
```

### Utility Functions

The CLI includes several utility functions in `src/lib/utils.js`:
- `executeCommand()`: Execute commands with spinners and error handling
- `isDockerRunning()`: Check if Docker is running
- `getBuildStatus()`: Get current build status
- `checkTypeScript()`: Check TypeScript validity
- `fileExists()`: Check if file exists
- `formatOutput()`: Format command output

## Examples

### Quick Development Workflow
```bash
# Start interactive menu
./bin/run.js

# Or direct commands
./bin/run.js dev:start           # Start development server
./bin/run.js build --watch       # Build in watch mode
./bin/run.js check               # Run all checks
./bin/run.js db --up             # Start database
./bin/run.js services --status   # Check services
```

### Status Monitoring
```bash
# Full status dashboard
./bin/run.js status

# Watch mode (auto-refresh)
./bin/run.js status --watch

# Minimal status
./bin/run.js status --minimal

# JSON output for scripts
./bin/run.js status --json
```

### Database Management
```bash
# Interactive database menu
./bin/run.js db:menu

# Direct database commands
./bin/run.js db --up           # Start database
./bin/run.js db --migrate      # Run migrations
./bin/run.js db --seed         # Seed data
./bin/run.js db --studio       # Open database studio
```

## Troubleshooting

### Common Issues

1. **Docker not running**: Many commands require Docker. Start Docker first.
2. **Build not found**: Run `./bin/run.js build` before using dist-related commands.
3. **TypeScript errors**: Run `./bin/run.js check --types` to see detailed errors.
4. **Permission issues**: Make sure `./bin/run.js` is executable.

### Getting Help

```bash
# General help
./bin/run.js --help

# Command-specific help
./bin/run.js build --help
./bin/run.js dev:start --help
./bin/run.js db --help
```

## Contributing

When adding new features to the CLI:

1. Follow the existing command structure
2. Add appropriate error handling
3. Include interactive prompts where helpful
4. Use the utility functions for consistency
5. Update documentation
6. Test all interactive flows

## License

This CLI is part of the Pothos GraphQL Federation project and follows the same license terms.