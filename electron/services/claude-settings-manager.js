/**
 * Claude Settings Manager
 * Manages Claude's settings.json file to configure MCP servers
 */
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
export class ClaudeSettingsManager {
    settingsPath;
    constructor() {
        this.settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    }
    /**
     * Read Claude settings
     */
    async readSettings() {
        try {
            const content = await fs.readFile(this.settingsPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            // If file doesn't exist, return empty settings
            if (error.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }
    /**
     * Write Claude settings
     */
    async writeSettings(settings) {
        // Ensure directory exists
        const dir = path.dirname(this.settingsPath);
        await fs.mkdir(dir, { recursive: true });
        // Write settings with proper formatting
        await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }
    /**
     * Add or update an MCP server configuration
     */
    async addMCPServer(name, config) {
        const settings = await this.readSettings();
        if (!settings.mcpServers) {
            settings.mcpServers = {};
        }
        settings.mcpServers[name] = config;
        await this.writeSettings(settings);
    }
    /**
     * Remove an MCP server configuration
     */
    async removeMCPServer(name) {
        const settings = await this.readSettings();
        if (settings.mcpServers && settings.mcpServers[name]) {
            delete settings.mcpServers[name];
            await this.writeSettings(settings);
        }
    }
    /**
     * Configure Clode Studio integration MCP server
     */
    async configureClodeIntegration(instanceId, workingDirectory, userId) {
        const mcpPath = path.join(__dirname, '..', '..', 'mcp-servers', 'clode-integration', 'index.js');
        const config = {
            transport: 'stdio',
            command: 'node',
            args: [mcpPath],
            env: {
                CLAUDE_INSTANCE_ID: instanceId,
                WORKSPACE_ID: workingDirectory,
                USER_ID: userId || process.env.USER || 'unknown'
            }
        };
        await this.addMCPServer('clode-integration', config);
    }
    /**
     * Clean up Clode integration MCP server
     */
    async cleanupClodeIntegration() {
        await this.removeMCPServer('clode-integration');
    }
    /**
     * Check if Clode integration is configured
     */
    async hasClodeIntegration() {
        const settings = await this.readSettings();
        return !!(settings.mcpServers && settings.mcpServers['clode-integration']);
    }
    /**
     * Backup current settings
     */
    async backupSettings() {
        const settings = await this.readSettings();
        const backupPath = `${this.settingsPath}.backup-${Date.now()}`;
        await fs.writeFile(backupPath, JSON.stringify(settings, null, 2), 'utf-8');
        return backupPath;
    }
    /**
     * Restore settings from backup
     */
    async restoreSettings(backupPath) {
        const backup = await fs.readFile(backupPath, 'utf-8');
        await fs.writeFile(this.settingsPath, backup, 'utf-8');
    }
}
