#!/usr/bin/env node
/**
 * Clode Studio Remote MCP Server
 * Provides remote collaboration features to Claude via MCP
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import io from 'socket.io-client';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Configuration
const CONFIG_FILE = path.join(os.homedir(), '.clode-studio', 'remote-config.json');
const DEFAULT_CONFIG = {
  serverUrl: 'http://localhost:3789',
  auth: {},
  connectionTimeout: 30000
};

class ClodeRemoteServer {
  constructor() {
    this.server = new McpServer({
      name: 'clode-remote',
      version: '1.0.0'
    });
    
    this.socket = null;
    this.connected = false;
    this.config = DEFAULT_CONFIG;
    this.requestId = 0;
    
    this.setupHandlers();
  }
  
  async loadConfig() {
    // Start with defaults
    let config = { ...DEFAULT_CONFIG };
    
    // Override with environment variables if present
    if (process.env.CLODE_REMOTE_URL) {
      config.serverUrl = process.env.CLODE_REMOTE_URL;
    }
    if (process.env.CLODE_REMOTE_TOKEN) {
      config.auth = { token: process.env.CLODE_REMOTE_TOKEN };
    }
    
    // Override with config file if it exists
    try {
      const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
      config = { ...config, ...JSON.parse(configData) };
    } catch (error) {
      // Use environment/default config if file doesn't exist
    }
    
    this.config = config;
  }
  
  async connect() {
    if (this.connected) return;
    
    return new Promise((resolve, reject) => {
      this.socket = io(this.config.serverUrl, {
        transports: ['websocket', 'polling'],
        auth: this.config.auth,
        timeout: this.config.connectionTimeout
      });
      
      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });
      
      this.socket.on('connection:ready', (data) => {
        console.error('Remote session ready:', data.sessionId);
      });
      
      this.socket.on('disconnect', () => {
        this.connected = false;
      });
      
      this.socket.on('connect_error', (error) => {
        reject(new Error(`Failed to connect: ${error.message}`));
      });
      
      // Set timeout
      setTimeout(() => {
        if (!this.connected) {
          this.socket?.disconnect();
          reject(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeout);
    });
  }
  
  async remoteRequest(event, payload) {
    if (!this.connected) {
      await this.connect();
    }
    
    return new Promise((resolve, reject) => {
      const request = {
        id: `mcp-${++this.requestId}`,
        payload
      };
      
      this.socket.emit(event, request, (response) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
  }
  
  setupHandlers() {
    // Register tools using the correct signature
    this.server.tool(
      'remote_connect',
      'Connect to a remote Clode Studio server',
      {
        serverUrl: z.string().optional().describe('Server URL (default: http://localhost:3789)'),
        token: z.string().optional().describe('Authentication token (optional)')
      },
      async (args) => {
        if (args.serverUrl) {
          this.config.serverUrl = args.serverUrl;
        }
        if (args.token) {
          this.config.auth = { token: args.token };
        }
        await this.connect();
        return {
          content: [
            {
              type: 'text',
              text: `Connected to remote server at ${this.config.serverUrl}`
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_read_file',
      'Read a file from the remote server',
      {
        path: z.string().describe('File path to read')
      },
      async (args) => {
        const content = await this.remoteRequest('file:read', {
          path: args.path
        });
        return {
          content: [
            {
              type: 'text',
              text: content
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_write_file',
      'Write a file on the remote server',
      {
        path: z.string().describe('File path to write'),
        content: z.string().describe('File content')
      },
      async (args) => {
        await this.remoteRequest('file:write', {
          path: args.path,
          content: args.content
        });
        return {
          content: [
            {
              type: 'text',
              text: `File written successfully: ${args.path}`
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_list_directory',
      'List contents of a remote directory',
      {
        path: z.string().optional().describe('Directory path (default: /)')
      },
      async (args) => {
        const files = await this.remoteRequest('file:list', {
          path: args.path || '/'
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(files, null, 2)
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_create_terminal',
      'Create a remote terminal session',
      {
        workingDirectory: z.string().optional().describe('Working directory for the terminal')
      },
      async (args) => {
        const terminal = await this.remoteRequest('terminal:create', {
          workingDirectory: args.workingDirectory
        });
        return {
          content: [
            {
              type: 'text',
              text: `Terminal created: ${terminal.terminalId}`
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_execute_command',
      'Execute a command in a remote terminal',
      {
        terminalId: z.string().describe('Terminal ID from create_terminal'),
        command: z.string().describe('Command to execute')
      },
      async (args) => {
        // Set up output listener
        let output = '';
        const outputHandler = (event) => {
          if (event.terminalId === args.terminalId) {
            const data = new Uint8Array(event.data).reduce(
              (str, byte) => str + String.fromCharCode(byte), 
              ''
            );
            output += data;
          }
        };
        
        this.socket.on('terminal:data', outputHandler);
        
        // Execute command
        await this.remoteRequest('terminal:write', {
          terminalId: args.terminalId,
          data: args.command + '\n'
        });
        
        // Wait for output (with timeout)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Clean up listener
        this.socket.off('terminal:data', outputHandler);
        
        return {
          content: [
            {
              type: 'text',
              text: output || 'Command sent successfully'
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_sync_push',
      'Push sync patches to remote server',
      {
        patches: z.array(z.any()).describe('Array of sync patches')
      },
      async (args) => {
        await this.remoteRequest('sync:push', {
          patches: args.patches,
          compressed: false
        });
        return {
          content: [
            {
              type: 'text',
              text: `Pushed ${args.patches.length} sync patches`
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_sync_pull',
      'Pull sync patches from remote server',
      {
        since: z.string().optional().describe('ISO date string to pull patches since'),
        types: z.array(z.string()).optional().describe('Entity types to filter')
      },
      async (args) => {
        const result = await this.remoteRequest('sync:pull', {
          since: args.since ? new Date(args.since) : null,
          types: args.types
        });
        return {
          content: [
            {
              type: 'text',
              text: `Pulled ${result.patches.length} sync patches:\n${JSON.stringify(result.patches, null, 2)}`
            }
          ]
        };
      }
    );
    
    this.server.tool(
      'remote_workspace_info',
      'Get information about the remote workspace',
      {},
      async () => {
        const stats = await this.remoteRequest('sync:status', {});
        return {
          content: [
            {
              type: 'text',
              text: `Workspace sync status:\n${JSON.stringify(stats, null, 2)}`
            }
          ]
        };
      }
    );
  }
  
  async run() {
    await this.loadConfig();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Cleanup on exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }
  
  cleanup() {
    if (this.socket) {
      this.socket.disconnect();
    }
    process.exit(0);
  }
}

// Start the server
const server = new ClodeRemoteServer();
server.run().catch(console.error);