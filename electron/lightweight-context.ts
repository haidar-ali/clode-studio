import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, basename, dirname, relative } from 'path';
import { existsSync, watch, FSWatcher } from 'fs';
import { workspacePersistence } from './workspace-persistence.js';

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  language: string;
  lastModified: Date;
  isDirectory: boolean;
  relevanceScore?: number;
}

export interface ProjectInfo {
  type: string;
  framework?: string;
  languages: string[];
  entryPoints: string[];
  configFiles: string[];
  totalFiles: number;
  languageDistribution: Record<string, number>;
}

export interface ContextResult {
  files: FileInfo[];
  totalFiles: number;
  relevantFiles: FileInfo[];
  projectInfo: ProjectInfo;
}

export class LightweightContext {
  private workspacePath: string = '';
  private fileCache: Map<string, FileInfo> = new Map();
  private projectInfo: ProjectInfo | null = null;
  private lastScanTime: number = 0;
  
  // File watching
  private watchers: Map<string, FSWatcher> = new Map();
  private watcherCallbacks: Set<(event: 'add' | 'change' | 'remove', filePath: string) => void> = new Set();
  private scanDebounceTimer: NodeJS.Timeout | null = null;
  
  // Common file extensions and their languages
  private languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.vue': 'vue',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.ex': 'elixir',
    '.al': 'al',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.sql': 'sql'
  };

  // Files to ignore
  private ignorePatterns = [
    'node_modules',
    '.git',
    '.claude',
    '.claude-checkpoints',
    '.worktrees',
    'dist',
    'build',
    '.output',
    'coverage',
    '.nyc_output',
    'tmp',
    'temp',
    '.cache',
    '.parcel-cache',
    '.vscode',
    '.idea',
    '__pycache__',
    '*.pyc',
    '.DS_Store'
  ];

  async initialize(workspacePath: string): Promise<void> {
    // Stop any existing watchers
    this.stopWatching();
    
    this.workspacePath = workspacePath;
    
    // Load .gitignore patterns
    await this.loadGitignorePatterns();
    
    // Try to load persisted context first
    const persistedData = await workspacePersistence.loadWorkspaceContext(workspacePath);
    if (persistedData && persistedData.projectInfo) {
      this.projectInfo = persistedData.projectInfo;
      // Still scan to get fresh file data
    }
    
    await this.scanWorkspace();
    
    // Save the project info for future sessions
    if (this.projectInfo) {
      await workspacePersistence.updateProjectInfo(workspacePath, this.projectInfo);
    }
    
    // Start watching for file changes
    this.startWatching();
  }

  async scanWorkspace(): Promise<void> {
    const startTime = Date.now();
    
    this.fileCache.clear();
    const files = await this.scanDirectory(this.workspacePath);
    
    // Build project info
    this.projectInfo = this.analyzeProject(files);
    this.lastScanTime = Date.now();
  }

  private async scanDirectory(dirPath: string, depth: number = 0): Promise<FileInfo[]> {
    if (depth > 8) return []; // Prevent infinite recursion
    
    const files: FileInfo[] = [];
    const relativePath = relative(this.workspacePath, dirPath);
    
    // Check if directory should be ignored
    if (this.shouldIgnore(relativePath)) {
      return files;
    }

    try {
      const entries = await readdir(dirPath);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath, depth + 1);
          files.push(...subFiles);
        } else {
          // Process file
          const ext = extname(entry).toLowerCase();
          const language = this.languageMap[ext] || 'unknown';
          
          // Skip binary files and very large files
          if (stats.size > 1024 * 1024 || this.isBinaryFile(entry)) {
            continue;
          }

          const fileInfo: FileInfo = {
            path: fullPath,
            name: entry,
            size: stats.size,
            language,
            lastModified: stats.mtime,
            isDirectory: false
          };

          files.push(fileInfo);
          this.fileCache.set(fullPath, fileInfo);
        }
      }
    } catch (error) {
      console.warn(`Error scanning directory ${dirPath}:`, error);
    }

    return files;
  }

  private shouldIgnore(path: string): boolean {
    return this.ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob pattern matching
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path.includes(pattern);
    });
  }

  private isBinaryFile(filename: string): boolean {
    const binaryExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx'
    ];
    
    const ext = extname(filename).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  private analyzeProject(files: FileInfo[]): ProjectInfo {
    const languageDistribution: Record<string, number> = {};
    const languages = new Set<string>();
    const entryPoints: string[] = [];
    const configFiles: string[] = [];

    for (const file of files) {
      // Count languages
      languageDistribution[file.language] = (languageDistribution[file.language] || 0) + 1;
      languages.add(file.language);

      // Identify entry points
      if (this.isEntryPoint(file.name)) {
        entryPoints.push(file.path);
      }

      // Identify config files
      if (this.isConfigFile(file.name)) {
        configFiles.push(file.path);
      }
    }

    return {
      type: this.detectProjectType(files),
      framework: this.detectFramework(files),
      languages: Array.from(languages),
      entryPoints,
      configFiles,
      totalFiles: files.length,
      languageDistribution
    };
  }

  private isEntryPoint(filename: string): boolean {
    const entryPoints = [
      'main.js', 'main.ts', 'index.js', 'index.ts',
      'app.js', 'app.ts', 'server.js', 'server.ts',
      'main.py', '__main__.py', 'app.py',
      'Main.java', 'Application.java',
      'main.cpp', 'main.c',
      'Program.cs', 'Main.cs'
    ];
    return entryPoints.includes(filename);
  }

  private isConfigFile(filename: string): boolean {
    const configFiles = [
      'package.json', 'tsconfig.json', 'nuxt.config.ts', 'vite.config.ts',
      'webpack.config.js', 'rollup.config.js', 'babel.config.js',
      'pom.xml', 'build.gradle', 'Cargo.toml', 'requirements.txt',
      'Dockerfile', 'docker-compose.yml', '.gitignore', 'README.md'
    ];
    return configFiles.includes(filename);
  }

  private detectProjectType(files: FileInfo[]): string {
    const fileNames = files.map(f => f.name);
    
    if (fileNames.includes('package.json')) return 'nodejs';
    if (fileNames.includes('pom.xml')) return 'java';
    if (fileNames.includes('Cargo.toml')) return 'rust';
    if (fileNames.includes('requirements.txt')) return 'python';
    if (fileNames.includes('go.mod')) return 'go';
    if (fileNames.includes('Gemfile')) return 'ruby';
    if (fileNames.includes('composer.json')) return 'php';
    if (fileNames.some(name => name.endsWith('.csproj'))) return 'csharp';
    if (fileNames.some(name => name.endsWith('.vcxproj'))) return 'cpp';
    if (fileNames.includes('app.json')) return 'al';
    
    return 'unknown';
  }

  private detectFramework(files: FileInfo[]): string | undefined {
    const fileNames = files.map(f => f.name);
    
    if (fileNames.includes('nuxt.config.ts')) return 'nuxt';
    if (fileNames.includes('next.config.js')) return 'nextjs';
    if (fileNames.includes('vue.config.js')) return 'vue';
    if (fileNames.includes('angular.json')) return 'angular';
    if (fileNames.includes('svelte.config.js')) return 'svelte';
    if (fileNames.includes('gatsby-config.js')) return 'gatsby';
    if (fileNames.includes('vite.config.ts')) return 'vite';
    
    return undefined;
  }

  // Fast file search using simple text matching
  async searchFiles(query: string, limit: number = 20): Promise<FileInfo[]> {
    const results: FileInfo[] = [];
    const queryLower = query.toLowerCase();

    for (const file of this.fileCache.values()) {
      let score = 0;
      
      // Score based on filename match
      if (file.name.toLowerCase().includes(queryLower)) {
        score += 10;
      }
      
      // Score based on path match
      if (file.path.toLowerCase().includes(queryLower)) {
        score += 5;
      }
      
      // Score based on language match
      if (file.language.toLowerCase().includes(queryLower)) {
        score += 3;
      }
      
      // Boost recent files
      const daysSinceModified = (Date.now() - file.lastModified.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceModified < 1) score += 5;
      else if (daysSinceModified < 7) score += 2;
      
      if (score > 0) {
        file.relevanceScore = score;
        results.push(file);
      }
    }

    return results
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, limit);
  }

  // Build smart context for Claude based on query and working files
  async buildContext(query: string, workingFiles: string[] = [], maxTokens: number = 2000): Promise<string> {
    const context: string[] = [];
    
    // Add project overview
    if (this.projectInfo) {
      context.push(`PROJECT: ${this.projectInfo.type} project`);
      if (this.projectInfo.framework) {
        context.push(`FRAMEWORK: ${this.projectInfo.framework}`);
      }
      context.push(`LANGUAGES: ${this.projectInfo.languages.join(', ')}`);
      context.push('');
    }

    // Find relevant files
    const relevantFiles = await this.searchFiles(query, 10);
    
    // Add working files context
    if (workingFiles.length > 0) {
      context.push('WORKING FILES:');
      for (const filePath of workingFiles) {
        const file = this.fileCache.get(filePath);
        if (file) {
          context.push(`- ${relative(this.workspacePath, filePath)} (${file.language})`);
        }
      }
      context.push('');
    }

    // Add relevant files
    if (relevantFiles.length > 0) {
      context.push('RELEVANT FILES:');
      for (const file of relevantFiles.slice(0, 5)) {
        const relativePath = relative(this.workspacePath, file.path);
        context.push(`- ${relativePath} (${file.language}) - Score: ${file.relevanceScore}`);
      }
      context.push('');
    }

    // Add file tree for small projects
    if (this.projectInfo && this.projectInfo.totalFiles < 50) {
      const tree = await this.buildFileTree();
      context.push('FILE TREE:');
      context.push(tree);
    }

    const contextString = context.join('\n');
    
    // Save to history for future reference
    if (this.workspacePath && query) {
      await workspacePersistence.addContextHistory(
        this.workspacePath,
        query,
        contextString
      );
    }

    return contextString;
  }

  private async buildFileTree(): Promise<string> {
    const tree: string[] = [];
    const files = Array.from(this.fileCache.values())
      .sort((a, b) => a.path.localeCompare(b.path));

    for (const file of files) {
      const relativePath = relative(this.workspacePath, file.path);
      const depth = relativePath.split('/').length - 1;
      const indent = '  '.repeat(depth);
      tree.push(`${indent}${file.name} (${file.language})`);
    }

    return tree.join('\n');
  }

  // Get file content for Claude
  async getFileContent(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.warn(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  // Get project statistics
  getStatistics(): ProjectInfo | null {
    return this.projectInfo;
  }

  // Get files by language
  getFilesByLanguage(language: string): FileInfo[] {
    return Array.from(this.fileCache.values())
      .filter(file => file.language === language);
  }

  // Get recently modified files
  getRecentFiles(hours: number = 24): FileInfo[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return Array.from(this.fileCache.values())
      .filter(file => file.lastModified.getTime() > cutoff)
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  // File watching methods
  startWatching(): void {
    if (!this.workspacePath) return;
    
    try {
      // Watch the workspace directory
      const watcher = watch(this.workspacePath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        
        const fullPath = join(this.workspacePath, filename);
        
        // Skip ignored files/directories
        if (this.shouldIgnore(filename) || this.isBinaryFile(filename)) {
          return;
        }
        
        this.handleFileSystemEvent(eventType, fullPath);
      });
      
      this.watchers.set(this.workspacePath, watcher);
      
      watcher.on('error', (error) => {
        console.warn('File watcher error:', error);
        this.stopWatching();
      });
      
    } catch (error) {
      console.warn('Failed to start file watching:', error);
    }
  }
  
  stopWatching(): void {
    
    for (const [path, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        console.warn(`Failed to close watcher for ${path}:`, error);
      }
    }
    
    this.watchers.clear();
    
    // Clear debounce timer
    if (this.scanDebounceTimer) {
      clearTimeout(this.scanDebounceTimer);
      this.scanDebounceTimer = null;
    }
  }
  
  private handleFileSystemEvent(eventType: string, filePath: string): void {
    // Debounce rapid file system events
    if (this.scanDebounceTimer) {
      clearTimeout(this.scanDebounceTimer);
    }
    
    this.scanDebounceTimer = setTimeout(async () => {
      try {
        const relativePath = relative(this.workspacePath, filePath);
        
        if (eventType === 'rename') {
          // File was added or removed
          const exists = existsSync(filePath);
          
          if (exists) {
            // File added
            await this.addFileToCache(filePath);
            this.notifyWatchers('add', filePath);
          } else {
            // File removed
            this.removeFileFromCache(filePath);
            this.notifyWatchers('remove', filePath);
          }
        } else if (eventType === 'change') {
          // File modified
          if (this.fileCache.has(filePath)) {
            await this.updateFileInCache(filePath);
            this.notifyWatchers('change', filePath);
          }
        }
        
        // Update project info if needed
        await this.updateProjectInfo();
        
      } catch (error) {
        console.warn('Error handling file system event:', error);
      }
    }, 300); // 300ms debounce
  }
  
  private async addFileToCache(filePath: string): Promise<void> {
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        const ext = extname(filePath).toLowerCase();
        const language = this.languageMap[ext] || 'unknown';
        
        // Skip binary files and very large files
        if (stats.size <= 1024 * 1024 && !this.isBinaryFile(filePath)) {
          const fileInfo: FileInfo = {
            path: filePath,
            name: basename(filePath),
            size: stats.size,
            language,
            lastModified: stats.mtime,
            isDirectory: false
          };
          
          this.fileCache.set(filePath, fileInfo);
        }
      }
    } catch (error) {
      console.warn(`Failed to add file to cache: ${filePath}`, error);
    }
  }
  
  private async updateFileInCache(filePath: string): Promise<void> {
    const existingFile = this.fileCache.get(filePath);
    if (existingFile) {
      try {
        const stats = await stat(filePath);
        existingFile.lastModified = stats.mtime;
        existingFile.size = stats.size;
      } catch (error) {
        console.warn(`Failed to update file in cache: ${filePath}`, error);
      }
    }
  }
  
  private removeFileFromCache(filePath: string): void {
    this.fileCache.delete(filePath);
  }
  
  private async updateProjectInfo(): Promise<void> {
    const files = Array.from(this.fileCache.values());
    this.projectInfo = this.analyzeProject(files);
  }
  
  // Callback management for UI notifications
  onFileChange(callback: (event: 'add' | 'change' | 'remove', filePath: string) => void): () => void {
    this.watcherCallbacks.add(callback);
    
    // Return cleanup function
    return () => {
      this.watcherCallbacks.delete(callback);
    };
  }
  
  private notifyWatchers(event: 'add' | 'change' | 'remove', filePath: string): void {
    for (const callback of this.watcherCallbacks) {
      try {
        callback(event, filePath);
      } catch (error) {
        console.warn('Error in file watcher callback:', error);
      }
    }
  }

  private async loadGitignorePatterns(): Promise<void> {
    try {
      const gitignorePath = join(this.workspacePath, '.gitignore');
      if (existsSync(gitignorePath)) {
        const gitignoreContent = await readFile(gitignorePath, 'utf-8');
        const lines = gitignoreContent.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith('#')) continue;
          
          // Add pattern if not already in default patterns
          if (!this.ignorePatterns.includes(trimmedLine)) {
            this.ignorePatterns.push(trimmedLine);
          }
        }
        
      }
    } catch (error) {
      console.warn('Failed to load .gitignore patterns:', error);
    }
  }

  // Enhanced cleanup
  cleanup(): void {
    this.stopWatching();
    this.fileCache.clear();
    this.projectInfo = null;
    this.watcherCallbacks.clear();
  }
}

// Global instance
export const lightweightContext = new LightweightContext();