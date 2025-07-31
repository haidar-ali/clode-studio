import { ipcMain } from 'electron';
import { WorktreeManager } from './worktree-manager.js';
/**
 * Global Worktree Manager that handles IPC communication
 * and delegates to workspace-specific WorktreeManager instances
 */
export class WorktreeManagerGlobal {
    static instance;
    currentManager = null;
    currentWorkspacePath = '';
    handlersSetup = false;
    constructor() {
        // Setup handlers once and never remove them
        this.setupIpcHandlers();
        this.handlersSetup = true;
    }
    static getInstance() {
        if (!WorktreeManagerGlobal.instance) {
            WorktreeManagerGlobal.instance = new WorktreeManagerGlobal();
        }
        return WorktreeManagerGlobal.instance;
    }
    setWorkspace(workspacePath) {
        this.currentWorkspacePath = workspacePath;
        // Don't remove/re-add handlers - they're set up once in constructor
        try {
            // Create a new worktree manager for this workspace
            // Pass false to prevent WorktreeManager from setting up its own IPC handlers
            this.currentManager = new WorktreeManager(workspacePath, false);
            return this.currentManager;
        }
        catch (error) {
            console.error('[WorktreeManagerGlobal] Failed to create WorktreeManager:', error);
            this.currentManager = null;
            return null;
        }
    }
    setActiveWorktreePath(worktreePath) {
        if (this.currentManager) {
            this.currentManager.setActiveWorktreePath(worktreePath);
        }
    }
    removeExistingHandlers() {
        const handlers = [
            'worktree:list', 'worktree:create', 'worktree:remove',
            'worktree:switch', 'worktree:compare', 'worktree:sessions',
            'worktree:createSession', 'worktree:deleteSession',
            'worktree:lock', 'worktree:prune'
        ];
        handlers.forEach(channel => {
            ipcMain.removeHandler(channel);
        });
    }
    setupIpcHandlers() {
        // Prevent re-registration
        if (this.handlersSetup) {
            return;
        }
        // List all worktrees
        ipcMain.handle('worktree:list', async () => {
            // If no manager, try to create one if we have a workspace path
            if (!this.currentManager && this.currentWorkspacePath) {
                this.setWorkspace(this.currentWorkspacePath);
            }
            if (!this.currentManager) {
                if (this.currentWorkspacePath) {
                    return { success: false, error: 'Not a git repository or git worktree feature not available', worktrees: [] };
                }
                else {
                    return { success: false, error: 'No workspace selected', worktrees: [] };
                }
            }
            try {
                return await this.currentManager.listWorktrees();
            }
            catch (error) {
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
