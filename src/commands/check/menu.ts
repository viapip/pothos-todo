import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { executeCommand, checkTypeScript } from '../../lib/utils.js';
import { Listr } from 'listr2';

export default class CheckMenu extends Command {
  static override description = 'Interactive check and validation menu';

  async run(): Promise<void> {
    const choices = [
      {
        name: `${chalk.blue('🔍')} TypeScript Check - Validate TypeScript types`,
        value: 'types',
        short: 'Types',
      },
      {
        name: `${chalk.green('📦')} Package Check - Validate package.json with publint`,
        value: 'publint',
        short: 'Package',
      },
      {
        name: `${chalk.yellow('🔧')} Types Wrong Check - Are the types wrong?`,
        value: 'attw',
        short: 'ATTW',
      },
      {
        name: `${chalk.magenta('✅')} All Checks - Run all validation checks`,
        value: 'all',
        short: 'All Checks',
      },
      {
        name: `${chalk.cyan('🎯')} Custom Check - Select specific checks to run`,
        value: 'custom',
        short: 'Custom',
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
        message: 'Choose a validation check:',
        choices,
        pageSize: 10,
      },
    ]);

    await this.handleAction(action);
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'types':
        await this.checkTypes();
        break;
      case 'publint':
        await this.checkPublint();
        break;
      case 'attw':
        await this.checkAttw();
        break;
      case 'all':
        await this.runAllChecks();
        break;
      case 'custom':
        await this.runCustomChecks();
        break;
      case 'back':
        return;
      default:
        this.log(chalk.red('Unknown action'));
        break;
    }
  }

  private async checkTypes(): Promise<void> {
    this.log(chalk.blue('🔍 Checking TypeScript types...'));
    
    const result = await executeCommand('bunx', ['tsc', '--noEmit'], {
      spinnerText: 'Checking TypeScript types...',
    });

    if (result.success) {
      this.log(chalk.green('✅ TypeScript types are valid!'));
    } else {
      this.log(chalk.red('❌ TypeScript type errors found'));
      if (result.stderr) {
        this.log(chalk.red(result.stderr));
      }
    }
  }

  private async checkPublint(): Promise<void> {
    this.log(chalk.green('📦 Checking package.json with publint...'));
    
    const result = await executeCommand('bunx', ['publint'], {
      spinnerText: 'Validating package.json...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Package validation passed!'));
    } else {
      this.log(chalk.red('❌ Package validation failed'));
      if (result.stdout) {
        this.log(chalk.red(result.stdout));
      }
    }
  }

  private async checkAttw(): Promise<void> {
    this.log(chalk.yellow('🔧 Checking if types are wrong...'));
    
    const result = await executeCommand('bunx', ['@arethetypeswrong/cli', '--pack'], {
      spinnerText: 'Checking type correctness...',
    });

    if (result.success) {
      this.log(chalk.green('✅ Types are correct!'));
    } else {
      // Check if it's only warnings (contains warning symbols but no actual errors)
      const output = result.stdout || '';
      const hasWarnings = output.includes('⚠️') || output.includes('Warning');
      const hasErrors = output.includes('❌') || output.includes('Error');
      
      if (hasWarnings && !hasErrors) {
        this.log(chalk.yellow('⚠️ Type compatibility warnings found'));
        if (result.stdout) {
          this.log(chalk.yellow(result.stdout));
        }
        this.log(chalk.gray('These are warnings, not errors. The package still functions correctly.'));
      } else {
        this.log(chalk.red('❌ Type issues found'));
        if (result.stdout) {
          this.log(chalk.red(result.stdout));
        }
      }
    }
  }

  private async runAllChecks(): Promise<void> {
    this.log(chalk.magenta('✅ Running all validation checks...'));
    
    const tasks = new Listr([
      {
        title: 'TypeScript Type Check',
        task: async () => {
          const result = await executeCommand('bunx', ['tsc', '--noEmit'], { silent: true });
          if (!result.success) {
            throw new Error(result.stderr || 'TypeScript errors found');
          }
        },
      },
      {
        title: 'Package Validation (publint)',
        task: async () => {
          const result = await executeCommand('bunx', ['publint'], { silent: true });
          if (!result.success) {
            throw new Error(result.stdout || 'Package validation failed');
          }
        },
      },
      {
        title: 'Type Correctness Check (attw)',
        task: async () => {
          const result = await executeCommand('bunx', ['@arethetypeswrong/cli', '--pack'], { silent: true });
          if (!result.success) {
            // Check if it's only warnings
            const output = result.stdout || '';
            const hasWarnings = output.includes('⚠️') || output.includes('Warning');
            const hasErrors = output.includes('❌') || output.includes('Error');
            
            if (hasWarnings && !hasErrors) {
              // Just warnings, don't fail
              return;
            }
            throw new Error(result.stdout || 'Type issues found');
          }
        },
      },
    ], {
      concurrent: false,
      exitOnError: false,
    });

    try {
      await tasks.run();
      this.log(chalk.green('\n✅ All validation checks passed!'));
    } catch (error) {
      this.log(chalk.red('\n❌ Some validation checks failed'));
      this.log(chalk.gray('Check the output above for details'));
    }
  }

  private async runCustomChecks(): Promise<void> {
    const { checks } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'checks',
        message: 'Select checks to run:',
        choices: [
          { name: 'TypeScript Type Check', value: 'types' },
          { name: 'Package Validation (publint)', value: 'publint' },
          { name: 'Type Correctness Check (attw)', value: 'attw' },
        ],
        validate: (answer) => {
          if (answer.length === 0) {
            return 'Please select at least one check';
          }
          return true;
        },
      },
    ]);

    if (checks.length === 0) {
      return;
    }

    const tasks = [];
    
    if (checks.includes('types')) {
      tasks.push({
        title: 'TypeScript Type Check',
        task: async () => {
          const result = await executeCommand('bunx', ['tsc', '--noEmit'], { silent: true });
          if (!result.success) {
            throw new Error(result.stderr || 'TypeScript errors found');
          }
        },
      });
    }

    if (checks.includes('publint')) {
      tasks.push({
        title: 'Package Validation (publint)',
        task: async () => {
          const result = await executeCommand('bunx', ['publint'], { silent: true });
          if (!result.success) {
            throw new Error(result.stdout || 'Package validation failed');
          }
        },
      });
    }

    if (checks.includes('attw')) {
      tasks.push({
        title: 'Type Correctness Check (attw)',
        task: async () => {
          const result = await executeCommand('bunx', ['@arethetypeswrong/cli', '--pack'], { silent: true });
          if (!result.success) {
            // Check if it's only warnings
            const output = result.stdout || '';
            const hasWarnings = output.includes('⚠️') || output.includes('Warning');
            const hasErrors = output.includes('❌') || output.includes('Error');
            
            if (hasWarnings && !hasErrors) {
              // Just warnings, don't fail
              return;
            }
            throw new Error(result.stdout || 'Type issues found');
          }
        },
      });
    }

    const taskList = new Listr(tasks, {
      concurrent: false,
      exitOnError: false,
    });

    try {
      await taskList.run();
      this.log(chalk.green('\n✅ Selected validation checks completed!'));
    } catch (error) {
      this.log(chalk.red('\n❌ Some validation checks failed'));
      this.log(chalk.gray('Check the output above for details'));
    }
  }
}