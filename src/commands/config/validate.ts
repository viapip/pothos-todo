import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { loadAppConfig, validateConfig } from '../../config/index.js';

export default class ConfigValidate extends Command {
  static override description = 'Validate current configuration';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --verbose',
  ];

  static override flags = {
    verbose: Flags.boolean({
      description: 'Show detailed validation information',
      default: false,
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(ConfigValidate);

    try {
      this.log(chalk.blue('🔍 Validating configuration...'));
      
      const config = await loadAppConfig();
      const validation = validateConfig(config);

      if (validation.valid) {
        this.log(chalk.green('✅ Configuration is valid!'));
        
        if (flags.verbose) {
          this.log(chalk.gray('\nConfiguration sections validated:'));
          this.log(chalk.gray('  • Server configuration'));
          this.log(chalk.gray('  • Database configuration'));
          this.log(chalk.gray('  • Logger configuration'));
          this.log(chalk.gray('  • Build configuration'));
          this.log(chalk.gray('  • Environment configuration'));
          
          this.log(chalk.gray('\nEnvironment:'), chalk.cyan(config.env?.name || 'unknown'));
          this.log(chalk.gray('Server port:'), chalk.cyan(config.server?.port || 'unknown'));
          this.log(chalk.gray('Database URL:'), chalk.cyan(config.database?.url ? config.database.url.replace(/\/\/.*:.*@/, '//***:***@') : 'unknown'));
          this.log(chalk.gray('Log level:'), chalk.cyan(config.logger?.level || 'unknown'));
        }
      } else {
        this.log(chalk.red('❌ Configuration validation failed!'));
        this.log(chalk.red('\nErrors found:'));
        
        validation.errors.forEach((error, index) => {
          this.log(chalk.red(`  ${index + 1}. ${error}`));
        });
        
        process.exit(1);
      }
    } catch (error) {
      this.error(`Failed to validate configuration: ${error}`);
    }
  }
}