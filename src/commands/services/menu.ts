import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { executeCommand, isDockerRunning } from '../../lib/utils.js';

export default class ServicesMenu extends Command {
  static override description = 'Interactive services menu';

  async run(): Promise<void> {
    // Check if Docker is running
    const dockerRunning = await isDockerRunning();
    const dockerStatus = dockerRunning ? 
      chalk.green('✅ Running') : 
      chalk.red('❌ Not running');

    this.log(chalk.cyan('🐳 Services Management'));
    this.log(chalk.gray('─'.repeat(50)));
    this.log(`Docker: ${dockerStatus}`);
    this.log(chalk.gray('─'.repeat(50)));

    const choices = [
      {
        name: `${chalk.green('🚀')} Start All Services - Start all containers`,
        value: 'up',
        short: 'Start All',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.red('🛑')} Stop All Services - Stop all containers`,
        value: 'down',
        short: 'Stop All',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.blue('📊')} Services Status - Show container status`,
        value: 'status',
        short: 'Status',
      },
      {
        name: `${chalk.yellow('🔄')} Restart Services - Restart all containers`,
        value: 'restart',
        short: 'Restart',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.magenta('📝')} View Logs - Show container logs`,
        value: 'logs',
        short: 'Logs',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.cyan('👀')} Follow Logs - Follow live logs`,
        value: 'logs-follow',
        short: 'Follow Logs',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.magenta('🔍')} Inspect Services - Detailed service info`,
        value: 'inspect',
        short: 'Inspect',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.green('🏗️')} Build Services - Build/rebuild containers`,
        value: 'build',
        short: 'Build',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.gray('🧹')} Clean Services - Remove containers and volumes`,
        value: 'clean',
        short: 'Clean',
        disabled: dockerRunning ? false : 'Docker not running',
      },
      {
        name: `${chalk.red('🔙')} Back to Main Menu`,
        value: 'back',
        short: 'Back',
      },
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose a services action:',
        choices,
        pageSize: 12,
      },
    ]);

    await this.handleAction(action);
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'up':
        await this.startServices();
        break;
      case 'down':
        await this.stopServices();
        break;
      case 'status':
        await this.showServicesStatus();
        break;
      case 'restart':
        await this.restartServices();
        break;
      case 'logs':
        await this.viewLogs();
        break;
      case 'logs-follow':
        await this.followLogs();
        break;
      case 'inspect':
        await this.inspectServices();
        break;
      case 'build':
        await this.buildServices();
        break;
      case 'clean':
        await this.cleanServices();
        break;
      case 'back':
        return;
      default:
        this.log(chalk.red('Unknown action'));
        break;
    }
  }

  private async startServices(): Promise<void> {
    this.log(chalk.green('🚀 Starting all services...'));
    
    const result = await executeCommand('docker', ['compose', 'up', '-d'], {
      spinnerText: 'Starting services...',
    });

    if (result.success) {
      this.log(chalk.green('✅ All services started successfully!'));
      await this.showServicesStatus();
    } else {
      this.log(chalk.red('❌ Failed to start services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async stopServices(): Promise<void> {
    this.log(chalk.red('🛑 Stopping all services...'));
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to stop all services?',
        default: false,
      },
    ]);

    if (!confirm) {
      return;
    }

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
    }
  }

  private async showServicesStatus(): Promise<void> {
    this.log(chalk.blue('📊 Services Status:'));
    this.log(chalk.gray('─'.repeat(50)));
    
    const result = await executeCommand('docker', ['compose', 'ps'], {
      spinnerText: 'Checking services status...',
    });

    if (result.success) {
      this.log(result.stdout);
    } else {
      this.log(chalk.red('❌ Failed to get services status'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async restartServices(): Promise<void> {
    this.log(chalk.yellow('🔄 Restarting all services...'));
    
    const result = await executeCommand('docker', ['compose', 'restart'], {
      spinnerText: 'Restarting services...',
    });

    if (result.success) {
      this.log(chalk.green('✅ All services restarted successfully!'));
      await this.showServicesStatus();
    } else {
      this.log(chalk.red('❌ Failed to restart services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async viewLogs(): Promise<void> {
    // First get list of services
    const servicesResult = await executeCommand('docker', ['compose', 'ps', '--services'], {
      silent: true,
    });

    if (!servicesResult.success) {
      this.log(chalk.red('❌ Failed to get services list'));
      return;
    }

    const services = servicesResult.stdout?.trim().split('\n').filter(s => s.trim()) || [];
    
    if (services.length === 0) {
      this.log(chalk.yellow('⚠️  No services found'));
      return;
    }

    const choices = [
      {
        name: `${chalk.cyan('📝')} All Services - View all logs`,
        value: 'all',
        short: 'All',
      },
      ...services.map(service => ({
        name: `${chalk.blue('🔍')} ${service} - View logs for ${service}`,
        value: service,
        short: service,
      })),
    ];

    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Choose service to view logs:',
        choices,
        pageSize: 10,
      },
    ]);

    this.log(chalk.magenta(`📝 Viewing logs for ${service === 'all' ? 'all services' : service}...`));
    
    const args = service === 'all' ? 
      ['compose', 'logs', '--tail=100'] : 
      ['compose', 'logs', '--tail=100', service];

    const result = await executeCommand('docker', args, {
      spinnerText: 'Fetching logs...',
    });

    if (result.success) {
      this.log(result.stdout);
    } else {
      this.log(chalk.red('❌ Failed to get logs'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async followLogs(): Promise<void> {
    // First get list of services
    const servicesResult = await executeCommand('docker', ['compose', 'ps', '--services'], {
      silent: true,
    });

    if (!servicesResult.success) {
      this.log(chalk.red('❌ Failed to get services list'));
      return;
    }

    const services = servicesResult.stdout?.trim().split('\n').filter(s => s.trim()) || [];
    
    if (services.length === 0) {
      this.log(chalk.yellow('⚠️  No services found'));
      return;
    }

    const choices = [
      {
        name: `${chalk.cyan('👀')} All Services - Follow all logs`,
        value: 'all',
        short: 'All',
      },
      ...services.map(service => ({
        name: `${chalk.green('📡')} ${service} - Follow logs for ${service}`,
        value: service,
        short: service,
      })),
    ];

    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Choose service to follow logs:',
        choices,
        pageSize: 10,
      },
    ]);

    this.log(chalk.cyan(`👀 Following logs for ${service === 'all' ? 'all services' : service}...`));
    this.log(chalk.gray('Press Ctrl+C to stop following logs\n'));
    
    const args = service === 'all' ? 
      ['compose', 'logs', '--follow'] : 
      ['compose', 'logs', '--follow', service];

    const result = await executeCommand('docker', args, {
      silent: false,
      showSpinner: false,
    });

    if (!result.success) {
      this.log(chalk.red('❌ Failed to follow logs'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async inspectServices(): Promise<void> {
    this.log(chalk.magenta('🔍 Inspecting services...'));
    
    const result = await executeCommand('docker', ['compose', 'ps', '--format', 'table'], {
      spinnerText: 'Getting detailed service information...',
    });

    if (result.success) {
      this.log(result.stdout);
    } else {
      this.log(chalk.red('❌ Failed to inspect services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async buildServices(): Promise<void> {
    const { buildType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'buildType',
        message: 'Choose build type:',
        choices: [
          {
            name: `${chalk.green('🏗️')} Build - Build containers`,
            value: 'build',
            short: 'Build',
          },
          {
            name: `${chalk.yellow('🔄')} Rebuild - Force rebuild containers`,
            value: 'rebuild',
            short: 'Rebuild',
          },
          {
            name: `${chalk.red('🧹')} Clean Build - Remove and rebuild`,
            value: 'clean-build',
            short: 'Clean Build',
          },
        ],
      },
    ]);

    let command: string[];
    let spinnerText: string;

    switch (buildType) {
      case 'build':
        command = ['compose', 'build'];
        spinnerText = 'Building containers...';
        break;
      case 'rebuild':
        command = ['compose', 'build', '--no-cache'];
        spinnerText = 'Rebuilding containers...';
        break;
      case 'clean-build':
        command = ['compose', 'build', '--no-cache', '--pull'];
        spinnerText = 'Clean building containers...';
        break;
      default:
        return;
    }

    this.log(chalk.green(`🏗️ ${buildType === 'build' ? 'Building' : buildType === 'rebuild' ? 'Rebuilding' : 'Clean building'} services...`));
    
    const result = await executeCommand('docker', command, {
      spinnerText,
    });

    if (result.success) {
      this.log(chalk.green('✅ Services built successfully!'));
    } else {
      this.log(chalk.red('❌ Failed to build services'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async cleanServices(): Promise<void> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'This will remove all containers and volumes. Are you sure?',
        default: false,
      },
    ]);

    if (!confirm) {
      return;
    }

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
    }
  }
}