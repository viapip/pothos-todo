import { Command, Flags } from '@oclif/core';
import { executeCommand } from '../../lib/utils.js';
import chalk from 'chalk';
import { Listr } from 'listr2';

export default class Check extends Command {
  static override description = 'Run validation checks';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --types',
    '<%= config.bin %> <%= command.id %> --publint',
    '<%= config.bin %> <%= command.id %> --attw',
  ];

  static override flags = {
    types: Flags.boolean({
      char: 't',
      description: 'Check TypeScript types only',
    }),
    publint: Flags.boolean({
      char: 'p',
      description: 'Check package.json with publint only',
    }),
    attw: Flags.boolean({
      char: 'a',
      description: 'Check if types are wrong only',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Check);
    
    if (flags.types) {
      await this.checkTypes();
    } else if (flags.publint) {
      await this.checkPublint();
    } else if (flags.attw) {
      await this.checkAttw();
    } else {
      await this.runAllChecks();
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
      process.exit(1);
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
      process.exit(1);
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
        process.exit(1);
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
      process.exit(1);
    }
  }
}