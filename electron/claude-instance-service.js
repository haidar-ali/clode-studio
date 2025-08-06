import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, statSync } from 'fs';
export class ClaudeInstanceService {
    claudeInstances = new Map();
    sessionService;
    mainWindow = null;
    constructor(sessionService) {
        this.sessionService = sessionService;
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    // Get instance by ID
    getInstance(instanceId) {
        return this.claudeInstances.get(instanceId);
    }
    // Check if instance exists
    hasInstance(instanceId) {
        return this.claudeInstances.has(instanceId);
    }
    // Store instance
    setInstance(instanceId, instance) {
        this.claudeInstances.set(instanceId, instance);
    }
    // Remove instance
    deleteInstance(instanceId) {
        return this.claudeInstances.delete(instanceId);
    }
    // Get all instances
    getAllInstances() {
        return this.claudeInstances;
    }
    // Clear all instances
    clearInstances() {
        this.claudeInstances.clear();
    }
    // Get instance count
    getInstanceCount() {
        return this.claudeInstances.size;
    }
    // Send command to instance
    async sendCommand(instanceId, command) {
        const claudePty = this.claudeInstances.get(instanceId);
        if (claudePty) {
            try {
                claudePty.write(command);
                return { success: true };
            }
            catch (error) {
                console.error(`Failed to send command to ${instanceId}:`, error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }
        return {
            success: false,
            error: `No Claude instance running for ${instanceId}`
        };
    }
    // Resize instance terminal
    async resizeTerminal(instanceId, cols, rows) {
        const claudePty = this.claudeInstances.get(instanceId);
        if (claudePty) {
            try {
                claudePty.resize(cols, rows);
                return { success: true };
            }
            catch (error) {
                console.error(`Failed to resize PTY for ${instanceId}:`, error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }
        return {
            success: false,
            error: `No Claude PTY running for instance ${instanceId}`
        };
    }
    // Stop instance
    async stopInstance(instanceId) {
        const claudePty = this.claudeInstances.get(instanceId);
        if (claudePty) {
            try {
                console.log(`Stopping Claude instance ${instanceId} (PID: ${claudePty.pid})...`);
                // First try SIGINT for graceful shutdown
                console.log(`Sent SIGINT to process ${claudePty.pid}`);
                claudePty.kill('SIGINT');
                // Wait a bit for graceful shutdown
                setTimeout(() => {
                    // Check if process is still running and force kill if needed
                    try {
                        if (this.claudeInstances.has(instanceId)) {
                            console.log(`Force killing Claude instance ${instanceId}...`);
                            claudePty.kill();
                            this.claudeInstances.delete(instanceId);
                        }
                    }
                    catch (error) {
                        console.error(`Error force killing Claude instance ${instanceId}:`, error);
                    }
                }, 2000);
                // Wait a bit before declaring success
                await new Promise(resolve => setTimeout(resolve, 100));
                // Process should terminate and trigger the onExit handler
                console.log(`Process ${claudePty.pid} terminated gracefully`);
                // Mark session for preservation but not auto-start
                const session = this.sessionService.get(instanceId);
                if (session) {
                    session.shouldAutoStart = false;
                    this.sessionService.saveSessionsToDisk();
                    console.log(`Session data saved for instance ${instanceId}`);
                }
                return { success: true };
            }
            catch (error) {
                console.error(`Failed to stop Claude for ${instanceId}:`, error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }
        return {
            success: false,
            error: `No Claude instance running for ${instanceId}`
        };
    }
    // Helper to detect new session files after restoration
    async detectNewSessionFile(instanceId, workingDirectory, restorationTime) {
        try {
            const projectDirName = workingDirectory.replace(/\//g, '-');
            const claudeProjectDir = join(homedir(), '.claude', 'projects', projectDirName);
            if (existsSync(claudeProjectDir)) {
                const files = readdirSync(claudeProjectDir)
                    .filter(f => f.endsWith('.jsonl'))
                    .map(f => {
                    const fullPath = join(claudeProjectDir, f);
                    const stats = statSync(fullPath);
                    return {
                        name: f.replace('.jsonl', ''),
                        time: stats.mtimeMs,
                        createdAfterRestore: stats.mtimeMs > restorationTime
                    };
                })
                    .filter(f => f.createdAfterRestore)
                    .sort((a, b) => b.time - a.time);
                if (files.length > 0) {
                    return files[0].name;
                }
            }
        }
        catch (error) {
            console.error('Failed to detect new session file:', error);
        }
        return null;
    }
}
