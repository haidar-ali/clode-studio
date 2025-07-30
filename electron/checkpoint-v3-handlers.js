import { ipcMain } from 'electron';
import * as path from 'path';
import fs from 'fs-extra';
import { CheckpointStrategyManager } from './checkpoint-strategy-manager.js';
// Store manager instances per workspace
const managers = new Map();
// Track if handlers have been registered
let handlersRegistered = false;
/**
 * Get or create a strategy manager for a workspace
 * This now properly handles worktrees by finding the main workspace path
 */
export async function getManager(workspacePath) {
    // Try to find the main workspace path by checking if this is a worktree
    let mainWorkspacePath = workspacePath;
    try {
        // Check if this path is a worktree by looking for .git file (not directory)
        const gitPath = path.join(workspacePath, '.git');
        const gitStat = await fs.stat(gitPath).catch(() => null);
        if (gitStat && gitStat.isFile()) {
            // This is a worktree - read the .git file to find the main repo
            const gitContent = await fs.readFile(gitPath, 'utf-8');
            const match = gitContent.match(/gitdir: (.+)$/m);
            if (match) {
                // Extract the main workspace path from the gitdir
                // gitdir format: /path/to/main/repo/.git/worktrees/worktree-name
                const gitDir = match[1];
                const mainRepoMatch = gitDir.match(/(.+)\/\.git\/worktrees\//);
                if (mainRepoMatch) {
                    mainWorkspacePath = mainRepoMatch[1];
                }
            }
        }
    }
    catch (error) {
        // If we can't determine the main workspace, use the provided path
        console.warn('Could not determine main workspace path:', error);
    }
    console.log(`[getManager] Input path: ${workspacePath}, Main workspace: ${mainWorkspacePath}`);
    // Use the main workspace path as the key
    if (!managers.has(mainWorkspacePath)) {
        console.log(`[getManager] Creating new manager for: ${mainWorkspacePath}`);
        const manager = new CheckpointStrategyManager({
            workspacePath: mainWorkspacePath,
            enableLegacySupport: true
        });
        await manager.initialize();
        managers.set(mainWorkspacePath, manager);
    }
    else {
        console.log(`[getManager] Reusing existing manager for: ${mainWorkspacePath}`);
    }
    return managers.get(mainWorkspacePath);
}
/**
 * Set up checkpoint v3 IPC handlers
 */
export function setupCheckpointV3Handlers(workspacePath) {
    // Initialize manager on startup
    getManager(workspacePath).catch(console.error);
    // Only register handlers once
    if (handlersRegistered) {
        console.log('[Checkpoint V3] Handlers already registered, skipping...');
        return;
    }
    handlersRegistered = true;
    // Create checkpoint
    ipcMain.handle('checkpoint-v3:create', async (event, workspacePath, data, options) => {
        try {
            const manager = await getManager(workspacePath);
            const metadata = await manager.createCheckpoint(data, options);
            return { success: true, metadata };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    // List all checkpoints
    ipcMain.handle('checkpoint-v3:list', async (event, workspacePath, filter) => {
        try {
            const manager = await getManager(workspacePath);
            const dateRange = filter?.dateRange ? {
                start: new Date(filter.dateRange.start),
                end: new Date(filter.dateRange.end)
            } : undefined;
            const checkpoints = await manager.listAllCheckpoints({
                ...filter,
                dateRange
            });
            return { success: true, checkpoints };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                checkpoints: []
            };
        }
    });
    // Get checkpoint details
    ipcMain.handle('checkpoint-v3:get', async (event, workspacePath, checkpointId) => {
        try {
            const manager = await getManager(workspacePath);
            const checkpoint = await manager.getCheckpoint(checkpointId);
            return { success: true, checkpoint };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    // Restore checkpoint
    ipcMain.handle('checkpoint-v3:restore', async (event, workspacePath, checkpointId, options) => {
        console.log('[Checkpoint V3 Restore Handler] Called with:');
        console.log('  - Workspace path:', workspacePath);
        console.log('  - Checkpoint ID:', checkpointId);
        console.log('  - Options:', options);
        try {
            const manager = await getManager(workspacePath);
            const result = await manager.restoreCheckpoint(checkpointId, options);
            return result;
        }
        catch (error) {
            return {
                success: false,
                restoredFiles: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    // Delete checkpoint
    ipcMain.handle('checkpoint-v3:delete', async (event, workspacePath, checkpointId) => {
        try {
            const manager = await getManager(workspacePath);
            const success = await manager.deleteCheckpoint(checkpointId);
            return { success };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    // Compare checkpoints
    ipcMain.handle('checkpoint-v3:compare', async (event, workspacePath, checkpointId1, checkpointId2) => {
        try {
            const manager = await getManager(workspacePath);
            // Special case: compare with current state
            if (checkpointId2 === 'current') {
                const checkpoint = await manager.getCheckpoint(checkpointId1);
                if (!checkpoint) {
                    throw new Error('Checkpoint not found');
                }
                // Create a pseudo-comparison with current state
                // We're comparing: checkpoint (source) → current (target)
                // So we need to show what would happen if we restore the checkpoint
                const currentFiles = await manager.getCurrentFiles();
                const checkpointFiles = new Map(checkpoint.files.map(f => [f.path, f]));
                console.log(`[Checkpoint Compare] Current files: ${currentFiles.size}, Checkpoint files: ${checkpointFiles.size}`);
                const filesAdded = [];
                const filesRemoved = [];
                const filesModified = [];
                // Check checkpoint files (these would be restored)
                for (const [path, checkpointFile] of checkpointFiles) {
                    const currentFile = currentFiles.get(path);
                    if (!currentFile) {
                        // File exists in checkpoint but not in current = would be added
                        filesAdded.push(path);
                        console.log(`[Checkpoint Compare] File would be added: ${path}`);
                    }
                    else if (checkpointFile.hash !== currentFile.hash) {
                        // File exists in both but different = would be modified
                        filesModified.push(path);
                        console.log(`[Checkpoint Compare] File would be modified: ${path}`);
                        console.log(`  Current hash: ${currentFile.hash.substring(0, 8)}...`);
                        console.log(`  Checkpoint hash: ${checkpointFile.hash.substring(0, 8)}...`);
                    }
                    // If hashes are same, file is unchanged - no action needed
                }
                // Check for files that would be removed (exist in current but not in checkpoint)
                for (const [path] of currentFiles) {
                    if (!checkpointFiles.has(path)) {
                        // File exists in current but not in checkpoint = would be removed (in hard reset)
                        filesRemoved.push(path);
                    }
                }
                const diff = {
                    filesAdded,
                    filesRemoved,
                    filesModified,
                    sizeChange: 0 // TODO: Calculate actual size change
                };
                return { success: true, diff };
            }
            // Normal comparison between two checkpoints
            const diff = await manager.compareCheckpoints(checkpointId1, checkpointId2);
            return { success: true, diff };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    // Get statistics
    ipcMain.handle('checkpoint-v3:stats', async (event, workspacePath) => {
        try {
            const manager = await getManager(workspacePath);
            const stats = await manager.getStatistics();
            return { success: true, stats };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    // Migrate checkpoints
    ipcMain.handle('checkpoint-v3:migrate', async (event, workspacePath, fromBackend, toBackend, filter) => {
        try {
            const manager = await getManager(workspacePath);
            const result = await manager.migrateCheckpoints(fromBackend, toBackend, filter ? {
                trigger: filter.trigger,
                beforeDate: filter.beforeDate ? new Date(filter.beforeDate) : undefined
            } : undefined);
            return { success: true, ...result };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                migrated: 0,
                failed: 0
            };
        }
    });
    // Clean up old checkpoints
    ipcMain.handle('checkpoint-v3:cleanup', async (event, workspacePath) => {
        try {
            const manager = await getManager(workspacePath);
            const result = await manager.cleanupAll();
            return { success: true, ...result };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                removed: 0,
                freedSpace: 0
            };
        }
    });
    // Get available backends
    ipcMain.handle('checkpoint-v3:backends', async (event, workspacePath) => {
        try {
            const manager = await getManager(workspacePath);
            // List which backends are actually available
            const stats = await manager.getStatistics();
            const backends = Object.keys(stats.byType);
            // Always include shadow if legacy support is enabled
            if (!backends.includes('shadow')) {
                backends.push('shadow');
            }
            return { success: true, backends };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                backends: []
            };
        }
    });
}
/**
 * Clean up managers when workspace is closed
 */
export function cleanupCheckpointV3Manager(workspacePath) {
    managers.delete(workspacePath);
}
/**
 * Remove all checkpoint v3 handlers (for app shutdown)
 */
export function removeCheckpointV3Handlers() {
    if (handlersRegistered) {
        ipcMain.removeHandler('checkpoint-v3:create');
        ipcMain.removeHandler('checkpoint-v3:list');
        ipcMain.removeHandler('checkpoint-v3:get');
        ipcMain.removeHandler('checkpoint-v3:restore');
        ipcMain.removeHandler('checkpoint-v3:delete');
        ipcMain.removeHandler('checkpoint-v3:compare');
        ipcMain.removeHandler('checkpoint-v3:stats');
        ipcMain.removeHandler('checkpoint-v3:migrate');
        ipcMain.removeHandler('checkpoint-v3:cleanup');
        ipcMain.removeHandler('checkpoint-v3:backends');
        handlersRegistered = false;
    }
}
