import { printSchema } from 'graphql';
import { schema, federationSchema } from '../../api/schema/schema.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';

export interface PrintSchemaOptions {
  outputPath?: string;
  verbose?: boolean;
}

export async function printMainSchema(options: PrintSchemaOptions = {}): Promise<void> {
  const { outputPath = '.output', verbose = false } = options;
  
  try {
    if (verbose) {
      console.log(chalk.blue('📄 Generating main GraphQL schema...'));
    }

    const schemaSDL = printSchema(schema);
    const filePath = join(outputPath, 'schema.graphql');
    
    // Ensure output directory exists
    mkdirSync(dirname(filePath), { recursive: true });
    
    // Write schema to file
    writeFileSync(filePath, schemaSDL);
    
    console.log(chalk.green(`✅ Main schema written to ${filePath}`));
    
    if (verbose) {
      console.log(chalk.gray(`Schema size: ${schemaSDL.length} characters`));
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to print main schema:'), error);
    throw error;
  }
}

export async function printFederationSchema(options: PrintSchemaOptions = {}): Promise<void> {
  const { outputPath = '.output', verbose = false } = options;
  
  try {
    if (verbose) {
      console.log(chalk.blue('📄 Generating federation GraphQL schema...'));
    }

    const schemaSDL = printSchema(federationSchema);
    const filePath = join(outputPath, 'federation-schema.graphql');
    
    // Ensure output directory exists
    mkdirSync(dirname(filePath), { recursive: true });
    
    // Write schema to file
    writeFileSync(filePath, schemaSDL);
    
    console.log(chalk.green(`✅ Federation schema written to ${filePath}`));
    
    if (verbose) {
      console.log(chalk.gray(`Schema size: ${schemaSDL.length} characters`));
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to print federation schema:'), error);
    throw error;
  }
}

export async function printAllSchemas(options: PrintSchemaOptions = {}): Promise<void> {
  const { verbose = false } = options;
  
  if (verbose) {
    console.log(chalk.magenta('📦 Printing all GraphQL schemas...\n'));
  }

  await printMainSchema(options);
  await printFederationSchema(options);
  
  if (verbose) {
    console.log(chalk.magenta('\n✨ All schemas printed successfully!'));
  }
}

export async function previewSchema(schemaType: 'main' | 'federation' | 'all' = 'main'): Promise<void> {
  try {
    console.log(chalk.cyan(`\n📋 Schema Preview (${schemaType}):\n`));
    
    switch (schemaType) {
      case 'main': {
        const mainSDL = printSchema(schema);
        console.log(chalk.gray(mainSDL.slice(0, 500) + (mainSDL.length > 500 ? '...' : '')));
        console.log(chalk.blue(`\nFull schema: ${mainSDL.length} characters`));
        break;
      }
        
      case 'federation': {
        const fedSDL = printSchema(federationSchema);
        console.log(chalk.gray(fedSDL.slice(0, 500) + (fedSDL.length > 500 ? '...' : '')));
        console.log(chalk.blue(`\nFull schema: ${fedSDL.length} characters`));
        break;
      }
        
      case 'all':
        await previewSchema('main');
        console.log(chalk.yellow('\n' + '─'.repeat(50)));
        await previewSchema('federation');
        break;
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to preview schema:'), error);
    throw error;
  }
}