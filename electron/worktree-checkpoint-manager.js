import fs from 'fs-extra';
import * as path from 'path';
import simpleGit from 'simple-git';
/**
 * Manages checkpoints on a per-worktree basis
 * Provides worktree-specific checkpoint operations and tracking
 */
export class WorktreeCheckpointManager {
    checkpointManager;
    worktreeManager;
    workspacePath;
    worktreeCheckpointPaths = new Map();
    constructor(workspacePath, checkpointManager, worktreeManager) {
        this.workspacePath = workspacePath;
        this.checkpointManager = checkpointManager;
        this.worktreeManager = worktreeManager;
    }
    /**
     * Initialize worktree checkpoint tracking
     */
    async initialize() {
        // Get all worktrees
        const result = await this.worktreeManager.listWorktrees();
        if (!result.success || !result.worktrees)
            return;
        // Set up checkpoint directories for each worktree
        for (const worktree of result.worktrees) {
            const checkpointPath = path.join(worktree.path, '.claude', 'checkpoints');
            await fs.ensureDir(checkpointPath);
            this.worktreeCheckpointPaths.set(worktree.path, checkpointPath);
        }
    }
    /**
     * Create a checkpoint for a specific worktree
     */
    async createWorktreeCheckpoint(worktreeId, data, options) {
        // Get worktree info
        const worktreesResult = await this.worktreeManager.listWorktrees();
        if (!worktreesResult.success || !worktreesResult.worktrees) {
            throw new Error('Failed to list worktrees');
        }
        const worktree = worktreesResult.worktrees.find(w => w.path === worktreeId);
        if (!worktree) {
            throw new Error(`Worktree ${worktreeId} not found`);
        }
        // Add worktree information to checkpoint data
        const checkpointData = {
            ...data,
            worktreeId: worktree.path,
            worktreePath: worktree.path,
            worktreeBranch: worktree.branch
        };
        // Create checkpoint
        return this.checkpointManager.createCheckpoint(checkpointData, options);
    }
    /**
     * List checkpoints for a specific worktree
     */
    async listWorktreeCheckpoints(worktreeId, filter) {
        return this.checkpointManager.listAllCheckpoints({
            ...filter,
            worktreeId
        });
    }
    /**
     * Get checkpoint info for all worktrees
     */
    async getWorktreeCheckpointInfo() {
        const worktreesResult = await this.worktreeManager.listWorktrees();
        if (!worktreesResult.success || !worktreesResult.worktrees) {
            return [];
        }
        const worktrees = worktreesResult.worktrees;
        const allCheckpoints = await this.checkpointManager.listAllCheckpoints();
        const info = [];
        for (const worktree of worktrees) {
            const worktreeCheckpoints = allCheckpoints.filter(cp => cp.worktreeId === worktree.path);
            const totalSize = worktreeCheckpoints.reduce((sum, cp) => sum + cp.stats.totalSize, 0);
            info.push({
                worktreeId: worktree.path,
                worktreePath: worktree.path,
                worktreeBranch: worktree.branch,
                checkpointCount: worktreeCheckpoints.length,
                lastCheckpoint: worktreeCheckpoints[0], // Already sorted by date
                totalSize
            });
        }
        // Also include main workspace
        const mainCheckpoints = allCheckpoints.filter(cp => !cp.worktreeId);
        if (mainCheckpoints.length > 0) {
            info.unshift({
                worktreeId: 'main',
                worktreePath: this.workspacePath,
                worktreeBranch: await this.getCurrentBranch(),
                checkpointCount: mainCheckpoints.length,
                lastCheckpoint: mainCheckpoints[0],
                totalSize: mainCheckpoints.reduce((sum, cp) => sum + cp.stats.totalSize, 0)
            });
        }
        return info;
    }
    /**
     * Copy checkpoint from one worktree to another
     */
    async copyCheckpointToWorktree(checkpointId, targetWorktreeId) {
        // Get checkpoint data
        const checkpoint = await this.checkpointManager.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error('Checkpoint not found');
        }
        // Get target worktree
        const worktreesResult = await this.worktreeManager.listWorktrees();
        if (!worktreesResult.success || !worktreesResult.worktrees) {
            throw new Error('Failed to list worktrees');
        }
        const targetWorktree = worktreesResult.worktrees.find(w => w.path === targetWorktreeId);
        if (!targetWorktree) {
            throw new Error('Target worktree not found');
        }
        // Create new checkpoint in target worktree
        const newCheckpointData = {
            ...checkpoint,
            name: `Copy of ${checkpoint.name}`,
            description: `Copied from worktree ${checkpoint.worktreeId || 'main'}`,
            tags: [...checkpoint.tags, 'copied'],
            worktreeId: targetWorktree.path,
            worktreePath: targetWorktree.path,
            worktreeBranch: targetWorktree.branch
        };
        // Remove id and timestamp as they'll be regenerated
        const { id, timestamp, type, ...dataForCreation } = newCheckpointData;
        return this.checkpointManager.createCheckpoint(dataForCreation);
    }
    /**
     * Restore checkpoint to a different worktree
     */
    async restoreCheckpointToWorktree(checkpointId, targetWorktreeId, options) {
        // Get target worktree
        const worktreesResult = await this.worktreeManager.listWorktrees();
        if (!worktreesResult.success || !worktreesResult.worktrees) {
            return {
                success: false,
                restoredFiles: 0,
                error: 'Failed to list worktrees'
            };
        }
        const targetWorktree = worktreesResult.worktrees.find(w => w.path === targetWorktreeId);
        if (!targetWorktree) {
            return {
                success: false,
                restoredFiles: 0,
                error: 'Target worktree not found'
            };
        }
        // Restore with target worktree specified
        return this.checkpointManager.restoreCheckpoint(checkpointId, {
            ...options,
            targetWorktree: targetWorktreeId
        });
    }
    /**
     * Clean up old checkpoints for a specific worktree
     */
    async cleanupWorktreeCheckpoints(worktreeId, options) {
        const checkpoints = await this.listWorktreeCheckpoints(worktreeId);
        let removed = 0;
        let freedSpace = 0;
        // Filter by age
        let toRemove = [];
        if (options.maxAge) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - options.maxAge);
            toRemove = checkpoints.filter(cp => new Date(cp.timestamp) < cutoffDate);
        }
        // Keep only maxCount most recent
        if (options.maxCount && checkpoints.length > options.maxCount) {
            const removeCount = checkpoints.length - options.maxCount;
            toRemove = [...toRemove, ...checkpoints.slice(-removeCount)];
        }
        // Remove duplicates
        const uniqueIds = new Set(toRemove.map(cp => cp.id));
        for (const id of uniqueIds) {
            const checkpoint = toRemove.find(cp => cp.id === id);
            if (checkpoint) {
                const success = await this.checkpointManager.deleteCheckpoint(id);
                if (success) {
                    removed++;
                    freedSpace += checkpoint.stats.totalSize;
                }
            }
        }
        return { removed, freedSpace };
    }
    /**
     * Get checkpoint storage metrics for a worktree
     */
    async getWorktreeMetrics(worktreeId) {
        const checkpoints = await this.listWorktreeCheckpoints(worktreeId);
        if (checkpoints.length === 0) {
            return {
                checkpointCount: 0,
                totalSize: 0,
                averageSize: 0,
                checkpointsByTrigger: {}
            };
        }
        const totalSize = checkpoints.reduce((sum, cp) => sum + cp.stats.totalSize, 0);
        const checkpointsByTrigger = {};
        checkpoints.forEach(cp => {
            checkpointsByTrigger[cp.trigger] = (checkpointsByTrigger[cp.trigger] || 0) + 1;
        });
        return {
            checkpointCount: checkpoints.length,
            totalSize,
            averageSize: Math.round(totalSize / checkpoints.length),
            oldestCheckpoint: new Date(checkpoints[checkpoints.length - 1].timestamp),
            newestCheckpoint: new Date(checkpoints[0].timestamp),
            checkpointsByTrigger
        };
    }
    /**
     * Export worktree checkpoints to archive
     */
    async exportWorktreeCheckpoints(worktreeId, exportPath) {
        try {
            const checkpoints = await this.listWorktreeCheckpoints(worktreeId);
            const exportDir = path.join(exportPath, `worktree-${worktreeId}-checkpoints`);
            await fs.ensureDir(exportDir);
            let exportedCount = 0;
            for (const checkpoint of checkpoints) {
                const backend = this.checkpointManager.backends.get(checkpoint.type);
                if (backend?.export) {
                    const filename = `${checkpoint.id}.bundle`;
                    const success = await backend.export(checkpoint.id, path.join(exportDir, filename));
                    if (success)
                        exportedCount++;
                }
            }
            // Write manifest
            await fs.writeJSON(path.join(exportDir, 'manifest.json'), {
                worktreeId,
                exportDate: new Date().toISOString(),
                checkpointCount: checkpoints.length,
                exportedCount,
                checkpoints: checkpoints.map(cp => ({
                    id: cp.id,
                    name: cp.name,
                    timestamp: cp.timestamp,
                    type: cp.type
                }))
            }, { spaces: 2 });
            return { success: true, exportedCount };
        }
        catch (error) {
            return {
                success: false,
                exportedCount: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get current branch of main workspace
     */
    async getCurrentBranch() {
        try {
            // Use git directly to get current branch
            const git = simpleGit(this.workspacePath);
            const status = await git.status();
            return status.current || 'main';
        }
        catch {
            return 'main';
        }
    }
}
