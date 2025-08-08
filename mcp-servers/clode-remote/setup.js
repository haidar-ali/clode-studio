#!/usr/bin/env node
/**
 * Setup script for Clode Studio Remote MCP Server
 * Helps users configure the MCP server in Claude Desktop
 */
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect Claude Desktop config location
function getClaudeConfigPath() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32':
      return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
    case 'linux':
      return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
    default:
      throw new Error('Unsupported platform');
  }
}

async function setup() {
 
  
  // Check if running from the correct directory
  const packagePath = path.join(__dirname, 'package.json');
  try {
    await fs.access(packagePath);
  } catch {
    console.error('❌ Error: Please run this script from the mcp-servers/clode-remote directory');
    process.exit(1);
  }
  
  // Install dependencies
 
  const { execSync } = await import('child_process');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
   
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }
  
  // Create config directory
  const configDir = path.join(os.homedir(), '.clode-studio');
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  
  // Create default remote config if it doesn't exist
  const remoteConfigPath = path.join(configDir, 'remote-config.json');
  try {
    await fs.access(remoteConfigPath);
   
  } catch {
    const defaultConfig = {
      serverUrl: 'http://localhost:3789',
      auth: {},
      connectionTimeout: 30000
    };
    await fs.writeFile(remoteConfigPath, JSON.stringify(defaultConfig, null, 2));
   
  }
  
  // Generate Claude Desktop config snippet
  const mcpConfig = {
    "clode-remote": {
      "command": "node",
      "args": [path.join(__dirname, 'index.js')],
      "env": {}
    }
  };
  
 
 
  
  // Try to find Claude config
  try {
    const claudeConfigPath = getClaudeConfigPath();
   
    
    // Check if config exists
    try {
      const configData = await fs.readFile(claudeConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (config.mcpServers && config.mcpServers['clode-remote']) {
       
      } else {
       
       
      }
    } catch {
     
    }
  } catch (error) {
   
  }
  
  // Handle auto-config flag
  if (process.argv.includes('--auto-config')) {
    await autoConfig();
  }
  
 
 
}

async function autoConfig() {
  try {
    const claudeConfigPath = getClaudeConfigPath();
    let config = {};
    
    // Read existing config if it exists
    try {
      const configData = await fs.readFile(claudeConfigPath, 'utf-8');
      config = JSON.parse(configData);
    } catch {
     
    }
    
    // Ensure mcpServers exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    
    // Add our MCP server
    config.mcpServers['clode-remote'] = {
      "command": "node",
      "args": [path.join(__dirname, 'index.js')],
      "env": {}
    };
    
    // Create directory if needed
    const configDir = path.dirname(claudeConfigPath);
    await fs.mkdir(configDir, { recursive: true });
    
    // Write config
    await fs.writeFile(claudeConfigPath, JSON.stringify(config, null, 2));
   
  } catch (error) {
    console.error('\n❌ Failed to auto-configure:', error.message);
   
  }
}

// Run setup
setup().catch(console.error);