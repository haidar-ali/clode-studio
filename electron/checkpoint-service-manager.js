import { ipcMain } from 'electron';
import { CheckpointService } from './checkpoint-service.js';
/**
 * Global Checkpoint Service Manager that handles IPC communication
 * and delegates to workspace-specific CheckpointService instances
 */
export class CheckpointServiceManager {
    static instance;
    currentService = null;
    constructor() {
        this.setupIpcHandlers();
    }
    static getInstance() {
        if (!CheckpointServiceManager.instance) {
            CheckpointServiceManager.instance = new CheckpointServiceManager();
        }
        return CheckpointServiceManager.instance;
    }
    setWorkspace(workspacePath) {
        // Create a new checkpoint service for this workspace
        // Pass false to prevent CheckpointService from setting up its own IPC handlers
        this.currentService = new CheckpointService(workspacePath, {}, false);
        return this.currentService;
    }
    removeExistingHandlers() {
        const handlers = [
            'checkpoint:init', 'checkpoint:create', 'checkpoint:list',
            'checkpoint:get', 'checkpoint:restore', 'checkpoint:delete',
            'checkpoint:compare', 'checkpoint:export', 'checkpoint:import',
            'checkpoint:stats', 'checkpoint:clean'
        ];
        handlers.forEach(channel => {
            ipcMain.removeHandler(channel);
        });
    }
    setupIpcHandlers() {
        // Initialize shadow repository
        ipcMain.handle('checkpoint:init', async () => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.initialize();
        });
        // Create checkpoint
        ipcMain.handle('checkpoint:create', async (event, metadata) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.createCheckpoint(metadata);
        });
        // List checkpoints
        ipcMain.handle('checkpoint:list', async () => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.listCheckpoints();
        });
        // Get checkpoint details
        ipcMain.handle('checkpoint:get', async (event, checkpointId) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.getCheckpoint(checkpointId);
        });
        // Restore checkpoint
        ipcMain.handle('checkpoint:restore', async (event, checkpointId, options) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.restoreCheckpoint(checkpointId, options);
        });
        // Delete checkpoint
        ipcMain.handle('checkpoint:delete', async (event, checkpointId) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.deleteCheckpoint(checkpointId);
        });
        // Compare checkpoints
        ipcMain.handle('checkpoint:compare', async (event, id1, id2) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.compareCheckpoints(id1, id2);
        });
        // Export checkpoint
        ipcMain.handle('checkpoint:export', async (event, checkpointId, exportPath) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.exportCheckpoint(checkpointId, exportPath);
        });
        // Import checkpoint
        ipcMain.handle('checkpoint:import', async (event, importPath) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.importCheckpoint(importPath);
        });
        // Get checkpoint statistics
        ipcMain.handle('checkpoint:stats', async () => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.getStatistics();
        });
        // Clean old checkpoints
        ipcMain.handle('checkpoint:clean', async (event, options) => {
            if (!this.currentService) {
                return { success: false, error: 'No workspace selected' };
            }
            return await this.currentService.cleanOldCheckpoints(options);
        });
    }
}
