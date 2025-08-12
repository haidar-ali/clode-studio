#!/usr/bin/env node

/**
 * Clode Studio Launcher
 * Handles different launch modes and configurations
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  hybrid: args.includes('--hybrid'),
  headless: args.includes('--headless'),
  server: args.includes('--server'),
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v'),
  dev: args.includes('--dev'),
  debug: args.includes('--debug'),
  port: null,
  relay: null,
  auth: false
};

// Extract port if specified
const portIndex = args.findIndex(arg => arg.startsWith('--port='));
if (portIndex !== -1) {
  flags.port = args[portIndex].split('=')[1];
}

// Extract relay URL if specified
const relayIndex = args.findIndex(arg => arg.startsWith('--relay='));
if (relayIndex !== -1) {
  flags.relay = args[relayIndex].split('=')[1];
}

// Check for auth flag
flags.auth = args.includes('--auth');

// Show help
if (flags.help) {
  console.log(`
Clode Studio - AI-powered IDE for developers

Usage: clode-studio [options]

Options:
  --hybrid          Start in hybrid mode (desktop + remote access)
  --headless        Start in headless/server mode (no GUI)
  --server          Alias for --headless
  --port=<port>     Specify server port (default: 3789)
  --relay=<url>     Custom relay server URL
  --auth            Enable authentication for remote access
  --dev             Start in development mode
  --debug           Enable debug output
  --version, -v     Show version
  --help, -h        Show this help message

Environment Variables:
  CLODE_MODE        Set mode (desktop, hybrid, headless)
  RELAY_TYPE        Tunnel type (CLODE, CLOUDFLARE, CUSTOM, NONE)
  RELAY_URL         Custom relay server URL
  CLODE_SERVER_PORT Server port for remote access
  CLODE_AUTH_REQUIRED Enable authentication

Examples:
  clode-studio                    # Start desktop mode
  clode-studio --hybrid           # Desktop with remote access
  clode-studio --headless         # Server mode only
  clode-studio --hybrid --port=8080 --auth

For more information, visit: https://github.com/haidar-ali/clode-studio
`);
  process.exit(0);
}

// Show version
if (flags.version) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  console.log(`Clode Studio v${packageJson.version}`);
  process.exit(0);
}

// Determine mode
let mode = 'desktop';
if (flags.hybrid) {
  mode = 'hybrid';
} else if (flags.headless || flags.server) {
  mode = 'headless';
} else if (process.env.CLODE_MODE) {
  mode = process.env.CLODE_MODE;
}

// Check if running in a headless environment
if (!process.env.DISPLAY && process.platform === 'linux' && mode === 'desktop') {
  console.log('No display detected, switching to headless mode...');
  mode = 'headless';
}

// Set environment variables
const env = { ...process.env };

// Mode configuration
env.CLODE_MODE = mode;

// Port configuration
if (flags.port) {
  env.CLODE_SERVER_PORT = flags.port;
}

// Relay configuration
if (flags.relay) {
  env.RELAY_URL = flags.relay;
  env.RELAY_TYPE = 'CLODE';
}

// Authentication
if (flags.auth) {
  env.CLODE_AUTH_REQUIRED = 'true';
}

// Debug mode
if (flags.debug) {
  env.CLAUDE_DEBUG = 'true';
  env.DEBUG = 'electron:*';
}

// Development mode
if (flags.dev) {
  env.NODE_ENV = 'development';
}

// Get electron executable path
let electronPath;
if (process.platform === 'darwin') {
  // macOS: Check if we're inside an app bundle
  const appPath = path.join(__dirname, '..', '..', '..');
  if (appPath.endsWith('.app/Contents/Resources/app')) {
    // We're inside the app bundle
    electronPath = path.join(appPath, '..', '..', 'MacOS', 'Clode Studio');
  } else {
    // Development or unpacked
    electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  }
} else if (process.platform === 'win32') {
  // Windows
  const exePath = path.join(__dirname, '..', 'Clode Studio.exe');
  if (fs.existsSync(exePath)) {
    electronPath = exePath;
  } else {
    electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron.cmd');
  }
} else {
  // Linux
  const appImagePath = process.env.APPIMAGE;
  if (appImagePath) {
    // Running from AppImage
    electronPath = appImagePath;
  } else {
    const binaryPath = path.join(__dirname, '..', 'clode-studio');
    if (fs.existsSync(binaryPath)) {
      electronPath = binaryPath;
    } else {
      electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
    }
  }
}

// Check if electron exists
if (!fs.existsSync(electronPath) && !process.env.APPIMAGE) {
  console.error('Electron executable not found. Please ensure Clode Studio is properly installed.');
  process.exit(1);
}

// Prepare launch arguments
const launchArgs = [];

// Add main script path
const mainPath = path.join(__dirname, 'main.js');
if (!process.env.APPIMAGE && !electronPath.includes('Clode Studio')) {
  launchArgs.push(mainPath);
}

// Add any remaining arguments
const passThroughArgs = args.filter(arg => 
  !arg.startsWith('--hybrid') &&
  !arg.startsWith('--headless') &&
  !arg.startsWith('--server') &&
  !arg.startsWith('--port=') &&
  !arg.startsWith('--relay=') &&
  !arg.startsWith('--auth') &&
  !arg.startsWith('--dev') &&
  !arg.startsWith('--debug')
);
launchArgs.push(...passThroughArgs);

// Display startup message
console.log(`Starting Clode Studio in ${mode} mode...`);
if (mode === 'hybrid') {
  console.log('Remote access will be available once the app starts.');
  console.log('Look for the QR code and connection URLs in the app.');
}
if (mode === 'headless') {
  console.log('Starting in headless mode. No GUI will be shown.');
  console.log(`Server will be available on port ${env.CLODE_SERVER_PORT || 3789}`);
}

// Launch Electron
const child = spawn(electronPath, launchArgs, {
  env,
  stdio: 'inherit',
  detached: false
});

// Handle process termination
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle signals
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

// Handle errors
child.on('error', (err) => {
  console.error('Failed to start Clode Studio:', err.message);
  process.exit(1);
});