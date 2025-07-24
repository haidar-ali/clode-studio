import { ipcMain } from 'electron';
import { GitHooksManager } from './git-hooks.js';
import type { HookOptions } from './git-hooks.js';

/**
 * Global Git Hooks Manager that handles IPC communication
 * and delegates to workspace-specific GitHooksManager instances
 */
export class GitHooksManagerGlobal {
  private static instance: GitHooksManagerGlobal;
  private currentManager: GitHooksManager | null = null;
  private currentWorkspacePath: string = '';
  private handlersSetup: boolean = false;
  
  private constructor() {
    console.log('[GitHooksManagerGlobal] Constructor called');
    // Setup handlers once and never remove them
    this.setupIpcHandlers();
    this.handlersSetup = true;
  }
  
  public static getInstance(): GitHooksManagerGlobal {
    if (!GitHooksManagerGlobal.instance) {
      console.log('[GitHooksManagerGlobal] Creating new instance');
      GitHooksManagerGlobal.instance = new GitHooksManagerGlobal();
    } else {
      console.log('[GitHooksManagerGlobal] Returning existing instance');
    }
    return GitHooksManagerGlobal.instance;
  }
  
  public setWorkspace(workspacePath: string): GitHooksManager | null {
    console.log('[GitHooksManagerGlobal] setWorkspace called with:', workspacePath);
    console.log('[GitHooksManagerGlobal] Previous workspace path was:', this.currentWorkspacePath);
    
    this.currentWorkspacePath = workspacePath;
    console.log('[GitHooksManagerGlobal] Updated currentWorkspacePath to:', this.currentWorkspacePath);
    
    try {
      // Create a new git hooks manager for this workspace
      // Pass false to prevent GitHooksManager from setting up its own IPC handlers
      console.log('[GitHooksManagerGlobal] Creating GitHooksManager for path:', workspacePath);
      this.currentManager = new GitHooksManager(workspacePath, false);
      
      console.log('[GitHooksManagerGlobal] GitHooksManager created successfully');
      console.log('[GitHooksManagerGlobal] Final currentWorkspacePath:', this.currentWorkspacePath);
      return this.currentManager;
    } catch (error) {
      console.error('[GitHooksManagerGlobal] Failed to create GitHooksManager:', error);
      this.currentManager = null;
      return null;
    }
  }
  
  private setupIpcHandlers() {
    // Prevent re-registration
    if (this.handlersSetup) {
      console.log('[GitHooksManagerGlobal] Handlers already set up, skipping');
      return;
    }
    
    console.log('[GitHooksManagerGlobal] Setting up IPC handlers');
    
    // Install hooks
    ipcMain.handle('git-hooks:install', async (event, options?: HookOptions) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.installHooks(options);
    });
    
    // Uninstall hooks
    ipcMain.handle('git-hooks:uninstall', async () => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.uninstallHooks();
    });
    
    // Get hooks status
    ipcMain.handle('git-hooks:status', async () => {
      console.log('[GitHooksManagerGlobal] git-hooks:status called');
      console.log('[GitHooksManagerGlobal] currentWorkspacePath:', this.currentWorkspacePath);
      console.log('[GitHooksManagerGlobal] currentManager exists:', !!this.currentManager);
      
      if (!this.currentManager) {
        if (this.currentWorkspacePath) {
          return { success: false, error: 'Git hooks not initialized for this workspace', hooks: {} };
        } else {
          return { success: false, error: 'No workspace selected', hooks: {} };
        }
      }
      
      try {
        return await this.currentManager.getHooksStatus();
      } catch (error) {
        console.error('[GitHooksManagerGlobal] Error getting hooks status:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get hooks status', hooks: {} };
      }
    });
    
    // Update hook
    ipcMain.handle('git-hooks:update', async (event, hookName: string, options: any) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.updateHook(hookName, options);
    });
    
    // Test hook
    ipcMain.handle('git-hooks:test', async (event, hookName: string) => {
      if (!this.currentManager) {
        return { success: false, error: 'No workspace selected' };
      }
      return await this.currentManager.testHook(hookName);
    });
  }
}