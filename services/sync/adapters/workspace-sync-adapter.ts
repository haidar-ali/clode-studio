/**
 * Workspace Sync Adapter
 * Synchronizes workspace state (open files, layout, etc.)
 */
import type { SyncableState } from '../sync-engine.js';
import { createHash } from 'crypto';

export interface WorkspaceState {
  openFiles: Array<{
    path: string;
    active: boolean;
    cursorPosition?: { line: number; column: number };
    scrollPosition?: number;
  }>;
  layout: {
    leftDockWidth: number;
    rightDockWidth: number;
    bottomDockHeight: number;
    activeModule: string;
    moduleStates: Record<string, any>;
  };
  terminal: {
    activeTerminalId?: string;
    terminalStates: Array<{
      id: string;
      cwd: string;
      history: string[];
    }>;
  };
  git: {
    currentBranch: string;
    stagedFiles: string[];
  };
}

export class WorkspaceSyncAdapter {
  private currentVersion: number = 1;
  private workspaceId: string;
  
  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }
  
  /**
   * Convert workspace state to syncable format
   */
  toSyncable(state: WorkspaceState): SyncableState {
    return {
      id: this.workspaceId,
      type: 'workspace',
      version: this.currentVersion++,
      lastModified: new Date(),
      data: state,
      checksum: this.calculateChecksum(state)
    };
  }
  
  /**
   * Convert from syncable format to workspace state
   */
  fromSyncable(syncable: SyncableState): WorkspaceState {
    return syncable.data as WorkspaceState;
  }
  
  /**
   * Calculate checksum for state verification
   */
  private calculateChecksum(state: WorkspaceState): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(state));
    return hash.digest('hex');
  }
  
  /**
   * Merge workspace states (for conflict resolution)
   */
  merge(local: WorkspaceState, remote: WorkspaceState): WorkspaceState {
    return {
      // Merge open files - union of both
      openFiles: this.mergeOpenFiles(local.openFiles, remote.openFiles),
      
      // Layout - prefer local as it's UI preference
      layout: local.layout,
      
      // Terminal - merge states
      terminal: {
        activeTerminalId: local.terminal.activeTerminalId || remote.terminal.activeTerminalId,
        terminalStates: this.mergeTerminalStates(
          local.terminal.terminalStates,
          remote.terminal.terminalStates
        )
      },
      
      // Git - prefer remote as it's more likely to be accurate
      git: remote.git
    };
  }
  
  /**
   * Merge open files lists
   */
  private mergeOpenFiles(
    local: WorkspaceState['openFiles'],
    remote: WorkspaceState['openFiles']
  ): WorkspaceState['openFiles'] {
    const fileMap = new Map<string, WorkspaceState['openFiles'][0]>();
    
    // Add remote files first
    remote.forEach(file => {
      fileMap.set(file.path, file);
    });
    
    // Override with local files (local takes precedence for cursor position)
    local.forEach(file => {
      const existing = fileMap.get(file.path);
      if (existing) {
        // Keep local cursor/scroll position
        fileMap.set(file.path, {
          ...existing,
          cursorPosition: file.cursorPosition || existing.cursorPosition,
          scrollPosition: file.scrollPosition || existing.scrollPosition,
          active: file.active || existing.active
        });
      } else {
        fileMap.set(file.path, file);
      }
    });
    
    return Array.from(fileMap.values());
  }
  
  /**
   * Merge terminal states
   */
  private mergeTerminalStates(
    local: WorkspaceState['terminal']['terminalStates'],
    remote: WorkspaceState['terminal']['terminalStates']
  ): WorkspaceState['terminal']['terminalStates'] {
    const terminalMap = new Map<string, WorkspaceState['terminal']['terminalStates'][0]>();
    
    // Add all remote terminals
    remote.forEach(term => {
      terminalMap.set(term.id, term);
    });
    
    // Add/update with local terminals
    local.forEach(term => {
      const existing = terminalMap.get(term.id);
      if (existing) {
        // Merge histories
        const mergedHistory = [...new Set([...existing.history, ...term.history])];
        terminalMap.set(term.id, {
          ...term,
          history: mergedHistory.slice(-100) // Keep last 100 commands
        });
      } else {
        terminalMap.set(term.id, term);
      }
    });
    
    return Array.from(terminalMap.values());
  }
}