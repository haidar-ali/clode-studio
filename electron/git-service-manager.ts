import { ipcMain } from 'electron';
import simpleGit, { SimpleGit } from 'simple-git';
import { GitService } from './git-service.js';

/**
 * Global Git Service Manager that handles IPC communication
 * and delegates to workspace-specific GitService instances
 */
export class GitServiceManager {
  private static instance: GitServiceManager;
  private currentService: GitService | null = null;
  private currentWorkspacePath: string = '';
  
  private constructor() {
    this.setupIpcHandlers();
  }
  
  public static getInstance(): GitServiceManager {
    if (!GitServiceManager.instance) {
      GitServiceManager.instance = new GitServiceManager();
    }
    return GitServiceManager.instance;
  }
  
  public setWorkspace(workspacePath: string): GitService {
    // Update current workspace path
    this.currentWorkspacePath = workspacePath;
    
    
    // Create a new git service for this workspace
    this.currentService = new GitService(workspacePath);
    
    return this.currentService;
  }
  
  private setupIpcHandlers() {
    // Git status
    ipcMain.handle('git:status', async () => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const isRepo = await git.checkIsRepo();
        
        if (!isRepo) {
          return { success: false, error: 'Not a git repository' };
        }
        
        const status = await git.status();
        return { success: true, data: this.formatStatus(status) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git add
    ipcMain.handle('git:add', async (_, files: string[], customPath?: string) => {
      if (!this.currentService && !customPath) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        // Use custom path if provided (for shadow repos), otherwise use current workspace
        const repoPath = customPath || this.currentWorkspacePath;
        const git = simpleGit(repoPath);
        await git.add(files);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git reset (unstage)
    ipcMain.handle('git:reset', async (_, files: string[]) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        await git.reset(files);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git commit
    ipcMain.handle('git:commit', async (_, message: string, customPath?: string) => {
      if (!this.currentService && !customPath) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        // Use custom path if provided (for shadow repos), otherwise use current workspace
        const repoPath = customPath || this.currentWorkspacePath;
        const git = simpleGit(repoPath);
        const result = await git.commit(message);
        return { success: true, data: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git push
    ipcMain.handle('git:push', async (_, remote?: string, branch?: string) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        if (remote && branch) {
          await git.push(remote, branch);
        } else {
          await git.push();
        }
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git pull
    ipcMain.handle('git:pull', async (_, remote?: string, branch?: string) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        if (remote && branch) {
          await git.pull(remote, branch);
        } else {
          await git.pull();
        }
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get current branch
    ipcMain.handle('git:getCurrentBranch', async () => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
        return { success: true, data: branch.trim() };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get branches
    ipcMain.handle('git:getBranches', async () => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const branches = await git.branchLocal();
        return { success: true, data: this.formatBranches(branches) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Create branch
    ipcMain.handle('git:createBranch', async (_, name: string) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        await git.checkoutLocalBranch(name);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Switch branch
    ipcMain.handle('git:switchBranch', async (_, name: string) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        await git.checkout(name);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get log
    ipcMain.handle('git:getLog', async (_, limit: number = 50) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const log = await git.log({ maxCount: limit });
        return { success: true, data: this.formatLog(log) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get diff
    ipcMain.handle('git:diff', async (_, file?: string) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const diff = file ? await git.diff([file]) : await git.diff();
        return { success: true, data: diff };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get staged diff
    ipcMain.handle('git:diffStaged', async (_, file?: string) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const diff = file 
          ? await git.diff(['--cached', file]) 
          : await git.diff(['--cached']);
        return { success: true, data: diff };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Discard changes
    ipcMain.handle('git:discardChanges', async (_, files: string[]) => {
      if (!this.currentService) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        await git.checkout(files);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Initialize repository
    ipcMain.handle('git:init', async () => {
      if (!this.currentWorkspacePath) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        await git.init();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Clone repository
    ipcMain.handle('git:clone', async (_, url: string, localPath?: string) => {
      try {
        const targetPath = localPath || this.currentWorkspacePath;
        await simpleGit().clone(url, targetPath);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Check if repo exists
    ipcMain.handle('git:checkIsRepo', async () => {
      if (!this.currentWorkspacePath) {
        return { success: false, error: 'No workspace selected' };
      }
      
      try {
        const git = simpleGit(this.currentWorkspacePath);
        const isRepo = await git.checkIsRepo();
        return { success: true, data: isRepo };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private formatStatus(status: any): any {
    return {
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      deleted: status.deleted,
      renamed: status.renamed,
      untracked: status.not_added,
      conflicted: status.conflicted
    };
  }

  private formatBranches(branches: any): any[] {
    return Object.entries(branches.branches).map(([name, info]: [string, any]) => ({
      name,
      current: info.current,
      commit: info.commit,
      label: info.label
    }));
  }

  private formatLog(log: any): any[] {
    return log.all.map((commit: any) => ({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author_name: commit.author_name,
      author_email: commit.author_email
    }));
  }
}