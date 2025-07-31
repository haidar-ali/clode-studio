import fs from 'fs-extra';
import * as path from 'path';
import simpleGit from 'simple-git';
/**
 * Manages checkpoint metadata persistence in git
 * Stores metadata in .git/info/checkpoints.json for persistence across sessions
 */
export class CheckpointMetadataManager {
    workspacePath;
    metadataPath;
    git;
    metadata;
    saveDebounceTimer = null;
    SAVE_DEBOUNCE_MS = 1000;
    METADATA_VERSION = '1.0.0';
    constructor(workspacePath) {
        this.workspacePath = workspacePath;
        this.git = simpleGit(workspacePath);
        this.metadata = {
            version: this.METADATA_VERSION,
            lastUpdated: new Date().toISOString(),
            checkpoints: []
        };
        // Don't set metadataPath here, will be set in initialize
        this.metadataPath = '';
    }
    /**
     * Initialize the metadata manager
     */
    async initialize() {
        try {
            // Check if this is a git repository
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                throw new Error('Not a git repository');
            }
            // Find the actual git directory (handles worktrees)
            const gitDir = await this.findGitDirectory();
            this.metadataPath = path.join(gitDir, 'info', 'checkpoints.json');
            // Ensure .git/info directory exists
            const infoDir = path.dirname(this.metadataPath);
            await fs.ensureDir(infoDir);
            // Load existing metadata if available
            await this.loadMetadata();
        }
        catch (error) {
            console.error('[CheckpointMetadata] Initialization error:', error);
            throw error;
        }
    }
    /**
     * Find the actual git directory (handles worktrees)
     */
    async findGitDirectory() {
        try {
            // Use git rev-parse to get the common git directory
            // This will return the main repository's .git directory even for worktrees
            const commonDir = await this.git.revparse(['--git-common-dir']);
            if (commonDir && commonDir.trim()) {
                const trimmed = commonDir.trim();
                return path.isAbsolute(trimmed)
                    ? trimmed
                    : path.join(this.workspacePath, trimmed);
            }
        }
        catch (error) {
            // Fall back to checking the .git path
            const gitPath = path.join(this.workspacePath, '.git');
            try {
                const stats = await fs.stat(gitPath);
                if (stats.isDirectory()) {
                    // Normal repository
                    return gitPath;
                }
                else if (stats.isFile()) {
                    // Worktree - read the file to get the actual git directory
                    const content = await fs.readFile(gitPath, 'utf8');
                    const match = content.match(/^gitdir: (.+)$/m);
                    if (match) {
                        let gitdir = match[1];
                        // If it's a relative path, resolve it
                        if (!path.isAbsolute(gitdir)) {
                            gitdir = path.resolve(this.workspacePath, gitdir);
                        }
                        // For worktrees, we need to go up to find the common directory
                        // Worktree git dirs are typically in .git/worktrees/<name>
                        // We want the parent .git directory
                        const parts = gitdir.split(path.sep);
                        const worktreesIndex = parts.lastIndexOf('worktrees');
                        if (worktreesIndex > 0 && parts[worktreesIndex - 1] === '.git') {
                            // Return the main .git directory
                            return parts.slice(0, worktreesIndex).join(path.sep);
                        }
                        return gitdir;
                    }
                }
            }
            catch {
                // Ignore errors
            }
            // Default fallback
            return gitPath;
        }
        // Final fallback if no path is found
        return path.join(this.workspacePath, '.git');
    }
    /**
     * Load metadata from disk
     */
    async loadMetadata() {
        try {
            if (await fs.pathExists(this.metadataPath)) {
                let data = await fs.readJSON(this.metadataPath);
                // Validate version and migrate if needed
                if (data.version !== this.METADATA_VERSION) {
                  
                    data = await this.migrateMetadata(data);
                }
                this.metadata = data;
              
            }
            else {
              
            }
        }
        catch (error) {
            console.error('[CheckpointMetadata] Error loading metadata:', error);
            // Start with fresh metadata on error
            this.metadata = {
                version: this.METADATA_VERSION,
                lastUpdated: new Date().toISOString(),
                checkpoints: []
            };
        }
    }
    /**
     * Save metadata to disk (debounced)
     */
    async saveMetadata() {
        // Clear existing timer
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        // Set new timer
        this.saveDebounceTimer = setTimeout(async () => {
            try {
                this.metadata.lastUpdated = new Date().toISOString();
                await fs.writeJSON(this.metadataPath, this.metadata, { spaces: 2 });
              
            }
            catch (error) {
                console.error('[CheckpointMetadata] Error saving metadata:', error);
            }
        }, this.SAVE_DEBOUNCE_MS);
    }
    /**
     * Add or update checkpoint metadata
     */
    async upsertCheckpoint(checkpoint) {
        const index = this.metadata.checkpoints.findIndex(cp => cp.id === checkpoint.id);
        if (index >= 0) {
            // Update existing
            this.metadata.checkpoints[index] = checkpoint;
        }
        else {
            // Add new
            this.metadata.checkpoints.unshift(checkpoint);
        }
        // Sort by timestamp (newest first)
        this.metadata.checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        await this.saveMetadata();
    }
    /**
     * Remove checkpoint metadata
     */
    async removeCheckpoint(checkpointId) {
        const initialLength = this.metadata.checkpoints.length;
        this.metadata.checkpoints = this.metadata.checkpoints.filter(cp => cp.id !== checkpointId);
        if (this.metadata.checkpoints.length < initialLength) {
            await this.saveMetadata();
        }
    }
    /**
     * Get all checkpoint metadata
     */
    async getAllCheckpoints() {
        return [...this.metadata.checkpoints];
    }
    /**
     * Get checkpoint by ID
     */
    async getCheckpoint(checkpointId) {
        return this.metadata.checkpoints.find(cp => cp.id === checkpointId) || null;
    }
    /**
     * Query checkpoints with filters
     */
    async queryCheckpoints(filter) {
        let checkpoints = [...this.metadata.checkpoints];
        if (!filter)
            return checkpoints;
        // Apply filters
        if (filter.worktreeId !== undefined) {
            checkpoints = checkpoints.filter(cp => cp.worktreeId === filter.worktreeId);
        }
        if (filter.trigger) {
            checkpoints = checkpoints.filter(cp => cp.trigger === filter.trigger);
        }
        if (filter.tags && filter.tags.length > 0) {
            checkpoints = checkpoints.filter(cp => filter.tags.every(tag => cp.tags.includes(tag)));
        }
        if (filter.dateRange) {
            const startTime = filter.dateRange.start.getTime();
            const endTime = filter.dateRange.end.getTime();
            checkpoints = checkpoints.filter(cp => {
                const cpTime = new Date(cp.timestamp).getTime();
                return cpTime >= startTime && cpTime <= endTime;
            });
        }
        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            checkpoints = checkpoints.filter(cp => cp.name.toLowerCase().includes(searchLower) ||
                cp.description?.toLowerCase().includes(searchLower) ||
                cp.tags.some(tag => tag.toLowerCase().includes(searchLower)));
        }
        return checkpoints;
    }
    /**
     * Get checkpoint statistics
     */
    async getStatistics() {
        const stats = {
            totalCount: this.metadata.checkpoints.length,
            byType: {},
            byTrigger: {},
            byWorktree: {},
            totalSize: 0,
            oldestDate: null,
            newestDate: null
        };
        if (this.metadata.checkpoints.length === 0) {
            return stats;
        }
        // Calculate statistics
        this.metadata.checkpoints.forEach((cp, index) => {
            // By type
            stats.byType[cp.type] = (stats.byType[cp.type] || 0) + 1;
            // By trigger
            stats.byTrigger[cp.trigger] = (stats.byTrigger[cp.trigger] || 0) + 1;
            // By worktree
            const worktreeKey = cp.worktreeId || 'main';
            stats.byWorktree[worktreeKey] = (stats.byWorktree[worktreeKey] || 0) + 1;
            // Total size
            stats.totalSize += cp.stats.totalSize;
            // Date range (checkpoints are already sorted newest first)
            if (index === 0) {
                stats.newestDate = new Date(cp.timestamp);
            }
            if (index === this.metadata.checkpoints.length - 1) {
                stats.oldestDate = new Date(cp.timestamp);
            }
        });
        return stats;
    }
    /**
     * Clean up orphaned metadata (checkpoints that no longer exist)
     */
    async cleanupOrphaned(existingIds) {
        const initialLength = this.metadata.checkpoints.length;
        this.metadata.checkpoints = this.metadata.checkpoints.filter(cp => existingIds.has(cp.id));
        const removedCount = initialLength - this.metadata.checkpoints.length;
        if (removedCount > 0) {
          
            await this.saveMetadata();
        }
        return removedCount;
    }
    /**
     * Export metadata for backup
     */
    async exportMetadata(targetPath) {
        await fs.writeJSON(targetPath, this.metadata, { spaces: 2 });
    }
    /**
     * Import metadata from backup
     */
    async importMetadata(sourcePath, merge = false) {
        const importedData = await fs.readJSON(sourcePath);
        if (merge) {
            // Merge with existing data
            const existingIds = new Set(this.metadata.checkpoints.map(cp => cp.id));
            const newCheckpoints = importedData.checkpoints.filter((cp) => !existingIds.has(cp.id));
            this.metadata.checkpoints.push(...newCheckpoints);
            // Re-sort
            this.metadata.checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
        else {
            // Replace existing data
            this.metadata = importedData;
        }
        await this.saveMetadata();
    }
    /**
     * Migrate metadata from older versions
     */
    async migrateMetadata(oldData) {
        // Handle migration logic here based on version
        // For now, just preserve checkpoints and update version
        return {
            version: this.METADATA_VERSION,
            lastUpdated: new Date().toISOString(),
            checkpoints: oldData.checkpoints || []
        };
    }
    /**
     * Force save (used during shutdown)
     */
    async forceSave() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }
        try {
            this.metadata.lastUpdated = new Date().toISOString();
            await fs.writeJSON(this.metadataPath, this.metadata, { spaces: 2 });
        }
        catch (error) {
            console.error('[CheckpointMetadata] Error during force save:', error);
        }
    }
}
