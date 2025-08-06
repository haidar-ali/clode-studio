import { ipcMain } from 'electron';
import fs from 'fs-extra';
import * as path from 'path';
import simpleGit from 'simple-git';
import * as crypto from 'crypto';
export class CheckpointService {
    workspacePath;
    shadowRepoPath;
    git;
    initialized = false;
    options;
    postCommitWatcher = null;
    constructor(workspacePath, options = {}, setupHandlers = true) {
        this.workspacePath = workspacePath;
        this.shadowRepoPath = path.join(workspacePath, '.claude-checkpoints');
        // Don't initialize git until the directory exists
        this.git = null; // Will be initialized in initialize()
        this.options = {
            includeNodeModules: false,
            includeGitIgnored: false,
            compressionLevel: 6,
            maxFileSize: 10 * 1024 * 1024, // 10MB default
            ...options
        };
        if (setupHandlers) {
            this.setupIpcHandlers();
        }
        this.setupPostCommitWatcher();
    }
    setupIpcHandlers() {
        // Initialize shadow repository
        ipcMain.handle('checkpoint:init', async () => {
            return await this.initialize();
        });
        // Create checkpoint
        ipcMain.handle('checkpoint:create', async (event, metadata) => {
            return await this.createCheckpoint(metadata);
        });
        // List checkpoints
        ipcMain.handle('checkpoint:list', async () => {
            return await this.listCheckpoints();
        });
        // Get checkpoint details
        ipcMain.handle('checkpoint:get', async (event, checkpointId) => {
            return await this.getCheckpoint(checkpointId);
        });
        // Restore checkpoint
        ipcMain.handle('checkpoint:restore', async (event, checkpointId, options) => {
            return await this.restoreCheckpoint(checkpointId, options);
        });
        // Delete checkpoint
        ipcMain.handle('checkpoint:delete', async (event, checkpointId) => {
            return await this.deleteCheckpoint(checkpointId);
        });
        // Compare checkpoints
        ipcMain.handle('checkpoint:compare', async (event, id1, id2) => {
            return await this.compareCheckpoints(id1, id2);
        });
        // Export checkpoint
        ipcMain.handle('checkpoint:export', async (event, checkpointId, exportPath) => {
            return await this.exportCheckpoint(checkpointId, exportPath);
        });
        // Import checkpoint
        ipcMain.handle('checkpoint:import', async (event, importPath) => {
            return await this.importCheckpoint(importPath);
        });
        // Get checkpoint statistics
        ipcMain.handle('checkpoint:stats', async () => {
            return await this.getStatistics();
        });
        // Clean old checkpoints
        ipcMain.handle('checkpoint:clean', async (event, options) => {
            return await this.cleanOldCheckpoints(options);
        });
    }
    async initialize() {
        try {
            // Create shadow repo directory
            await fs.ensureDir(this.shadowRepoPath);
            // Initialize git now that directory exists
            this.git = simpleGit(this.shadowRepoPath);
            // Check if already initialized
            const gitDir = path.join(this.shadowRepoPath, '.git');
            if (!await fs.pathExists(gitDir)) {
                // Initialize git repository
                await this.git.init();
                // Create initial commit
                const readmePath = path.join(this.shadowRepoPath, 'README.md');
                await fs.writeFile(readmePath, '# Claude Checkpoints\n\n' +
                    'This directory contains automatic checkpoints created by Claude Code IDE.\n' +
                    'DO NOT EDIT FILES IN THIS DIRECTORY MANUALLY.\n');
                await this.git.add('README.md');
                await this.git.commit('Initialize checkpoint repository');
            }
            // Update parent .gitignore only if directories are not already ignored
            const parentDir = path.dirname(this.shadowRepoPath);
            const parentGitignore = path.join(parentDir, '.gitignore');
            // Check if git is available and directories are already ignored
            const checkIfIgnored = async (dirName) => {
                try {
                    const git = simpleGit(parentDir);
                    // First check if this is a git repository
                    const isRepo = await git.checkIsRepo();
                    if (!isRepo) {
                        // Not a git repo, so we can't check if paths are ignored
                        return false;
                    }
                    // Use check-ignore to see if the path is ignored
                    await git.raw(['check-ignore', dirName]);
                    // If check-ignore returns 0 (no error), the path is ignored
                    return true;
                }
                catch (error) {
                    // If git command is not available or check-ignore returns non-zero
                    // Assume the path is not ignored
                    return false;
                }
            };
            // Check which directories need to be added
            const directoriesToAdd = [];
            try {
                if (!(await checkIfIgnored('.claude-checkpoints'))) {
                    directoriesToAdd.push('.claude-checkpoints/');
                }
                if (!(await checkIfIgnored('.worktrees'))) {
                    directoriesToAdd.push('.worktrees/');
                }
            }
            catch (error) {
                // If git is not available, add all directories to be safe
                console.log('Git not available, will add all Claude directories to .gitignore');
                directoriesToAdd.push('.claude-checkpoints/', '.worktrees/');
            }
            // Only update .gitignore if there are directories to add and the file exists
            if (directoriesToAdd.length > 0 && await fs.pathExists(parentGitignore)) {
                let gitignoreContent = await fs.readFile(parentGitignore, 'utf-8');
                // Double-check the file doesn't already contain these entries
                const filteredDirs = directoriesToAdd.filter(dir => !gitignoreContent.includes(dir.replace('/', '')));
                if (filteredDirs.length > 0) {
                    let contentToAppend = '';
                    if (gitignoreContent.trim()) {
                        contentToAppend += '\n';
                    }
                    contentToAppend += '# Claude Code IDE generated directories\n';
                    contentToAppend += filteredDirs.join('\n') + '\n';
                    await fs.writeFile(parentGitignore, gitignoreContent + contentToAppend);
                }
            }
            // Note: If .gitignore doesn't exist, the frontend will create it with proper defaults
            this.initialized = true;
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async createCheckpoint(metadata) {
        if (!this.initialized) {
            await this.initialize();
        }
        try {
            const checkpointId = `cp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
            const checkpointDir = path.join(this.shadowRepoPath, checkpointId);
            // Create checkpoint directory
            await fs.ensureDir(checkpointDir);
            // Save metadata
            await fs.writeJSON(path.join(checkpointDir, 'metadata.json'), {
                ...metadata,
                id: checkpointId,
                created: new Date().toISOString()
            }, { spaces: 2 });
            // Create file snapshots
            const workspacePath = path.dirname(this.shadowRepoPath);
            const fileSnapshots = await this.createFileSnapshots(workspacePath, checkpointDir);
            // Save file manifest
            await fs.writeJSON(path.join(checkpointDir, 'manifest.json'), {
                files: fileSnapshots,
                totalSize: fileSnapshots.reduce((sum, f) => sum + f.size, 0),
                fileCount: fileSnapshots.length
            }, { spaces: 2 });
            // Commit checkpoint
            await this.git.add('.');
            await this.git.commit(`Checkpoint: ${metadata.name || checkpointId} [${metadata.trigger || 'manual'}]`);
            return { success: true, checkpointId };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async createFileSnapshots(sourcePath, targetPath) {
        const snapshots = [];
        const filesDir = path.join(targetPath, 'files');
        await fs.ensureDir(filesDir);
        // Get all files to snapshot
        const files = await this.getFilesToSnapshot(sourcePath);
        for (const file of files) {
            try {
                const relativePath = path.relative(sourcePath, file);
                const stats = await fs.stat(file);
                // Skip large files
                if (stats.size > this.options.maxFileSize) {
                    console.warn(`Skipping large file: ${relativePath} (${stats.size} bytes)`);
                    continue;
                }
                // Create file snapshot
                const content = await fs.readFile(file);
                const hash = crypto.createHash('sha256').update(content).digest('hex');
                // Store file content
                const snapshotPath = path.join(filesDir, hash);
                if (!await fs.pathExists(snapshotPath)) {
                    await fs.writeFile(snapshotPath, content);
                }
                snapshots.push({
                    path: relativePath,
                    hash,
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                    permissions: stats.mode
                });
            }
            catch (err) {
                console.error(`Failed to snapshot file ${file}:`, err);
            }
        }
        return snapshots;
    }
    async getFilesToSnapshot(workspacePath) {
        const files = [];
        const gitignorePath = path.join(workspacePath, '.gitignore');
        let ignorePatterns = ['.git', '.claude-checkpoints'];
        // Read .gitignore patterns
        if (await fs.pathExists(gitignorePath)) {
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
            ignorePatterns.push(...gitignoreContent.split('\n').filter(line => line && !line.startsWith('#')));
        }
        // Add default ignores
        if (!this.options.includeNodeModules) {
            ignorePatterns.push('node_modules');
        }
        // Walk directory and collect files
        await this.walkDirectory(workspacePath, files, ignorePatterns);
        return files;
    }
    async walkDirectory(dir, files, ignorePatterns) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            // Check if should ignore
            if (this.shouldIgnore(entry.name, ignorePatterns)) {
                continue;
            }
            if (entry.isDirectory()) {
                await this.walkDirectory(fullPath, files, ignorePatterns);
            }
            else if (entry.isFile()) {
                files.push(fullPath);
            }
        }
    }
    shouldIgnore(name, patterns) {
        return patterns.some(pattern => {
            // Simple pattern matching (could be enhanced with minimatch)
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(name);
            }
            return name === pattern || name.startsWith(pattern + '/');
        });
    }
    async listCheckpoints() {
        try {
            const dirs = await fs.readdir(this.shadowRepoPath);
            const checkpoints = [];
            for (const dir of dirs) {
                if (dir.startsWith('cp-')) {
                    const metadataPath = path.join(this.shadowRepoPath, dir, 'metadata.json');
                    if (await fs.pathExists(metadataPath)) {
                        const metadata = await fs.readJSON(metadataPath);
                        const manifestPath = path.join(this.shadowRepoPath, dir, 'manifest.json');
                        if (await fs.pathExists(manifestPath)) {
                            const manifest = await fs.readJSON(manifestPath);
                            checkpoints.push({
                                ...metadata,
                                stats: {
                                    fileCount: manifest.fileCount,
                                    totalSize: manifest.totalSize
                                }
                            });
                        }
                    }
                }
            }
            // Sort by creation date
            checkpoints.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
            return { success: true, checkpoints };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async getCheckpoint(checkpointId) {
        try {
            const checkpointDir = path.join(this.shadowRepoPath, checkpointId);
            if (!await fs.pathExists(checkpointDir)) {
                return { success: false, error: 'Checkpoint not found' };
            }
            const metadata = await fs.readJSON(path.join(checkpointDir, 'metadata.json'));
            const manifest = await fs.readJSON(path.join(checkpointDir, 'manifest.json'));
            return {
                success: true,
                checkpoint: {
                    ...metadata,
                    manifest
                }
            };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async restoreCheckpoint(checkpointId, options = {}) {
        try {
            const checkpointDir = path.join(this.shadowRepoPath, checkpointId);
            if (!await fs.pathExists(checkpointDir)) {
                return { success: false, error: 'Checkpoint not found' };
            }
            // Create backup if requested
            if (options.createBackup) {
                await this.createCheckpoint({
                    name: `Pre-restore backup`,
                    trigger: 'auto-restore',
                    description: `Automatic backup before restoring checkpoint ${checkpointId}`
                });
            }
            const manifest = await fs.readJSON(path.join(checkpointDir, 'manifest.json'));
            const filesDir = path.join(checkpointDir, 'files');
            const workspacePath = path.dirname(this.shadowRepoPath);
            let restoredCount = 0;
            for (const file of manifest.files) {
                // Skip if selective restore and file not in list
                if (options.selective && !options.selective.includes(file.path)) {
                    continue;
                }
                try {
                    const targetPath = path.join(workspacePath, file.path);
                    const sourcePath = path.join(filesDir, file.hash);
                    // Ensure target directory exists
                    await fs.ensureDir(path.dirname(targetPath));
                    // Restore file
                    await fs.copy(sourcePath, targetPath, { overwrite: true });
                    // Restore permissions
                    if (file.permissions) {
                        await fs.chmod(targetPath, file.permissions);
                    }
                    restoredCount++;
                }
                catch (err) {
                    console.error(`Failed to restore file ${file.path}:`, err);
                }
            }
            return { success: true, restored: restoredCount };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async deleteCheckpoint(checkpointId) {
        try {
            const checkpointDir = path.join(this.shadowRepoPath, checkpointId);
            if (!await fs.pathExists(checkpointDir)) {
                return { success: false, error: 'Checkpoint not found' };
            }
            // Remove directory
            await fs.remove(checkpointDir);
            // Commit deletion
            await this.git.add('.');
            await this.git.commit(`Delete checkpoint: ${checkpointId}`);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async compareCheckpoints(id1, id2) {
        try {
            const checkpoint1 = await this.getCheckpoint(id1);
            const checkpoint2 = await this.getCheckpoint(id2);
            if (!checkpoint1.success || !checkpoint2.success) {
                return { success: false, error: 'One or both checkpoints not found' };
            }
            const manifest1 = checkpoint1.checkpoint.manifest;
            const manifest2 = checkpoint2.checkpoint.manifest;
            const files1 = new Map(manifest1.files.map((f) => [f.path, f]));
            const files2 = new Map(manifest2.files.map((f) => [f.path, f]));
            const diff = {
                added: [],
                removed: [],
                modified: [],
                unchanged: []
            };
            // Check for added/modified files
            for (const [path, file2] of files2) {
                const file1 = files1.get(path);
                if (!file1) {
                    diff.added.push(path);
                }
                else if (file1.hash !== file2.hash) {
                    diff.modified.push(path);
                }
                else {
                    diff.unchanged.push(path);
                }
            }
            // Check for removed files
            for (const [path] of files1) {
                if (!files2.has(path)) {
                    diff.removed.push(path);
                }
            }
            return { success: true, diff };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async exportCheckpoint(checkpointId, exportPath) {
        try {
            const checkpointDir = path.join(this.shadowRepoPath, checkpointId);
            if (!await fs.pathExists(checkpointDir)) {
                return { success: false, error: 'Checkpoint not found' };
            }
            // Create tar archive
            const archiver = require('archiver');
            const output = fs.createWriteStream(exportPath);
            const archive = archiver('tar', { gzip: true, gzipOptions: { level: this.options.compressionLevel } });
            archive.pipe(output);
            archive.directory(checkpointDir, checkpointId);
            await archive.finalize();
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async importCheckpoint(importPath) {
        try {
            // Extract tar archive
            const tar = require('tar');
            const tempDir = path.join(this.shadowRepoPath, '.import-temp');
            await fs.ensureDir(tempDir);
            await tar.extract({
                file: importPath,
                cwd: tempDir
            });
            // Find checkpoint directory
            const entries = await fs.readdir(tempDir);
            const checkpointDir = entries.find(e => e.startsWith('cp-'));
            if (!checkpointDir) {
                await fs.remove(tempDir);
                return { success: false, error: 'Invalid checkpoint archive' };
            }
            // Move to shadow repo
            const targetPath = path.join(this.shadowRepoPath, checkpointDir);
            await fs.move(path.join(tempDir, checkpointDir), targetPath);
            await fs.remove(tempDir);
            // Commit import
            await this.git.add('.');
            await this.git.commit(`Import checkpoint: ${checkpointDir}`);
            return { success: true, checkpointId: checkpointDir };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async getStatistics() {
        try {
            const checkpoints = await this.listCheckpoints();
            if (!checkpoints.success) {
                return { success: false, error: checkpoints.error };
            }
            const stats = {
                totalCheckpoints: checkpoints.checkpoints.length,
                totalSize: 0,
                totalFiles: 0,
                oldestCheckpoint: null,
                newestCheckpoint: null,
                checkpointsByTrigger: {},
                averageSize: 0
            };
            checkpoints.checkpoints.forEach((cp, index) => {
                stats.totalSize += cp.stats.totalSize;
                stats.totalFiles += cp.stats.fileCount;
                if (index === 0)
                    stats.newestCheckpoint = cp;
                if (index === checkpoints.checkpoints.length - 1)
                    stats.oldestCheckpoint = cp;
                const trigger = cp.trigger || 'manual';
                stats.checkpointsByTrigger[trigger] = (stats.checkpointsByTrigger[trigger] || 0) + 1;
            });
            if (stats.totalCheckpoints > 0) {
                stats.averageSize = Math.round(stats.totalSize / stats.totalCheckpoints);
            }
            // Get shadow repo size
            const shadowRepoStats = await this.getDirectorySize(this.shadowRepoPath);
            stats.totalSize = shadowRepoStats.size;
            return { success: true, stats };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async getDirectorySize(dir) {
        let totalSize = 0;
        let fileCount = 0;
        const processDirectory = async (currentDir) => {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory() && entry.name !== '.git') {
                    await processDirectory(fullPath);
                }
                else if (entry.isFile()) {
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                    fileCount++;
                }
            }
        };
        await processDirectory(dir);
        return { size: totalSize, files: fileCount };
    }
    async cleanOldCheckpoints(options = {}) {
        try {
            const checkpoints = await this.listCheckpoints();
            if (!checkpoints.success) {
                return { success: false, error: checkpoints.error };
            }
            let toRemove = [];
            // Filter by age
            if (options.maxAge) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - options.maxAge);
                toRemove = checkpoints.checkpoints
                    .filter(cp => new Date(cp.created) < cutoffDate)
                    .map(cp => cp.id);
            }
            // Keep only maxCount most recent
            if (options.maxCount && checkpoints.checkpoints.length > options.maxCount) {
                const removeCount = checkpoints.checkpoints.length - options.maxCount;
                toRemove = checkpoints.checkpoints
                    .slice(-removeCount)
                    .map(cp => cp.id);
            }
            // Remove duplicates
            toRemove = [...new Set(toRemove)];
            // Delete checkpoints
            let removedCount = 0;
            for (const checkpointId of toRemove) {
                const result = await this.deleteCheckpoint(checkpointId);
                if (result.success)
                    removedCount++;
            }
            return { success: true, removed: removedCount };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    setupPostCommitWatcher() {
        // Watch for post-commit trigger file
        const triggerPath = path.join(this.workspacePath, '.git', 'claude-checkpoint-trigger');
        // Check for trigger file periodically
        setInterval(async () => {
            if (await fs.pathExists(triggerPath)) {
                // Read and remove trigger file
                await fs.remove(triggerPath);
                // Create automatic post-commit checkpoint
                await this.createCheckpoint({
                    message: 'Post-commit checkpoint',
                    trigger: 'post-commit',
                    autoCreated: true
                });
            }
        }, 2000); // Check every 2 seconds
    }
    destroy() {
        if (this.postCommitWatcher) {
            this.postCommitWatcher.close();
            this.postCommitWatcher = null;
        }
    }
}
