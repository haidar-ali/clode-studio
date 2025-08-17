/**
 * Worktree Manager - Manages isolated Git worktrees for safe agent execution
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { execa } from 'execa';
import { createHash } from 'crypto';

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  head: string;
  locked: boolean;
  prunable: boolean;
}

export interface WorktreeChanges {
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}

export interface AgentDefinition {
  id: string;
  name?: string;
  type?: string;
}

export interface Task {
  id: string;
  projectId?: string;
}

export class WorktreeManager {
  private workspacePath: string;
  private worktreesDir: string;
  private activeWorktrees = new Map<string, WorktreeInfo>();
  private lockFiles = new Map<string, number>();
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.worktreesDir = path.join(workspacePath, '.worktrees');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.worktreesDir);
    
    // Clean up any orphaned worktrees
    await this.cleanupOrphaned();
  }
  
  async createAgentWorktree(
    agent: AgentDefinition,
    task: Task
  ): Promise<WorktreeInfo> {
    const worktreeName = this.generateWorktreeName(agent, task);
    const worktreePath = path.join(this.worktreesDir, worktreeName);
    const branch = `agent/${agent.id}/${task.id}`;
    
    // Check if worktree already exists
    const existing = await this.getWorktree(worktreeName);
    if (existing) {
      console.log(`[Worktree] Reusing existing worktree: ${worktreeName}`);
      this.activeWorktrees.set(agent.id, existing);
      return existing;
    }
    
    try {
      // Create new branch from current HEAD
      await execa('git', ['branch', branch], { 
        cwd: this.workspacePath,
        reject: false // Don't throw if branch exists
      });
      
      // Create worktree
      await execa('git', ['worktree', 'add', worktreePath, branch], {
        cwd: this.workspacePath
      });
      
      console.log(`[Worktree] Created worktree: ${worktreeName} at ${worktreePath}`);
      
      // Copy Claude settings and necessary configs
      await this.copySettings(worktreePath);
      
      // Get worktree info
      const info = await this.getWorktreeInfo(worktreePath);
      
      // Track active worktree
      this.activeWorktrees.set(agent.id, info);
      
      // Lock worktree to prevent accidental removal
      await this.lockWorktree(worktreeName);
      
      return info;
      
    } catch (error: any) {
      console.error(`[Worktree] Failed to create worktree: ${error.message}`);
      
      // Clean up on failure
      await this.removeWorktree(worktreeName);
      throw error;
    }
  }
  
  async executeInWorktree<T>(
    agentId: string,
    execution: (worktreePath: string) => Promise<T>
  ): Promise<T> {
    const worktree = this.activeWorktrees.get(agentId);
    if (!worktree) {
      throw new Error(`No active worktree for agent ${agentId}`);
    }
    
    // Ensure worktree is still valid
    if (!await fs.pathExists(worktree.path)) {
      throw new Error(`Worktree path does not exist: ${worktree.path}`);
    }
    
    try {
      // Execute in isolated environment
      // Note: We pass the path instead of changing process.cwd() to avoid concurrency issues
      const result = await execution(worktree.path);
      
      return result;
      
    } catch (error) {
      console.error(`[Worktree] Execution failed in ${worktree.name}:`, error);
      throw error;
    }
  }
  
  async captureChanges(worktree: WorktreeInfo): Promise<WorktreeChanges> {
    const changes: WorktreeChanges = {
      added: [],
      modified: [],
      deleted: [],
      renamed: []
    };
    
    try {
      // Get git status in porcelain format
      const { stdout } = await execa('git', ['status', '--porcelain=v1'], {
        cwd: worktree.path
      });
      
      const lines = stdout.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        
        switch (status.trim()) {
          case 'A':
          case '??':
            changes.added.push(file);
            break;
          case 'M':
          case 'MM':
            changes.modified.push(file);
            break;
          case 'D':
            changes.deleted.push(file);
            break;
          case 'R':
            const parts = file.split(' -> ');
            if (parts.length === 2) {
              changes.renamed.push({ from: parts[0], to: parts[1] });
            }
            break;
        }
      }
      
      return changes;
      
    } catch (error) {
      console.error(`[Worktree] Failed to capture changes:`, error);
      return changes;
    }
  }
  
  async createDiff(worktree: WorktreeInfo): Promise<string> {
    try {
      // Get diff between worktree and main branch
      const { stdout } = await execa('git', [
        'diff',
        'HEAD...',
        '--unified=3'
      ], {
        cwd: worktree.path
      });
      
      return stdout;
      
    } catch (error) {
      console.error(`[Worktree] Failed to create diff:`, error);
      return '';
    }
  }
  
  async commitChanges(
    worktree: WorktreeInfo,
    message: string,
    author?: string
  ): Promise<string> {
    try {
      // Stage all changes
      await execa('git', ['add', '-A'], {
        cwd: worktree.path
      });
      
      // Commit with message
      const args = ['commit', '-m', message];
      if (author) {
        args.push('--author', author);
      }
      
      const { stdout } = await execa('git', args, {
        cwd: worktree.path
      });
      
      // Get commit hash
      const { stdout: hash } = await execa('git', ['rev-parse', 'HEAD'], {
        cwd: worktree.path
      });
      
      return hash.trim();
      
    } catch (error: any) {
      if (error.stdout?.includes('nothing to commit')) {
        console.log('[Worktree] No changes to commit');
        return '';
      }
      throw error;
    }
  }
  
  async mergeToMain(
    worktree: WorktreeInfo,
    squash: boolean = true
  ): Promise<boolean> {
    try {
      // Switch to main branch in main worktree
      await execa('git', ['checkout', 'main'], {
        cwd: this.workspacePath
      });
      
      // Merge worktree branch
      const args = ['merge', worktree.branch];
      if (squash) {
        args.push('--squash');
      }
      
      await execa('git', args, {
        cwd: this.workspacePath
      });
      
      return true;
      
    } catch (error) {
      console.error(`[Worktree] Failed to merge to main:`, error);
      return false;
    }
  }
  
  async stashWorktree(worktree: WorktreeInfo): Promise<string> {
    try {
      const { stdout } = await execa('git', [
        'stash',
        'push',
        '-m',
        `Agent worktree: ${worktree.name}`
      ], {
        cwd: worktree.path
      });
      
      // Get stash reference
      const { stdout: stashRef } = await execa('git', [
        'stash',
        'list',
        '-n',
        '1',
        '--format=%H'
      ], {
        cwd: worktree.path
      });
      
      return stashRef.trim();
      
    } catch (error) {
      console.error(`[Worktree] Failed to stash:`, error);
      return '';
    }
  }
  
  async cleanupWorktree(agentId: string): Promise<void> {
    const worktree = this.activeWorktrees.get(agentId);
    if (!worktree) {
      return;
    }
    
    try {
      // Stash any uncommitted changes
      await this.stashWorktree(worktree);
      
      // Unlock worktree
      await this.unlockWorktree(worktree.name);
      
      // Remove worktree
      await this.removeWorktree(worktree.name);
      
      // Remove from active list
      this.activeWorktrees.delete(agentId);
      
      console.log(`[Worktree] Cleaned up worktree: ${worktree.name}`);
      
    } catch (error) {
      console.error(`[Worktree] Failed to cleanup:`, error);
    }
  }
  
  private async copySettings(worktreePath: string): Promise<void> {
    const filesToCopy = [
      '.claude/CLAUDE.md',
      '.claude/RULES.md',
      '.vscode/settings.json',
      '.env.local',
      'package.json',
      'tsconfig.json'
    ];
    
    for (const file of filesToCopy) {
      const sourcePath = path.join(this.workspacePath, file);
      const destPath = path.join(worktreePath, file);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourcePath, destPath);
      }
    }
  }
  
  private async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo> {
    const name = path.basename(worktreePath);
    
    // Get branch name
    const { stdout: branch } = await execa('git', ['branch', '--show-current'], {
      cwd: worktreePath
    });
    
    // Get HEAD commit
    const { stdout: head } = await execa('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath
    });
    
    return {
      name,
      path: worktreePath,
      branch: branch.trim(),
      head: head.trim(),
      locked: this.lockFiles.has(name),
      prunable: false
    };
  }
  
  private async getWorktree(name: string): Promise<WorktreeInfo | null> {
    try {
      const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.workspacePath
      });
      
      const worktrees = this.parseWorktreeList(stdout);
      return worktrees.find(w => w.name === name) || null;
      
    } catch (error) {
      return null;
    }
  }
  
  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const lines = output.split('\n');
    
    let current: Partial<WorktreeInfo> = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = {
          path: line.substring(9),
          name: path.basename(line.substring(9)),
          locked: false,
          prunable: false
        };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
      } else if (line === 'locked') {
        current.locked = true;
      } else if (line === 'prunable') {
        current.prunable = true;
      }
    }
    
    if (current.path) {
      worktrees.push(current as WorktreeInfo);
    }
    
    return worktrees;
  }
  
  private async removeWorktree(name: string): Promise<void> {
    try {
      await execa('git', ['worktree', 'remove', name, '--force'], {
        cwd: this.workspacePath
      });
    } catch (error) {
      // Ignore errors - worktree might not exist
    }
  }
  
  private async lockWorktree(name: string): Promise<void> {
    const lockFile = path.join(this.worktreesDir, `${name}.lock`);
    const pid = process.pid;
    
    await fs.writeFile(lockFile, String(pid));
    this.lockFiles.set(name, pid);
  }
  
  private async unlockWorktree(name: string): Promise<void> {
    const lockFile = path.join(this.worktreesDir, `${name}.lock`);
    
    try {
      await fs.remove(lockFile);
      this.lockFiles.delete(name);
    } catch {
      // Ignore errors
    }
  }
  
  private async cleanupOrphaned(): Promise<void> {
    try {
      // Prune worktrees that no longer exist
      await execa('git', ['worktree', 'prune'], {
        cwd: this.workspacePath
      });
      
      // Clean up lock files for dead processes
      const lockFiles = await fs.readdir(this.worktreesDir);
      
      for (const file of lockFiles) {
        if (file.endsWith('.lock')) {
          const lockPath = path.join(this.worktreesDir, file);
          const pidStr = await fs.readFile(lockPath, 'utf-8');
          const pid = parseInt(pidStr);
          
          // Check if process is still alive
          if (!this.isProcessAlive(pid)) {
            await fs.remove(lockPath);
            console.log(`[Worktree] Removed orphaned lock: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('[Worktree] Cleanup failed:', error);
    }
  }
  
  private isProcessAlive(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  
  private generateWorktreeName(agent: AgentDefinition, task: Task): string {
    const timestamp = Date.now();
    const hash = createHash('sha256')
      .update(`${agent.id}-${task.id}-${timestamp}`)
      .digest('hex')
      .slice(0, 6);
    
    return `agent-${agent.id}-${hash}`;
  }
  
  async getAllWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.workspacePath
      });
      
      return this.parseWorktreeList(stdout);
    } catch (error) {
      return [];
    }
  }
  
  async getActiveWorktrees(): Map<string, WorktreeInfo> {
    return this.activeWorktrees;
  }
}