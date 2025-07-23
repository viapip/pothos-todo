import { Command } from '@oclif/core';
import { SchemaGenerator, defaultDocConfig } from '../../infrastructure/documentation/SchemaGenerator.js';
import { logger } from '../../logger.js';
import chalk from 'chalk';

export default class DocsGenerate extends Command {
  static override description = 'Generate comprehensive API documentation';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --output ./api-docs',
    '<%= config.bin %> <%= command.id %> --no-markdown --no-postman',
  ];

  static override flags = {
    output: {
      char: 'o',
      description: 'Output directory for generated documentation',
      default: './docs',
    },
    'no-sdl': {
      description: 'Skip generating GraphQL Schema Definition Language file',
      type: 'boolean',
      default: false,
    },
    'no-introspection': {
      description: 'Skip generating GraphQL introspection result',
      type: 'boolean',
      default: false,
    },
    'no-markdown': {
      description: 'Skip generating Markdown documentation',
      type: 'boolean',
      default: false,
    },
    'no-postman': {
      description: 'Skip generating Postman collection',
      type: 'boolean',
      default: false,
    },
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DocsGenerate);

    console.log(chalk.blue('🚀 Generating API Documentation...\n'));

    try {
      const config = {
        ...defaultDocConfig,
        outputDir: flags.output,
        includeSDL: !flags['no-sdl'],
        includeIntrospection: !flags['no-introspection'],
        includeMarkdown: !flags['no-markdown'],
        includePostmanCollection: !flags['no-postman'],
      };

      const generator = new SchemaGenerator(config);
      await generator.generateAll();

      console.log(chalk.green('✅ API documentation generated successfully!'));
      console.log(chalk.gray(`📁 Output directory: ${flags.output}`));
      
      if (config.includeSDL) {
        console.log(chalk.gray('  📄 schema.graphql - GraphQL Schema Definition Language'));
      }
      if (config.includeIntrospection) {
        console.log(chalk.gray('  📄 introspection.json - GraphQL introspection result'));
      }
      if (config.includeMarkdown) {
        console.log(chalk.gray('  📄 API.md - Comprehensive API documentation'));
      }
      if (config.includePostmanCollection) {
        console.log(chalk.gray('  📄 postman-collection.json - Postman collection'));
      }

      console.log(chalk.cyan('\n💡 Next steps:'));
      console.log(chalk.gray('  • Import postman-collection.json into Postman'));
      console.log(chalk.gray('  • Share API.md with your team'));
      console.log(chalk.gray('  • Use schema.graphql for code generation'));

    } catch (error) {
      console.error(chalk.red('❌ Failed to generate documentation:'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      logger.error('Documentation generation failed', { error });
      process.exit(1);
    }
  }
}