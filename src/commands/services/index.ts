import { Command, Flags } from '@oclif/core';
import { executeCommand, isDockerRunning } from '../../lib/utils.js';
import chalk from 'chalk';

export default class Services extends Command {
  static override description = 'Docker services management';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --up',
    '<%= config.bin %> <%= command.id %> --down',
    '<%= config.bin %> <%= command.id %> --status',
    '<%= config.bin %> <%= command.id %> --logs',
    '<%= config.bin %> <%= command.id %> --build',
  ];

  static override flags = {
    up: Flags.boolean({
      char: 'u',
      description: 'Start all services',
    }),
    down: Flags.boolean({
      char: 'd',
      description: 'Stop all services',
    }),
    status: Flags.boolean({
      char: 's',
      description: 'Show services status',
    }),
    logs: Flags.boolean({
      char: 'l',
      description: 'View service logs',
    }),
    follow: Flags.boolean({
      char: 'f',
      description: 'Follow logs in real-time',
    }),
    build: Flags.boolean({
      char: 'b',
      description: 'Build services',
    }),
    rebuild: Flags.boolean({
      description: 'Rebuild services (no cache)',
    }),
    restart: Flags.boolean({
      char: 'r',
      description: 'Restart services',
    }),
    clean: Flags.boolean({
      description: 'Clean services (remove containers and volumes)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Services);
    
    // Check if Docker is running for commands that need it
    const dockerCommands = ['up', 'down', 'logs', 'follow', 'build', 'rebuild', 'restart', 'clean'];
    const needsDocker = Object.keys(flags).some(flag => dockerCommands.includes(flag) && flags[flag]);
    
    if (needsDocker && !await isDockerRunning()) {
      this.log(chalk.red('❌ Docker is not running. Please start Docker first.'));
      process.exit(1);
    }
    
    if (flags.up) {
      await this.startServices();
    } else if (flags.down) {
      await this.stopServices();
    } else if (flags.status) {
      await this.showServicesStatus();
    } else if (flags.logs) {
      await this.viewLogs();
    } else if (flags.follow) {
      await this.followLogs();
    } else if (flags.build) {
      await this.buildServices();
    } else if (flags.rebuild) {
      await this.rebuildServices();
    } else if (flags.restart) {
      await this.restartServices();
    } else if (flags.clean) {
      await this.cleanServices();
    } else {
      // If no flags, show status
      await this.showServicesStatus();
    }
  }

  private async startServices(): Promise<void> {
    this.log(chalk.green('🚀 Starting all services...'));
    
    const result = await executeCommand('docker', ['compose', 'up', '-d'], {
      spinnerText: 'Starting services...',
    });

    if (result.success) {
      this.log(chalk.green('✅ All services started successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to start services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async stopServices(): Promise<void> {
    this.log(chalk.red('🛑 Stopping all services...'));
    
    const result = await executeCommand('docker', ['compose', 'down'], {
      spinnerText: 'Stopping services...',
    });

    if (result.success) {
      this.log(chalk.green('✅ All services stopped successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to stop services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async showServicesStatus(): Promise<void> {
    this.log(chalk.blue('📊 Services Status:'));
    this.log(chalk.gray('─'.repeat(50)));
    
    const dockerRunning = await isDockerRunning();
    const dockerStatus = dockerRunning ? 
      chalk.green('✅ Running') : 
      chalk.red('❌ Not running');
    
    this.log(`Docker: ${dockerStatus}`);
    
    if (dockerRunning) {
      const result = await executeCommand('docker', ['compose', 'ps'], {
        spinnerText: 'Checking services status...',
      });

      if (result.success) {
        this.log(chalk.gray('─'.repeat(50)));
        this.log(result.stdout);
      } else {
        this.log(chalk.red('❌ Failed to get services status'));
        if (result.stderr) {
          this.log(chalk.red(result.stderr));
        }
      }
    }
  }

  private async viewLogs(): Promise<void> {
    this.log(chalk.magenta('📝 Viewing service logs...'));
    
    const result = await executeCommand('docker', ['compose', 'logs', '--tail=100'], {
      spinnerText: 'Fetching logs...',
    });

    if (result.success) {
      this.log(result.stdout);
    } else {
      this.log(chalk.red('❌ Failed to get logs'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async followLogs(): Promise<void> {
    this.log(chalk.cyan('👀 Following service logs...'));
    this.log(chalk.gray('Press Ctrl+C to stop following logs\n'));
    
    const result = await executeCommand('docker', ['compose', 'logs', '--follow'], {
      silent: false,
      showSpinner: false,
    });

    if (!result.success) {
      this.log(chalk.red('❌ Failed to follow logs'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async buildServices(): Promise<void> {
    this.log(chalk.green('🏗️ Building services...'));
    
    const result = await executeCommand('docker', ['compose', 'build'], {
      spinnerText: 'Building containers...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Services built successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to build services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async rebuildServices(): Promise<void> {
    this.log(chalk.yellow('🔄 Rebuilding services...'));
    
    const result = await executeCommand('docker', ['compose', 'build', '--no-cache'], {
      spinnerText: 'Rebuilding containers...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Services rebuilt successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to rebuild services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async restartServices(): Promise<void> {
    this.log(chalk.yellow('🔄 Restarting services...'));
    
    const result = await executeCommand('docker', ['compose', 'restart'], {
      spinnerText: 'Restarting services...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Services restarted successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to restart services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }

  private async cleanServices(): Promise<void> {
    this.log(chalk.gray('🧹 Cleaning services...'));
    
    const result = await executeCommand('docker', ['compose', 'down', '--volumes', '--remove-orphans'], {
      spinnerText: 'Removing containers and volumes...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Services cleaned successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to clean services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
      process.exit(1);
    }
  }
}