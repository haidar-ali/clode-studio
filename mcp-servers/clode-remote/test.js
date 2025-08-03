#!/usr/bin/env node
/**
 * Test script for Clode Studio Remote MCP Server
 * Tests the MCP protocol implementation
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
      capabilities: {
        roots: {
          listChanged: true
        },
        sampling: {}
      },
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
  
  // Call a tool (remote_workspace_info)
  {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'remote_workspace_info',
      arguments: {}
    },
    id: 3
  }
];

async function runTest() {
  console.log('🧪 Testing Clode Studio Remote MCP Server\n');
  
  // Spawn the MCP server
  const mcpServer = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLODE_REMOTE_URL: 'http://localhost:3789'
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
          console.log('📥 Response:', JSON.stringify(response, null, 2));
          
          // Check for errors
          if (response.error) {
            console.error('❌ Error:', response.error);
          }
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
    console.log(`\n🏁 MCP server exited with code ${code}`);
  });
  
  // Send test messages
  for (const message of testMessages) {
    console.log(`\n📤 Sending: ${message.method}`);
    mcpServer.stdin.write(JSON.stringify(message) + '\n');
    
    // Wait a bit between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Clean shutdown
  console.log('\n🛑 Shutting down...');
  mcpServer.kill('SIGTERM');
}

// Run the test
runTest().catch(console.error);