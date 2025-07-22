import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { printMainSchema, printFederationSchema, printAllSchemas, previewSchema } from './print.js';

export default class Schema extends Command {
  static override description = 'Print GraphQL schema to SDL format';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --main',
    '<%= config.bin %> <%= command.id %> --federation',
    '<%= config.bin %> <%= command.id %> --all',
    '<%= config.bin %> <%= command.id %> --preview',
    '<%= config.bin %> <%= command.id %> --output custom-output',
  ];

  static override flags = {
    main: Flags.boolean({
      char: 'm',
      description: 'Print main GraphQL schema only',
      exclusive: ['federation', 'all'],
    }),
    federation: Flags.boolean({
      char: 'f',
      description: 'Print federation GraphQL schema only',
      exclusive: ['main', 'all'],
    }),
    all: Flags.boolean({
      char: 'a',
      description: 'Print both main and federation schemas',
      exclusive: ['main', 'federation'],
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory path',
      default: '.output',
    }),
    preview: Flags.boolean({
      char: 'p',
      description: 'Preview schema without writing to file',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed output',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Schema);
    
    if (flags.preview) {
      await this.handlePreview(flags);
      return;
    }

    if (flags.main) {
      await this.printMain(flags);
    } else if (flags.federation) {
      await this.printFederation(flags);
    } else if (flags.all) {
      await this.printAll(flags);
    } else {
      // Default to main schema if no specific flag is provided
      await this.printMain(flags);
    }
  }

  private async handlePreview(flags: any): Promise<void> {
    try {
      if (flags.all) {
        await previewSchema('all');
      } else if (flags.federation) {
        await previewSchema('federation');
      } else {
        await previewSchema('main');
      }
    } catch (error) {
      this.log(chalk.red('❌ Failed to preview schema'));
      if (flags.verbose) {
        this.log(chalk.red(String(error)));
      }
      process.exit(1);
    }
  }

  private async printMain(flags: any): Promise<void> {
    this.log(chalk.blue('📄 Printing main GraphQL schema...'));
    
    try {
      await printMainSchema({
        outputPath: flags.output,
        verbose: flags.verbose,
      });
    } catch (error) {
      this.log(chalk.red('❌ Failed to print main schema'));
      if (flags.verbose) {
        this.log(chalk.red(String(error)));
      }
      process.exit(1);
    }
  }

  private async printFederation(flags: any): Promise<void> {
    this.log(chalk.blue('🌐 Printing federation GraphQL schema...'));
    
    try {
      await printFederationSchema({
        outputPath: flags.output,
        verbose: flags.verbose,
      });
    } catch (error) {
      this.log(chalk.red('❌ Failed to print federation schema'));
      if (flags.verbose) {
        this.log(chalk.red(String(error)));
      }
      process.exit(1);
    }
  }

  private async printAll(flags: any): Promise<void> {
    this.log(chalk.magenta('📦 Printing all GraphQL schemas...'));
    
    try {
      await printAllSchemas({
        outputPath: flags.output,
        verbose: flags.verbose,
      });
    } catch (error) {
      this.log(chalk.red('❌ Failed to print schemas'));
      if (flags.verbose) {
        this.log(chalk.red(String(error)));
      }
      process.exit(1);
    }
  }
}