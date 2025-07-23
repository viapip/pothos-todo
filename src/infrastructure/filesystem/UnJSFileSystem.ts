/**
 * UnJS-powered file system service
 * Provides advanced file operations using UnJS utilities
 */

import { pathUtils, storage, logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { createStorage } from 'unstorage';
import fsDriver from 'unstorage/drivers/fs';
import { promises as fs } from 'fs';
import { readdir, stat, readFile, writeFile, mkdir, rmdir, unlink, access } from 'fs/promises';
import { createJiti } from 'jiti';
import { parseTarGzip } from 'nanotar';
import { glob } from 'glob';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  mtime: Date;
  ctime: Date;
  ext: string;
  hash?: string;
}

export interface WatchOptions {
  ignored?: string | RegExp | (string | RegExp)[];
  persistent?: boolean;
  recursive?: boolean;
  followSymlinks?: boolean;
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  error?: string;
  meta?: any;
}

/**
 * Advanced file system operations using UnJS utilities
 */
export class UnJSFileSystemService {
  private fsStorage: ReturnType<typeof createStorage>;
  private watchers: Map<string, FSWatcher> = new Map();
  private jiti: any;

  constructor(private basePath: string = './storage') {
    this.fsStorage = createStorage({
      driver: fsDriver({ base: basePath }),
    });

    // Initialize jiti for dynamic imports
    this.jiti = createJiti(pathUtils.resolve('.'));
  }

  /**
   * Read file with automatic type detection and parsing
   */
  async readFile<T = any>(filePath: string): Promise<T | null> {
    try {
      const fullPath = pathUtils.resolve(this.basePath, filePath);
      const ext = pathUtils.extname(fullPath).toLowerCase();

      // Use unstorage for simple operations
      if (['.json', '.txt', '.md'].includes(ext)) {
        const content = await this.fsStorage.getItem<T>(filePath);
        return content;
      }

      // Direct file read for other types
      const buffer = await readFile(fullPath);

      switch (ext) {
        case '.json':
          return JSON.parse(buffer.toString()) as T;
        case '.js':
        case '.ts':
          return this.jiti(fullPath) as T;
        case '.yaml':
        case '.yml':
          // Would need yaml parser
          return buffer.toString() as unknown as T;
        default:
          return buffer.toString() as unknown as T;
      }
    } catch (error) {
      logger.error('Failed to read file', { filePath, error });
      return null;
    }
  }

  /**
   * Write file with automatic serialization
   */
  async writeFile<T = any>(filePath: string, data: T): Promise<FileOperationResult> {
    try {
      const fullPath = pathUtils.resolve(this.basePath, filePath);
      const ext = pathUtils.extname(fullPath).toLowerCase();

      // Ensure directory exists
      await this.ensureDir(pathUtils.dirname(filePath));

      let content: string;
      switch (ext) {
        case '.json':
          content = JSON.stringify(data, null, 2);
          break;
        case '.yaml':
        case '.yml':
          // Would need yaml serializer
          content = String(data);
          break;
        default:
          content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      }

      await this.fsStorage.setItem(filePath, content);

      logger.debug('File written successfully', { filePath, size: content.length });

      return {
        success: true,
        path: fullPath,
        meta: { size: content.length, ext }
      };
    } catch (error) {
      logger.error('Failed to write file', { filePath, error });
      return {
        success: false,
        path: pathUtils.resolve(this.basePath, filePath),
        error: String(error)
      };
    }
  }

  /**
   * Get detailed file information
   */
  async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const fullPath = pathUtils.resolve(this.basePath, filePath);
      const stats = await stat(fullPath);

      const info: FileInfo = {
        name: pathUtils.basename(fullPath),
        path: fullPath,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        mtime: stats.mtime,
        ctime: stats.ctime,
        ext: pathUtils.extname(fullPath),
      };

      // Generate hash for files
      if (info.isFile && info.size < 10 * 1024 * 1024) { // Only for files < 10MB
        const content = await readFile(fullPath);
        info.hash = objectUtils.hash(content);
      }

      return info;
    } catch (error) {
      logger.error('Failed to get file info', { filePath, error });
      return null;
    }
  }

  /**
   * List directory contents with filtering
   */
  async listDirectory(
    dirPath: string = '.',
    options: {
      recursive?: boolean;
      pattern?: string;
      extensions?: string[];
      includeHidden?: boolean;
    } = {}
  ): Promise<FileInfo[]> {
    try {
      const { recursive = false, pattern, extensions, includeHidden = false } = options;
      const fullPath = pathUtils.resolve(this.basePath, dirPath);

      let files: string[] = [];

      if (recursive || pattern) {
        const globPattern = pattern || '**/*';
        const globPath = pathUtils.join(fullPath, globPattern);
        files = await glob(globPath, {
          dot: includeHidden,
          nodir: false
        });
      } else {
        const entries = await readdir(fullPath);
        files = entries
          .filter(entry => includeHidden || !entry.startsWith('.'))
          .map(entry => pathUtils.join(fullPath, entry));
      }

      const fileInfos: FileInfo[] = [];

      for (const file of files) {
        const relativePath = pathUtils.relative(this.basePath, file);
        const info = await this.getFileInfo(relativePath);

        if (info) {
          // Filter by extensions if specified
          if (extensions && extensions.length > 0) {
            if (info.isFile && !extensions.includes(info.ext)) {
              continue;
            }
          }

          fileInfos.push(info);
        }
      }

      return fileInfos.sort((a, b) => {
        // Directories first, then files alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      logger.error('Failed to list directory', { dirPath, error });
      return [];
    }
  }

  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath: string): Promise<boolean> {
    try {
      const fullPath = pathUtils.resolve(this.basePath, dirPath);
      await mkdir(fullPath, { recursive: true });
      return true;
    } catch (error) {
      logger.error('Failed to ensure directory', { dirPath, error });
      return false;
    }
  }

  /**
   * Delete file or directory
   */
  async delete(filePath: string, recursive = false): Promise<FileOperationResult> {
    try {
      const fullPath = pathUtils.resolve(this.basePath, filePath);
      const info = await this.getFileInfo(filePath);

      if (!info) {
        return {
          success: false,
          path: fullPath,
          error: 'File or directory not found'
        };
      }

      if (info.isDirectory) {
        await rmdir(fullPath, { recursive });
      } else {
        await unlink(fullPath);
        await this.fsStorage.removeItem(filePath);
      }

      logger.debug('File/directory deleted', { filePath, isDirectory: info.isDirectory });

      return {
        success: true,
        path: fullPath,
        meta: { isDirectory: info.isDirectory }
      };
    } catch (error) {
      logger.error('Failed to delete file/directory', { filePath, error });
      return {
        success: false,
        path: pathUtils.resolve(this.basePath, filePath),
        error: String(error)
      };
    }
  }

  /**
   * Copy file or directory
   */
  async copy(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    try {
      const fullSourcePath = pathUtils.resolve(this.basePath, sourcePath);
      const fullDestPath = pathUtils.resolve(this.basePath, destPath);

      const sourceInfo = await this.getFileInfo(sourcePath);
      if (!sourceInfo) {
        return {
          success: false,
          path: fullDestPath,
          error: 'Source file not found'
        };
      }

      await this.ensureDir(pathUtils.dirname(destPath));

      if (sourceInfo.isFile) {
        const content = await readFile(fullSourcePath);
        await writeFile(fullDestPath, content);
      } else {
        // For directories, would need recursive copy logic
        throw new Error('Directory copying not implemented yet');
      }

      return {
        success: true,
        path: fullDestPath,
        meta: { size: sourceInfo.size }
      };
    } catch (error) {
      logger.error('Failed to copy file', { sourcePath, destPath, error });
      return {
        success: false,
        path: pathUtils.resolve(this.basePath, destPath),
        error: String(error)
      };
    }
  }

  /**
   * Watch files/directories for changes
   */
  async watch(
    path: string,
    callback: (event: string, filePath: string) => void,
    options: WatchOptions = {}
  ): Promise<string> {
    const watchId = stringUtils.random(8);
    const fullPath = pathUtils.resolve(this.basePath, path);

    const watcher = watch(fullPath, {
      persistent: true,
      recursive: true,
      ...options
    });

    watcher
      .on('add', (filePath) => callback('add', filePath))
      .on('change', (filePath) => callback('change', filePath))
      .on('unlink', (filePath) => callback('unlink', filePath))
      .on('addDir', (dirPath) => callback('addDir', dirPath))
      .on('unlinkDir', (dirPath) => callback('unlinkDir', dirPath));

    this.watchers.set(watchId, watcher);

    logger.debug('File watcher started', { path, watchId });

    return watchId;
  }

  /**
   * Stop watching
   */
  async unwatch(watchId: string): Promise<boolean> {
    const watcher = this.watchers.get(watchId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(watchId);
      logger.debug('File watcher stopped', { watchId });
      return true;
    }
    return false;
  }

  /**
   * Extract tar archive
   */
  async extractTar(tarPath: string, destPath: string): Promise<FileOperationResult> {
    try {
      const fullTarPath = pathUtils.resolve(this.basePath, tarPath);
      const fullDestPath = pathUtils.resolve(this.basePath, destPath);

      await this.ensureDir(destPath);

      const tarBuffer = await readFile(fullTarPath);
      const files = await parseTarGzip(tarBuffer, {
        metaOnly: true,
      });

      for (const file of files) {
        const content = await readFile(pathUtils.resolve(this.basePath, file.name));
        await writeFile(pathUtils.resolve(this.basePath, file.name), content);
        await this.fsStorage.setItem(file.name, content);
      }

      return {
        success: true,
        path: fullDestPath,
        meta: { extracted: true }
      };
    } catch (error) {
      logger.error('Failed to extract tar', { tarPath, destPath, error });
      return {
        success: false,
        path: pathUtils.resolve(this.basePath, destPath),
        error: String(error)
      };
    }
  }

  /**
   * Search files by content
   */
  async searchInFiles(
    pattern: RegExp | string,
    options: {
      extensions?: string[];
      maxFileSize?: number;
      caseSensitive?: boolean;
    } = {}
  ): Promise<Array<{ file: string; matches: string[]; lineNumbers: number[] }>> {
    const { extensions = ['.txt', '.md', '.js', '.ts', '.json'], maxFileSize = 1024 * 1024 } = options;
    const regex = typeof pattern === 'string'
      ? new RegExp(pattern, options.caseSensitive ? 'g' : 'gi')
      : pattern;

    const results: Array<{ file: string; matches: string[]; lineNumbers: number[] }> = [];

    const files = await this.listDirectory('.', { recursive: true, extensions });

    for (const file of files) {
      if (file.isFile && file.size <= maxFileSize) {
        try {
          const content = await this.readFile<string>(file.path.replace(this.basePath, ''));
          if (typeof content === 'string') {
            const lines = content.split('\n');
            const matches: string[] = [];
            const lineNumbers: number[] = [];

            lines.forEach((line, index) => {
              const match = line.match(regex);
              if (match) {
                matches.push(...match);
                lineNumbers.push(index + 1);
              }
            });

            if (matches.length > 0) {
              results.push({
                file: file.path,
                matches: [...new Set(matches)], // Remove duplicates
                lineNumbers: [...new Set(lineNumbers)]
              });
            }
          }
        } catch (error) {
          logger.warn('Failed to search in file', { file: file.path, error });
        }
      }
    }

    return results;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    largestFile: FileInfo | null;
    oldestFile: FileInfo | null;
    newestFile: FileInfo | null;
  }> {
    const files = await this.listDirectory('.', { recursive: true });

    let totalFiles = 0;
    let totalDirectories = 0;
    let totalSize = 0;
    let largestFile: FileInfo | null = null;
    let oldestFile: FileInfo | null = null;
    let newestFile: FileInfo | null = null;

    for (const file of files) {
      if (file.isFile) {
        totalFiles++;
        totalSize += file.size;

        if (!largestFile || file.size > largestFile.size) {
          largestFile = file;
        }

        if (!oldestFile || file.ctime < oldestFile.ctime) {
          oldestFile = file;
        }

        if (!newestFile || file.ctime > newestFile.ctime) {
          newestFile = file;
        }
      } else if (file.isDirectory) {
        totalDirectories++;
      }
    }

    return {
      totalFiles,
      totalDirectories,
      totalSize,
      largestFile,
      oldestFile,
      newestFile
    };
  }

  /**
   * Cleanup - close all watchers
   */
  async cleanup(): Promise<void> {
    const watcherIds = Array.from(this.watchers.keys());
    await Promise.all(watcherIds.map(id => this.unwatch(id)));
    logger.info('File system service cleaned up', { watchersRemoved: watcherIds.length });
  }
}

// Singleton instance
export const fileSystemService = new UnJSFileSystemService();