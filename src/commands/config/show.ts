import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { inspect } from 'util';
import { loadAppConfig } from '../../config/index.js';

export default class ConfigShow extends Command {
  static override description = 'Show current configuration';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --section=server',
  ];

  static override flags = {
    json: Flags.boolean({
      description: 'Output configuration as JSON',
      default: false,
    }),
    section: Flags.string({
      description: 'Show specific configuration section',
      options: ['server', 'database', 'logger', 'build', 'cli', 'docker', 'graphql', 'env'],
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(ConfigShow);

    try {
      const config = await loadAppConfig();

      if (flags.section) {
        const section = config[flags.section as keyof typeof config];
        if (!section) {
          this.error(`Configuration section '${flags.section}' not found`);
        }
        
        if (flags.json) {
          this.log(JSON.stringify(section, null, 2));
        } else {
          this.log(chalk.blue(`\n${String(flags.section).toUpperCase()} Configuration:`));
          this.log(inspect(section, { colors: true, depth: null }));
        }
      } else {
        if (flags.json) {
          this.log(JSON.stringify(config, null, 2));
        } else {
          this.log(chalk.blue('\nCurrent Configuration:'));
          this.log(inspect(config, { colors: true, depth: null }));
        }
      }
    } catch (error) {
      this.error(`Failed to load configuration: ${error}`);
    }
  }
}