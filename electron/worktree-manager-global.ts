import { ipcMain } from 'electron';
import { WorktreeManager } from './worktree-manager.js';

/**
 * Global Worktree Manager that handles IPC communication
 * and delegates to workspace-specific WorktreeManager instances
 */
export class WorktreeManagerGlobal {
  private static instance: WorktreeManagerGlobal;
  private currentManager: WorktreeManager | null = null;
  private currentWorkspacePath: string = '';
  private handlersSetup: boolean = false;
  
  private constructor() {
    console.log('[WorktreeManagerGlobal] Constructor called');
    // Setup handlers once and never remove them
    this.setupIpcHandlers();
    this.handlersSetup = true;
  }
  
  public static getInstance(): WorktreeManagerGlobal {
    if (!WorktreeManagerGlobal.instance) {
      console.log('[WorktreeManagerGlobal] Creating new instance');
      WorktreeManagerGlobal.instance = new WorktreeManagerGlobal();
    } else {
      console.log('[WorktreeManagerGlobal] Returning existing instance');
    }
    return WorktreeManagerGlobal.instance;
  }
  
  public setWorkspace(workspacePath: string): WorktreeManager | null {
    console.log('[WorktreeManagerGlobal] setWorkspace called with:', workspacePath);
    console.log('[WorktreeManagerGlobal] Previous workspace path was:', this.currentWorkspacePath);
    
    this.currentWorkspacePath = workspacePath;
    console.log('[WorktreeManagerGlobal] Updated currentWorkspacePath to:', this.currentWorkspacePath);
    
    // Don't remove/re-add handlers - they're set up once in constructor
    
    try {
      // Create a new worktree manager for this workspace
      // Pass false to prevent WorktreeManager from setting up its own IPC handlers
      console.log('[WorktreeManagerGlobal] Creating WorktreeManager for path:', workspacePath);
      this.currentManager = new WorktreeManager(workspacePath, false);
      
      console.log('[WorktreeManagerGlobal] WorktreeManager created successfully');
      console.log('[WorktreeManagerGlobal] Final currentWorkspacePath:', this.currentWorkspacePath);
      return this.currentManager;
    } catch (error) {
      console.error('[WorktreeManagerGlobal] Failed to create WorktreeManager:', error);
      this.currentManager = null;
      return null;
    }
  }
  
  private removeExistingHandlers() {
    const handlers = [
      'worktree:list', 'worktree:create', 'worktree:remove',
      'worktree:switch', 'worktree:compare', 'worktree:sessions',
      'worktree:createSession', 'worktree:deleteSession',
      'worktree:lock', 'worktree:prune'
    ];
    
    console.log('[WorktreeManagerGlobal] Removing existing handlers');
    handlers.forEach(channel => {
      ipcMain.removeHandler(channel);
    });
  }
  
  private setupIpcHandlers() {
    // Prevent re-registration
    if (this.handlersSetup) {
      console.log('[WorktreeManagerGlobal] Handlers already set up, skipping');
      return;
    }
    
    console.log('[WorktreeManagerGlobal] Setting up IPC handlers');
    
    // List all worktrees
    ipcMain.handle('worktree:list', async () => {
      console.log('[WorktreeManagerGlobal] worktree:list called');
      console.log('[WorktreeManagerGlobal] currentWorkspacePath:', this.currentWorkspacePath);
      console.log('[WorktreeManagerGlobal] currentManager exists:', !!this.currentManager);
      
      // If no manager, try to create one if we have a workspace path
      if (!this.currentManager && this.currentWorkspacePath) {
        console.log('[WorktreeManagerGlobal] No manager but have workspace, attempting to create one');
        this.setWorkspace(this.currentWorkspacePath);
      }
      
      if (!this.currentManager) {
        if (this.currentWorkspacePath) {
          return { success: false, error: 'Not a git repository or git worktree feature not available', worktrees: [] };
        } else {
          return { success: false, error: 'No workspace selected', worktrees: [] };
        }
      }
      
      try {
        return await this.currentManager.listWorktrees();
      } catch (error) {
        console.error('[WorktreeManagerGlobal] Error listing worktrees:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list worktrees', worktrees: [] };
      }
    });
    
    // Create new worktree
    ipcMain.handle('worktree:create', async (event, branchName, sessionName, sessionDescription) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.createWorktree(branchName, sessionName, sessionDescription);
    });
    
    // Remove worktree
    ipcMain.handle('worktree:remove', async (event, worktreePath, force) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.removeWorktree(worktreePath, force);
    });
    
    // Switch to worktree
    ipcMain.handle('worktree:switch', async (event, worktreePath) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.switchToWorktree(worktreePath);
    });
    
    // Compare worktrees
    ipcMain.handle('worktree:compare', async (event, path1, path2) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.compareWorktrees(path1, path2);
    });
    
    // List sessions
    ipcMain.handle('worktree:sessions', async () => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.listSessions();
    });
    
    // Create session
    ipcMain.handle('worktree:createSession', async (event, sessionData) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.createSession(sessionData);
    });
    
    // Delete session
    ipcMain.handle('worktree:deleteSession', async (event, sessionId) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.deleteSession(sessionId);
    });
    
    // Lock/unlock worktree
    ipcMain.handle('worktree:lock', async (event, worktreePath, lock) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.lockWorktree(worktreePath, lock);
    });
    
    // Prune worktrees
    ipcMain.handle('worktree:prune', async () => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.pruneWorktrees();
    });
  }
}