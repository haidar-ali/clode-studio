/**
 * Desktop MCP service implementation
 * Wraps existing Electron MCP IPC APIs
 */
import type {
  IMCPService,
  MCPServer,
  MCPServerConfig,
  MCPServerStatus,
  MCPResource,
  MCPCommand
} from '../../interfaces';

export class DesktopMCPService implements IMCPService {
  // Track server states locally
  private serverStates: Map<string, MCPServerStatus> = new Map();
  
  // Server management
  async listServers(): Promise<MCPServer[]> {
    const servers = await window.electronAPI.mcp.list();
    
    return servers.map((server: any) => ({
      name: server.name,
      config: {
        name: server.name,
        transport: server.type as any,
        command: server.command,
        args: server.args,
        url: server.url,
        env: server.env
      },
      status: this.serverStates.get(server.name) || { state: 'stopped' }
    }));
  }
  
  async addServer(config: MCPServerConfig): Promise<MCPServer> {
    await window.electronAPI.mcp.add({
      name: config.name,
      type: config.transport,
      command: config.command,
      args: config.args,
      url: config.url,
      env: config.env
    });
    
    const status: MCPServerStatus = { state: 'stopped' };
    this.serverStates.set(config.name, status);
    
    return {
      name: config.name,
      config,
      status
    };
  }
  
  async removeServer(name: string): Promise<void> {
    await window.electronAPI.mcp.remove(name);
    this.serverStates.delete(name);
  }
  
  async updateServer(name: string, updates: Partial<MCPServerConfig>): Promise<MCPServer> {
    // Current API doesn't support update, would need to remove and re-add
    const existing = await window.electronAPI.mcp.get(name);
    if (!existing) {
      throw new Error(`MCP server ${name} not found`);
    }
    
    await this.removeServer(name);
    const newConfig = { ...existing, ...updates, name };
    return this.addServer(newConfig as MCPServerConfig);
  }
  
  // Server control
  async startServer(name: string): Promise<void> {
    // Current API doesn't have explicit start/stop
    // Servers are managed by Claude instances
    this.serverStates.set(name, { state: 'running' });
  }
  
  async stopServer(name: string): Promise<void> {
    // Current API doesn't have explicit start/stop
    this.serverStates.set(name, { state: 'stopped' });
  }
  
  async restartServer(name: string): Promise<void> {
    await this.stopServer(name);
    await this.startServer(name);
  }
  
  // Server interaction
  async callTool(serverName: string, toolName: string, params: any): Promise<any> {
    // Current API doesn't expose direct tool calls
    // This would be handled through Claude
    throw new Error('Direct MCP tool calls not implemented in desktop mode');
  }
  
  async listResources(serverName: string): Promise<MCPResource[]> {
    // Current API doesn't expose resource listing
    return [];
  }
  
  async getResource(serverName: string, uri: string): Promise<any> {
    // Current API doesn't expose resource access
    throw new Error('MCP resource access not implemented in desktop mode');
  }
  
  // Commands
  async listCommands(serverName: string): Promise<MCPCommand[]> {
    // Current API doesn't expose command listing
    return [];
  }
  
  async executeCommand(serverName: string, command: string, params?: any): Promise<any> {
    // Current API doesn't expose command execution
    throw new Error('MCP command execution not implemented in desktop mode');
  }
  
  // Server status
  async getServerStatus(name: string): Promise<MCPServerStatus> {
    return this.serverStates.get(name) || { state: 'stopped' };
  }
  
  async getServerLogs(name: string, lines?: number): Promise<string[]> {
    // Current API doesn't expose server logs
    return [];
  }
  
  // Event handlers
  onServerOutput(name: string, callback: (data: string) => void): () => void {
    // Current API doesn't expose server output events
    return () => {};
  }
  
  onServerError(name: string, callback: (error: string) => void): () => void {
    // Current API doesn't expose server error events
    return () => {};
  }
}