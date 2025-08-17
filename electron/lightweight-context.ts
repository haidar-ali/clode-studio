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
  
  // Performance limits
  private readonly MAX_FILES = 5000;  // Limit for large projects
  private readonly MAX_FILE_SIZE = 512 * 1024; // 512KB
  private readonly MAX_ERRORS = 100; // Stop after too many errors
  private scanningInProgress: boolean = false;
  private errorCount: number = 0;
  
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

  // Files to ignore (expanded for better performance)
  private ignorePatterns = [
    // Dependencies
    'node_modules', 'vendor', 'packages', '.pnpm-store', 'bower_components',
    // Version control
    '.git', '.svn', '.hg', '.bzr',
    // Claude specific
    '.claude', '.claude-checkpoints', '.clode', '.worktrees',
    // Build outputs
    'dist', 'build', '.output', '.next', 'target', 'bin', 'obj', '_build',
    // Testing and coverage
    'coverage', '.nyc_output', '.pytest_cache',
    // Temp and cache
    'tmp', 'temp', '.cache', '.parcel-cache', '.nuxt', '.turbo',
    // IDE
    '.vscode', '.idea', '.vs',
    // Python
    '__pycache__', '*.pyc', '*.pyo', '.Python', 'venv', 'env',
    // OS
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
    // Media directories (common locations)
    'wwwroot', 'public/images', 'public/media', 'assets/images',
    'resources', 'static/images', 'uploads', 'media',
    // Deployment directories (fix for the double slash issue)
    'azure-deploy', 'incremental-deploy', 'deploy', 'deployment',
    // Large files
    '*.jpg', '*.jpeg', '*.png', '*.gif', '*.mp4', '*.avi', '*.mov',
    '*.zip', '*.rar', '*.tar', '*.gz', '*.pdf', '*.exe', '*.dll',
    '*.min.js', '*.min.css', '*.map', '*.sql', '*.sqlite', '*.db'
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
    // Prevent concurrent scans
    if (this.scanningInProgress) {
      
      return;
    }
    
    this.scanningInProgress = true;
    this.errorCount = 0;
    const startTime = Date.now();
    
    try {
      this.fileCache.clear();
      const files = await this.scanDirectory(this.workspacePath);
      
      // Build project info
      this.projectInfo = this.analyzeProject(files);
      this.lastScanTime = Date.now();
      
      
    } finally {
      this.scanningInProgress = false;
    }
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
      
      // Check limits before processing
      if (this.fileCache.size >= this.MAX_FILES) {
        console.warn(`Reached maximum file limit (${this.MAX_FILES}), stopping scan`);
        return files;
      }
      
      if (this.errorCount >= this.MAX_ERRORS) {
        console.error(`Too many errors (${this.MAX_ERRORS}), stopping scan`);
        return files;
      }
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        
        let stats;
        try {
          stats = await stat(fullPath);
        } catch (statError) {
          // File doesn't exist or is a broken symlink - skip silently
          this.errorCount++;
          continue;
        }
        
        if (stats.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath, depth + 1);
          files.push(...subFiles);
        } else {
          // Process file
          const ext = extname(entry).toLowerCase();
          const language = this.languageMap[ext] || 'unknown';
          
          // Skip binary files and large files
          if (stats.size > this.MAX_FILE_SIZE || this.isBinaryFile(entry)) {
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
      this.errorCount++;
      // Only log if it's not a common error
      if ((error as any).code !== 'ENOENT' && (error as any).code !== 'EACCES') {
        console.warn(`Error scanning directory ${dirPath}:`, (error as any).code || error);
      }
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
    
    // Detect if this is a large project
    const isLargeProject = this.fileCache.size > 1000;
    
    // Add minimal project overview
    if (this.projectInfo) {
      context.push(`PROJECT: ${this.projectInfo.type} project`);
      if (this.projectInfo.framework) {
        context.push(`FRAMEWORK: ${this.projectInfo.framework}`);
      }
      // Only show top 3 languages for large projects
      const languages = isLargeProject 
        ? this.projectInfo.languages.slice(0, 3).join(', ') + (this.projectInfo.languages.length > 3 ? '...' : '')
        : this.projectInfo.languages.join(', ');
      context.push(`LANGUAGES: ${languages}`);
      
      // Show size indicator
      if (isLargeProject) {
        context.push(`SIZE: Large project (${this.projectInfo.totalFiles}+ files)`);
      }
      context.push('');
    }

    // For large projects, severely limit file search
    const searchLimit = isLargeProject ? 5 : 10;
    const relevantFiles = query ? await this.searchFiles(query, searchLimit) : [];
    
    // Add working files context (limit to 5 for large projects)
    if (workingFiles.length > 0) {
      const filesToShow = isLargeProject ? workingFiles.slice(0, 5) : workingFiles.slice(0, 10);
      if (filesToShow.length > 0) {
        context.push('WORKING FILES:');
        for (const filePath of filesToShow) {
          const file = this.fileCache.get(filePath);
          if (file) {
            const relativePath = relative(this.workspacePath, filePath);
            // Shorten paths for large projects
            const displayPath = isLargeProject && relativePath.length > 50
              ? '...' + relativePath.slice(-47)
              : relativePath;
            context.push(`- ${displayPath} (${file.language})`);
          }
        }
        if (workingFiles.length > filesToShow.length) {
          context.push(`  ... and ${workingFiles.length - filesToShow.length} more`);
        }
        context.push('');
      }
    }

    // Add relevant files (but fewer for large projects)
    if (relevantFiles.length > 0) {
      const filesToShow = isLargeProject ? relevantFiles.slice(0, 3) : relevantFiles.slice(0, 5);
      context.push('RELEVANT FILES:');
      for (const file of filesToShow) {
        const relativePath = relative(this.workspacePath, file.path);
        const displayPath = isLargeProject && relativePath.length > 50
          ? '...' + relativePath.slice(-47)
          : relativePath;
        context.push(`- ${displayPath} (${file.language})`);
      }
      context.push('');
    }

    // NEVER build file tree for large projects or projects with many files
    if (this.projectInfo && this.projectInfo.totalFiles < 30 && !isLargeProject) {
      const tree = await this.buildFileTree();
      if (tree) {
        context.push('FILE TREE:');
        context.push(tree);
      }
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
    
    // Don't watch if project has too many files
    if (this.fileCache.size > 1000) {
      
      return;
    }
    
    try {
      // Watch the workspace directory (non-recursive for large projects)
      const watcher = watch(this.workspacePath, { recursive: false }, (eventType, filename) => {
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
    // Skip if already scanning
    if (this.scanningInProgress) {
      return;
    }
    
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
        
        // Skip binary files and large files
        if (stats.size <= this.MAX_FILE_SIZE && !this.isBinaryFile(filePath)) {
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