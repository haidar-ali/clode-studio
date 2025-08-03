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
  console.log('🚀 Clode Studio Remote MCP Server Setup\n');
  
  // Check if running from the correct directory
  const packagePath = path.join(__dirname, 'package.json');
  try {
    await fs.access(packagePath);
  } catch {
    console.error('❌ Error: Please run this script from the mcp-servers/clode-remote directory');
    process.exit(1);
  }
  
  // Install dependencies
  console.log('📦 Installing dependencies...');
  const { execSync } = await import('child_process');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Dependencies installed\n');
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
    console.log('📄 Remote config already exists at:', remoteConfigPath);
  } catch {
    const defaultConfig = {
      serverUrl: 'http://localhost:3789',
      auth: {},
      connectionTimeout: 30000
    };
    await fs.writeFile(remoteConfigPath, JSON.stringify(defaultConfig, null, 2));
    console.log('✅ Created remote config at:', remoteConfigPath);
  }
  
  // Generate Claude Desktop config snippet
  const mcpConfig = {
    "clode-remote": {
      "command": "node",
      "args": [path.join(__dirname, 'index.js')],
      "env": {}
    }
  };
  
  console.log('\n📋 Add this to your Claude Desktop config:\n');
  console.log(JSON.stringify({ mcpServers: mcpConfig }, null, 2));
  
  // Try to find Claude config
  try {
    const claudeConfigPath = getClaudeConfigPath();
    console.log('\n📍 Your Claude Desktop config is likely at:', claudeConfigPath);
    
    // Check if config exists
    try {
      const configData = await fs.readFile(claudeConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (config.mcpServers && config.mcpServers['clode-remote']) {
        console.log('\n⚠️  Warning: clode-remote MCP server is already configured');
      } else {
        console.log('\n💡 Tip: You can automatically add this config by running:');
        console.log(`   node setup.js --auto-config`);
      }
    } catch {
      console.log('\n💡 Tip: Claude Desktop config doesn\'t exist yet. It will be created when you first run Claude Desktop.');
    }
  } catch (error) {
    console.log('\n⚠️  Could not detect Claude Desktop config location for your platform');
  }
  
  // Handle auto-config flag
  if (process.argv.includes('--auto-config')) {
    await autoConfig();
  }
  
  console.log('\n✅ Setup complete! You can now use the clode-remote MCP server in Claude Desktop.');
  console.log('\n📚 See README.md for usage instructions');
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
      console.log('Creating new Claude Desktop config...');
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
    console.log('\n✅ Automatically added clode-remote to Claude Desktop config!');
  } catch (error) {
    console.error('\n❌ Failed to auto-configure:', error.message);
    console.log('Please add the configuration manually.');
  }
}

// Run setup
setup().catch(console.error);