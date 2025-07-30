import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { executeCommand, getBuildStatus } from '../../lib/utils.js';

export default class BuildMenu extends Command {
  static override description = 'Interactive build menu';

  async run(): Promise<void> {
    const buildStatus = await getBuildStatus();
    const statusText = buildStatus === 'success' ? 
      chalk.green('✅ Built') : 
      buildStatus === 'error' ? 
      chalk.red('❌ Error') : 
      chalk.gray('📦 Not built');

    const choices = [
      {
        name: `${chalk.blue('🔨')} Standard Build - Build once ${statusText}`,
        value: 'build',
        short: 'Build',
      },
      {
        name: `${chalk.yellow('👀')} Watch Mode - Build on file changes`,
        value: 'watch',
        short: 'Watch Build',
      },
      {
        name: `${chalk.green('🚀')} Production Build - Optimized build`,
        value: 'prod',
        short: 'Production',
      },
      {
        name: `${chalk.red('🧹')} Clean Build - Remove dist/ and rebuild`,
        value: 'clean',
        short: 'Clean Build',
      },
      {
        name: `${chalk.magenta('📊')} Build Info - Show build status and info`,
        value: 'info',
        short: 'Build Info',
      },
      {
        name: `${chalk.cyan('🔍')} Validate Build - Check build output`,
        value: 'validate',
        short: 'Validate',
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
        message: 'Choose a build action:',
        choices,
        pageSize: 10,
      },
    ]);

    await this.handleAction(action);
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'build':
        await this.standardBuild();
        break;
      case 'watch':
        await this.watchBuild();
        break;
      case 'prod':
        await this.productionBuild();
        break;
      case 'clean':
        await this.cleanBuild();
        break;
      case 'info':
        await this.showBuildInfo();
        break;
      case 'validate':
        await this.validateBuild();
        break;
      case 'back':
        return;
      default:
        this.log(chalk.red('Unknown action'));
        break;
    }
  }

  private async standardBuild(): Promise<void> {
    this.log(chalk.blue('🔨 Starting standard build...'));
    
    const result = await executeCommand('bun', ['run', 'build'], {
      spinnerText: 'Building project...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Build completed successfully!'));
      await this.showBuildInfo();
    } else {
      this.log(chalk.red('❌ Build failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
    }
  }

  private async watchBuild(): Promise<void> {
    this.log(chalk.yellow('👀 Starting build watch mode...'));
    this.log(chalk.gray('Files will be rebuilt automatically when changed.'));
    this.log(chalk.gray('Press Ctrl+C to stop watching\n'));
    
    const result = await executeCommand('bun', ['run', 'build:watch'], {
      silent: false,
      showSpinner: false,
    });

    if (!result.success) {
      this.log(chalk.red('❌ Build watch failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
    }
  }

  private async productionBuild(): Promise<void> {
    this.log(chalk.green('🚀 Starting production build...'));
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'This will create an optimized production build. Continue?',
        default: true,
      },
    ]);

    if (!confirm) {
      return;
    }

    const result = await executeCommand('bun', ['run', 'build:prod'], {
      spinnerText: 'Building for production...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Production build completed!'));
      await this.showBuildInfo();
    } else {
      this.log(chalk.red('❌ Production build failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
    }
  }

  private async cleanBuild(): Promise<void> {
    this.log(chalk.red('🧹 Starting clean build...'));
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'This will remove the dist/ directory and rebuild. Continue?',
        default: true,
      },
    ]);

    if (!confirm) {
      return;
    }

    const result = await executeCommand('bun', ['run', 'build:clean'], {
      spinnerText: 'Cleaning and rebuilding...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Clean build completed!'));
      await this.showBuildInfo();
    } else {
      this.log(chalk.red('❌ Clean build failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
    }
  }

  private async showBuildInfo(): Promise<void> {
    this.log(chalk.magenta('📊 Build Information:'));
    this.log(chalk.gray('─'.repeat(50)));
    
    const buildStatus = await getBuildStatus();
    const statusText = buildStatus === 'success' ? 
      chalk.green('✅ Success') : 
      buildStatus === 'error' ? 
      chalk.red('❌ Error') : 
      chalk.gray('📦 Not built');

    this.log(`Status: ${statusText}`);
    
    // Try to get more info about the build
    const { fileExists } = await import('../../lib/utils.js');
    const { join } = await import('path');
    const { statSync } = await import('fs');
    
    const distPath = join(process.cwd(), 'dist');
    
    if (fileExists(distPath)) {
      try {
        const stats = statSync(distPath);
        this.log(`Built: ${chalk.blue(stats.mtime.toLocaleString())}`);
        
        // Try to count files
        const { readdirSync } = await import('fs');
        const files = readdirSync(distPath, { recursive: true });
        this.log(`Files: ${chalk.blue(files.length.toString())}`);
      } catch (error) {
        this.log(`Error reading build info: ${chalk.red(error)}`);
      }
    } else {
      this.log(chalk.gray('No build directory found'));
    }
  }

  private async validateBuild(): Promise<void> {
    this.log(chalk.cyan('🔍 Validating build...'));
    
    const buildStatus = await getBuildStatus();
    
    if (buildStatus === 'missing') {
      this.log(chalk.red('❌ No build found. Run a build first.'));
      return;
    }
    
    if (buildStatus === 'error') {
      this.log(chalk.red('❌ Build appears incomplete or corrupted.'));
      return;
    }
    
    // Run validation commands
    const validationResults = await Promise.all([
      executeCommand('bun', ['run', 'check:types'], { silent: true }),
      executeCommand('bun', ['run', 'check:publint'], { silent: true }),
    ]);
    
    this.log(chalk.green('✅ Build validation completed:'));
    this.log(`TypeScript: ${validationResults[0].success ? chalk.green('✅') : chalk.red('❌')}`);
    this.log(`Package: ${validationResults[1].success ? chalk.green('✅') : chalk.red('❌')}`);
  }
}