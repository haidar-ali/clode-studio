import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
export class WorkspacePersistence {
    CLAUDE_DIR = '.claude';
    CONTEXT_FILE = 'context.json';
    HISTORY_LIMIT = 50;
    CHECKPOINT_LIMIT = 5;
    // Get the .claude directory path for a workspace
    getClaudeDir(workspacePath) {
        return join(workspacePath, this.CLAUDE_DIR);
    }
    // Get the context file path for a workspace
    getContextFilePath(workspacePath) {
        return join(this.getClaudeDir(workspacePath), this.CONTEXT_FILE);
    }
    // Ensure .claude directory exists
    async ensureClaudeDir(workspacePath) {
        const claudeDir = this.getClaudeDir(workspacePath);
        if (!existsSync(claudeDir)) {
            await mkdir(claudeDir, { recursive: true });
        }
    }
    // Load workspace context data
    async loadWorkspaceContext(workspacePath) {
        try {
            const contextPath = this.getContextFilePath(workspacePath);
            if (!existsSync(contextPath)) {
                return null;
            }
            const data = await readFile(contextPath, 'utf-8');
            const parsed = JSON.parse(data);
            // Validate data structure
            if (!parsed.workspacePath || parsed.workspacePath !== workspacePath) {
                console.warn('Invalid workspace context data');
                return null;
            }
            return parsed;
        }
        catch (error) {
            console.error('Failed to load workspace context:', error);
            return null;
        }
    }
    // Save workspace context data
    async saveWorkspaceContext(data) {
        try {
            await this.ensureClaudeDir(data.workspacePath);
            const contextPath = this.getContextFilePath(data.workspacePath);
            // Update timestamp
            data.lastUpdated = new Date().toISOString();
            // Limit history and checkpoints
            if (data.contextHistory.length > this.HISTORY_LIMIT) {
                data.contextHistory = data.contextHistory.slice(-this.HISTORY_LIMIT);
            }
            if (data.checkpoints.length > this.CHECKPOINT_LIMIT) {
                data.checkpoints = data.checkpoints.slice(-this.CHECKPOINT_LIMIT);
            }
            const json = JSON.stringify(data, null, 2);
            await writeFile(contextPath, json, 'utf-8');
        }
        catch (error) {
            console.error('Failed to save workspace context:', error);
            throw error;
        }
    }
    // Add context usage to history
    async addContextHistory(workspacePath, query, context) {
        const data = await this.loadWorkspaceContext(workspacePath) || this.createDefaultData(workspacePath);
        data.contextHistory.push({
            timestamp: new Date().toISOString(),
            query,
            context
        });
        await this.saveWorkspaceContext(data);
    }
    // Update optimization time
    async updateOptimizationTime(workspacePath, lastOptimization) {
        const data = await this.loadWorkspaceContext(workspacePath) || this.createDefaultData(workspacePath);
        data.lastOptimization = lastOptimization;
        await this.saveWorkspaceContext(data);
    }
    // Update working files
    async updateWorkingFiles(workspacePath, workingFiles) {
        const data = await this.loadWorkspaceContext(workspacePath) || this.createDefaultData(workspacePath);
        data.workingFiles = workingFiles;
        await this.saveWorkspaceContext(data);
    }
    // Update project info
    async updateProjectInfo(workspacePath, projectInfo) {
        const data = await this.loadWorkspaceContext(workspacePath) || this.createDefaultData(workspacePath);
        data.projectInfo = projectInfo;
        await this.saveWorkspaceContext(data);
    }
    // Add or update checkpoint
    async saveCheckpoint(workspacePath, checkpoint) {
        const data = await this.loadWorkspaceContext(workspacePath) || this.createDefaultData(workspacePath);
        // Remove existing checkpoint with same ID
        data.checkpoints = data.checkpoints.filter(cp => cp.id !== checkpoint.id);
        // Add new checkpoint
        data.checkpoints.push(checkpoint);
        await this.saveWorkspaceContext(data);
    }
    // Remove checkpoint
    async removeCheckpoint(workspacePath, checkpointId) {
        const data = await this.loadWorkspaceContext(workspacePath);
        if (!data)
            return;
        data.checkpoints = data.checkpoints.filter(cp => cp.id !== checkpointId);
        await this.saveWorkspaceContext(data);
    }
    // Get recent context history
    async getRecentContextHistory(workspacePath, limit = 10) {
        const data = await this.loadWorkspaceContext(workspacePath);
        if (!data)
            return [];
        return data.contextHistory.slice(-limit);
    }
    // Clear old history entries
    async pruneHistory(workspacePath, daysToKeep = 7) {
        const data = await this.loadWorkspaceContext(workspacePath);
        if (!data)
            return;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        data.contextHistory = data.contextHistory.filter(entry => new Date(entry.timestamp) > cutoffDate);
        await this.saveWorkspaceContext(data);
    }
    // Create default data structure
    createDefaultData(workspacePath) {
        return {
            workspacePath,
            lastUpdated: new Date().toISOString(),
            projectInfo: null,
            workingFiles: [],
            contextHistory: [],
            lastOptimization: null,
            checkpoints: []
        };
    }
    // Export workspace context as JSON
    async exportWorkspaceContext(workspacePath) {
        const data = await this.loadWorkspaceContext(workspacePath);
        if (!data) {
            throw new Error('No workspace context found');
        }
        return JSON.stringify(data, null, 2);
    }
    // Import workspace context from JSON
    async importWorkspaceContext(workspacePath, jsonData) {
        try {
            const data = JSON.parse(jsonData);
            // Update workspace path to match current
            data.workspacePath = workspacePath;
            await this.saveWorkspaceContext(data);
        }
        catch (error) {
            throw new Error(`Failed to import workspace context: ${error}`);
        }
    }
}
// Export singleton instance
export const workspacePersistence = new WorkspacePersistence();
