import { ipcMain } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';
export class AIReviewMonitor {
    watcher = null;
    repoPath;
    triggerPath;
    resultPath;
    mainWindow = null;
    isMonitoring = false;
    pendingReview = null;
    constructor(repoPath) {
        this.repoPath = repoPath;
        this.triggerPath = path.join(repoPath, '.git', 'claude-ai-review-trigger');
        this.resultPath = path.join(repoPath, '.git', 'claude-ai-review-result');
        this.setupIpcHandlers();
    }
    setupIpcHandlers() {
        // Handle review result from renderer
        ipcMain.handle('ai-review:complete', async (event, result) => {
            try {
                await fs.writeFile(this.resultPath, result);
                return { success: true };
            }
            catch (error) {
                console.error('Failed to write AI review result:', error);
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });
        // Handle review status query
        ipcMain.handle('ai-review:status', async () => {
            return {
                isMonitoring: this.isMonitoring,
                hasPendingReview: this.pendingReview !== null
            };
        });
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    async start() {
        if (this.isMonitoring)
            return;
        // Clean up any existing trigger/result files
        await this.cleanup();
        // Watch for trigger file
        this.watcher = chokidar.watch(this.triggerPath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 50
            }
        });
        this.watcher.on('add', () => this.handleTrigger());
        this.watcher.on('change', () => this.handleTrigger());
        this.isMonitoring = true;
      
    }
    async stop() {
        if (!this.isMonitoring)
            return;
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        if (this.pendingReview) {
            clearTimeout(this.pendingReview);
            this.pendingReview = null;
        }
        await this.cleanup();
        this.isMonitoring = false;
      
    }
    async handleTrigger() {
        try {
            // Read trigger file
            const content = await fs.readFile(this.triggerPath, 'utf-8');
            const lines = content.trim().split('\n');
            if (lines[0] !== 'PRE_COMMIT_AI_REVIEW') {
                console.warn('Invalid AI review trigger file');
                return;
            }
            // Parse trigger options
            const trigger = {
                type: 'PRE_COMMIT_AI_REVIEW',
                severityThreshold: 'warning',
                blockOnFailure: false
            };
            lines.slice(1).forEach(line => {
                const [key, value] = line.split('=');
                if (key === 'SEVERITY_THRESHOLD') {
                    trigger.severityThreshold = value;
                }
                else if (key === 'BLOCK_ON_FAILURE') {
                    trigger.blockOnFailure = value === 'true';
                }
            });
            // Notify renderer to show AI review dialog
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('ai-review:triggered', trigger);
                // Focus the window
                if (this.mainWindow.isMinimized()) {
                    this.mainWindow.restore();
                }
                this.mainWindow.focus();
                // Set timeout to auto-bypass if no response
                this.pendingReview = setTimeout(async () => {
                    if (await fs.pathExists(this.triggerPath)) {
                        await fs.writeFile(this.resultPath, 'BYPASSED');
                        await fs.remove(this.triggerPath);
                    }
                    this.pendingReview = null;
                }, 25000); // 25 seconds (5 seconds before git hook timeout)
            }
            else {
                // No window available, bypass review
                await fs.writeFile(this.resultPath, 'BYPASSED');
            }
        }
        catch (error) {
            console.error('Error handling AI review trigger:', error);
            // Write bypass result on error
            try {
                await fs.writeFile(this.resultPath, 'BYPASSED');
            }
            catch (e) {
                // Ignore
            }
        }
    }
    async cleanup() {
        try {
            await fs.remove(this.triggerPath);
            await fs.remove(this.resultPath);
        }
        catch (error) {
            // Ignore cleanup errors
        }
    }
    async dispose() {
        await this.stop();
        ipcMain.removeHandler('ai-review:complete');
        ipcMain.removeHandler('ai-review:status');
    }
}
