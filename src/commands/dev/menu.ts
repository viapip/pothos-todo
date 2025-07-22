import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { executeCommand } from '../../lib/utils.js';

export default class DevMenu extends Command {
  static override description = 'Interactive development menu';

  async run(): Promise<void> {
    const choices = [
      {
        name: `${chalk.blue('🚀')} Start Development Server - Hot reload with bun`,
        value: 'start',
        short: 'Dev Server',
      },
      {
        name: `${chalk.green('📦')} Start Built Server - Run from dist/`,
        value: 'dist',
        short: 'Built Server',
      },
      {
        name: `${chalk.yellow('👀')} Watch Mode - Build + Dev server`,
        value: 'watch',
        short: 'Watch Mode',
      },
      {
        name: `${chalk.magenta('🔧')} Build + Start - Build then start`,
        value: 'build-start',
        short: 'Build + Start',
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
        message: 'Choose a development action:',
        choices,
        pageSize: 10,
      },
    ]);

    await this.handleAction(action);
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'start':
        await this.startDev();
        break;
      case 'dist':
        await this.startDist();
        break;
      case 'watch':
        await this.startWatch();
        break;
      case 'build-start':
        await this.buildAndStart();
        break;
      case 'back':
        return;
      default:
        this.log(chalk.red('Unknown action'));
        break;
    }
  }

  private async startDev(): Promise<void> {
    this.log(chalk.blue('🚀 Starting development server...'));
    this.log(chalk.gray('Press Ctrl+C to stop the server\n'));
    
    const result = await executeCommand('bun', ['run', '--watch', 'index.ts'], {
      silent: false,
      showSpinner: false,
    });

    if (!result.success) {
      this.log(chalk.red('❌ Failed to start development server'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
    }
  }

  private async startDist(): Promise<void> {
    this.log(chalk.green('📦 Starting built server from dist/...'));
    
    // Check if dist exists
    const { getBuildStatus } = await import('../../lib/utils.js');
    const buildStatus = await getBuildStatus();
    
    if (buildStatus === 'missing') {
      this.log(chalk.yellow('⚠️  Build directory not found. Building first...'));
      const buildResult = await executeCommand('bun', ['run', 'build'], {
        spinnerText: 'Building project...',
      });
      
      if (!buildResult.success) {
        this.log(chalk.red('❌ Build failed. Cannot start server.'));
        return;
      }
    }
    
    this.log(chalk.gray('Press Ctrl+C to stop the server\n'));
    
    const result = await executeCommand('node', ['dist/index.js'], {
      silent: false,
      showSpinner: false,
    });

    if (!result.success) {
      this.log(chalk.red('❌ Failed to start built server'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
    }
  }

  private async startWatch(): Promise<void> {
    this.log(chalk.yellow('👀 Starting watch mode (build + dev)...'));
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'This will start both build watch and dev server. Continue?',
        default: true,
      },
    ]);

    if (!confirm) {
      return;
    }

    this.log(chalk.gray('Starting build watch in the background...'));
    
    // Start build watch in background
    void executeCommand('bun', ['run', 'build:watch'], {
      silent: true,
      showSpinner: false,
    }); // Start build watch in background, don't await

    // Wait a bit for build to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.log(chalk.gray('Starting development server...\n'));
    
    // Start dev server
    const devResult = await executeCommand('bun', ['run', '--watch', 'index.ts'], {
      silent: false,
      showSpinner: false,
    });

    if (!devResult.success) {
      this.log(chalk.red('❌ Failed to start development server'));
    }
  }

  private async buildAndStart(): Promise<void> {
    this.log(chalk.magenta('🔧 Building and starting...'));
    
    // Build first
    const buildResult = await executeCommand('bun', ['run', 'build'], {
      spinnerText: 'Building project...',
    });
    
    if (!buildResult.success) {
      this.log(chalk.red('❌ Build failed. Cannot start server.'));
      return;
    }

    // Then start
    this.log(chalk.green('✅ Build complete. Starting server...\n'));
    
    const startResult = await executeCommand('node', ['dist/index.js'], {
      silent: false,
      showSpinner: false,
    });

    if (!startResult.success) {
      this.log(chalk.red('❌ Failed to start server'));
      if (startResult.error) {
        this.log(startResult.error.message);
      }
    }
  }
}