/**
 * Git operations service interface
 * Abstracts Git commands and repository management
 */
export interface IGitService {
  // Repository info
  getCurrentBranch(): Promise<string>;
  getRemotes(): Promise<GitRemote[]>;
  getStatus(): Promise<GitStatus>;
  isRepository(path: string): Promise<boolean>;
  
  // Branch operations
  getBranches(): Promise<GitBranch[]>;
  createBranch(name: string, fromBranch?: string): Promise<void>;
  switchBranch(name: string): Promise<void>;
  deleteBranch(name: string, force?: boolean): Promise<void>;
  
  // Commit operations
  getCommitHistory(limit?: number): Promise<GitCommit[]>;
  commit(message: string, files?: string[]): Promise<string>;
  getFileDiff(filePath: string, staged?: boolean): Promise<string>;
  
  // Stage/unstage operations
  stageFiles(files: string[]): Promise<void>;
  unstageFiles(files: string[]): Promise<void>;
  
  // Remote operations
  fetch(remote?: string): Promise<void>;
  pull(remote?: string, branch?: string): Promise<void>;
  push(remote?: string, branch?: string): Promise<void>;
  
  // Stash operations
  stash(message?: string): Promise<void>;
  stashPop(): Promise<void>;
  stashList(): Promise<GitStash[]>;
  
  // Worktree operations (if supported)
  getWorktrees(): Promise<GitWorktree[]>;
  addWorktree(path: string, branch: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
}

export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
}

export interface GitFileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string; // For renamed files
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  lastCommit?: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: Date;
  files: string[];
}

export interface GitStash {
  index: number;
  message: string;
  date: Date;
}

export interface GitWorktree {
  path: string;
  branch: string;
  head: string;
  locked: boolean;
}