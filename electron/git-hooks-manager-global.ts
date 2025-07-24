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
    // Setup handlers once and never remove them
    this.setupIpcHandlers();
    this.handlersSetup = true;
  }
  
  public static getInstance(): GitHooksManagerGlobal {
    if (!GitHooksManagerGlobal.instance) {
      GitHooksManagerGlobal.instance = new GitHooksManagerGlobal();
    }
    return GitHooksManagerGlobal.instance;
  }
  
  public setWorkspace(workspacePath: string): GitHooksManager | null {
    this.currentWorkspacePath = workspacePath;
    
    try {
      // Create a new git hooks manager for this workspace
      // Pass false to prevent GitHooksManager from setting up its own IPC handlers
      this.currentManager = new GitHooksManager(workspacePath, false);
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
      return;
    }
    
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