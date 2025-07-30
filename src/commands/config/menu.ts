import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { inspect } from 'util';
import { loadAppConfig, validateConfig } from '../../config/index.js';

export default class ConfigMenu extends Command {
  static override description = 'Interactive configuration management menu';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  override async run(): Promise<void> {
    await this.showConfigMenu();
  }

  private async showConfigMenu(): Promise<void> {
    const choices = [
      {
        name: `${chalk.blue('📋')} Show Full Configuration`,
        value: 'show-full',
        short: 'Show Full',
      },
      {
        name: `${chalk.green('🔍')} Show Configuration Section`,
        value: 'show-section',
        short: 'Show Section',
      },
      {
        name: `${chalk.yellow('✅')} Validate Configuration`,
        value: 'validate',
        short: 'Validate',
      },
      {
        name: `${chalk.cyan('📊')} Show Environment Variables`,
        value: 'show-env',
        short: 'Show Env',
      },
      {
        name: `${chalk.magenta('🔧')} Configuration Help`,
        value: 'help',
        short: 'Help',
      },
      {
        name: `${chalk.red('🚪')} Exit`,
        value: 'exit',
        short: 'Exit',
      },
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
        pageSize: 10,
      },
    ]);

    await this.handleAction(action);
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'show-full':
        await this.showFullConfig();
        break;
      case 'show-section':
        await this.showConfigSection();
        break;
      case 'validate':
        await this.validateConfiguration();
        break;
      case 'show-env':
        await this.showEnvironmentVariables();
        break;
      case 'help':
        await this.showConfigHelp();
        break;
      case 'exit':
        this.log(chalk.green('👋 Goodbye!'));
        return;
      default:
        this.log(chalk.red('Unknown action'));
        break;
    }

    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to continue?',
        default: true,
      },
    ]);

    if (shouldContinue) {
      console.log('\n');
      await this.showConfigMenu();
    } else {
      this.log(chalk.green('👋 Goodbye!'));
    }
  }

  private async showFullConfig(): Promise<void> {
    try {
      const config = await loadAppConfig();
      this.log(chalk.blue('\n📋 Full Configuration:'));
      this.log(inspect(config, { colors: true, depth: null }));
    } catch (error) {
      this.log(chalk.red(`Failed to load configuration: ${error}`));
    }
  }

  private async showConfigSection(): Promise<void> {
    const sections = [
      { name: 'Server Configuration', value: 'server' },
      { name: 'Database Configuration', value: 'database' },
      { name: 'Logger Configuration', value: 'logger' },
      { name: 'Build Configuration', value: 'build' },
      { name: 'CLI Configuration', value: 'cli' },
      { name: 'Docker Configuration', value: 'docker' },
      { name: 'GraphQL Configuration', value: 'graphql' },
      { name: 'Environment Configuration', value: 'env' },
    ];

    const { section } = await inquirer.prompt([
      {
        type: 'list',
        name: 'section',
        message: 'Which configuration section would you like to view?',
        choices: sections,
      },
    ]);

    try {
      const config = await loadAppConfig();
      const sectionData = config[section as keyof typeof config];
      
      this.log(chalk.blue(`\n🔍 ${section.toUpperCase()} Configuration:`));
      this.log(inspect(sectionData, { colors: true, depth: null }));
    } catch (error) {
      this.log(chalk.red(`Failed to load configuration: ${error}`));
    }
  }

  private async validateConfiguration(): Promise<void> {
    try {
      this.log(chalk.blue('\n🔍 Validating configuration...'));
      
      const config = await loadAppConfig();
      const validation = validateConfig(config);

      if (validation.valid) {
        this.log(chalk.green('✅ Configuration is valid!'));
        
        this.log(chalk.gray('\nConfiguration Summary:'));
        this.log(chalk.gray('  • Environment:'), chalk.cyan(config.env?.name || 'unknown'));
        this.log(chalk.gray('  • Server Port:'), chalk.cyan(config.server?.port || 'unknown'));
        this.log(chalk.gray('  • Database:'), chalk.cyan(config.database?.url ? config.database.url.replace(/\/\/.*:.*@/, '//***:***@') : 'unknown'));
        this.log(chalk.gray('  • Log Level:'), chalk.cyan(config.logger?.level || 'unknown'));
      } else {
        this.log(chalk.red('❌ Configuration validation failed!'));
        this.log(chalk.red('\nErrors found:'));
        
        validation.errors.forEach((error, index) => {
          this.log(chalk.red(`  ${index + 1}. ${error}`));
        });
      }
    } catch (error) {
      this.log(chalk.red(`Failed to validate configuration: ${error}`));
    }
  }

  private async showEnvironmentVariables(): Promise<void> {
    this.log(chalk.blue('\n📊 Environment Variables:'));
    
    const envVars = [
      'NODE_ENV',
      'PORT',
      'HOST',
      'DATABASE_URL',
      'FRONTEND_URL',
      'LOG_LEVEL',
      'LOG_DIR',
      'POSTGRES_DB',
      'POSTGRES_USER',
      'POSTGRES_PORT',
      'QDRANT_PORT',
      'BUILD_MINIFY',
      'BUILD_SOURCEMAP',
    ];

    envVars.forEach(envVar => {
      const value = process.env[envVar];
      if (value) {
        // Mask sensitive values
        const maskedValue = envVar.toLowerCase().includes('password') || envVar.toLowerCase().includes('secret') || envVar.toLowerCase().includes('url')
          ? '***'
          : value;
        this.log(chalk.gray(`  ${envVar}:`), chalk.cyan(maskedValue));
      } else {
        this.log(chalk.gray(`  ${envVar}:`), chalk.red('(not set)'));
      }
    });
  }

  private async showConfigHelp(): Promise<void> {
    this.log(chalk.blue('\n🔧 Configuration Help'));
    
    const helpText = `
${chalk.bold('Configuration System')}

This project uses c12 for smart configuration management with environment-aware settings.

${chalk.bold('Configuration Files:')}
• config/base.config.ts - Base configuration
• config/development.config.ts - Development overrides
• config/production.config.ts - Production overrides
• config/test.config.ts - Test overrides

${chalk.bold('Environment Variables:')}
• NODE_ENV - Environment (development, production, test)
• PORT - Server port
• DATABASE_URL - Database connection string
• LOG_LEVEL - Logging level (debug, info, warn, error)

${chalk.bold('CLI Commands:')}
• pothos config:show - Show full configuration
• pothos config:validate - Validate configuration
• pothos config:show --section=server - Show specific section

${chalk.bold('Documentation:')}
• docs/configuration/README.md - Configuration overview
• docs/configuration/environment-variables.md - Environment variables
• docs/configuration/development.md - Development setup
• docs/configuration/production.md - Production deployment
`;

    this.log(helpText);
  }
}