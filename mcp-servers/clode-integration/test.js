#!/usr/bin/env node
/**
 * Test script for Clode Studio Integration MCP Server
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test messages in JSON-RPC format
const testMessages = [
  // Initialize
  {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    },
    id: 1
  },
  
  // List tools
  {
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2
  },
  
  // Call workspace info tool
  {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'clode_workspace_info',
      arguments: {}
    },
    id: 3
  },
  
  // List files in current directory
  {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'clode_list_files',
      arguments: {}
    },
    id: 4
  }
];

async function runTest() {
 
  
  // Spawn the MCP server with test environment
  const mcpServer = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLAUDE_INSTANCE_ID: 'test-instance-123',
      WORKSPACE_ID: __dirname,
      USER_ID: 'test-user'
    }
  });
  
  let responseBuffer = '';
  
  // Handle stdout (responses)
  mcpServer.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    
    // Try to parse complete JSON-RPC messages
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || ''; // Keep incomplete line
    
    lines.forEach(line => {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
         
        } catch (e) {
          // Ignore parse errors for incomplete messages
        }
      }
    });
  });
  
  // Handle stderr (logs)
  mcpServer.stderr.on('data', (data) => {
    console.error('📝 Log:', data.toString().trim());
  });
  
  // Handle exit
  mcpServer.on('exit', (code) => {
   
  });
  
  // Send test messages
  for (const message of testMessages) {
   
    mcpServer.stdin.write(JSON.stringify(message) + '\n');
    
    // Wait a bit between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Clean shutdown
 
  mcpServer.kill('SIGTERM');
}

// Run the test
runTest().catch(console.error);