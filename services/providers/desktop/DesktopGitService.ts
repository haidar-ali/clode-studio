/**
 * Desktop Git service implementation
 * Wraps existing Electron Git IPC APIs
 */
import type {
  IGitService,
  GitRemote,
  GitStatus,
  GitFileStatus,
  GitBranch,
  GitCommit,
  GitStash,
  GitWorktree
} from '../../interfaces';

export class DesktopGitService implements IGitService {
  // Repository info
  async getCurrentBranch(): Promise<string> {
    return window.electronAPI.git.getCurrentBranch();
  }
  
  async getRemotes(): Promise<GitRemote[]> {
    // Current API doesn't expose remotes directly
    // Would need to parse from git config or enhance API
    return [];
  }
  
  async getStatus(): Promise<GitStatus> {
    const status = await window.electronAPI.git.status();
    
    // Map to our interface format
    return {
      branch: status.branch || '',
      ahead: status.ahead || 0,
      behind: status.behind || 0,
      staged: status.staged?.map((file: any) => ({
        path: file.path,
        status: this.mapGitStatus(file.status),
        oldPath: file.oldPath
      })) || [],
      unstaged: status.modified?.map((file: any) => ({
        path: file.path,
        status: this.mapGitStatus(file.status)
      })) || [],
      untracked: status.untracked || []
    };
  }
  
  async isRepository(path: string): Promise<boolean> {
    return window.electronAPI.git.checkIsRepo();
  }
  
  // Branch operations
  async getBranches(): Promise<GitBranch[]> {
    const branches = await window.electronAPI.git.getBranches();
    const currentBranch = await this.getCurrentBranch();
    
    return branches.map((branch: string) => ({
      name: branch,
      current: branch === currentBranch,
      remote: branch.includes('origin/') ? 'origin' : undefined
    }));
  }
  
  async createBranch(name: string, fromBranch?: string): Promise<void> {
    if (fromBranch && fromBranch !== await this.getCurrentBranch()) {
      await this.switchBranch(fromBranch);
    }
    return window.electronAPI.git.createBranch(name);
  }
  
  async switchBranch(name: string): Promise<void> {
    return window.electronAPI.git.switchBranch(name);
  }
  
  async deleteBranch(name: string, force?: boolean): Promise<void> {
    // Current API doesn't have delete branch
    // Would need to enhance or use workaround
    throw new Error('Branch deletion not implemented in desktop mode');
  }
  
  // Commit operations
  async getCommitHistory(limit?: number): Promise<GitCommit[]> {
    const logs = await window.electronAPI.git.getLog(limit);
    
    return logs.map((log: any) => ({
      hash: log.hash,
      message: log.message,
      author: log.author,
      date: new Date(log.date),
      files: log.files || []
    }));
  }
  
  async commit(message: string, files?: string[]): Promise<string> {
    if (files) {
      await window.electronAPI.git.add(files);
    }
    await window.electronAPI.git.commit(message);
    
    // Get the latest commit hash
    const logs = await window.electronAPI.git.getLog(1);
    return logs[0]?.hash || '';
  }
  
  async getFileDiff(filePath: string, staged?: boolean): Promise<string> {
    if (staged) {
      return window.electronAPI.git.diffStaged(filePath);
    }
    return window.electronAPI.git.diff(filePath);
  }
  
  // Stage/unstage operations
  async stageFiles(files: string[]): Promise<void> {
    return window.electronAPI.git.add(files);
  }
  
  async unstageFiles(files: string[]): Promise<void> {
    return window.electronAPI.git.reset(files);
  }
  
  // Remote operations
  async fetch(remote?: string): Promise<void> {
    // Current API doesn't have fetch
    // Would need to enhance
    throw new Error('Fetch not implemented in desktop mode');
  }
  
  async pull(remote?: string, branch?: string): Promise<void> {
    return window.electronAPI.git.pull(remote, branch);
  }
  
  async push(remote?: string, branch?: string): Promise<void> {
    return window.electronAPI.git.push(remote, branch);
  }
  
  // Stash operations
  async stash(message?: string): Promise<void> {
    return window.electronAPI.git.stash(message);
  }
  
  async stashPop(): Promise<void> {
    // Current API doesn't have stash pop
    throw new Error('Stash pop not implemented in desktop mode');
  }
  
  async stashList(): Promise<GitStash[]> {
    // Current API doesn't list stashes
    return [];
  }
  
  // Worktree operations
  async getWorktrees(): Promise<GitWorktree[]> {
    const worktrees = await window.electronAPI.worktree.list();
    
    return worktrees.map((wt: any) => ({
      path: wt.path,
      branch: wt.branch,
      head: wt.head,
      locked: wt.locked || false
    }));
  }
  
  async addWorktree(path: string, branch: string): Promise<void> {
    await window.electronAPI.worktree.create(branch);
  }
  
  async removeWorktree(path: string): Promise<void> {
    await window.electronAPI.worktree.remove(path);
  }
  
  // Helper methods
  private mapGitStatus(status: string): GitFileStatus['status'] {
    const statusMap: Record<string, GitFileStatus['status']> = {
      'A': 'added',
      'M': 'modified',
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied'
    };
    return statusMap[status] || 'modified';
  }
}