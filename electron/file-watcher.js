import { watch } from 'chokidar';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
// Simple debounce implementation to avoid ESM/CommonJS issues
function debounce(func, wait) {
    let timeout = null;
    return function debounced(...args) {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func(...args);
            timeout = null;
        }, wait);
    };
}
export class FileWatcherService extends EventEmitter {
    watchers = new Map();
    fileIndex = new Map();
    changeQueue = new Map();
    processingQueue = false;
    processChangeQueueDebounced;
    constructor() {
        super();
        this.processChangeQueueDebounced = debounce(this.processChangeQueue.bind(this), 500);
    }
    /**
     * Start watching a directory
     */
    async watchDirectory(dirPath, options = {}) {
        // Stop existing watcher for this path
        if (this.watchers.has(dirPath)) {
            await this.unwatchDirectory(dirPath);
        }
        const defaultOptions = {
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/.worktrees/**',
                '**/dist/**',
                '**/build/**',
                '**/.DS_Store',
                '**/*.log',
                '**/coverage/**',
                '**/.vscode/**',
                '**/.idea/**'
            ],
            depth: 10,
            followSymlinks: false,
            usePolling: false,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 100
            }
        };
        const mergedOptions = { ...defaultOptions, ...options };
        const watcher = watch(dirPath, {
            persistent: true,
            ignoreInitial: false,
            ...mergedOptions
        });
        // Initialize file index for this directory
        this.fileIndex.set(dirPath, new Set());
        watcher
            .on('add', (filePath, stats) => {
            this.handleFileEvent('add', dirPath, filePath, stats);
        })
            .on('change', (filePath, stats) => {
            this.handleFileEvent('change', dirPath, filePath, stats);
        })
            .on('unlink', (filePath) => {
            this.handleFileEvent('unlink', dirPath, filePath);
        })
            .on('error', (error) => {
            console.error(`Watcher error for ${dirPath}:`, error);
            this.emit('error', { directory: dirPath, error });
        })
            .on('ready', () => {
            this.emit('ready', { directory: dirPath });
        });
        this.watchers.set(dirPath, watcher);
    }
    /**
     * Stop watching a directory
     */
    async unwatchDirectory(dirPath) {
        const watcher = this.watchers.get(dirPath);
        if (watcher) {
            await watcher.close();
            this.watchers.delete(dirPath);
            this.fileIndex.delete(dirPath);
            this.changeQueue.delete(dirPath);
        }
    }
    /**
     * Stop all watchers
     */
    async stopAll() {
        const promises = Array.from(this.watchers.keys()).map(dirPath => this.unwatchDirectory(dirPath));
        await Promise.all(promises);
    }
    /**
     * Get all watched files for a directory
     */
    getWatchedFiles(dirPath) {
        const index = this.fileIndex.get(dirPath);
        return index ? Array.from(index) : [];
    }
    /**
     * Check if a file is being watched
     */
    isWatching(filePath) {
        for (const [dirPath, files] of this.fileIndex.entries()) {
            if (files.has(filePath) || filePath.startsWith(dirPath)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Handle file events
     */
    handleFileEvent(type, dirPath, filePath, stats) {
        const relativePath = path.relative(dirPath, filePath);
        const event = {
            type,
            path: filePath,
            relativePath,
            stats
        };
        // Update file index
        const index = this.fileIndex.get(dirPath);
        if (index) {
            if (type === 'add' || type === 'change') {
                index.add(filePath);
            }
            else if (type === 'unlink') {
                index.delete(filePath);
            }
        }
        // Add to change queue
        if (!this.changeQueue.has(dirPath)) {
            this.changeQueue.set(dirPath, []);
        }
        this.changeQueue.get(dirPath).push(event);
        // Process queue
        this.processChangeQueueDebounced();
    }
    /**
     * Process queued changes (debounced)
     */
    async processChangeQueue() {
        if (this.processingQueue)
            return;
        this.processingQueue = true;
        try {
            for (const [dirPath, events] of this.changeQueue.entries()) {
                if (events.length === 0)
                    continue;
                // Group events by file
                const fileEvents = new Map();
                for (const event of events) {
                    if (!fileEvents.has(event.path)) {
                        fileEvents.set(event.path, []);
                    }
                    fileEvents.get(event.path).push(event);
                }
                // Process each file's events
                for (const [filePath, fileEventList] of fileEvents.entries()) {
                    // Get the latest event for this file
                    const latestEvent = fileEventList[fileEventList.length - 1];
                    // Emit individual event
                    this.emit('file:change', {
                        directory: dirPath,
                        event: latestEvent
                    });
                }
                // Emit batch event
                this.emit('batch:change', {
                    directory: dirPath,
                    events: events.slice()
                });
                // Clear processed events
                this.changeQueue.set(dirPath, []);
            }
        }
        finally {
            this.processingQueue = false;
        }
    }
    /**
     * Perform incremental indexing of changed files
     */
    async performIncrementalIndex(filePath, type) {
        if (type === 'unlink') {
            // File was deleted, remove from index
            return {
                action: 'remove',
                path: filePath
            };
        }
        try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                return null;
            }
            const ext = path.extname(filePath).toLowerCase();
            const supportedExtensions = [
                '.ts', '.tsx', '.js', '.jsx', '.vue', '.py', '.java',
                '.cs', '.go', '.rs', '.cpp', '.c', '.h', '.php', '.rb',
                '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.css'
            ];
            if (!supportedExtensions.includes(ext)) {
                return null;
            }
            const content = await fs.readFile(filePath, 'utf-8');
            const metadata = {
                path: filePath,
                size: stats.size,
                modified: stats.mtime,
                extension: ext,
                lines: content.split('\n').length
            };
            // Extract basic information
            const indexData = {
                action: type === 'add' ? 'add' : 'update',
                path: filePath,
                metadata,
                content: content.substring(0, 1000), // First 1000 chars for preview
                extractedInfo: this.extractFileInfo(content, ext)
            };
            return indexData;
        }
        catch (error) {
            console.error(`Error indexing file ${filePath}:`, error);
            return null;
        }
    }
    /**
     * Extract information from file content
     */
    extractFileInfo(content, extension) {
        const info = {
            imports: [],
            exports: [],
            functions: [],
            classes: [],
            interfaces: []
        };
        // Simple regex-based extraction (can be enhanced with proper parsing)
        if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
            // Extract imports
            const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                info.imports.push(match[1]);
            }
            // Extract exports
            const exportRegex = /export\s+(?:default\s+)?(?:const|let|var|function|class|interface)\s+(\w+)/g;
            while ((match = exportRegex.exec(content)) !== null) {
                info.exports.push(match[1]);
            }
            // Extract functions
            const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
            while ((match = functionRegex.exec(content)) !== null) {
                info.functions.push(match[1]);
            }
            // Extract classes
            const classRegex = /(?:export\s+)?class\s+(\w+)/g;
            while ((match = classRegex.exec(content)) !== null) {
                info.classes.push(match[1]);
            }
            // Extract interfaces (TypeScript)
            if (['.ts', '.tsx'].includes(extension)) {
                const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
                while ((match = interfaceRegex.exec(content)) !== null) {
                    info.interfaces.push(match[1]);
                }
            }
        }
        return info;
    }
    /**
     * Get statistics about watched directories
     */
    getStatistics() {
        const stats = {
            watchedDirectories: this.watchers.size,
            totalFiles: 0,
            directories: {}
        };
        for (const [dirPath, files] of this.fileIndex.entries()) {
            stats.directories[dirPath] = {
                fileCount: files.size,
                files: Array.from(files)
            };
            stats.totalFiles += files.size;
        }
        return stats;
    }
}
// Singleton instance
export const fileWatcherService = new FileWatcherService();
