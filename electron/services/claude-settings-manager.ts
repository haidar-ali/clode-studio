/**
 * Claude Settings Manager
 * Manages Claude's settings.json file to configure MCP servers
 */
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface ClaudeSettings {
  mcpServers?: Record<string, MCPServerConfig>;
  [key: string]: any;
}

export interface MCPServerConfig {
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export class ClaudeSettingsManager {
  private settingsPath: string;
  
  constructor() {
    this.settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  }
  
  /**
   * Read Claude settings
   */
  async readSettings(): Promise<ClaudeSettings> {
    try {
      const content = await fs.readFile(this.settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // If file doesn't exist, return empty settings
      if ((error as any).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }
  
  /**
   * Write Claude settings
   */
  async writeSettings(settings: ClaudeSettings): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.settingsPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write settings with proper formatting
    await fs.writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  }
  
  /**
   * Add or update an MCP server configuration
   */
  async addMCPServer(name: string, config: MCPServerConfig): Promise<void> {
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
  async removeMCPServer(name: string): Promise<void> {
    const settings = await this.readSettings();
    
    if (settings.mcpServers && settings.mcpServers[name]) {
      delete settings.mcpServers[name];
      await this.writeSettings(settings);
    }
  }
  
  /**
   * Configure Clode Studio integration MCP server
   */
  async configureClodeIntegration(instanceId: string, workingDirectory: string, userId?: string): Promise<void> {
    const mcpPath = path.join(__dirname, '..', '..', 'mcp-servers', 'clode-integration', 'index.js');
    
    const config: MCPServerConfig = {
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
  async cleanupClodeIntegration(): Promise<void> {
    await this.removeMCPServer('clode-integration');
  }
  
  /**
   * Check if Clode integration is configured
   */
  async hasClodeIntegration(): Promise<boolean> {
    const settings = await this.readSettings();
    return !!(settings.mcpServers && settings.mcpServers['clode-integration']);
  }
  
  /**
   * Backup current settings
   */
  async backupSettings(): Promise<string> {
    const settings = await this.readSettings();
    const backupPath = `${this.settingsPath}.backup-${Date.now()}`;
    await fs.writeFile(backupPath, JSON.stringify(settings, null, 2), 'utf-8');
    return backupPath;
  }
  
  /**
   * Restore settings from backup
   */
  async restoreSettings(backupPath: string): Promise<void> {
    const backup = await fs.readFile(backupPath, 'utf-8');
    await fs.writeFile(this.settingsPath, backup, 'utf-8');
  }
}