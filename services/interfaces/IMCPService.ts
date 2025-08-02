/**
 * MCP (Model Context Protocol) service interface
 * Abstracts MCP server management and communication
 */
export interface IMCPService {
  // Server management
  listServers(): Promise<MCPServer[]>;
  addServer(config: MCPServerConfig): Promise<MCPServer>;
  removeServer(name: string): Promise<void>;
  updateServer(name: string, updates: Partial<MCPServerConfig>): Promise<MCPServer>;
  
  // Server control
  startServer(name: string): Promise<void>;
  stopServer(name: string): Promise<void>;
  restartServer(name: string): Promise<void>;
  
  // Server interaction
  callTool(serverName: string, toolName: string, params: any): Promise<any>;
  listResources(serverName: string): Promise<MCPResource[]>;
  getResource(serverName: string, uri: string): Promise<any>;
  
  // Commands
  listCommands(serverName: string): Promise<MCPCommand[]>;
  executeCommand(serverName: string, command: string, params?: any): Promise<any>;
  
  // Server status
  getServerStatus(name: string): Promise<MCPServerStatus>;
  getServerLogs(name: string, lines?: number): Promise<string[]>;
  
  // Event handlers
  onServerOutput(name: string, callback: (data: string) => void): () => void;
  onServerError(name: string, callback: (error: string) => void): () => void;
}

export interface MCPServer {
  name: string;
  config: MCPServerConfig;
  status: MCPServerStatus;
  pid?: number;
  startedAt?: Date;
}

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  metadata?: Record<string, any>;
}

export interface MCPServerStatus {
  state: 'stopped' | 'starting' | 'running' | 'error';
  message?: string;
  lastError?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPCommand {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}