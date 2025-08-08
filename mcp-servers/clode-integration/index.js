#!/usr/bin/env node
/**
 * Clode Studio Integration MCP Server
 * Provides Claude instances with tools to interact with Clode Studio features
 * This runs alongside Claude instances spawned by Clode Studio
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

class ClodeIntegrationServer {
  constructor() {
    this.server = new McpServer({
      name: 'clode-integration',
      version: '1.0.0'
    });
    
    // Get context from environment variables set by Clode Studio
    this.context = {
      instanceId: process.env.CLAUDE_INSTANCE_ID || 'unknown',
      instanceName: process.env.CLAUDE_INSTANCE_NAME || 'Claude',
      workingDirectory: process.env.PWD || process.cwd(),
      userId: process.env.USER_ID || process.env.USER || 'unknown',
      workspaceId: process.env.WORKSPACE_ID || 'default'
    };
    
    this.setupHandlers();
  }
  
  setupHandlers() {
    // File operations
    this.server.tool(
      'clode_read_file',
      'Read a file in the current Clode Studio workspace',
      {
        path: z.string().describe('Relative or absolute file path')
      },
      async (args) => {
        const filePath = path.isAbsolute(args.path) 
          ? args.path 
          : path.join(this.context.workingDirectory, args.path);
          
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return {
            content: [
              {
                type: 'text',
                text: content
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error reading file: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    this.server.tool(
      'clode_write_file',
      'Write a file in the current Clode Studio workspace',
      {
        path: z.string().describe('Relative or absolute file path'),
        content: z.string().describe('File content to write')
      },
      async (args) => {
        const filePath = path.isAbsolute(args.path) 
          ? args.path 
          : path.join(this.context.workingDirectory, args.path);
          
        try {
          await fs.writeFile(filePath, args.content, 'utf-8');
          return {
            content: [
              {
                type: 'text',
                text: `File written successfully: ${filePath}`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error writing file: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    this.server.tool(
      'clode_list_files',
      'List files in a directory within the Clode Studio workspace',
      {
        path: z.string().optional().describe('Directory path (default: current working directory)')
      },
      async (args) => {
        const dirPath = args.path 
          ? (path.isAbsolute(args.path) ? args.path : path.join(this.context.workingDirectory, args.path))
          : this.context.workingDirectory;
          
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const files = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.join(dirPath, entry.name)
          }));
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(files, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error listing directory: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    // Terminal operations
    this.server.tool(
      'clode_execute_command',
      'Execute a shell command in the Clode Studio workspace',
      {
        command: z.string().describe('Command to execute'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)')
      },
      async (args) => {
        return new Promise((resolve) => {
          const timeout = args.timeout || 30000;
          let output = '';
          let error = '';
          
          const proc = spawn(args.command, [], {
            shell: true,
            cwd: this.context.workingDirectory,
            env: { ...process.env }
          });
          
          const timer = setTimeout(() => {
            proc.kill();
            resolve({
              content: [
                {
                  type: 'text',
                  text: `Command timed out after ${timeout}ms\nPartial output:\n${output}\n${error ? `Error: ${error}` : ''}`
                }
              ],
              isError: true
            });
          }, timeout);
          
          proc.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          proc.stderr.on('data', (data) => {
            error += data.toString();
          });
          
          proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({
              content: [
                {
                  type: 'text',
                  text: `Exit code: ${code}\n${output}${error ? `\nError output:\n${error}` : ''}`
                }
              ],
              isError: code !== 0
            });
          });
        });
      }
    );
    
    // Workspace information
    this.server.tool(
      'clode_workspace_info',
      'Get information about the current Clode Studio workspace and context',
      {},
      async () => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                instanceId: this.context.instanceId,
                instanceName: this.context.instanceName,
                workingDirectory: this.context.workingDirectory,
                userId: this.context.userId,
                workspaceId: this.context.workspaceId,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
              }, null, 2)
            }
          ]
        };
      }
    );
    
    // Git operations
    this.server.tool(
      'clode_git_status',
      'Get git status of the current workspace',
      {},
      async () => {
        return new Promise((resolve) => {
          const proc = spawn('git', ['status', '--porcelain'], {
            cwd: this.context.workingDirectory
          });
          
          let output = '';
          let error = '';
          
          proc.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          proc.stderr.on('data', (data) => {
            error += data.toString();
          });
          
          proc.on('close', (code) => {
            if (code !== 0) {
              resolve({
                content: [
                  {
                    type: 'text',
                    text: `Not a git repository or git error: ${error}`
                  }
                ],
                isError: true
              });
            } else {
              resolve({
                content: [
                  {
                    type: 'text',
                    text: output || 'Working directory clean'
                  }
                ]
              });
            }
          });
        });
      }
    );
    
    // Task management integration
    this.server.tool(
      'clode_list_tasks',
      'List tasks from Clode Studio task board',
      {
        status: z.enum(['pending', 'in-progress', 'completed']).optional().describe('Filter by status')
      },
      async (args) => {
        // This would integrate with Clode Studio's task system
        // For now, return a placeholder
        return {
          content: [
            {
              type: 'text',
              text: 'Task integration pending. This will connect to Clode Studio task board.'
            }
          ]
        };
      }
    );
    
    // Knowledge base access
    this.server.tool(
      'clode_search_knowledge',
      'Search the Clode Studio knowledge base',
      {
        query: z.string().describe('Search query')
      },
      async (args) => {
        // This would integrate with Clode Studio's knowledge base
        // For now, return a placeholder
        return {
          content: [
            {
              type: 'text',
              text: `Knowledge base search for "${args.query}" - integration pending.`
            }
          ]
        };
      }
    );
  }
  
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log startup for debugging
    console.error(`Clode Integration MCP Server started for instance: ${this.context.instanceId}`);
    
    // Cleanup on exit
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  }
}

// Start the server
const server = new ClodeIntegrationServer();
server.run().catch(console.error);