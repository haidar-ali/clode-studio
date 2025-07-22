import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult, DiffResult, CommitResult } from 'simple-git';
import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
  untracked: string[];
  conflicted: string[];
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  label?: string;
}

export class GitService {
  private git: SimpleGit;
  private repoPath: string;
  private initialized: boolean = false;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.setupIpcHandlers();
    this.checkGitRepo();
  }

  private async checkGitRepo() {
    try {
      const isRepo = await this.git.checkIsRepo();
      this.initialized = isRepo;
      if (!isRepo) {
        console.warn(`Path ${this.repoPath} is not a git repository`);
      }
    } catch (error) {
      console.error('Error checking git repository:', error);
      this.initialized = false;
    }
  }

  private setupIpcHandlers() {
    // Git status
    ipcMain.handle('git:status', async () => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const status = await this.git.status();
        return { success: true, data: this.formatStatus(status) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git add
    ipcMain.handle('git:add', async (_, files: string[]) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        await this.git.add(files);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git reset (unstage)
    ipcMain.handle('git:reset', async (_, files: string[]) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        await this.git.reset(files);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git commit
    ipcMain.handle('git:commit', async (_, message: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const result = await this.git.commit(message);
        return { success: true, data: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git push
    ipcMain.handle('git:push', async (_, remote?: string, branch?: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        if (remote && branch) {
          await this.git.push(remote, branch);
        } else {
          await this.git.push();
        }
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Git pull
    ipcMain.handle('git:pull', async (_, remote?: string, branch?: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        if (remote && branch) {
          await this.git.pull(remote, branch);
        } else {
          await this.git.pull();
        }
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get current branch
    ipcMain.handle('git:getCurrentBranch', async () => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
        return { success: true, data: branch.trim() };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get branches
    ipcMain.handle('git:getBranches', async () => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const branches = await this.git.branchLocal();
        return { success: true, data: this.formatBranches(branches) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Create branch
    ipcMain.handle('git:createBranch', async (_, name: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        await this.git.checkoutLocalBranch(name);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Switch branch
    ipcMain.handle('git:switchBranch', async (_, name: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        await this.git.checkout(name);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get log
    ipcMain.handle('git:getLog', async (_, limit: number = 50) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const log = await this.git.log({ maxCount: limit });
        return { success: true, data: this.formatLog(log) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get diff
    ipcMain.handle('git:diff', async (_, file?: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const diff = file ? await this.git.diff([file]) : await this.git.diff();
        return { success: true, data: diff };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get staged diff
    ipcMain.handle('git:diffStaged', async (_, file?: string) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        const diff = file 
          ? await this.git.diff(['--cached', file]) 
          : await this.git.diff(['--cached']);
        return { success: true, data: diff };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Discard changes
    ipcMain.handle('git:discardChanges', async (_, files: string[]) => {
      try {
        if (!this.initialized) {
          return { success: false, error: 'Not a git repository' };
        }
        await this.git.checkout(files);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Initialize repository
    ipcMain.handle('git:init', async () => {
      try {
        await this.git.init();
        this.initialized = true;
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Clone repository
    ipcMain.handle('git:clone', async (_, url: string, localPath?: string) => {
      try {
        const targetPath = localPath || this.repoPath;
        await simpleGit().clone(url, targetPath);
        this.git = simpleGit(targetPath);
        this.repoPath = targetPath;
        this.initialized = true;
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Check if repo exists
    ipcMain.handle('git:checkIsRepo', async () => {
      try {
        const isRepo = await this.git.checkIsRepo();
        return { success: true, data: isRepo };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private formatStatus(status: StatusResult): GitStatus {
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

  private formatBranches(branches: BranchSummary): BranchInfo[] {
    return Object.entries(branches.branches).map(([name, info]) => ({
      name,
      current: info.current,
      commit: info.commit,
      label: info.label
    }));
  }

  private formatLog(log: LogResult): GitCommit[] {
    return log.all.map(commit => ({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author_name: commit.author_name,
      author_email: commit.author_email
    }));
  }

  public updateRepoPath(newPath: string) {
    this.repoPath = newPath;
    this.git = simpleGit(newPath);
    this.checkGitRepo();
  }

  public cleanup() {
    // Remove all IPC handlers
    ipcMain.removeHandler('git:status');
    ipcMain.removeHandler('git:add');
    ipcMain.removeHandler('git:reset');
    ipcMain.removeHandler('git:commit');
    ipcMain.removeHandler('git:push');
    ipcMain.removeHandler('git:pull');
    ipcMain.removeHandler('git:getCurrentBranch');
    ipcMain.removeHandler('git:getBranches');
    ipcMain.removeHandler('git:createBranch');
    ipcMain.removeHandler('git:switchBranch');
    ipcMain.removeHandler('git:getLog');
    ipcMain.removeHandler('git:diff');
    ipcMain.removeHandler('git:diffStaged');
    ipcMain.removeHandler('git:discardChanges');
    ipcMain.removeHandler('git:init');
    ipcMain.removeHandler('git:clone');
    ipcMain.removeHandler('git:checkIsRepo');
  }
}