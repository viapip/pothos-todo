import { Command, Flags } from '@oclif/core';
import { executeCommand } from '../../lib/utils.js';
import chalk from 'chalk';

export default class Build extends Command {
  static override description = 'Build the project';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --prod',
    '<%= config.bin %> <%= command.id %> --watch',
    '<%= config.bin %> <%= command.id %> --clean',
  ];

  static override flags = {
    watch: Flags.boolean({
      char: 'w',
      description: 'Watch for file changes and rebuild',
    }),
    prod: Flags.boolean({
      char: 'p',
      description: 'Build for production',
    }),
    clean: Flags.boolean({
      char: 'c',
      description: 'Clean build (remove dist/ first)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Build);
    
    if (flags.watch) {
      await this.watchBuild();
    } else if (flags.prod) {
      await this.productionBuild();
    } else if (flags.clean) {
      await this.cleanBuild();
    } else {
      await this.standardBuild();
    }
  }

  private async standardBuild(): Promise<void> {
    this.log(chalk.blue('🔨 Building project...'));
    
    const result = await executeCommand('bun', ['run', 'build'], {
      spinnerText: 'Building project...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Build completed successfully!'));
    } else {
      this.log(chalk.red('❌ Build failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
      process.exit(1);
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
      process.exit(1);
    }
  }

  private async productionBuild(): Promise<void> {
    this.log(chalk.green('🚀 Building for production...'));
    
    const result = await executeCommand('bun', ['run', 'build:prod'], {
      spinnerText: 'Building for production...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Production build completed!'));
    } else {
      this.log(chalk.red('❌ Production build failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
      process.exit(1);
    }
  }

  private async cleanBuild(): Promise<void> {
    this.log(chalk.red('🧹 Starting clean build...'));
    
    const result = await executeCommand('bun', ['run', 'build:clean'], {
      spinnerText: 'Cleaning and rebuilding...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Clean build completed!'));
    } else {
      this.log(chalk.red('❌ Clean build failed'));
      if (result.error) {
        this.log(chalk.red(result.error.message));
      }
      process.exit(1);
    }
  }
}