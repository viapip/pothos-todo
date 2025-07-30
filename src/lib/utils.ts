import { execa } from 'execa';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';

export interface ExecuteOptions {
  cwd?: string;
  silent?: boolean;
  showSpinner?: boolean;
  spinnerText?: string;
  env?: Record<string, string>;
}

export interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

/**
 * Execute a command with execa and proper error handling
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: ExecuteOptions = {}
): Promise<CommandResult> {
  const { cwd = process.cwd(), silent = false, showSpinner = true, spinnerText, env = {} } = options;
  
  let spinner: Ora | null = null;
  
  logger.debug('Executing command', { command, args, cwd, env });
  
  if (showSpinner && !silent) {
    spinner = ora(spinnerText || `Running ${command} ${args.join(' ')}`).start();
  }
  
  try {
    const result = await execa(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: silent ? 'pipe' : 'inherit',
    });
    
    if (spinner) {
      spinner.succeed(chalk.green(`✅ ${command} completed successfully`));
    }
    
    logger.debug('Command completed successfully', { 
      command, 
      args, 
      exitCode: result.exitCode,
      stdout: result.stdout?.trim() || '' 
    });
    
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red(`❌ ${command} failed`));
    }
    
    logger.error('Command failed', { 
      command, 
      args, 
      error: error as Error,
      stderr: (error as any).stderr 
    });
    
    return {
      success: false,
      error: error as Error,
      stderr: (error as any).stderr,
    };
  }
}

/**
 * Check if a file exists
 */
export function fileExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Check if Docker is running
 */
export async function isDockerRunning(): Promise<boolean> {
  try {
    const result = await execa('docker', ['info'], { stdio: 'pipe' });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if a service is running via Docker Compose
 */
export async function isServiceRunning(serviceName: string): Promise<boolean> {
  try {
    const result = await execa('docker-compose', ['ps', '-q', serviceName], { stdio: 'pipe' });
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the project root directory
 */
export function getProjectRoot(): string {
  return process.cwd();
}

/**
 * Check if TypeScript files have errors
 */
export async function checkTypeScript(): Promise<boolean> {
  try {
    const result = await execa('bunx', ['tsc', '--noEmit'], { stdio: 'pipe' });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get build status
 */
export async function getBuildStatus(): Promise<'success' | 'error' | 'missing'> {
  const distPath = join(getProjectRoot(), 'dist');
  
  if (!fileExists(distPath)) {
    return 'missing';
  }
  
  const indexPath = join(distPath, 'index.js');
  if (!fileExists(indexPath)) {
    return 'error';
  }
  
  return 'success';
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Create a colored status indicator
 */
export function getStatusIndicator(status: 'success' | 'error' | 'warning' | 'info'): string {
  const indicators = {
    success: chalk.green('✅'),
    error: chalk.red('❌'),
    warning: chalk.yellow('⚠️'),
    info: chalk.blue('ℹ️'),
  };
  
  return indicators[status] || indicators.info;
}

/**
 * Format command output with colors
 */
export function formatOutput(text: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): string {
  const colors = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
  };
  
  return colors[type](text);
}

/**
 * Create a separator line
 */
export function createSeparator(char: string = '─', length: number = 50): string {
  return chalk.gray(char.repeat(length));
}