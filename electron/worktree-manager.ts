import { ipcMain } from 'electron';
import * as path from 'path';
import fs from 'fs-extra';
import simpleGit, { SimpleGit } from 'simple-git';

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
  created?: Date;
  description?: string;
  linkedCheckpoint?: string;
}

export interface WorktreeSession {
  id: string;
  name: string;
  worktree: Worktree;
  created: Date;
  lastAccessed: Date;
  metadata: {
    task?: string;
    experiment?: boolean;
    tags?: string[];
  };
}

export interface WorktreeComparisonResult {
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  commits: {
    ahead: number;
    behind: number;
    diverged: boolean;
  };
}

export class WorktreeManager {
  private mainRepoPath: string;
  private git: SimpleGit;
  private worktreesPath: string;
  private sessions: Map<string, WorktreeSession> = new Map();
  private activeWorktreePath: string;
  
  constructor(mainRepoPath: string, setupHandlers: boolean = true) {
    this.mainRepoPath = mainRepoPath;
    this.activeWorktreePath = mainRepoPath; // Initially set to main repo path
    this.git = simpleGit(mainRepoPath);
    this.worktreesPath = path.join(mainRepoPath, '.worktrees');
    
    // Only setup IPC handlers if not managed by WorktreeManagerGlobal
    if (setupHandlers) {
      this.setupIpcHandlers();
    }
    
    this.initialize();
  }
  
  private setupIpcHandlers() {
    // List all worktrees
    ipcMain.handle('worktree:list', async () => {
      return await this.listWorktrees();
    });
    
    // Create new worktree
    ipcMain.handle('worktree:create', async (event, branchName: string, sessionName?: string) => {
      return await this.createWorktree(branchName, sessionName);
    });
    
    // Remove worktree
    ipcMain.handle('worktree:remove', async (event, worktreePath: string, force?: boolean) => {
      return await this.removeWorktree(worktreePath, force);
    });
    
    // Switch to worktree
    ipcMain.handle('worktree:switch', async (event, worktreePath: string) => {
      return await this.switchToWorktree(worktreePath);
    });
    
    // Compare worktrees
    ipcMain.handle('worktree:compare', async (event, path1: string, path2: string) => {
      return await this.compareWorktrees(path1, path2);
    });
    
    // List sessions
    ipcMain.handle('worktree:sessions', async () => {
      return await this.listSessions();
    });
    
    // Create session
    ipcMain.handle('worktree:createSession', async (event, sessionData: any) => {
      return await this.createSession(sessionData);
    });
    
    // Delete session
    ipcMain.handle('worktree:deleteSession', async (event, sessionId: string) => {
      return await this.deleteSession(sessionId);
    });
    
    // Lock/unlock worktree
    ipcMain.handle('worktree:lock', async (event, worktreePath: string, lock: boolean) => {
      return await this.lockWorktree(worktreePath, lock);
    });
    
    // Prune worktrees
    ipcMain.handle('worktree:prune', async () => {
      return await this.pruneWorktrees();
    });
  }
  
  async initialize(): Promise<void> {
    try {
      // Verify git repository first
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return; // Don't throw error, just return
      }
      
      // Only proceed if it's a git repository
      // Ensure worktrees directory exists
      await fs.ensureDir(this.worktreesPath);
      
      // Load saved sessions
      await this.loadSessions();
    } catch (error) {
      console.error('Failed to initialize worktree manager:', error);
    }
  }
  
  async listWorktrees(): Promise<{ success: boolean; worktrees?: Worktree[]; error?: string }> {
    try {
      // Check if git repository first
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return { success: false, error: 'Not a git repository', worktrees: [] };
      }
      
      // Use git worktree list --porcelain for machine-readable output
      const result = await this.git.raw(['worktree', 'list', '--porcelain']);
      const worktrees = this.parseWorktreeList(result);
      
      // Enhance with additional info
      for (const worktree of worktrees) {
        // Check if this is the active worktree by comparing paths
        worktree.isActive = path.resolve(this.activeWorktreePath) === path.resolve(worktree.path);
        
        // Check if locked
        const lockFile = path.join(worktree.path, '.git', 'locked');
        worktree.isLocked = await fs.pathExists(lockFile);
        
        // Get creation time if available
        const gitDir = path.join(worktree.path, '.git');
        if (await fs.pathExists(gitDir)) {
          const stats = await fs.stat(gitDir);
          worktree.created = stats.birthtime;
        }
        
        // Check if it's a session worktree
        const session = this.findSessionByPath(worktree.path);
        if (session) {
          worktree.description = session.name;
        }
      }
      
      return { success: true, worktrees };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to list worktrees' 
      };
    }
  }
  
  async createWorktree(
    branchName: string, 
    sessionName?: string,
    sessionDescription?: string
  ): Promise<{ success: boolean; worktree?: Worktree; error?: string }> {
    try {
      // Check if repository has any commits
      try {
        await this.git.raw(['rev-parse', 'HEAD']);
      } catch (error) {
        return { 
          success: false, 
          error: 'Cannot create worktree: Repository has no commits. Please make an initial commit first.' 
        };
      }
      
      // Generate worktree path
      const safeBranchName = branchName.replace(/[^a-zA-Z0-9-_]/g, '-');
      const worktreePath = path.join(this.worktreesPath, safeBranchName);
      
      // Check if worktree already exists
      if (await fs.pathExists(worktreePath)) {
        return { success: false, error: 'Worktree already exists' };
      }
      
      // Check if branch exists
      const branches = await this.git.branch();
      const branchExists = branches.all.includes(branchName);
      
      if (branchExists) {
        // Create worktree for existing branch
        await this.git.raw(['worktree', 'add', worktreePath, branchName]);
      } else {
        // Create worktree with new branch
        await this.git.raw(['worktree', 'add', '-b', branchName, worktreePath]);
      }
      
      // Get worktree info
      const worktrees = await this.listWorktrees();
      const newWorktree = worktrees.worktrees?.find(w => w.path === worktreePath);
      
      if (!newWorktree) {
        throw new Error('Failed to create worktree');
      }
      
      // Copy or link .claude directory from main workspace to worktree
      await this.setupWorktreeConfiguration(worktreePath);
      
      // Always create a session - use branch name if no session name provided
      const finalSessionName = sessionName || branchName;
      await this.createSession({
        name: finalSessionName,
        worktreePath,
        branchName,
        metadata: {
          description: sessionDescription
        }
      });
      
      return { success: true, worktree: newWorktree };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create worktree' 
      };
    }
  }
  
  async removeWorktree(
    worktreePath: string, 
    force: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if worktree is locked
      const lockFile = path.join(worktreePath, '.git', 'locked');
      if (await fs.pathExists(lockFile) && !force) {
        return { success: false, error: 'Worktree is locked' };
      }
      
      // Remove worktree
      const args = ['worktree', 'remove', worktreePath];
      if (force) args.push('--force');
      
      await this.git.raw(args);
      
      // Remove associated session
      const session = this.findSessionByPath(worktreePath);
      if (session) {
        await this.deleteSession(session.id);
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to remove worktree' 
      };
    }
  }
  
  async switchToWorktree(worktreePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify worktree exists
      if (!await fs.pathExists(worktreePath)) {
        return { success: false, error: 'Worktree path does not exist' };
      }
      
      // Update the active worktree path
      this.activeWorktreePath = worktreePath;
      
      // Ensure worktree has up-to-date configuration
      await this.setupWorktreeConfiguration(worktreePath);
      
      // Update session last accessed time
      const session = this.findSessionByPath(worktreePath);
      if (session) {
        session.lastAccessed = new Date();
        await this.saveSessions();
      }
      
      // Note: Actual directory switching would be handled by the IDE
      // This just validates and updates metadata
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to switch worktree' 
      };
    }
  }
  
  async compareWorktrees(
    path1: string, 
    path2: string
  ): Promise<{ success: boolean; comparison?: WorktreeComparisonResult; error?: string }> {
    try {
      const git1 = simpleGit(path1);
      const git2 = simpleGit(path2);
      
      // Get current branches
      const status1 = await git1.status();
      const status2 = await git2.status();
      
      // Get file differences
      const files1 = await this.getAllFiles(path1);
      const files2 = await this.getAllFiles(path2);
      
      const filesSet1 = new Set(files1);
      const filesSet2 = new Set(files2);
      
      const filesAdded = files2.filter(f => !filesSet1.has(f));
      const filesRemoved = files1.filter(f => !filesSet2.has(f));
      
      // Check modified files
      const filesModified: string[] = [];
      for (const file of files1) {
        if (filesSet2.has(file)) {
          const content1 = await fs.readFile(path.join(path1, file), 'utf-8');
          const content2 = await fs.readFile(path.join(path2, file), 'utf-8');
          if (content1 !== content2) {
            filesModified.push(file);
          }
        }
      }
      
      // Compare commits
      const log1 = await git1.log();
      const log2 = await git2.log();
      
      const comparison: WorktreeComparisonResult = {
        filesAdded,
        filesRemoved,
        filesModified,
        commits: {
          ahead: status1.ahead,
          behind: status1.behind,
          diverged: status1.ahead > 0 && status1.behind > 0
        }
      };
      
      return { success: true, comparison };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to compare worktrees' 
      };
    }
  }
  
  async lockWorktree(worktreePath: string, lock: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const lockFile = path.join(worktreePath, '.git', 'locked');
      
      if (lock) {
        await fs.writeFile(lockFile, `Locked at ${new Date().toISOString()}`);
      } else {
        await fs.remove(lockFile);
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to lock/unlock worktree' 
      };
    }
  }
  
  async pruneWorktrees(): Promise<{ success: boolean; pruned?: number; error?: string }> {
    try {
      // Get list before pruning
      const before = await this.listWorktrees();
      const beforeCount = before.worktrees?.length || 0;
      
      // Prune worktrees
      await this.git.raw(['worktree', 'prune']);
      
      // Get list after pruning
      const after = await this.listWorktrees();
      const afterCount = after.worktrees?.length || 0;
      
      const pruned = beforeCount - afterCount;
      
      return { success: true, pruned };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to prune worktrees' 
      };
    }
  }
  
  // Session management
  async createSession(sessionData: {
    name: string;
    worktreePath: string;
    branchName: string;
    metadata?: any;
  }): Promise<{ success: boolean; session?: WorktreeSession; error?: string }> {
    try {
      const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Get worktree info
      const worktrees = await this.listWorktrees();
      const worktree = worktrees.worktrees?.find(w => w.path === sessionData.worktreePath);
      
      if (!worktree) {
        return { success: false, error: 'Worktree not found' };
      }
      
      const session: WorktreeSession = {
        id,
        name: sessionData.name,
        worktree,
        created: new Date(),
        lastAccessed: new Date(),
        metadata: sessionData.metadata || {}
      };
      
      this.sessions.set(id, session);
      await this.saveSessions();
      
      return { success: true, session };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create session' 
      };
    }
  }
  
  async listSessions(): Promise<{ success: boolean; sessions?: WorktreeSession[]; error?: string }> {
    try {
      const sessions = Array.from(this.sessions.values());
      
      // Update worktree status
      const worktrees = await this.listWorktrees();
      for (const session of sessions) {
        const currentWorktree = worktrees.worktrees?.find(
          w => w.path === session.worktree.path
        );
        if (currentWorktree) {
          session.worktree = currentWorktree;
        }
      }
      
      return { success: true, sessions };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to list sessions' 
      };
    }
  }
  
  async deleteSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      
      this.sessions.delete(sessionId);
      await this.saveSessions();
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete session' 
      };
    }
  }
  
  // Setup configuration for new worktree
  private async setupWorktreeConfiguration(worktreePath: string): Promise<void> {
    try {
      const mainClaudeDir = path.join(this.mainRepoPath, '.claude');
      const worktreeClaudeDir = path.join(worktreePath, '.claude');
      
      // Check if main workspace has .claude directory
      if (await fs.pathExists(mainClaudeDir)) {
        
        // Create .claude directory in worktree if it doesn't exist
        await fs.ensureDir(worktreeClaudeDir);
        
        // Copy configuration files (but not local settings)
        const filesToCopy = ['settings.json', 'hooks.json', 'tools.json'];
        
        for (const file of filesToCopy) {
          const sourcePath = path.join(mainClaudeDir, file);
          if (await fs.pathExists(sourcePath)) {
            const destPath = path.join(worktreeClaudeDir, file);
            await fs.copy(sourcePath, destPath, { overwrite: false });
          }
        }
        
        // For settings.local.json, we might want to create a symlink or copy based on preference
        const localSettingsSource = path.join(mainClaudeDir, 'settings.local.json');
        if (await fs.pathExists(localSettingsSource)) {
          const localSettingsDest = path.join(worktreeClaudeDir, 'settings.local.json');
          // Copy local settings as well (user can modify per-worktree if needed)
          await fs.copy(localSettingsSource, localSettingsDest, { overwrite: false });
        }
        
        // Also check for .mcp.json in the project root
        const mainMcpFile = path.join(this.mainRepoPath, '.mcp.json');
        if (await fs.pathExists(mainMcpFile)) {
          const worktreeMcpFile = path.join(worktreePath, '.mcp.json');
          await fs.copy(mainMcpFile, worktreeMcpFile, { overwrite: false });
        }
      }
    } catch (error) {
      console.warn('Failed to setup worktree configuration:', error);
      // Don't fail the worktree creation if configuration setup fails
    }
  }
  
  // Helper methods
  private parseWorktreeList(output: string): Worktree[] {
    const worktrees: Worktree[] = [];
    const lines = output.trim().split('\n');
    
    let currentWorktree: Partial<Worktree> = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as Worktree);
        }
        currentWorktree = {
          path: line.substring(9),
          isActive: false,
          isLocked: false,
          prunable: false
        };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.substring(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7);
      } else if (line === 'detached') {
        currentWorktree.branch = 'detached';
      } else if (line === 'prunable') {
        currentWorktree.prunable = true;
      }
    }
    
    if (currentWorktree.path) {
      worktrees.push(currentWorktree as Worktree);
    }
    
    // Mark the current worktree as active based on the current repo path
    const currentPath = this.mainRepoPath;
    for (const worktree of worktrees) {
      // Normalize paths for comparison
      const normalizedWorktreePath = path.resolve(worktree.path);
      const normalizedCurrentPath = path.resolve(currentPath);
      worktree.isActive = normalizedWorktreePath === normalizedCurrentPath;
    }
    
    return worktrees;
  }
  
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    // Default ignore patterns
    const ignorePatterns = [
      '.git',
      'node_modules',
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
    
    // Load .gitignore patterns
    const gitignorePath = path.join(dirPath, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      try {
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
        const lines = gitignoreContent.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith('#')) continue;
          
          // Add pattern if not already in list
          if (!ignorePatterns.includes(trimmedLine)) {
            ignorePatterns.push(trimmedLine);
          }
        }
      } catch (error) {
        console.warn('Failed to load .gitignore for comparison:', error);
      }
    }
    
    const shouldIgnore = (name: string): boolean => {
      return ignorePatterns.some(pattern => {
        if (pattern.includes('*')) {
          // Simple glob pattern matching
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(name);
        }
        return name === pattern || name.startsWith(pattern + '/');
      });
    };
    
    const walk = async (dir: string, base: string = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (shouldIgnore(entry.name)) continue;
        
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(base, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath, relativePath);
        } else {
          files.push(relativePath);
        }
      }
    };
    
    await walk(dirPath);
    return files;
  }
  
  private findSessionByPath(worktreePath: string): WorktreeSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.worktree.path === worktreePath) {
        return session;
      }
    }
    return undefined;
  }
  
  private async loadSessions(): Promise<void> {
    try {
      const sessionsFile = path.join(this.worktreesPath, 'sessions.json');
      if (await fs.pathExists(sessionsFile)) {
        const data = await fs.readJSON(sessionsFile);
        for (const session of data.sessions || []) {
          // Convert dates
          session.created = new Date(session.created);
          session.lastAccessed = new Date(session.lastAccessed);
          if (session.worktree.created) {
            session.worktree.created = new Date(session.worktree.created);
          }
          this.sessions.set(session.id, session);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }
  
  private async saveSessions(): Promise<void> {
    try {
      const sessionsFile = path.join(this.worktreesPath, 'sessions.json');
      const data = {
        sessions: Array.from(this.sessions.values()),
        updated: new Date().toISOString()
      };
      await fs.writeJSON(sessionsFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }
  
  // Method to set the active worktree path (useful when workspace changes)
  setActiveWorktreePath(path: string): void {
    this.activeWorktreePath = path;
  }
}