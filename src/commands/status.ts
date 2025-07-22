import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { executeCommand, isDockerRunning, getBuildStatus, fileExists } from '../lib/utils.js';
// checkTypeScript imported but not used in this file
import boxen from 'boxen';
import { join } from 'path';

export default class Status extends Command {
  static override description = 'Show comprehensive system status dashboard';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --watch',
    '<%= config.bin %> <%= command.id %> --minimal',
  ];

  static override flags = {
    watch: Flags.boolean({
      char: 'w',
      description: 'Watch mode - refresh status every 5 seconds',
    }),
    minimal: Flags.boolean({
      char: 'm',
      description: 'Show minimal status info',
    }),
    json: Flags.boolean({
      char: 'j',
      description: 'Output status as JSON',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Status);
    
    if (flags.watch) {
      await this.watchStatus();
    } else if (flags.json) {
      await this.jsonStatus();
    } else {
      await this.showStatus(flags.minimal);
    }
  }

  private async watchStatus(): Promise<void> {
    this.log(chalk.cyan('👀 Status Dashboard - Watch Mode'));
    this.log(chalk.gray('Press Ctrl+C to stop watching\n'));
    
    const showStatusWithClear = async () => {
      // Clear screen
      process.stdout.write('\x1b[2J\x1b[0f');
      
      this.log(chalk.cyan('👀 Status Dashboard - Watch Mode'));
      this.log(chalk.gray(`Updated: ${new Date().toLocaleString()}`));
      this.log(chalk.gray('Press Ctrl+C to stop watching\n'));
      
      await this.showStatus(false);
    };

    // Show initial status
    await showStatusWithClear();
    
    // Set up interval
    const interval = setInterval(async () => {
      await showStatusWithClear();
    }, 5000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      this.log(chalk.yellow('\n👋 Status watching stopped'));
      process.exit(0);
    });
  }

  private async jsonStatus(): Promise<void> {
    const status = await this.getSystemStatus();
    this.log(JSON.stringify(status, null, 2));
  }

  private async showStatus(minimal: boolean = false): Promise<void> {
    const status = await this.getSystemStatus();
    
    if (minimal) {
      this.showMinimalStatus(status);
    } else {
      this.showFullStatus(status);
    }
  }

  private async getSystemStatus(): Promise<any> {
    const [
      dockerRunning,
      buildStatus,
      typeScriptStatus,
      gitStatus,
      packageInfo,
      servicesStatus,
      diskUsage,
    ] = await Promise.all([
      isDockerRunning(),
      getBuildStatus(),
      this.getTypeScriptStatus(),
      this.getGitStatus(),
      this.getPackageInfo(),
      this.getServicesStatus(),
      this.getDiskUsage(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      system: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      docker: {
        running: dockerRunning,
        services: servicesStatus,
      },
      build: {
        status: buildStatus,
        typescript: typeScriptStatus,
      },
      git: gitStatus,
      package: packageInfo,
      disk: diskUsage,
    };
  }

  private showMinimalStatus(status: any): void {
    const dockerIcon = status.docker.running ? '🟢' : '🔴';
    const buildIcon = status.build.status === 'success' ? '🟢' : 
                     status.build.status === 'error' ? '🔴' : '🟡';
    const tsIcon = status.build.typescript.valid ? '🟢' : '🔴';
    const gitIcon = status.git.clean ? '🟢' : '🟡';

    this.log(`${dockerIcon} Docker: ${status.docker.running ? 'Running' : 'Stopped'}`);
    this.log(`${buildIcon} Build: ${status.build.status}`);
    this.log(`${tsIcon} TypeScript: ${status.build.typescript.valid ? 'Valid' : 'Invalid'}`);
    this.log(`${gitIcon} Git: ${status.git.clean ? 'Clean' : 'Modified'}`);
    if (status.docker.services?.length > 0) {
      this.log(`🐳 Services: ${status.docker.services.length} running`);
    }
  }

  private showFullStatus(status: any): void {
    // Main title
    this.log(boxen(
      chalk.cyan.bold('🚀 System Status Dashboard'),
      {
        padding: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        textAlignment: 'center',
      }
    ));

    // System Information
    this.log(boxen(
      `${chalk.blue.bold('💻 System Information')}\n` +
      `${chalk.gray('Node.js:')} ${chalk.green(status.system.node)}\n` +
      `${chalk.gray('Platform:')} ${chalk.green(status.system.platform)}\n` +
      `${chalk.gray('Architecture:')} ${chalk.green(status.system.arch)}`,
      {
        padding: 1,
        borderStyle: 'single',
        borderColor: 'blue',
        margin: { top: 1 },
      }
    ));

    // Docker Status
    const dockerColor = status.docker.running ? 'green' : 'red';
    const dockerIcon = status.docker.running ? '✅' : '❌';
    
    let dockerContent = `${chalk.blue.bold('🐳 Docker Status')}\n` +
      `${chalk.gray('Status:')} ${chalk[dockerColor](`${dockerIcon} ${status.docker.running ? 'Running' : 'Stopped'}`)}`;
    
    if (status.docker.services?.length > 0) {
      dockerContent += `\n${chalk.gray('Services:')} ${chalk.green(status.docker.services.length)} running`;
    }

    this.log(boxen(dockerContent, {
      padding: 1,
      borderStyle: 'single',
      borderColor: dockerColor,
      margin: { top: 1 },
    }));

    // Build Status
    const buildColor = status.build.status === 'success' ? 'green' : 
                      status.build.status === 'error' ? 'red' : 'yellow';
    const buildIcon = status.build.status === 'success' ? '✅' : 
                     status.build.status === 'error' ? '❌' : '⚠️';
    
    let buildContent = `${chalk.blue.bold('🔨 Build Status')}\n` +
      `${chalk.gray('Status:')} ${chalk[buildColor](`${buildIcon} ${status.build.status}`)}`;
    
    if (status.build.typescript) {
      const tsColor = status.build.typescript.valid ? 'green' : 'red';
      const tsIcon = status.build.typescript.valid ? '✅' : '❌';
      buildContent += `\n${chalk.gray('TypeScript:')} ${chalk[tsColor](`${tsIcon} ${status.build.typescript.valid ? 'Valid' : 'Invalid'}`)}`;
    }

    this.log(boxen(buildContent, {
      padding: 1,
      borderStyle: 'single',
      borderColor: buildColor,
      margin: { top: 1 },
    }));

    // Git Status
    if (status.git) {
      const gitColor = status.git.clean ? 'green' : 'yellow';
      const gitIcon = status.git.clean ? '✅' : '⚠️';
      
      let gitContent = `${chalk.blue.bold('📁 Git Status')}\n` +
        `${chalk.gray('Status:')} ${chalk[gitColor](`${gitIcon} ${status.git.clean ? 'Clean' : 'Modified'}`)}`;
      
      if (status.git.branch) {
        gitContent += `\n${chalk.gray('Branch:')} ${chalk.cyan(status.git.branch)}`;
      }
      
      if (status.git.ahead || status.git.behind) {
        gitContent += `\n${chalk.gray('Sync:')} ${chalk.yellow(`${status.git.ahead || 0} ahead, ${status.git.behind || 0} behind`)}`;
      }

      this.log(boxen(gitContent, {
        padding: 1,
        borderStyle: 'single',
        borderColor: gitColor,
        margin: { top: 1 },
      }));
    }

    // Package Information
    if (status.package) {
      const packageContent = `${chalk.blue.bold('📦 Package Information')}\n` +
        `${chalk.gray('Name:')} ${chalk.green(status.package.name || 'Unknown')}\n` +
        `${chalk.gray('Version:')} ${chalk.green(status.package.version || 'Unknown')}\n` +
        `${chalk.gray('Dependencies:')} ${chalk.cyan(status.package.dependencies || 0)}`;

      this.log(boxen(packageContent, {
        padding: 1,
        borderStyle: 'single',
        borderColor: 'magenta',
        margin: { top: 1 },
      }));
    }

    // Disk Usage
    if (status.disk) {
      const diskContent = `${chalk.blue.bold('💾 Disk Usage')}\n` +
        `${chalk.gray('Project Size:')} ${chalk.green(status.disk.projectSize || 'Unknown')}\n` +
        `${chalk.gray('Node Modules:')} ${chalk.yellow(status.disk.nodeModulesSize || 'Unknown')}\n` +
        `${chalk.gray('Build Output:')} ${chalk.cyan(status.disk.buildSize || 'Unknown')}`;

      this.log(boxen(diskContent, {
        padding: 1,
        borderStyle: 'single',
        borderColor: 'gray',
        margin: { top: 1 },
      }));
    }

    // Footer
    this.log(boxen(
      chalk.gray(`Last updated: ${new Date().toLocaleString()}`),
      {
        padding: 1,
        borderStyle: 'single',
        borderColor: 'gray',
        textAlignment: 'center',
        margin: { top: 1 },
      }
    ));
  }

  private async getTypeScriptStatus(): Promise<any> {
    try {
      const result = await executeCommand('bunx', ['tsc', '--noEmit'], { silent: true });
      return {
        valid: result.success,
        errors: result.success ? null : result.stderr,
      };
    } catch (error) {
      return {
        valid: false,
        errors: 'TypeScript check failed',
      };
    }
  }

  private async getGitStatus(): Promise<any> {
    try {
      const [statusResult, branchResult] = await Promise.all([
        executeCommand('git', ['status', '--porcelain'], { silent: true }),
        executeCommand('git', ['branch', '--show-current'], { silent: true }),
      ]);

      const clean = statusResult.success && (statusResult.stdout?.trim() || '') === '';
      const branch = branchResult.success ? branchResult.stdout?.trim() || null : null;

      return {
        clean,
        branch,
        modified: !clean,
      };
    } catch (error) {
      return null;
    }
  }

  private async getPackageInfo(): Promise<any> {
    try {
      const packagePath = join(process.cwd(), 'package.json');
      if (!fileExists(packagePath)) {
        return null;
      }

      const { readFileSync } = await import('fs');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      
      return {
        name: packageJson.name,
        version: packageJson.version,
        dependencies: Object.keys(packageJson.dependencies || {}).length,
      };
    } catch (error) {
      return null;
    }
  }

  private async getServicesStatus(): Promise<any> {
    try {
      const result = await executeCommand('docker', ['compose', 'ps', '--services'], { silent: true });
      if (result.success) {
        return result.stdout?.trim().split('\n').filter(s => s.trim()) || [];
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  private async getDiskUsage(): Promise<any> {
    try {
      const [projectSize, nodeModulesSize, buildSize] = await Promise.all([
        this.getDirectorySize('.'),
        this.getDirectorySize('node_modules'),
        this.getDirectorySize('dist'),
      ]);

      return {
        projectSize,
        nodeModulesSize,
        buildSize,
      };
    } catch (error) {
      return null;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<string> {
    try {
      const fullPath = join(process.cwd(), dirPath);
      if (!fileExists(fullPath)) {
        return '0 B';
      }

      const result = await executeCommand('du', ['-sh', fullPath], { silent: true });
      if (result.success) {
        return result.stdout?.trim().split('\t')[0] || 'Unknown';
      }
      return 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  }
}