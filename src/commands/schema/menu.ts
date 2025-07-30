import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { printMainSchema, printFederationSchema, printAllSchemas, previewSchema } from './print.js';

export default class SchemaMenu extends Command {
  static override description = 'Interactive schema printing menu';
  static override hidden = true;

  async run(): Promise<void> {
    await this.showSchemaMenu();
  }

  private async showSchemaMenu(): Promise<void> {
    const choices = [
      {
        name: `${chalk.blue('📄')} Print Main Schema - Export main GraphQL schema to SDL`,
        value: 'main',
        short: 'Main Schema',
      },
      {
        name: `${chalk.cyan('🌐')} Print Federation Schema - Export federation subgraph schema`,
        value: 'federation',
        short: 'Federation Schema',
      },
      {
        name: `${chalk.magenta('📦')} Print All Schemas - Export both main and federation schemas`,
        value: 'all',
        short: 'All Schemas',
      },
      {
        name: `${chalk.yellow('👁️')} Preview Main Schema - View schema without saving`,
        value: 'preview-main',
        short: 'Preview Main',
      },
      {
        name: `${chalk.yellow('👁️')} Preview Federation Schema - View federation schema without saving`,
        value: 'preview-federation',
        short: 'Preview Federation',
      },
      {
        name: `${chalk.green('⚙️')} Custom Options - Configure output path and options`,
        value: 'custom',
        short: 'Custom',
      },
      {
        name: `${chalk.gray('↩️')} Back to Main Menu`,
        value: 'back',
        short: 'Back',
      },
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do with GraphQL schemas?',
        choices,
        pageSize: 10,
      },
    ]);

    await this.handleSchemaAction(action);
  }

  private async handleSchemaAction(action: string): Promise<void> {
    switch (action) {
      case 'main':
        await this.executePrintMain();
        break;
      case 'federation':
        await this.executePrintFederation();
        break;
      case 'all':
        await this.executePrintAll();
        break;
      case 'preview-main':
        await this.executePreview('main');
        break;
      case 'preview-federation':
        await this.executePreview('federation');
        break;
      case 'custom':
        await this.executeCustomOptions();
        break;
      case 'back':
        return;
      default:
        this.log(chalk.red('Unknown action'));
        break;
    }

    // Ask if user wants to continue
    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to perform another schema operation?',
        default: true,
      },
    ]);

    if (shouldContinue) {
      console.log('\n');
      await this.showSchemaMenu();
    }
  }

  private async executePrintMain(): Promise<void> {
    try {
      this.log(chalk.blue('\n📄 Printing main GraphQL schema...\n'));
      await printMainSchema({ verbose: true });
    } catch (error) {
      this.log(chalk.red(`\n❌ Error: ${error}\n`));
    }
  }

  private async executePrintFederation(): Promise<void> {
    try {
      this.log(chalk.cyan('\n🌐 Printing federation GraphQL schema...\n'));
      await printFederationSchema({ verbose: true });
    } catch (error) {
      this.log(chalk.red(`\n❌ Error: ${error}\n`));
    }
  }

  private async executePrintAll(): Promise<void> {
    try {
      this.log(chalk.magenta('\n📦 Printing all GraphQL schemas...\n'));
      await printAllSchemas({ verbose: true });
    } catch (error) {
      this.log(chalk.red(`\n❌ Error: ${error}\n`));
    }
  }

  private async executePreview(schemaType: 'main' | 'federation'): Promise<void> {
    try {
      await previewSchema(schemaType);
    } catch (error) {
      this.log(chalk.red(`\n❌ Error: ${error}\n`));
    }
  }

  private async executeCustomOptions(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'schemaType',
        message: 'Which schema(s) would you like to print?',
        choices: [
          { name: 'Main Schema', value: 'main' },
          { name: 'Federation Schema', value: 'federation' },
          { name: 'Both Schemas', value: 'all' },
        ],
      },
      {
        type: 'input',
        name: 'outputPath',
        message: 'Output directory path:',
        default: '.output',
        validate: (input) => input.trim().length > 0 || 'Output path cannot be empty',
      },
      {
        type: 'confirm',
        name: 'verbose',
        message: 'Enable verbose output?',
        default: true,
      },
    ]);

    const options = {
      outputPath: answers.outputPath,
      verbose: answers.verbose,
    };

    try {
      switch (answers.schemaType) {
        case 'main':
          this.log(chalk.blue('\n📄 Printing main schema with custom options...\n'));
          await printMainSchema(options);
          break;
        case 'federation':
          this.log(chalk.cyan('\n🌐 Printing federation schema with custom options...\n'));
          await printFederationSchema(options);
          break;
        case 'all':
          this.log(chalk.magenta('\n📦 Printing all schemas with custom options...\n'));
          await printAllSchemas(options);
          break;
      }
    } catch (error) {
      this.log(chalk.red(`\n❌ Error: ${error}\n`));
    }
  }
}