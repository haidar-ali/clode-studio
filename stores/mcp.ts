import { defineStore } from 'pinia';

// MCP Server configuration types
export interface MCPServer {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  lastConnected?: Date;
  capabilities?: {
    resources?: boolean;
    prompts?: boolean;
    tools?: boolean;
  };
}

export interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export const useMCPStore = defineStore('mcp', {
  state: () => ({
    servers: [] as MCPServer[],
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    connectedServers: (state) => state.servers.filter(s => s.status === 'connected'),
    disconnectedServers: (state) => state.servers.filter(s => s.status === 'disconnected'),
    serverCount: (state) => state.servers.length,
    connectedCount: (state) => state.servers.filter(s => s.status === 'connected').length,
  },

  actions: {
    async loadServers() {
      try {
        this.isLoading = true;
        this.error = null;

        if (window.electronAPI?.mcp?.list) {
          // Desktop mode - direct access
          const { useEditorStore } = await import('~/stores/editor');
          const editorStore = useEditorStore();
          const workspacePath = editorStore.workspacePath;
          
          const result = await window.electronAPI.mcp.list(workspacePath);
          if (result.success && result.servers) {
            this.servers = result.servers.map((server: any) => ({
              name: server.name,
              type: server.transport?.toLowerCase() || 'stdio',
              command: server.command,
              url: server.url,
              status: 'connected', // Claude CLI manages connections
              capabilities: server.capabilities || {},
              args: server.args,
              env: server.env,
            }));
          } else {
            this.servers = [];
            if (result.error) {
              this.error = result.error;
            }
          }
        } else {
          // Remote mode - get from desktop via Socket.IO
          const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
          const socket = remoteConnection.getSocket();
          
          if (socket?.connected) {
            try {
              const features = await new Promise<any>((resolve, reject) => {
                const request = {
                  id: `mcp-store-${Date.now()}`,
                  payload: {}
                };
                
                const timeout = setTimeout(() => {
                  reject(new Error('Request timeout'));
                }, 5000);
                
                socket.emit('desktop:features:get', request, (response: any) => {
                  clearTimeout(timeout);
                  if (response.success) {
                    resolve(response.data);
                  } else {
                    reject(new Error(response.error?.message || 'Request failed'));
                  }
                });
              });
              
              // Extract MCP servers from features
              this.servers = features?.mcp?.servers || [];
            } catch (error) {
              console.error('Failed to load MCP servers from remote:', error);
              this.servers = [];
            }
          } else {
            console.debug('No remote connection available');
            this.servers = [];
          }
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to load MCP servers';
        console.error('Failed to load MCP servers:', error);
      } finally {
        this.isLoading = false;
      }
    },

    async addServer(config: MCPServerConfig) {
      try {
        // Ensure config is a plain object that can be serialized
        const plainConfig = {
          name: config.name,
          type: config.type,
          ...(config.command && { command: config.command }),
          ...(config.args && { args: [...config.args] }),
          ...(config.url && { url: config.url }),
          ...(config.env && { env: { ...config.env } }),
          ...(config.headers && { headers: { ...config.headers } })
        };
        
        
        
        const result = await window.electronAPI.mcp.add(plainConfig);
        if (result.success) {
          // Reload servers after adding
          await this.loadServers();
          return this.servers.find(s => s.name === config.name);
        } else {
          throw new Error(result.error || 'Failed to add server');
        }
      } catch (error) {
        console.error('Failed to add MCP server:', error);
        throw error;
      }
    },

    async removeServer(name: string) {
      try {
        const result = await window.electronAPI.mcp.remove(name);
        if (result.success) {
          // Reload servers after removing
          await this.loadServers();
        } else {
          throw new Error(result.error || 'Failed to remove server');
        }
      } catch (error) {
        console.error('Failed to remove MCP server:', error);
        throw error;
      }
    },

    async getServerDetails(name: string) {
      try {
        const result = await window.electronAPI.mcp.get(name);
        if (result.success && result.server) {
          // Update server details in our store
          const server = this.servers.find(s => s.name === name);
          if (server) {
            server.capabilities = result.server.capabilities || {};
            if (result.server.env) server.env = result.server.env;
            if (result.server.args) server.args = result.server.args;
          }
          return result.server;
        }
        return null;
      } catch (error) {
        console.error(`Failed to get details for MCP server ${name}:`, error);
        return null;
      }
    },

    async testServer(config: MCPServerConfig) {
      try {
        const result = await window.electronAPI.mcp.test(config);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Test failed',
        };
      }
    },

  },
});