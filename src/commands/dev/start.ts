import { Command } from '@oclif/core';
import chalk from 'chalk';
import { executeCommand } from '../../lib/utils.js';

export default class DevStart extends Command {
  static override description = 'Start development server with hot reload';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  async run(): Promise<void> {
    this.log(chalk.blue('🚀 Starting development server...'));
    this.log(chalk.gray('The server will automatically reload when you make changes.'));
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
      process.exit(1);
    }
  }
}