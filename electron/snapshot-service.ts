import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { homedir } from 'os';
import { createHash } from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { isText } from 'istextorbinary';
import type { ClaudeSnapshot, ContentObject, DiffObject } from '../types/snapshot';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class SnapshotService {
  private baseDir: string;
  private projectPath: string;
  private projectName: string;
  private projectSnapshotsDir: string;
  private currentBranch: string = 'main';

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.projectName = path.basename(projectPath);
    this.baseDir = path.join(homedir(), '.claude-snapshots');
    this.projectSnapshotsDir = path.join(this.baseDir, this.projectName);
    this.initialize();
  }

  private getBranchDir(branch?: string): string {
    const branchName = (branch || this.currentBranch).replace(/\//g, '-');
    return path.join(this.projectSnapshotsDir, branchName);
  }

  private getSnapshotsDir(branch?: string): string {
    return path.join(this.getBranchDir(branch), 'snapshots');
  }

  private getContentDir(branch?: string): string {
    return path.join(this.getBranchDir(branch), 'content');
  }

  private getDiffDir(branch?: string): string {
    return path.join(this.getBranchDir(branch), 'diffs');
  }

  private async initialize() {
    try {
      await fs.ensureDir(this.projectSnapshotsDir);
      
      // Ensure .claude-snapshots is in .gitignore
      await this.ensureGitignore();
    } catch (error) {
      console.error('Failed to initialize snapshot directories:', error);
    }
  }

  /**
   * Generate content-addressable path (2-level directory structure)
   */
  private getContentPath(hash: string, branch?: string): string {
    const prefix = hash.substring(0, 2);
    const suffix = hash.substring(2);
    return path.join(this.getContentDir(branch), prefix, suffix + '.json');
  }

  private getDiffPath(hash: string, branch?: string): string {
    const prefix = hash.substring(0, 2);
    const suffix = hash.substring(2);
    return path.join(this.getDiffDir(branch), prefix, suffix + '.json');
  }

  public setCurrentBranch(branch: string) {
    this.currentBranch = branch;
  }

  setupIpcHandlers() {
    
    // Save snapshot
    ipcMain.handle('snapshots:save', async (_, snapshot: ClaudeSnapshot) => {
      try {
        const branch = snapshot.gitBranch || 'main';
        const snapshotsDir = this.getSnapshotsDir(branch);
        
        // Ensure branch directories exist
        await fs.ensureDir(snapshotsDir);
        await fs.ensureDir(this.getContentDir(branch));
        await fs.ensureDir(this.getDiffDir(branch));
        
        const filename = `${snapshot.id}.json`;
        const filepath = path.join(snapshotsDir, filename);
        
        // Calculate actual size
        const content = JSON.stringify(snapshot, null, 2);
        snapshot.sizeKb = Buffer.byteLength(content) / 1024;
        
        await fs.writeJson(filepath, snapshot, { spaces: 2 });
        
        return { success: true, snapshot };
      } catch (error: any) {
        console.error('Failed to save snapshot:', error);
        return { success: false, error: error.message };
      }
    });

    // List snapshots
    ipcMain.handle('snapshots:list', async (_, options?: { branch?: string; allBranches?: boolean }) => {
      return this.handleListSnapshots(_, options);
    });

    // Delete snapshot
    ipcMain.handle('snapshots:delete', async (_, snapshotId: string, branch?: string) => {
      try {
        // If branch is provided, use it directly
        if (branch) {
          const filename = `${snapshotId}.json`;
          const filepath = path.join(this.getSnapshotsDir(branch), filename);
          await fs.remove(filepath);
          return { success: true };
        }
        
        // Otherwise, search for the snapshot in all branches
        const branchDirs = await fs.readdir(this.projectSnapshotsDir);
        
        for (const branchDir of branchDirs) {
          const branchPath = path.join(this.projectSnapshotsDir, branchDir);
          const stat = await fs.stat(branchPath);
          
          if (stat.isDirectory()) {
            const filename = `${snapshotId}.json`;
            const filepath = path.join(branchPath, 'snapshots', filename);
            
            if (await fs.pathExists(filepath)) {
              await fs.remove(filepath);
              return { success: true };
            }
          }
        }
        
        return { success: false, error: 'Snapshot not found' };
      } catch (error: any) {
        console.error('Failed to delete snapshot:', error);
        return { success: false, error: error.message };
      }
    });

    // Update snapshot (for tags)
    ipcMain.handle('snapshots:update', async (_, snapshot: ClaudeSnapshot) => {
      try {
        const branch = snapshot.gitBranch || 'main';
        const filename = `${snapshot.id}.json`;
        const filepath = path.join(this.getSnapshotsDir(branch), filename);
        
        await fs.writeJson(filepath, snapshot, { spaces: 2 });
        
        return { success: true };
      } catch (error: any) {
        console.error('Failed to update snapshot:', error);
        return { success: false, error: error.message };
      }
    });


    // Export snapshots
    ipcMain.handle('snapshots:export', async (_, exportPath: string) => {
      try {
        const exportFile = path.join(exportPath, `${this.projectName}-snapshots-${Date.now()}.json`);
        const snapshots = await this.listAllSnapshots();
        
        await fs.writeJson(exportFile, {
          project: this.projectName,
          exportDate: new Date().toISOString(),
          snapshots
        }, { spaces: 2 });
        
        return { success: true, path: exportFile };
      } catch (error: any) {
        console.error('Failed to export snapshots:', error);
        return { success: false, error: error.message };
      }
    });

    // Import snapshots
    ipcMain.handle('snapshots:import', async (_, importPath: string) => {
      try {
        const data = await fs.readJson(importPath);
        
        if (!data.snapshots || !Array.isArray(data.snapshots)) {
          throw new Error('Invalid snapshot export file');
        }
        
        let imported = 0;
        for (const snapshot of data.snapshots) {
          const filename = `${snapshot.id}.json`;
          const branch = snapshot.gitBranch || 'main';
          const filepath = path.join(this.getSnapshotsDir(branch), filename);
          
          // Don't overwrite existing snapshots
          if (!await fs.pathExists(filepath)) {
            await fs.writeJson(filepath, snapshot, { spaces: 2 });
            imported++;
          }
        }
        
        return { success: true, imported };
      } catch (error: any) {
        console.error('Failed to import snapshots:', error);
        return { success: false, error: error.message };
      }
    });

    // Enhanced snapshot IPC handlers
    
    // Content compression
    ipcMain.handle('snapshots:compressContent', async (_, content: string) => {
      try {
        const { compressed, ratio } = await this.compressContent(content);
        return { compressed: compressed.toString('base64'), ratio };
      } catch (error: any) {
        console.error('Failed to compress content:', error);
        return { compressed: content, ratio: 1.0 };
      }
    });

    // Content storage
    ipcMain.handle('snapshots:storeContent', async (_, params: { hash: string; content: string; mimeType: string; encoding: string; projectPath: string; branch?: string }) => {
      try {
        const success = await this.storeContentObject(params.hash, params.content, params.mimeType, params.encoding, params.branch);
        return { success };
      } catch (error: any) {
        console.error('Failed to store content:', error);
        return { success: false, error: error.message };
      }
    });

    // Content retrieval
    ipcMain.handle('snapshots:getContent', async (_, params: { hash: string; projectPath: string; branch?: string }) => {
      try {
        const content = await this.getContentObject(params.hash, params.branch);
        return { success: true, content };
      } catch (error: any) {
        console.error('Failed to get content:', error);
        return { success: false, error: error.message, content: null };
      }
    });

    // Diff storage
    ipcMain.handle('snapshots:storeDiff', async (_, params: { hash: string; diffObject: DiffObject; projectPath: string; branch?: string }) => {
      try {
        const success = await this.storeDiffObject(params.hash, params.diffObject, params.branch);
        return { success };
      } catch (error: any) {
        console.error('Failed to store diff:', error);
        return { success: false, error: error.message };
      }
    });

    // Diff retrieval
    ipcMain.handle('snapshots:getDiff', async (_, params: { hash: string; projectPath: string; branch?: string }) => {
      try {
        const diffObject = await this.getDiffObject(params.hash, params.branch);
        return { success: true, diffObject };
      } catch (error: any) {
        console.error('Failed to get diff:', error);
        return { success: false, error: error.message, diffObject: null };
      }
    });

    // Project file scanning
    ipcMain.handle('snapshots:scanProjectFiles', async (_, params: { projectPath: string }) => {
      try {
        const files = await this.scanProjectFiles(params.projectPath);
        return { success: true, files };
      } catch (error: any) {
        console.error('Failed to scan project files:', error);
        return { success: false, error: error.message, files: [] };
      }
    });
    
    // Update current branch
    ipcMain.handle('snapshots:setCurrentBranch', async (_, branch: string) => {
      try {
        this.setCurrentBranch(branch);
        return { success: true };
      } catch (error: any) {
        console.error('Failed to set current branch:', error);
        return { success: false, error: error.message };
      }
    });

    // File restoration
    ipcMain.handle('snapshots:restoreFiles', async (_, params: { fileChanges: any; projectPath: string }) => {
      try {
        const success = await this.restoreProjectFiles(params.fileChanges, params.projectPath);
        return { success };
      } catch (error: any) {
        console.error('Failed to restore files:', error);
        return { success: false, error: error.message };
      }
    });

    // Enhanced storage info
    ipcMain.handle('snapshots:getStorageInfo', async (_, params?: { projectPath: string }) => {
      try {
        // Calculate stats for all branch directories
        let totalSize = 0;
        if (await fs.pathExists(this.projectSnapshotsDir)) {
          const stats = await fs.stat(this.projectSnapshotsDir);
          totalSize = stats.size;
        }
        
        // Calculate content storage stats
        let contentSize = 0;
        let contentCount = 0;
        try {
          const contentStats = await this.calculateContentStats();
          contentSize = contentStats.size;
          contentCount = contentStats.count;
        } catch (error) {
          console.warn('Failed to calculate content stats:', error);
        }
        
        const storageInfo = {
          totalSnapshots: 0, // Will be filled by snapshots store
          totalSizeKb: totalSize / 1024,
          totalContentSizeKb: contentSize / 1024,
          compressionRatio: 0, // Calculate based on stored objects
          deduplicationSavings: 0, // Calculate based on content hash duplicates
          oldestSnapshot: new Date().toISOString(),
          newestSnapshot: new Date().toISOString(),
          storageDirectory: this.projectSnapshotsDir
        };
        
        return { success: true, storageInfo };
      } catch (error: any) {
        console.error('Failed to get storage info:', error);
        return { 
          success: false, 
          error: error.message,
          storageInfo: {
            totalSnapshots: 0,
            totalSizeKb: 0,
            totalContentSizeKb: 0,
            compressionRatio: 0,
            deduplicationSavings: 0,
            oldestSnapshot: new Date().toISOString(),
            newestSnapshot: new Date().toISOString(),
            storageDirectory: this.projectSnapshotsDir
          }
        };
      }
    });

    // Cleanup
    ipcMain.handle('snapshots:cleanup', async (_, params: { projectPath: string; olderThanDays: number }) => {
      try {
        const removed = await this.cleanup(params.olderThanDays);
        return { success: true, stats: { removed, sizeFreed: 0 } };
      } catch (error: any) {
        console.error('Failed to cleanup:', error);
        return { success: false, error: error.message, stats: { removed: 0, sizeFreed: 0 } };
      }
    });
  }

  private async calculateContentStats(): Promise<{ size: number; count: number }> {
    let totalSize = 0;
    let count = 0;
    
    async function walkContentDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await walkContentDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
            count++;
          }
        }
      } catch (error) {
        // Ignore errors in content directory walking
      }
    }
    
    // Walk through all branch directories
    if (await fs.pathExists(this.projectSnapshotsDir)) {
      const branchDirs = await fs.readdir(this.projectSnapshotsDir);
      
      for (const branchDir of branchDirs) {
        const branchPath = path.join(this.projectSnapshotsDir, branchDir);
        const stat = await fs.stat(branchPath);
        
        if (stat.isDirectory()) {
          const contentDir = path.join(branchPath, 'content');
          const diffDir = path.join(branchPath, 'diffs');
          
          if (await fs.pathExists(contentDir)) {
            await walkContentDir(contentDir);
          }
          if (await fs.pathExists(diffDir)) {
            await walkContentDir(diffDir);
          }
        }
      }
    }
    
    return { size: totalSize, count };
  }

  /**
   * Ensure Claude directories are in .gitignore
   */
  private async ensureGitignore() {
    try {
      const gitignorePath = path.join(this.projectPath, '.gitignore');
      const claudeDirectories = [
        '.claude/',
        '.claude-snapshots/',
        '.claude-checkpoints/',
        '.worktrees/'
      ];
      
      let gitignoreContent = '';
      const missingDirs: string[] = [];
      
      // Read existing .gitignore if it exists
      if (await fs.pathExists(gitignorePath)) {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
        
        // Check which directories are missing
        const lines = gitignoreContent.split('\n').map(line => line.trim());
        
        for (const dir of claudeDirectories) {
          const dirName = dir.replace('/', '');
          const hasDir = lines.some(line => 
            line === dirName || 
            line === dir ||
            line === '/' + dirName ||
            line === '/' + dir
          );
          
          if (!hasDir) {
            missingDirs.push(dir);
          }
        }
      } else {
        // No .gitignore, add all directories
        missingDirs.push(...claudeDirectories);
      }
      
      if (missingDirs.length > 0) {
        // Add missing directories to .gitignore
        let contentToAppend = '';
        
        if (gitignoreContent.trim()) {
          contentToAppend += '\n';
        }
        
        contentToAppend += '# Claude Code IDE generated directories\n';
        contentToAppend += missingDirs.join('\n') + '\n';
        
        await fs.writeFile(gitignorePath, gitignoreContent + contentToAppend);
        console.log(`Added ${missingDirs.join(', ')} to .gitignore`);
      }
    } catch (error) {
      console.warn('Failed to update .gitignore:', error);
    }
  }

  /**
   * Read and parse .gitignore patterns
   */
  private async readGitignorePatterns(): Promise<string[]> {
    const patterns: string[] = [];
    const gitignorePath = path.join(this.projectPath, '.gitignore');
    
    if (await fs.pathExists(gitignorePath)) {
      try {
        const content = await fs.readFile(gitignorePath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          // Skip empty lines and comments
          if (trimmed && !trimmed.startsWith('#')) {
            patterns.push(trimmed);
          }
        }
      } catch (error) {
        console.warn('Failed to read .gitignore:', error);
      }
    }
    
    return patterns;
  }

  /**
   * Check if a path matches gitignore patterns
   */
  private matchesGitignorePattern(relativePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Simple pattern matching (not full gitignore spec)
      let regex: RegExp;
      
      if (pattern.endsWith('/')) {
        // Directory pattern
        const dirPattern = pattern.slice(0, -1);
        if (relativePath.startsWith(dirPattern + '/') || relativePath === dirPattern) {
          return true;
        }
      } else if (pattern.includes('*')) {
        // Glob pattern - convert to regex
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        regex = new RegExp(`^${regexPattern}$`);
        if (regex.test(relativePath)) {
          return true;
        }
      } else {
        // Exact match or prefix match
        if (relativePath === pattern || 
            relativePath.startsWith(pattern + '/') ||
            relativePath.includes('/' + pattern + '/') ||
            relativePath.endsWith('/' + pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  private async listAllSnapshots(): Promise<{ success: boolean; data: ClaudeSnapshot[] }> {
    // Use the existing list handler with allBranches option
    return this.handleListSnapshots(null, { allBranches: true });
  }
  
  private async handleListSnapshots(_: any, options?: { branch?: string; allBranches?: boolean }) {
    try {
      const snapshots: ClaudeSnapshot[] = [];
      
      // Check if project directory exists
      if (!await fs.pathExists(this.projectSnapshotsDir)) {
        return { success: true, data: snapshots };
      }
      
      if (options?.allBranches) {
        // List all branch directories
        const branchDirs = await fs.readdir(this.projectSnapshotsDir);
        
        for (const branchDir of branchDirs) {
          const branchPath = path.join(this.projectSnapshotsDir, branchDir);
          const stat = await fs.stat(branchPath);
          
          if (stat.isDirectory()) {
            const snapshotsDir = path.join(branchPath, 'snapshots');
            
            if (await fs.pathExists(snapshotsDir)) {
              const files = await fs.readdir(snapshotsDir);
              
              for (const file of files) {
                if (file.endsWith('.json')) {
                  const filepath = path.join(snapshotsDir, file);
                  try {
                    const snapshot = await fs.readJson(filepath);
                    snapshots.push(snapshot);
                  } catch (error) {
                    console.error(`Failed to read snapshot ${file}:`, error);
                  }
                }
              }
            }
          }
        }
      } else {
        // List snapshots for specific branch only
        const branch = options?.branch || this.currentBranch;
        const snapshotsDir = this.getSnapshotsDir(branch);
        
        if (await fs.pathExists(snapshotsDir)) {
          const files = await fs.readdir(snapshotsDir);
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filepath = path.join(snapshotsDir, file);
              try {
                const snapshot = await fs.readJson(filepath);
                snapshots.push(snapshot);
              } catch (error) {
                console.error(`Failed to read snapshot ${file}:`, error);
              }
            }
          }
        }
      }
      
      return { success: true, data: snapshots };
    } catch (error: any) {
      console.error('Failed to list snapshots:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  // Clean up old snapshots
  async cleanup(daysToKeep: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      let deleted = 0;
      
      // Clean up snapshots in all branch directories
      if (await fs.pathExists(this.projectSnapshotsDir)) {
        const branchDirs = await fs.readdir(this.projectSnapshotsDir);
        
        for (const branchDir of branchDirs) {
          const branchPath = path.join(this.projectSnapshotsDir, branchDir);
          const stat = await fs.stat(branchPath);
          
          if (stat.isDirectory()) {
            const snapshotsDir = path.join(branchPath, 'snapshots');
            
            if (await fs.pathExists(snapshotsDir)) {
              const files = await fs.readdir(snapshotsDir);
              
              for (const file of files) {
                if (file.endsWith('.json')) {
                  const filepath = path.join(snapshotsDir, file);
                  const stats = await fs.stat(filepath);
                  
                  if (stats.mtime < cutoffDate) {
                    await fs.remove(filepath);
                    deleted++;
                  }
                }
              }
            }
          }
        }
      }
      
      return deleted;
    } catch (error) {
      console.error('Failed to cleanup snapshots:', error);
      return 0;
    }
  }

  /**
   * Enhanced snapshot operations
   */
  
  /**
   * Detect if a file is text or binary using istextorbinary library
   */
  private async detectFileInfo(filePath: string, buffer?: Buffer): Promise<{
    mimeType: string;
    encoding: 'utf8' | 'binary';
    isTextFile: boolean;
  }> {
    try {
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      
      // Use istextorbinary for smart detection
      // If buffer is provided, use it; otherwise read a sample for detection
      let detectionBuffer = buffer;
      if (!detectionBuffer) {
        try {
          // Read first 1KB for detection (much faster than full file)
          const fileStats = await fs.stat(filePath);
          const readSize = Math.min(1024, fileStats.size);
          const fd = await fs.open(filePath, 'r');
          const readBuffer = Buffer.alloc(readSize);
          const bytesRead = await fs.read(fd, readBuffer, 0, readSize, 0);
          await fs.close(fd);
          detectionBuffer = readBuffer.slice(0, bytesRead.bytesRead);
        } catch (error) {
          // If we can't read the file, fall back to extension-based detection
          console.warn(`Failed to read file for detection ${filePath}:`, error);
          return this.fallbackDetection(fileName, ext);
        }
      }
      
      const detectionResult = isText(fileName, detectionBuffer);
      // isText can return boolean | null, so we need to handle null as false
      const isTextFile = detectionResult === true;
      
      // Log detection results for debugging dot files and common config files
      if (fileName.startsWith('.') || fileName.includes('lock') || fileName.includes('ignore')) {
        console.log(`📋 [istextorbinary] ${fileName}: ${detectionResult} → ${isTextFile ? 'TEXT' : 'BINARY'} (buffer size: ${detectionBuffer.length})`);
      }
      
      // Basic MIME type mapping for common extensions
      const mimeTypes: Record<string, string> = {
        // Text files
        'txt': 'text/plain',
        'md': 'text/markdown',
        'js': 'application/javascript',
        'ts': 'application/typescript',
        'json': 'application/json',
        'html': 'text/html',
        'css': 'text/css',
        'xml': 'application/xml',
        'yaml': 'application/yaml',
        'yml': 'application/yaml',
        // Images
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        // Other binary
        'pdf': 'application/pdf',
        'zip': 'application/zip',
        'mp4': 'video/mp4',
        'mp3': 'audio/mpeg'
      };
      
      const mimeType = mimeTypes[ext] || (isTextFile ? 'text/plain' : 'application/octet-stream');
      
      return {
        mimeType,
        encoding: isTextFile ? 'utf8' : 'binary',
        isTextFile
      };
    } catch (error) {
      console.warn(`File detection failed for ${filePath}:`, error);
      // Fallback to simple extension-based detection
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      return this.fallbackDetection(fileName, ext);
    }
  }
  
  /**
   * Fallback detection when istextorbinary fails
   */
  private fallbackDetection(fileName: string, ext: string): {
    mimeType: string;
    encoding: 'utf8' | 'binary';
    isTextFile: boolean;
  } {
    // Common text file patterns
    const textFiles = new Set([
      '.gitignore', '.babelrc', '.eslintrc', '.prettierrc', '.npmrc', '.nvmrc',
      '.editorconfig', '.firebaserc', 'Dockerfile', 'Makefile', 'LICENSE', 'README'
    ]);
    
    const textExtensions = new Set([
      'txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'css', 'scss',
      'json', 'xml', 'yaml', 'yml', 'py', 'java', 'cpp', 'c', 'h', 'php',
      'rb', 'go', 'rs', 'sh', 'sql', 'toml', 'ini', 'cfg', 'log', 'env'
    ]);
    
    const isTextFile = textFiles.has(fileName) || textExtensions.has(ext);
    
    // Log fallback detection for debugging
    if (fileName.startsWith('.') || fileName.includes('lock') || fileName.includes('ignore')) {
      console.log(`🔄 [fallback] ${fileName} (ext: ${ext}): ${isTextFile ? 'TEXT' : 'BINARY'}`);
    }
    
    return {
      mimeType: isTextFile ? 'text/plain' : 'application/octet-stream',
      encoding: isTextFile ? 'utf8' : 'binary',
      isTextFile
    };
  }
  
  // Content compression
  private async compressContent(content: string): Promise<{ compressed: Buffer; ratio: number }> {
    try {
      const original = Buffer.from(content, 'utf8');
      const compressed = await gzip(original);
      const ratio = compressed.length / original.length;
      return { compressed, ratio };
    } catch (error) {
      console.warn('Compression failed:', error);
      return { compressed: Buffer.from(content, 'utf8'), ratio: 1.0 };
    }
  }

  private async decompressContent(compressed: Buffer): Promise<string> {
    try {
      const decompressed = await gunzip(compressed);
      return decompressed.toString('utf8');
    } catch (error) {
      // If decompression fails, assume content is uncompressed
      return compressed.toString('utf8');
    }
  }

  // Content storage
  private async storeContentObject(hash: string, content: string, mimeType: string, encoding: string, branch?: string): Promise<boolean> {
    const contentPath = this.getContentPath(hash, branch);
    
    // Check if content already exists (deduplication)
    if (await fs.pathExists(contentPath)) {
      return true;
    }

    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(contentPath));
      
      // Determine if content is text or binary based on encoding
      const isTextContent = encoding === 'utf8';
      
      // Compress content
      const { compressed, ratio } = await this.compressContent(content);
      
      const contentObject = {
        hash,
        content: compressed.toString('base64'), // Convert Buffer to base64 string for JSON storage
        originalSize: Buffer.byteLength(content, isTextContent ? 'utf8' : 'binary'),
        compressionAlgorithm: ratio < 0.95 ? 'gzip' : 'none',
        mimeType: isTextContent ? 'text/plain' : 'application/octet-stream', // Use encoding to determine MIME type
        encoding: encoding as 'utf8' | 'binary',
        createdAt: new Date().toISOString()
      };

      await fs.writeJson(contentPath, contentObject);
      return true;
    } catch (error) {
      console.error('Failed to store content:', error);
      return false;
    }
  }

  private async getContentObject(hash: string, branch?: string): Promise<string | null> {
    const contentPath = this.getContentPath(hash, branch);
    
    if (!await fs.pathExists(contentPath)) {
      return null;
    }

    try {
      const contentObject = await fs.readJson(contentPath);
      // Convert base64 string back to Buffer for decompression
      const contentBuffer = Buffer.from(contentObject.content, 'base64');
      const decompressed = await this.decompressContent(contentBuffer);
      
      // Debug log for problematic files
      if (contentPath.includes('eslint') || contentPath.includes('yarn') || contentPath.includes('babel')) {
        console.log(`🔍 [restore] ${contentPath.split('/').pop()}: encoding=${contentObject.encoding}, compression=${contentObject.compressionAlgorithm}, size=${decompressed.length}`);
        console.log(`🔍 [content preview]:`, decompressed.substring(0, 50));
      }
      
      return decompressed;
    } catch (error) {
      console.error(`Failed to read content ${hash}:`, error);
      return null;
    }
  }

  // Diff storage
  private async storeDiffObject(hash: string, diffObject: DiffObject, branch?: string): Promise<boolean> {
    const diffPath = this.getDiffPath(hash, branch);
    
    try {
      await fs.ensureDir(path.dirname(diffPath));
      await fs.writeJson(diffPath, diffObject);
      return true;
    } catch (error) {
      console.error('Failed to store diff:', error);
      return false;
    }
  }

  private async getDiffObject(hash: string, branch?: string): Promise<DiffObject | null> {
    const diffPath = this.getDiffPath(hash, branch);
    
    if (!await fs.pathExists(diffPath)) {
      return null;
    }

    try {
      return await fs.readJson(diffPath);
    } catch (error) {
      console.error(`Failed to read diff ${hash}:`, error);
      return null;
    }
  }

  // File scanning
  private async scanProjectFiles(projectPath: string): Promise<Array<{
    fullPath: string;
    relativePath: string;
    content: string;
    size: number;
    encoding: 'utf8' | 'binary';
    isTextFile: boolean;
  }>> {
    const files: Array<{
      fullPath: string;
      relativePath: string;
      content: string;
      size: number;
      encoding: 'utf8' | 'binary';
      isTextFile: boolean;
    }> = [];

    // Read gitignore patterns
    const gitignorePatterns = await this.readGitignorePatterns();
    
    // Add some default patterns that should always be ignored
    const defaultIgnorePatterns = [
      '.git',
      '.git/',
      '.claude',
      '.claude/',
      '.claude-snapshots',
      '.claude-snapshots/',
      '.claude-checkpoints',
      '.claude-checkpoints/',
      '.worktrees',
      '.worktrees/',
      'node_modules',
      'node_modules/',
      '.DS_Store',
      '.nuxt/',
      '.output/',
      'dist/',
      'build/'
    ];
    
    const allPatterns = [...defaultIgnorePatterns, ...gitignorePatterns];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(projectPath, fullPath);
          
          // Skip ignored patterns
          if (this.matchesGitignorePattern(relativePath, allPatterns)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              // Skip very large files (>1MB)
              if (stats.size > 1024 * 1024) {
                continue;
              }
              
              // Detect if file is binary or text
              const fileInfo = await this.detectFileInfo(fullPath);
              
              // Read file with appropriate encoding
              let content: string;
              if (fileInfo.isTextFile) {
                content = await fs.readFile(fullPath, 'utf8');
              } else {
                // For binary files, read as buffer and convert to base64
                const buffer = await fs.readFile(fullPath);
                content = buffer.toString('base64');
              }
              
              files.push({
                fullPath,
                relativePath,
                content,
                size: stats.size,
                encoding: fileInfo.encoding,
                isTextFile: fileInfo.isTextFile
              });
            } catch (error) {
              // Skip files that can't be read as text
              console.warn(`Skipping file ${fullPath}:`, error instanceof Error ? error.message : String(error));
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${dir}:`, error);
      }
    }

    await walkDir(projectPath);
    return files;
  }

  // File restoration
  private async restoreProjectFiles(fileChanges: any, projectPath: string): Promise<boolean> {
    try {
      const allFiles = [...fileChanges.added, ...fileChanges.modified];
      
      // Debug: Log files being restored
      console.log(`🔧 [restore] Processing ${allFiles.length} files for restoration`);
      
      for (const fileChange of allFiles) {
        const fullPath = path.join(projectPath, fileChange.path);
        
        // Debug log for problematic files
        if (fileChange.path.includes('eslint') || fileChange.path.includes('yarn') || fileChange.path.includes('babel')) {
          console.log(`🔧 [restore] Processing file: ${fileChange.path}, contentHash: ${fileChange.contentHash}, isTextFile: ${fileChange.isTextFile}`);
        }
        
        if (fileChange.contentHash) {
          const content = await this.getContentObject(fileChange.contentHash);
          if (content) {
            await fs.ensureDir(path.dirname(fullPath));
            
            // Write file with appropriate encoding
            if (fileChange.isTextFile) {
              await fs.writeFile(fullPath, content, 'utf8');
              
              // Debug log after writing
              if (fileChange.path.includes('eslint') || fileChange.path.includes('yarn') || fileChange.path.includes('babel')) {
                console.log(`✅ [restore] Successfully wrote text file: ${fileChange.path}`);
              }
            } else {
              // For binary files, convert base64 back to buffer
              const buffer = Buffer.from(content, 'base64');
              await fs.writeFile(fullPath, buffer);
              
              // Debug log after writing
              if (fileChange.path.includes('eslint') || fileChange.path.includes('yarn') || fileChange.path.includes('babel')) {
                console.log(`✅ [restore] Successfully wrote binary file: ${fileChange.path}`);
              }
            }
          } else {
            // Debug log for missing content
            if (fileChange.path.includes('eslint') || fileChange.path.includes('yarn') || fileChange.path.includes('babel')) {
              console.log(`❌ [restore] No content found for: ${fileChange.path} (hash: ${fileChange.contentHash})`);
            }
          }
        } else {
          // Debug log for missing hash
          if (fileChange.path.includes('eslint') || fileChange.path.includes('yarn') || fileChange.path.includes('babel')) {
            console.log(`❌ [restore] No contentHash for: ${fileChange.path}`);
          }
        }
      }

      // Remove files that were removed in the snapshot
      for (const fileChange of fileChanges.removed) {
        const fullPath = path.join(projectPath, fileChange.path);
        if (await fs.pathExists(fullPath)) {
          await fs.unlink(fullPath);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to restore files:', error);
      return false;
    }
  }
}