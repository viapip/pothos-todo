import { Command } from '@oclif/core';
import chalk from 'chalk';
import { executeCommand, getBuildStatus } from '../../lib/utils.js';

export default class DevDist extends Command {
  static override description = 'Start built server from dist/ directory';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  async run(): Promise<void> {
    this.log(chalk.green('📦 Starting built server from dist/...'));
    
    // Check if dist exists and is valid
    const buildStatus = await getBuildStatus();
    
    if (buildStatus === 'missing') {
      this.log(chalk.yellow('⚠️  Build directory not found. Building first...'));
      const buildResult = await executeCommand('bun', ['run', 'build'], {
        spinnerText: 'Building project...',
      });
      
      if (!buildResult.success) {
        this.log(chalk.red('❌ Build failed. Cannot start server.'));
        process.exit(1);
      }
    } else if (buildStatus === 'error') {
      this.log(chalk.yellow('⚠️  Build appears incomplete. Rebuilding...'));
      const buildResult = await executeCommand('bun', ['run', 'build'], {
        spinnerText: 'Rebuilding project...',
      });
      
      if (!buildResult.success) {
        this.log(chalk.red('❌ Build failed. Cannot start server.'));
        process.exit(1);
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
      process.exit(1);
    }
  }
}