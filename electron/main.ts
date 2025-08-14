import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as path from 'path';
import { spawn, fork, ChildProcess } from 'child_process';
import Store from 'electron-store';
import * as pty from 'node-pty';
import { FSWatcher, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as fs from 'fs';
import { readFile, mkdir } from 'fs/promises';
import { watch as chokidarWatch } from 'chokidar';
import { homedir } from 'os';
import { claudeCodeService } from './claude-sdk-service.js';
import { lightweightContext } from './lightweight-context.js';
import { contextOptimizer } from './context-optimizer.js';
import { workspacePersistence } from './workspace-persistence.js';
import { searchWithRipgrep } from './search-ripgrep.js';
import { claudeSettingsManager as importedClaudeSettingsManager } from './claude-settings-manager.js';
import { ClaudeDetector } from './claude-detector.js';
import { fileWatcherService } from './file-watcher.js';
import { createKnowledgeCache } from './knowledge-cache.js';
import { GitService } from './git-service.js';
import { GitServiceManager } from './git-service-manager.js';
import { WorktreeManager } from './worktree-manager.js';
import { WorktreeManagerGlobal } from './worktree-manager-global.js';
import { GitHooksManagerGlobal } from './git-hooks-manager-global.js';
import { GitHooksManager } from './git-hooks.js';
import { SnapshotService } from './snapshot-service.js';
import { setupGitTimelineHandlers } from './git-timeline-handlers.js';
import { ghostTextService } from './ghost-text-service.js';
// LocalDatabase removed - SQLite not actively used
import { getModeManager, MainProcessMode } from './services/mode-config.js';
import { RemoteServer } from './services/remote-server.js';
import { ClaudeSettingsManager } from './services/claude-settings-manager.js';
import { CloudflareTunnel } from './services/cloudflare-tunnel.js';
import { RelayClient } from './services/relay-client.js';
import { claudeInstanceManager } from './services/claude-instance-manager.js';

// Load environment variables from .env file
import { config } from 'dotenv';
config();

// Extend global for pending output storage
declare global {
  var pendingClaudeOutput: Map<string, string> | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const store = new Store<Record<string, any>>();
const fileWatchers: Map<string, any> = new Map();

// Multi-instance Claude support
const claudeInstances: Map<string, pty.IPty> = new Map(); // Keep for backward compatibility, will migrate gradually

// Mode manager and remote server
const modeManager = getModeManager();
let remoteServer: RemoteServer | null = null;
let cloudflareTunnel: CloudflareTunnel | null = null;
let relayClient: RelayClient | null = null;

// Claude settings manager
const claudeSettingsManager = importedClaudeSettingsManager;

// Knowledge cache instances per workspace
const knowledgeCaches: Map<string, any> = new Map();

// Git service instances per workspace
const gitServices: Map<string, GitService> = new Map();


// Worktree manager instances per workspace
const worktreeManagers: Map<string, WorktreeManager> = new Map();

// Git hooks manager instances per workspace - now handled by GitHooksManagerGlobal
// const gitHooksManagers: Map<string, GitHooksManager> = new Map();

// Snapshot service instances per workspace
const snapshotServices: Map<string, SnapshotService> = new Map();

// Export getter for remoteServer for use in other modules
export function getRemoteServer(): RemoteServer | null {
  return remoteServer;
}

const isDev = process.env.NODE_ENV !== 'production';
let nuxtURL = 'http://localhost:3000';
let serverProcess: ChildProcess | null = null;

// Start Nuxt server function
const startNuxtServer = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!app.isPackaged) {
      // Development mode - server is already running via npm run dev
      console.log('Development mode - using existing server');
      setTimeout(resolve, 100);
      return;
    }

    // Production mode - start the Nuxt server from extraResources
    console.log('Starting Nuxt server in production...');
    
    // Get the path to the server in extraResources
    const resourcesPath = process.resourcesPath;
    const serverPath = join(resourcesPath, '.output', 'server', 'index.mjs');
    
    console.log('Server path:', serverPath);
    
    if (!existsSync(serverPath)) {
      console.error('Server file not found at:', serverPath);
      reject(new Error('Server file not found'));
      return;
    }

    // Fork the server process
    serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: '3000',
        HOST: 'localhost',
        NODE_ENV: 'production',
        NITRO_PORT: '3000',
        NITRO_HOST: 'localhost'
      },
      silent: true // Capture stdout/stderr
    });

    let serverStarted = false;

    serverProcess.stdout?.on('data', (data) => {
      const message = data.toString();
      console.log('Nuxt:', message);
      
      // Check if server is ready
      if (!serverStarted && (message.includes('3000') || message.includes('Listening') || message.includes('ready'))) {
        serverStarted = true;
        console.log('Nuxt server is ready!');
        setTimeout(resolve, 500); // Give it a moment to stabilize
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error('Nuxt Error:', data.toString());
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start Nuxt server:', error);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      console.log('Nuxt server exited with code:', code);
    });

    // Timeout fallback
    setTimeout(() => {
      if (!serverStarted) {
        console.log('Server start timeout - proceeding anyway');
        resolve();
      }
    }, 5000);
  });
};

// Clean up server on quit
app.on('before-quit', () => {
  if (serverProcess) {
    console.log('Stopping Nuxt server...');
    serverProcess.kill();
  }
  
  // Clean up all pending Claude output
  if (global.pendingClaudeOutput && global.pendingClaudeOutput.size > 0) {
    console.log('Cleaning up all pending Claude output...');
    global.pendingClaudeOutput.clear();
  }
  
  // Kill all Claude instances
  claudeInstances.forEach((pty, instanceId) => {
    console.log(`Killing Claude instance ${instanceId}`);
    try {
      pty.kill();
    } catch (error) {
      console.error(`Failed to kill Claude instance ${instanceId}:`, error);
    }
  });
  claudeInstances.clear();
});

function createWindow() {
  // Set up icon path
  const iconPath = process.platform === 'darwin'
    ? join(__dirname, '..', 'build', 'icon.icns')
    : process.platform === 'win32'
    ? join(__dirname, '..', 'build', 'icon.ico')
    : join(__dirname, '..', 'build', 'icon.png');
  
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'Clode Studio',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 15, y: 13 }, // macOS traffic light position
    backgroundColor: '#1e1e1e',
    show: false
  });

  mainWindow.loadURL(nuxtURL);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
    
    // Update remote server with new window reference if it exists
    if (remoteServer && mainWindow) {
      remoteServer.updateMainWindow(mainWindow);
    }
    
    // Flush any pending Claude output
    if (global.pendingClaudeOutput && global.pendingClaudeOutput.size > 0) {
      console.log('Flushing pending Claude output to new window');
      setTimeout(() => {
        global.pendingClaudeOutput?.forEach((output, instanceId) => {
          if (output && mainWindow && !mainWindow.isDestroyed()) {
            console.log(`Flushing ${output.length} chars for instance ${instanceId}`);
            mainWindow.webContents.send(`claude:output:${instanceId}`, output);
          }
        });
        global.pendingClaudeOutput?.clear();
      }, 1000); // Give renderer time to set up listeners
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Clean up all Claude instances
    claudeInstances.forEach((pty, instanceId) => {
      pty.kill();
    });
    claudeInstances.clear();
  });
}

app.whenReady().then(async () => {
  // Log the current mode
  console.log(`[Main] Starting in ${modeManager.getMode()} mode`);
  
  // Start Nuxt server (needed for all modes - it's the UI that remote users access)
  if (app.isPackaged) {
    try {
      console.log('Starting Nuxt server for production...');
      await startNuxtServer();
      console.log('Nuxt server started successfully');
    } catch (error) {
      console.error('Failed to start Nuxt server:', error);
      // In headless mode, just log and exit
      if (modeManager.isHeadlessMode()) {
        console.error('Cannot start in headless mode without UI server');
        app.quit();
        return;
      }
      // In desktop/hybrid mode, show error dialog
      dialog.showErrorBox('Server Error', 'Failed to start the application server. Please try again.');
      app.quit();
      return;
    }
  }
  
  // Initialize all service managers (singletons)
  GitServiceManager.getInstance();
  WorktreeManagerGlobal.getInstance();
  GitHooksManagerGlobal.getInstance();
  
  // LocalDatabase removed - SQLite not actively used
  let workspacePath = (store as any).get('workspacePath');
  
  // In headless mode, use workspace from config
  if (modeManager.isHeadlessMode()) {
    const config = modeManager.getConfig();
    if (config.workspacePath) {
      workspacePath = config.workspacePath;
      (store as any).set('workspacePath', workspacePath);
      // Also set it as a global variable for RemoteClaudeHandler
      (global as any).__currentWorkspace = workspacePath;
      console.log(`[Main] Setting workspace to: ${workspacePath}`);
      console.log(`[Main] Global workspace set to:`, (global as any).__currentWorkspace);
    }
  }
  
  // Initialize autocomplete services (needed for remote clients too)
  await ghostTextService.initialize();
  
  // Setup Git Timeline handlers
  setupGitTimelineHandlers();

  // Only create window if not in headless mode
  if (!modeManager.isHeadlessMode()) {
    createWindow();
  }
  
  // Set up periodic cleanup of orphaned pending output (every 5 minutes)
  setInterval(() => {
    if (global.pendingClaudeOutput && global.pendingClaudeOutput.size > 0) {
      // Check for orphaned entries (instances that no longer exist)
      const activeInstances = new Set(claudeInstances.keys());
      let cleanedCount = 0;
      
      global.pendingClaudeOutput.forEach((output, instanceId) => {
        if (!activeInstances.has(instanceId)) {
          console.log(`Cleaning up orphaned pending output for ${instanceId}`);
          global.pendingClaudeOutput?.delete(instanceId);
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} orphaned pending output entries`);
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Check if hybrid mode was enabled in settings and auto-start it
  const savedHybridMode = (store as any).get('hybridModeEnabled');
  const savedRelayType = (store as any).get('relayType') || 'CLODE';
  const savedCustomUrl = (store as any).get('customRelayUrl');
  
  if (savedHybridMode && !modeManager.isHybridMode()) {
    console.log('[Main] Auto-starting hybrid mode from saved settings...');
    console.log('[Main] Using saved relay type:', savedRelayType);
    if (savedCustomUrl) {
      console.log('[Main] Using custom relay URL:', savedCustomUrl);
    }
    
    // Enable hybrid mode with saved relay type and custom URL
    setTimeout(async () => {
      try {
        const result = await enableHybridMode(savedRelayType, savedCustomUrl);
        if (result && result.success) {
          console.log('[Main] Hybrid mode auto-started successfully');
          // Notify the UI that hybrid mode is enabled
          mainWindow?.webContents.send('hybrid-mode-enabled', { relayType: savedRelayType });
        } else {
          console.error('[Main] Failed to auto-start hybrid mode:', result?.error);
        }
      } catch (error) {
        console.error('[Main] Error auto-starting hybrid mode:', error);
      }
    }, 3000); // Delay to ensure window is ready
  }
  
  // Initialize remote server if in hybrid or headless mode
  if ((modeManager.isHybridMode() || modeManager.isHeadlessMode()) && (mainWindow || modeManager.isHeadlessMode())) {
    const config = modeManager.getConfig();
    remoteServer = new RemoteServer({
      config,
      mainWindow: mainWindow || null as any // In headless mode, mainWindow is null
    });
    
    try {
      await remoteServer.start();
     
      
      // Make remote server globally accessible for handlers
      (global as any).__remoteServer = remoteServer;
      
      // Set up IPC handler for terminal data forwarding
      ipcMain.on('forward-terminal-data', (event, data) => {
        if (remoteServer && data.socketId && data.terminalId) {
          remoteServer.forwardTerminalData(data.socketId, data.terminalId, data.data);
        }
      });
      
      // Set up IPC handler for Claude output forwarding
      ipcMain.on('forward-claude-output', (event, data) => {
        if (remoteServer && data.socketId && data.instanceId) {
          remoteServer.forwardClaudeOutput(data.socketId, data.instanceId, data.data);
        }
      });
      
      // Set up IPC handler for Claude response complete forwarding
      ipcMain.on('forward-claude-response-complete', (event, data) => {
       
        if (remoteServer && data.socketId && data.instanceId) {
         
          remoteServer.forwardClaudeResponseComplete(data.socketId, data.instanceId);
         
        } else {
          console.log('[Main] ❌ Missing requirements for forwarding:', {
            remoteServer: !!remoteServer,
            socketId: !!data.socketId,
            instanceId: !!data.instanceId
          });
        }
      });
      
      // Set up IPC handler for Claude instance updates
      ipcMain.on('claude-instances-updated', () => {
        if (remoteServer) {
          remoteServer.broadcastClaudeInstancesUpdate();
        }
        // Also notify the desktop UI
        mainWindow?.webContents.send('claude:instances:updated');
      });

      // Initialize tunnel/relay based on RELAY_TYPE environment variable
      // Options: CLODE (default), CLOUDFLARE, CUSTOM
      const relayType = (process.env.RELAY_TYPE || process.env.USE_RELAY || 'CLODE').toUpperCase();
      
      console.log(`[Main] Using relay type: ${relayType}`);
      
      switch (relayType) {
        case 'CLODE':
        case 'TRUE': // Backward compatibility with USE_RELAY=true
          // Use Clode relay server (default behavior)
          relayClient = new RelayClient(
            process.env.RELAY_URL || 'wss://relay.clode.studio'
          );
          
          relayClient.on('registered', async (info) => {
            console.log(`[Main] Clode Relay registered: ${info.url}`);
            
            // In headless mode, output the connection info with pairing parameters
            if (modeManager.isHeadlessMode()) {
              // Generate pairing parameters for easy connection
              const { generateToken, generateDeviceId, generatePairingCode } = await import('./utils/token-generator.js');
              const deviceId = generateDeviceId();
              const token = generateToken();
              const pairingCode = generatePairingCode();
              
              // Store the token for validation
              if (remoteServer) {
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
                remoteServer.storeToken(token, deviceId, 'Headless Connection', pairingCode, expiresAt);
              }
              
              // Build the complete connection URL with parameters
              const connectUrl = `${info.url}?deviceId=${deviceId}&token=${token}&pairing=${pairingCode}`;
              
              console.log('\n========================================');
              console.log('🚀 Clode Studio Headless Server Ready!');
              console.log('========================================');
              console.log(`📱 Connect URL: ${connectUrl}`);
              console.log(`🔑 Access Token: ${info.token}`);
              console.log(`📂 Workspace: ${config.workspacePath || process.cwd()}`);
              console.log('========================================\n');
            }
            
            mainWindow?.webContents.send('relay:connected', info);
          });
          
          relayClient.on('reconnected', () => {
            console.log('[Main] Clode Relay reconnected');
            mainWindow?.webContents.send('relay:reconnected');
          });
          
          relayClient.on('connection_lost', () => {
            console.log('[Main] Clode Relay connection lost');
            mainWindow?.webContents.send('relay:disconnected');
          });
          
          // Connect to relay after server is ready
          setTimeout(async () => {
            try {
              const info = await relayClient!.connect();
              console.log(`[Main] Connected to Clode Relay: ${info.url}`);
              (global as any).__relayClient = relayClient;
            } catch (error) {
              console.error('[Main] Failed to connect to Clode Relay:', error);
              // Continue without relay - fallback to local network
            }
          }, 2000);
          break;
          
        case 'CLOUDFLARE':
          // Use Cloudflare tunnel
          console.log('[Main] Initializing Cloudflare tunnel...');
          cloudflareTunnel = new CloudflareTunnel();
          
          // Set up tunnel status updates
          cloudflareTunnel.onStatusUpdated(async (tunnelInfo) => {
            // Send tunnel info to renderer process
            mainWindow?.webContents.send('tunnel:status-updated', tunnelInfo);
            console.log('[Main] Cloudflare tunnel status:', tunnelInfo);
            
            // In headless mode, output the connection info when tunnel is ready
            if (modeManager.isHeadlessMode() && tunnelInfo.url) {
              // Generate pairing parameters for easy connection
              const { generateToken, generateDeviceId, generatePairingCode } = await import('./utils/token-generator.js');
              const deviceId = generateDeviceId();
              const token = generateToken();
              const pairingCode = generatePairingCode();
              
              // Store the token for validation
              if (remoteServer) {
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
                remoteServer.storeToken(token, deviceId, 'Headless Connection', pairingCode, expiresAt);
              }
              
              // Build the complete connection URL with parameters
              const connectUrl = `${tunnelInfo.url}?deviceId=${deviceId}&token=${token}&pairing=${pairingCode}`;
              
              console.log('\n========================================');
              console.log('🚀 Clode Studio Headless Server Ready!');
              console.log('========================================');
              console.log(`📱 Connect URL: ${connectUrl}`);
              console.log(`📂 Workspace: ${config.workspacePath || process.cwd()}`);
              console.log('🌐 Tunnel Type: Cloudflare');
              console.log('========================================\n');
            }
          });
          
          // Start tunnel (wait a bit for Nuxt to be ready)
          setTimeout(async () => {
            try {
              await cloudflareTunnel?.start();
              console.log('[Main] Cloudflare tunnel started successfully');
            } catch (tunnelError) {
              console.error('[Main] Failed to start Cloudflare tunnel:', tunnelError);
              // Tunnel failure shouldn't break the app, just log it
            }
          }, 2000); // Wait 2 seconds for Nuxt server to be ready
          break;
          
        case 'CUSTOM':
          // User will provide their own tunnel solution (ngrok, serveo, etc.)
          // Custom tunnels should expose port 3000 (Nuxt UI), not 3789 (remote server)
          const uiPort = 3000;
          console.log('[Main] Custom tunnel mode - user will provide their own tunnel');
          
          if (modeManager.isHeadlessMode()) {
            console.log('\n========================================');
            console.log('🚀 Clode Studio Headless Server Ready!');
            console.log('========================================');
            console.log('📂 Workspace:', config.workspacePath || process.cwd());
            console.log('🖥️  UI Server: http://localhost:' + uiPort);
            console.log('🔌 Socket Server: http://localhost:' + config.serverPort);
            console.log('\n📡 Set up your own tunnel to expose port', uiPort);
            console.log('Choose one of these commands:');
            console.log(`  • tunnelmole:  npx tunnelmole@latest ${uiPort}`);
            console.log(`  • localtunnel: npx localtunnel --port ${uiPort}`);
            console.log(`  • ngrok:       ngrok http ${uiPort}`);
            console.log(`  • serveo:      ssh -R 80:localhost:${uiPort} serveo.net`);
            console.log(`  • bore:        bore local ${uiPort} --to bore.pub`);
            console.log('========================================\n');
          } else {
            console.log('[Main] UI server running on port:', uiPort);
            console.log('[Main] Remote server running on port:', config.serverPort);
            console.log('[Main] To expose your app, use one of these commands:');
            console.log(`[Main]   tunnelmole: npx tunnelmole@latest ${uiPort}`);
            console.log(`[Main]   localtunnel: npx localtunnel --port ${uiPort}`);
            console.log(`[Main]   ngrok: ngrok http ${uiPort}`);
            console.log(`[Main]   serveo: ssh -R 80:localhost:${uiPort} serveo.net`);
            console.log(`[Main]   bore: bore local ${uiPort} --to bore.pub`);
          }
          
          // Send a message to the renderer that custom mode is active
          setTimeout(() => {
            mainWindow?.webContents.send('tunnel:custom-mode', {
              port: uiPort,
              message: 'Please set up your own tunnel solution for port 3000',
              suggestions: [
                `npx tunnelmole@latest ${uiPort}`,
                `npx localtunnel --port ${uiPort}`,
                `ngrok http ${uiPort}`,
                `ssh -R 80:localhost:${uiPort} serveo.net`,
                `bore local ${uiPort} --to bore.pub`
              ]
            });
          }, 2000);
          break;
          
        case 'FALSE':
        case 'NONE':
          // No tunnel/relay - local network only
          console.log('[Main] No tunnel/relay - local network access only');
          
          if (modeManager.isHeadlessMode()) {
            console.log('\n========================================');
            console.log('🚀 Clode Studio Headless Server Ready!');
            console.log('========================================');
            console.log('📂 Workspace:', config.workspacePath || process.cwd());
            console.log('🖥️  UI Server: http://localhost:3000');
            console.log('🔌 Socket Server: http://localhost:' + config.serverPort);
            console.log('🌐 Access Mode: Local Network Only');
            console.log('\nTo access from other devices on your network:');
            console.log('  Use your local IP address instead of localhost');
            console.log('========================================\n');
          } else {
            console.log('[Main] UI available at http://localhost:3000');
            console.log('[Main] Remote server available at http://localhost:' + config.serverPort);
          }
          
          setTimeout(() => {
            mainWindow?.webContents.send('tunnel:local-only', {
              port: 3000,
              serverPort: config.serverPort,
              message: 'Local network access only'
            });
          }, 2000);
          break;
          
        default:
          console.warn(`[Main] Unknown RELAY_TYPE: ${relayType}, falling back to CLODE`);
          // Fall back to CLODE relay
          relayClient = new RelayClient(
            process.env.RELAY_URL || 'wss://relay.clode.studio'
          );
          setTimeout(async () => {
            try {
              const info = await relayClient!.connect();
              console.log(`[Main] Connected to relay: ${info.url}`);
              (global as any).__relayClient = relayClient;
            } catch (error) {
              console.error('[Main] Failed to connect to relay:', error);
            }
          }, 2000);
      }
    } catch (error) {
      console.error('Failed to start remote server:', error);
      dialog.showErrorBox('Remote Server Error', 
        `Failed to start remote server: ${(error as Error).message}`);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      // After creating new window, update remote server reference
      if (remoteServer && mainWindow) {
        // Give window time to be ready
        setTimeout(() => {
          if (remoteServer && mainWindow) {
            remoteServer.updateMainWindow(mainWindow);
          }
        }, 100);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Claude Process Management using PTY with multi-instance support
ipcMain.handle('claude:start', async (event, instanceId: string, workingDirectory: string, instanceName?: string, runConfig?: { command?: string; args?: string[] }) => {
  // Check both the legacy map and the instance manager
  if (claudeInstances.has(instanceId) || claudeInstanceManager.hasInstance(instanceId)) {
    // Instance already running - return success with existing PID
    const existingPty = claudeInstances.get(instanceId) || claudeInstanceManager.getPty(instanceId);
    const pid = existingPty?.pid || -1;
   
    
    // Get Claude info for response
    const claudeInfo = await ClaudeDetector.detectClaude(workingDirectory);
    
    // Update instance metadata if it exists in manager
    if (claudeInstanceManager.hasInstance(instanceId)) {
      claudeInstanceManager.updateInstance(instanceId, {
        status: 'connected',
        lastActiveAt: new Date().toISOString()
      });
    }
    
    return { 
      success: true, 
      pid,
      claudeInfo,
      alreadyRunning: true 
    };
  }

  try {
    // Configure MCP server for this Claude instance
    await claudeSettingsManager.configureClodeIntegration(instanceId, workingDirectory);
    
    // Detect Claude installation
    const claudeInfo = await ClaudeDetector.detectClaude(workingDirectory);

    // Get the command configuration
    // Claude starts in interactive mode by default when run without arguments
    const debugArgs = process.env.CLAUDE_DEBUG === 'true' ? ['--debug'] : [];

    let { command, args: commandArgs, useShell } = ClaudeDetector.getClaudeCommand(claudeInfo, debugArgs);

    // Override with run config if provided
    if (runConfig) {
      if (runConfig.command) {
        // If the command is just 'claude', use the detected path
        command = runConfig.command === 'claude' ? command : runConfig.command;
      }
      if (runConfig.args && runConfig.args.length > 0) {
        // When we have custom args, we need to rebuild the command
        const allArgs = [...runConfig.args, ...debugArgs];
        const result = ClaudeDetector.getClaudeCommand(claudeInfo, allArgs);
        command = result.command;
        commandArgs = result.args;
        useShell = result.useShell;
      }
    }


    // Log settings file to verify it exists
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    if (!existsSync(settingsPath)) {
      console.warn('Claude settings file not found!');
    }

    // Get the user's default shell
    const userShell = process.env.SHELL || '/bin/bash';

    console.log('Spawning Claude with:', { command, commandArgs, useShell });
    
    // Add error handling for spawn
    let claudePty;
    try {
      claudePty = pty.spawn(command, commandArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: workingDirectory,
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
          HOME: process.env.HOME, // Ensure HOME is set so Claude can find ~/.claude/settings.json
          USER: process.env.USER, // Ensure USER is set
          SHELL: userShell, // Ensure SHELL is set
          // Add instance-specific environment variables for hooks
          CLAUDE_INSTANCE_ID: instanceId,
          CLAUDE_INSTANCE_NAME: instanceName || `Claude-${instanceId.slice(7, 15)}`, // Use provided name or short ID
          CLAUDE_IDE_INSTANCE: 'true',
          // Force PTY mode to ensure Claude uses the PTY for I/O
          FORCE_TTY: '1'
        },
        handleFlowControl: true
      });
    } catch (error) {
      console.error('Failed to spawn Claude:', error);
      mainWindow?.webContents.send('claude-error', {
        instanceId,
        error: `Failed to spawn Claude: ${error instanceof Error ? error.message : String(error)}`
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }


    // Store this instance
    claudeInstances.set(instanceId, claudePty);
    
    // Also register with the instance manager
    const instanceMetadata = claudeInstanceManager.addInstance(instanceId, claudePty, {
      name: instanceName || `Claude-${instanceId.slice(7, 15)}`,
      workingDirectory,
      isHeadless: modeManager.isHeadlessMode()
    });
    console.log(`[Main] Registered Claude instance with manager:`, {
      instanceId,
      name: instanceMetadata.name,
      workingDirectory,
      isHeadless: modeManager.isHeadlessMode()
    });

    // Capture initial output for debugging
    let initialOutput = '';
    let outputTimer: NodeJS.Timeout | null = null;

    // Handle output from Claude
    claudePty.onData((data: string) => {
      // Capture first few outputs for debugging
      if (initialOutput.length < 1000) {
        initialOutput += data;
        
        // Log initial output after a short delay
        if (outputTimer) clearTimeout(outputTimer);
        outputTimer = setTimeout(() => {
          if (initialOutput.trim()) {
            console.log(`Initial Claude output for ${instanceId}:`, initialOutput);
          }
        }, 500);
      }
      
      // Send data with instance ID to all windows
      const windows = BrowserWindow.getAllWindows();
      console.log(`Sending Claude output to frontend for ${instanceId}, length: ${data.length}, windows: ${windows.length}`);
      
      if (windows.length === 0) {
        console.warn('No windows available to send Claude output to!');
        // Store output to send when window becomes available
        if (!global.pendingClaudeOutput) {
          global.pendingClaudeOutput = new Map();
        }
        const pending = global.pendingClaudeOutput.get(instanceId) || '';
        // Limit pending output to prevent unbounded memory growth (10MB limit)
        const MAX_PENDING_SIZE = 10 * 1024 * 1024; // 10MB
        const newPending = pending + data;
        if (newPending.length > MAX_PENDING_SIZE) {
          // Keep only the last portion of the output
          global.pendingClaudeOutput.set(instanceId, newPending.slice(-MAX_PENDING_SIZE));
          console.warn(`Pending output for ${instanceId} exceeded limit, truncating...`);
        } else {
          global.pendingClaudeOutput.set(instanceId, newPending);
        }
      } else {
        windows.forEach(window => {
          if (!window.isDestroyed()) {
            console.log(`Sending to window ${window.id}`);
            window.webContents.send(`claude:output:${instanceId}`, data);
          }
        });
      }
    });

    // Handle exit
    claudePty.onExit(async ({ exitCode, signal }) => {
      console.log(`Claude process exited for ${instanceId}:`, { exitCode, signal });
      
      // Log any captured output if process exits quickly
      if (initialOutput.trim()) {
        console.log(`Claude output before exit for ${instanceId}:`, initialOutput);
      }
      
      // Clean up pending output for this instance to prevent memory leak
      if (global.pendingClaudeOutput?.has(instanceId)) {
        console.log(`Cleaning up pending output for ${instanceId}`);
        global.pendingClaudeOutput.delete(instanceId);
      }
      
      // Send exit event to all windows
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send(`claude:exit:${instanceId}`, exitCode);
        }
      });
      claudeInstances.delete(instanceId);
      
      // Also update instance status in the manager (mark as disconnected, don't remove)
      claudeInstanceManager.disconnectInstance(instanceId);
      
      // Clean up MCP server configuration
      try {
        await claudeSettingsManager.cleanupClodeIntegration();
      } catch (error) {
        console.error('Failed to clean up MCP server configuration:', error);
      }
      
      // Notify all clients about instance update
      mainWindow?.webContents.send('claude:instances:updated');
      if (remoteServer) {
        remoteServer.broadcastClaudeInstancesUpdate();
      }
      
      // Broadcast the exit/disconnection
      if (remoteServer) {
        remoteServer.broadcastClaudeStatusUpdate(instanceId, 'disconnected');
      }
    });

    // Notify all clients about instance update
    mainWindow?.webContents.send('claude:instances:updated');
    if (remoteServer) {
      remoteServer.broadcastClaudeInstancesUpdate();
    }
    
    // Broadcast the successful start with PID
    if (remoteServer) {
      remoteServer.broadcastClaudeStatusUpdate(instanceId, 'connected', claudePty.pid);
    }

    return {
      success: true,
      pid: claudePty.pid,
      claudeInfo: {
        path: claudeInfo.path,
        version: claudeInfo.version,
        source: claudeInfo.source
      }
    };
  } catch (error) {
    console.error(`Failed to start Claude for ${instanceId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:send', async (event, instanceId: string, command: string) => {
  const claudePty = claudeInstances.get(instanceId);
  if (!claudePty) {
    return { success: false, error: `Claude instance is not running. Please start a Claude instance in the terminal first.` };
  }

  try {
    // Write raw data to PTY (xterm.js will handle line endings)
    claudePty.write(command);

    return { success: true };
  } catch (error) {
    console.error(`Failed to send command to Claude PTY ${instanceId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:stop', async (event, instanceId: string) => {
  const claudePty = claudeInstances.get(instanceId);
  if (claudePty) {
    claudePty.kill();
    claudeInstances.delete(instanceId);
    
    // Also remove from the instance manager
    claudeInstanceManager.removeInstance(instanceId);
    
    // Clean up pending output for this instance
    if (global.pendingClaudeOutput?.has(instanceId)) {
      console.log(`Cleaning up pending output for stopped instance ${instanceId}`);
      global.pendingClaudeOutput.delete(instanceId);
    }
    
    // Notify all clients about instance update
    mainWindow?.webContents.send('claude:instances:updated');
    if (remoteServer) {
      remoteServer.broadcastClaudeInstancesUpdate();
    }
    
    // Broadcast the disconnection
    if (remoteServer) {
      remoteServer.broadcastClaudeStatusUpdate(instanceId, 'disconnected');
    }
    
    return { success: true };
  }
  return { success: false, error: `No Claude PTY running for instance ${instanceId}` };
});

// Check if a Claude instance is being forwarded from remote
ipcMain.handle('check-claude-forwarding', async (event, instanceId: string) => {
  if (!mainWindow) return false;
  
  try {
    // Check if the instance is in the forwarding map on the renderer side
    const isForwarded = await mainWindow.webContents.executeJavaScript(`
      (() => {
        if (window.__remoteClaudeForwarding) {
          return window.__remoteClaudeForwarding.has('${instanceId}');
        }
        return false;
      })()
    `);
    
    return isForwarded;
  } catch (error) {
    console.error('Failed to check Claude forwarding:', error);
    return false;
  }
});

ipcMain.handle('claude:resize', async (event, instanceId: string, cols: number, rows: number) => {
  const claudePty = claudeInstances.get(instanceId);
  if (claudePty) {
    try {
      claudePty.resize(cols, rows);
      return { success: true };
    } catch (error) {
      console.error(`Failed to resize PTY for ${instanceId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { success: false, error: `No Claude PTY running for instance ${instanceId}` };
});

// Get home directory
ipcMain.handle('getHomeDir', () => {
  return homedir();
});

// Show notification
ipcMain.handle('showNotification', async (event, options: { title: string; body: string }) => {
  const { Notification } = await import('electron');
  if (Notification.isSupported()) {
    new Notification(options).show();
  }
  return { success: true };
});

// File Watcher operations
ipcMain.handle('fileWatcher:start', async (event, dirPath: string, options?: any) => {
  try {
    await fileWatcherService.watchDirectory(dirPath, options);

    // Set up event forwarding to renderer
    fileWatcherService.on('file:change', (data) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('file:change', data);
        }
      });
    });

    fileWatcherService.on('batch:change', (data) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('batch:change', data);
        }
      });
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fileWatcher:stop', async (event, dirPath: string) => {
  try {
    await fileWatcherService.unwatchDirectory(dirPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fileWatcher:indexFile', async (event, filePath: string) => {
  try {
    const result = await fileWatcherService.performIncrementalIndex(filePath, 'change');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fileWatcher:getStats', () => {
  try {
    const stats = fileWatcherService.getStatistics();
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Knowledge Cache operations
ipcMain.handle('knowledgeCache:recordQuery', async (event, workspacePath: string, metrics: any) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }

    await cache.learnFromQuery(
      metrics.query,
      metrics.result || {},
      metrics.responseTime,
      metrics.success
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:getStats', async (event, workspacePath: string) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }

    const stats = cache.getStatistics();
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:predict', async (event, workspacePath: string, context: any) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }

    const predictions = await cache.predictNextQueries(context);
    return { success: true, predictions };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:clear', async (event, workspacePath: string) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }

    await cache.clear();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:invalidate', async (event, workspacePath: string, pattern?: string, tags?: string[]) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }

    const count = await cache.invalidate(pattern, tags);
    return { success: true, count };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// File System operations
ipcMain.handle('fs:readFile', async (event, filePath: string) => {
  const fs = await import('fs/promises');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:exists', async (event, filePath: string) => {
  const fs = await import('fs/promises');
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs:ensureDir', async (event, dirPath: string) => {
  try {
    await mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:rename', async (event, oldPath: string, newPath: string) => {
  const fs = await import('fs/promises');
  try {
    await fs.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:delete', async (event, filePath: string) => {
  const fs = await import('fs/promises');
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      await fs.rmdir(filePath, { recursive: true });
    } else {
      await fs.unlink(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:writeFile', async (event, filePath: string, content: string) => {
  const fs = await import('fs/promises');
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:readDir', async (event, dirPath: string) => {
  const fs = await import('fs/promises');
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      path: join(dirPath, entry.name),
      isDirectory: entry.isDirectory()
    }));
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Storage operations
ipcMain.handle('store:get', (event, key: string) => {
  return (store as any).get(key);
});

ipcMain.handle('store:set', (event, key: string, value: any) => {
  (store as any).set(key, value);
  return { success: true };
});

ipcMain.handle('store:delete', (event, key: string) => {
  (store as any).delete(key);
  return { success: true };
});

ipcMain.handle('store:getAll', () => {
  return (store as any).store;
});

ipcMain.handle('store:getHomePath', () => {
  return app.getPath('home');
});

// Session operations
ipcMain.handle('claude:listSessions', async () => {
  try {
    // For now, return mock data. In a real implementation, this would read from session storage
    return {
      success: true,
      sessions: [
        {
          id: 'session-1',
          name: 'Previous Session',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          messageCount: 15,
          duration: 1800000,
          preview: 'Working on implementing the context system...'
        },
        {
          id: 'session-2',
          name: 'Older Session',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          messageCount: 25,
          duration: 3600000,
          preview: 'Fixed the memory issue with the knowledge base...'
        }
      ]
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:resumeSession', async (event, instanceId: string, sessionId: string) => {
  try {
    // For now, just return success. In a real implementation, this would restore the session
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Hook operations
ipcMain.handle('claude:getHooks', async () => {
  try {
    // Return hooks from Claude's settings file
    const hooks = await claudeSettingsManager.getHooks();
    return { success: true, hooks };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:addHook', async (event, hook: any) => {
  try {
    const existingHooks = await claudeSettingsManager.getHooks();
    const newHook = {
      ...hook,
      id: `hook_${Date.now()}`,
      disabled: hook.disabled !== undefined ? hook.disabled : false
    };
    existingHooks.push(newHook);
    await claudeSettingsManager.saveHooks(existingHooks);
    return { success: true, hook: newHook };
  } catch (error) {
    console.error('Error in claude:addHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:updateHook', async (event, hookId: string, updates: any) => {
  try {
    const hooks = await claudeSettingsManager.getHooks();
    const index = hooks.findIndex((h: any) => h.id === hookId);
    if (index !== -1) {
      hooks[index] = { ...hooks[index], ...updates };
      await claudeSettingsManager.saveHooks(hooks);
      return { success: true };
    }
    return { success: false, error: 'Hook not found' };
  } catch (error) {
    console.error('Error in claude:updateHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Add removeHook as an alias for deleteHook for compatibility
ipcMain.handle('claude:removeHook', async (event, hookId: string) => {
  try {
    const hooks = await claudeSettingsManager.getHooks();
    const filteredHooks = hooks.filter((h: any) => h.id !== hookId);
    await claudeSettingsManager.saveHooks(filteredHooks);
    return { success: true };
  } catch (error) {
    console.error('Error in claude:removeHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:deleteHook', async (event, hookId: string) => {
  try {
    const hooks = await claudeSettingsManager.getHooks();
    const filtered = hooks.filter((h: any) => h.id !== hookId);
    await claudeSettingsManager.saveHooks(filtered);
    return { success: true };
  } catch (error) {
    console.error('Error in claude:deleteHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Clear Claude detector cache (useful if installation changes)
ipcMain.handle('claude:clearCache', async () => {
  ClaudeDetector.clearCache();
  return { success: true };
});

// Test a hook
ipcMain.handle('claude:testHook', async (event, hook: any) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const testCommand = claudeSettingsManager.createTestCommand(hook);
    const { stdout, stderr } = await execAsync(testCommand, {
      timeout: 5000 // 5 second timeout
    });

    return {
      success: true,
      output: stdout + (stderr ? '\n\nErrors:\n' + stderr : '')
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
      output: error.stdout || ''
    };
  }
});

// Open external links
ipcMain.handle('shell:openExternal', async (event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Dialog operations
ipcMain.handle('dialog:selectFolder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Workspace Folder'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dialog:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Open File',
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss', 'html'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, options);
    return result;
  } catch (error) {
    return { canceled: true, filePaths: [] };
  }
});

ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, options);
    return result;
  } catch (error) {
    return { canceled: true, filePath: undefined };
  }
});

ipcMain.handle('dialog:showInputBox', async (event, options) => {
  try {
    // Electron doesn't have a built-in input box, so we'll use a custom implementation
    // For now, return a simple response indicating this needs to be handled in the renderer
    return { canceled: true, value: '' };
  } catch (error) {
    return { canceled: true, value: '' };
  }
});

ipcMain.handle('dialog:showMessageBox', async (event, options) => {
  try {
    const result = await dialog.showMessageBox(mainWindow!, options);
    return result;
  } catch (error) {
    return { response: 0, checkboxChecked: false };
  }
});

// Claude installation detection
ipcMain.handle('claude:detectInstallation', async () => {
  try {
    const claudeInfo = await ClaudeDetector.detectClaude();
    return { success: true, info: claudeInfo };
  } catch (error) {
    return { success: false };
  }
});

// Claude instance management - list all instances
ipcMain.handle('claude:listInstances', async () => {
  try {
    const instances = claudeInstanceManager.getAllInstances();
    return { success: true, instances };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Claude instance management - list instances by workspace
ipcMain.handle('claude:listInstancesByWorkspace', async (event, workspacePath: string) => {
  try {
    const instances = claudeInstanceManager.getInstancesByWorkspace(workspacePath);
    return { success: true, instances };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Claude instance management - get single instance
ipcMain.handle('claude:getInstance', async (event, instanceId: string) => {
  try {
    const metadata = claudeInstanceManager.getMetadata(instanceId);
    return { success: true, instance: metadata };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// File watching operations
ipcMain.handle('fs:watchFile', async (event, filePath: string) => {
  try {
    // Don't create duplicate watchers
    if (fileWatchers.has(filePath)) {
      return { success: true };
    }


    const watcher = chokidarWatch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('change', async (path) => {

      try {
        // Read the new content immediately (chokidar already handles debouncing with awaitWriteFinish)
        const content = await readFile(filePath, 'utf-8');

        // Send update to all windows
      
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(window => {
          if (!window.isDestroyed()) {
          
            window.webContents.send('file:changed', {
              path: filePath,
              content
            });
          }
        });

        // Also log if no windows are available
        if (windows.length === 0) {
          console.error('[FileWatcher] No windows available to send file:changed event');
        }
      } catch (error) {
        console.error('[FileWatcher] Error reading changed file:', error);
      }
    });

    // Add error handler
    watcher.on('error', (error) => {
      console.error('[FileWatcher] Watcher error for', filePath, ':', error);
    });

    fileWatchers.set(filePath, watcher);
    return { success: true };
  } catch (error) {
    console.error('Failed to watch file:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Directory watching operations
ipcMain.handle('fs:watchDirectory', async (event, dirPath: string) => {
  try {
    // Don't create duplicate watchers
    const watchKey = `dir:${dirPath}`;
    if (fileWatchers.has(watchKey)) {
      return { success: true };
    }

    const watcher = chokidarWatch(dirPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0, // Only watch the directory itself, not subdirectories
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('all', (eventType, filePath) => {
      // Send update to renderer
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('directory:changed', {
            path: dirPath,
            eventType,
            filename: filePath
          });
        }
      });
    });

    fileWatchers.set(watchKey, watcher);

    return { success: true };
  } catch (error) {
    console.error('Failed to watch directory:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:unwatchDirectory', async (event, dirPath: string) => {
  try {
    const watchKey = `dir:${dirPath}`;
    const watcher = fileWatchers.get(watchKey);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(watchKey);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:unwatchFile', async (event, filePath: string) => {
  try {
    const watcher = fileWatchers.get(filePath);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Clean up watchers on app quit
app.on('before-quit', () => {
  for (const [path, watcher] of fileWatchers) {
    watcher.close();
  }
  fileWatchers.clear();
});

// Claude SDK operations
ipcMain.handle('claude:sdk:getTodos', async (event, projectPath: string) => {
  try {
    const result = await claudeCodeService.getCurrentTodos(projectPath);
    return result;
  } catch (error) {
    console.error('Error getting todos via SDK:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:sdk:createTodos', async (event, taskDescription: string, projectPath: string) => {
  try {
    const result = await claudeCodeService.createTodosForTask(taskDescription, projectPath);
    return result;
  } catch (error) {
    console.error('Error creating todos via SDK:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:sdk:updateTodo', async (event, todoId: string, newStatus: string, projectPath: string) => {
  try {
    const result = await claudeCodeService.updateTodoStatus(todoId, newStatus, projectPath);
    return result;
  } catch (error) {
    console.error('Error updating todo via SDK:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Search operations
ipcMain.handle('search:findInFiles', async (event, options) => {

  // Add a response wrapper to ensure clean IPC communication
  const sendResponse = (data: any) => {
    return data;
  };

  const { promisify } = await import('util');
  const { exec } = await import('child_process');
  const execAsync = promisify(exec);
  const path = await import('path');
  const fs = await import('fs/promises');

  try {
    const { query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern, workspacePath } = options;

    // Use workspace path if provided, otherwise fall back to current directory
    const workingDir = workspacePath || process.cwd();
  

    // Validate that the workspace path exists
    try {
      await fs.access(workingDir);
    
    } catch (error) {
      console.error('[Main] Workspace directory not found:', workingDir);
      throw new Error(`Workspace directory not found: ${workingDir}`);
    }

    try {
      // Try ripgrep first
    

      // Check for bundled ripgrep first
      const platform = process.platform;
      const arch = process.arch;
      const platformKey = platform === 'darwin'
        ? (arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64')
        : platform === 'linux' ? 'linux-x64'
        : platform === 'win32' ? 'win32-x64'
        : null;

      let rgPath = 'rg'; // Default to system rg

      if (platformKey) {
        const rgBinary = platform === 'win32' ? 'rg.exe' : 'rg';
        const bundledRgPath = path.join(__dirname, '..', 'vendor', 'ripgrep', platformKey, rgBinary);

        if (existsSync(bundledRgPath)) {
          rgPath = bundledRgPath;
        
        } else {
        
        }
      }

      // Use streaming ripgrep search
      const results = await searchWithRipgrep(rgPath, query, workingDir, {
        caseSensitive,
        wholeWord,
        useRegex,
        includePattern,
        excludePattern
      });

      return sendResponse(results);
    } catch (error: any) {
      // Ripgrep failed (likely timeout), fallback to Node.js implementation
    
      const fallbackResults = await fallbackSearch(workingDir, options);
      return sendResponse(fallbackResults);
    }
  } catch (error) {
    console.error('[Main] search:findInFiles error:', error);
    if (error instanceof Error) {
      console.error('[Main] Error stack:', error.stack);
    }
    throw error;
  }
});

// Fallback search implementation using Node.js
async function fallbackSearch(workingDir: string, options: any) {
  const startTime = Date.now();

  const { query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern } = options;
  const path = await import('path');
  const fs = await import('fs/promises');

  const results = new Map<string, any>();

  // Build regex pattern
  let pattern = query;
  if (!useRegex) {
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

  // Default exclude patterns
  const defaultExcludes = ['node_modules', 'dist', '.git', '.next', 'build', 'out', '.claude', '', '.worktrees', '.output', 'coverage', '.nyc_output', 'tmp', 'temp', '.cache', '.parcel-cache', '.vscode', '.idea', '__pycache__', '.DS_Store', '.nuxt'];
  const excludes = excludePattern
    ? [...defaultExcludes, ...excludePattern.split(',').map((p: string) => p.trim().replace('**/', '').replace('/**', ''))]
    : defaultExcludes;


  const searchInDirectory = async (dir: string) => {
    try {

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip excluded directories/files
        if (excludes.some(exclude => entry.name.includes(exclude) || fullPath.includes(exclude))) {
          continue;
        }

        if (entry.isDirectory()) {
          await searchInDirectory(fullPath);
        } else if (entry.isFile()) {
          // Check include pattern
          if (includePattern) {
            const patterns = includePattern.split(',').map((p: string) => p.trim());
            const matchesInclude = patterns.some((p: string) => {
              if (p.startsWith('*.')) {
                return entry.name.endsWith(p.substring(1));
              }
              return entry.name.includes(p);
            });
            if (!matchesInclude) continue;
          }

          // Search in text files only
          const ext = path.extname(entry.name).toLowerCase();
          const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.json', '.md', '.txt', '.css', '.scss', '.html', '.xml', '.yaml', '.yml', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'];

          if (!textExtensions.includes(ext)) continue;

          try {
            // Skip files larger than 5MB to prevent hanging
            const stats = await fs.stat(fullPath);
            if (stats.size > 5 * 1024 * 1024) {
              continue;
            }

            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            const matches: any[] = [];

            lines.forEach((line, lineIndex) => {
              let match;
              regex.lastIndex = 0; // Reset regex
              while ((match = regex.exec(line)) !== null) {
                matches.push({
                  line: lineIndex + 1,
                  column: match.index,
                  text: line,
                  length: match[0].length
                });
                if (!regex.global) break;
              }
            });

            if (matches.length > 0) {
              const relativePath = path.relative(workingDir, fullPath);
              results.set(fullPath, {
                path: fullPath,
                relativePath: relativePath,
                matches: matches
              });
            }
          } catch (err) {
            // Skip files that can't be read
          }
        }
      }
    } catch (err) {
      // Skip directories that can't be accessed
    }
  };

  await searchInDirectory(workingDir);


  const resultsArray = Array.from(results.values());

  return resultsArray;
}

ipcMain.handle('search:replaceInFile', async (event, options) => {
  const fs = await import('fs/promises');
  const { filePath, searchQuery, replaceQuery, line, column, caseSensitive, wholeWord, useRegex } = options;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (line > 0 && line <= lines.length) {
      const lineContent = lines[line - 1];
      let pattern = searchQuery;

      if (!useRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }

      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      lines[line - 1] = lineContent.replace(regex, replaceQuery);

      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    }

    return { success: true };
  } catch (error) {
    console.error('Replace failed:', error);
    throw error;
  }
});

ipcMain.handle('search:replaceAllInFile', async (event, options) => {
  const fs = await import('fs/promises');
  const { filePath, searchQuery, replaceQuery, caseSensitive, wholeWord, useRegex } = options;

  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let pattern = searchQuery;

    if (!useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    content = content.replace(regex, replaceQuery);

    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Replace all failed:', error);
    throw error;
  }
});

// Terminal operations
const terminals = new Map<string, any>();

ipcMain.handle('terminal:create', async (event, options) => {
  const pty = await import('node-pty');
  const { v4: uuidv4 } = await import('uuid');

  try {
    const id = uuidv4();
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.cwd(),
      env: process.env as any
    });

    terminals.set(id, ptyProcess);

    ptyProcess.onData((data) => {
      mainWindow?.webContents.send(`terminal:data:${id}`, data);
      
      // Also forward to remote clients if in hybrid mode
      if (remoteServer) {
        remoteServer.forwardDesktopTerminalData(id, data);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      terminals.delete(id);
      mainWindow?.webContents.send(`terminal:exit:${id}`, { exitCode, signal });
    });

    return { success: true, id };
  } catch (error) {
    console.error('Failed to create terminal:', error);
    throw error;
  }
});

ipcMain.handle('terminal:write', async (event, id: string, data: string) => {
  const terminal = terminals.get(id);
  if (terminal) {
    terminal.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('terminal:resize', async (event, id: string, cols: number, rows: number) => {
  const terminal = terminals.get(id);
  if (terminal) {
    terminal.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('terminal:destroy', async (event, id: string) => {
  const terminal = terminals.get(id);
  if (terminal) {
    terminal.kill();
    terminals.delete(id);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Clean up terminals on app quit
app.on('before-quit', () => {
  for (const [id, terminal] of terminals) {
    terminal.kill();
  }
  terminals.clear();
});

// Ghost text handler (for inline AI suggestions)
ipcMain.handle('autocomplete:getGhostText', async (event, { prefix, suffix, forceManual = false }) => {
  try {
    // Check if ghost text is enabled in settings (but skip check if manual trigger)
    if (!forceManual) {
      const settings = (store as any).get('autocompleteSettings');
      
      // If no settings exist yet, ghost text should be disabled by default
      if (!settings || !settings.providers || !settings.providers.claude || !settings.providers.claude.enabled) {
        return { success: true, suggestion: '' }; // Return empty if disabled or settings don't exist
      }
    }

    const suggestion = await ghostTextService.getGhostTextSuggestion(prefix, suffix);
    return { success: true, suggestion };
  } catch (error) {
    console.error('[Main] Ghost text error:', error);
    return { success: false, suggestion: '', error: error instanceof Error ? error.message : String(error) };
  }
});






ipcMain.handle('autocomplete:initializeProject', async (event, projectPath) => {
  try {
    await ghostTextService.initializeProject(projectPath);
    return { success: true };
  } catch (error) {
    console.error('Ghost text project initialization error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Ghost text health check
ipcMain.handle('autocomplete:checkHealth', async () => {
  try {
    return await ghostTextService.checkHealth();
  } catch (error) {
    console.error('Ghost text health check error:', error);
    return { available: false, status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
});

// Debug: Check what settings are actually stored
ipcMain.handle('debug:getStoredSettings', async () => {
  try {
    const settings = (store as any).get('autocompleteSettings');
    return { success: true, settings };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('autocomplete:checkLSPServers', async () => {
  try {
    const { lspManager } = await import('./lsp-manager.js');
    const servers = await lspManager.getAvailableServers();
    return { success: true, servers };
  } catch (error) {
    console.error('LSP servers check error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('autocomplete:getLSPStatus', async () => {
  try {
    const { lspManager } = await import('./lsp-manager.js');
    const status = {
      connected: lspManager.getConnectedServers(),
      available: await lspManager.getAvailableServers()
    };
    return { success: true, status };
  } catch (error) {
    console.error('LSP status check error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// LSP Bridge handlers for codemirror-languageservice
ipcMain.handle('lsp:getCompletions', async (event, params) => {
  try {
    const { lspManager } = await import('./lsp-manager.js');
    const completions = await lspManager.getCompletions(
      params.filepath,
      params.content,
      params.position,
      params.context  // Pass the full context object
    );
    
    // Return in LSP format expected by codemirror-languageservice
    return { 
      success: true, 
      completions: completions.map(item => ({
        label: item.label,
        kind: item.kind,
        detail: item.detail,
        documentation: item.documentation,
        insertText: item.insertText,
        insertTextFormat: item.insertTextFormat,
        filterText: item.filterText,
        sortText: item.sortText,
        preselect: item.preselect,
        commitCharacters: item.commitCharacters,
        additionalTextEdits: item.additionalTextEdits,
        command: item.command,
        data: item.data
      }))
    };
  } catch (error) {
    console.error('LSP completions error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('lsp:getHover', async (event, params) => {
  try {
    const { lspManager } = await import('./lsp-manager.js');
    const hover = await lspManager.getHover(
      params.filepath,
      params.content,
      params.position
    );
    
    if (!hover) {
      return { success: true, hover: null };
    }
    
    return { 
      success: true, 
      hover: {
        content: hover.content,
        range: hover.range
      }
    };
  } catch (error) {
    console.error('LSP hover error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('lsp:getDiagnostics', async (event, params) => {
  try {
    const { lspManager } = await import('./lsp-manager.js') as any;
    const diagnostics = await lspManager.getDiagnostics(
      params.filepath,
      params.content
    );
    
    return { 
      success: true, 
      diagnostics: diagnostics || []
    };
  } catch (error) {
    console.error('LSP diagnostics error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// LSP Installation handlers
ipcMain.handle('lsp:install', async (event, params) => {
  try {
    const { id, command, packageManager } = params;
    
  
    
    return new Promise((resolve) => {
      // Parse the command into executable and arguments
      const commandParts = command.split(' ');
      const executable = commandParts[0];
      const args = commandParts.slice(1);
      
      const installProcess = spawn(executable, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      installProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      installProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      installProcess.on('close', (code) => {
        if (code === 0) {
        
          resolve({ success: true, output: stdout });
        } else {
          console.error(`Failed to install LSP server: ${id}`, stderr);
          resolve({ 
            success: false, 
            error: `Installation failed with code ${code}: ${stderr || 'Unknown error'}` 
          });
        }
      });
      
      installProcess.on('error', (error) => {
        console.error(`Error installing LSP server: ${id}`, error);
        resolve({ 
          success: false, 
          error: `Failed to start installation: ${error.message}` 
        });
      });
      
      // Set timeout for installation (5 minutes)
      setTimeout(() => {
        try {
          installProcess.kill();
        } catch (e) {
          // Ignore kill errors
        }
        resolve({ 
          success: false, 
          error: 'Installation timed out after 5 minutes' 
        });
      }, 5 * 60 * 1000);
    });
    
  } catch (error) {
    console.error('LSP install error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('lsp:uninstall', async (event, params) => {
  try {
    const { id, packageManager } = params;
    
  
    
    // Define uninstall commands for different package managers
    const uninstallCommands: Record<string, string[]> = {
      npm: ['npm', 'uninstall', '-g'],
      pip: ['pip', 'uninstall', '-y'],
      brew: ['brew', 'uninstall'],
      go: ['rm', '-f'], // Go modules are in GOPATH/bin
      gem: ['gem', 'uninstall'],
      rustup: ['rustup', 'component', 'remove'],
      dotnet: ['dotnet', 'tool', 'uninstall', '-g']
    };
    
    // Map server IDs to package names
    const packageNames: Record<string, string> = {
      typescript: 'typescript-language-server',
      python: 'python-lsp-server',
      rust: 'rust-analyzer',
      go: `${homedir()}/go/bin/gopls`,
      vue: '@vue/language-server',
      html: 'vscode-langservers-extracted',
      php: 'intelephense',
      csharp: 'omnisharp',
      kotlin: 'kotlin-language-server',
      ruby: 'ruby-lsp',
      svelte: 'svelte-language-server',
      lua: 'lua-language-server',
      yaml: 'yaml-language-server',
      java: 'jdtls',
      cpp: 'llvm'
    };
    
    const command = uninstallCommands[packageManager];
    const packageName = packageNames[id];
    
    if (!command || !packageName) {
      return { success: false, error: `Unsupported uninstall for ${id} with ${packageManager}` };
    }
    
    return new Promise((resolve) => {
      const uninstallProcess = spawn(command[0], [...command.slice(1), packageName], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      uninstallProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      uninstallProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      uninstallProcess.on('close', (code) => {
        if (code === 0) {
        
          resolve({ success: true, output: stdout });
        } else {
          console.error(`Failed to uninstall LSP server: ${id}`, stderr);
          resolve({ 
            success: false, 
            error: `Uninstallation failed with code ${code}: ${stderr || 'Unknown error'}` 
          });
        }
      });
      
      uninstallProcess.on('error', (error) => {
        console.error(`Error uninstalling LSP server: ${id}`, error);
        resolve({ 
          success: false, 
          error: `Failed to start uninstallation: ${error.message}` 
        });
      });
    });
    
  } catch (error) {
    console.error('LSP uninstall error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Check if a command is available
ipcMain.handle('lsp:checkCommand', async (event, command) => {
  try {
    return new Promise((resolve) => {
      const checkProcess = spawn('which', [command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      checkProcess.on('close', (code) => {
        resolve({ available: code === 0 });
      });
      
      checkProcess.on('error', () => {
        resolve({ available: false });
      });
      
      // Timeout after 2 seconds
      setTimeout(() => {
        try {
          checkProcess.kill();
        } catch (e) {
          // Ignore kill errors
        }
        resolve({ available: false });
      }, 2000);
    });
    
  } catch (error) {
    console.error('Command check error:', error);
    return { available: false };
  }
});

// Code generation handler
ipcMain.handle('codeGeneration:generate', async (event, { prompt, fileContent, filePath, language, resources = [] }) => {
  try {
    // Import Claude SDK and detector
    const { query } = await import('@anthropic-ai/claude-code');
    const { ClaudeDetector } = await import('./claude-detector.js');
    
    // Detect Claude installation
    const claudeInfo = await ClaudeDetector.detectClaude();
    if (!claudeInfo || !claudeInfo.path) {
      return { 
        success: false, 
        error: 'Claude CLI not found. Please ensure Claude is installed.' 
      };
    }
    
    // Load resource contents
    const loadedResources = await Promise.all(resources.map(async (resource: any) => {
      if (resource.type === 'file' && resource.path) {
        try {
          const content = await readFile(resource.path, 'utf-8');
          return { ...resource, content };
        } catch (error) {
          console.error(`Failed to read resource file ${resource.path}:`, error);
          return resource;
        }
      } else if (resource.type === 'knowledge' && resource.id) {
        // Load from knowledge store
        const knowledgeData = (store as any).get('knowledgeBases');
        for (const kbName in knowledgeData) {
          const kb = knowledgeData[kbName];
          if (kb.entries && kb.entries[resource.id]) {
            return { ...resource, content: kb.entries[resource.id].content };
          }
        }
      }
      return resource;
    }));
    
    // Construct the system prompt for code generation
    const systemPrompt = `You are an expert code generation assistant. When given a file and a request to modify it, you must return ONLY the complete updated file contents. No explanations, no markdown code blocks, no comments about what changed - just the raw code for the entire file.

CRITICAL: Your response must be ONLY code. Do not include any text before or after the code. Do not wrap the code in markdown blocks. Do not explain what you're doing. Just output the raw code that should replace the file contents.`;
    
    // Build resource context
    let resourceContext = '';
    if (loadedResources.length > 0) {
      resourceContext = '\n\nReference Resources:\n';
      loadedResources.forEach((resource, index) => {
        if (resource.content) {
          resourceContext += `\n--- Resource ${index + 1}: ${resource.name} (${resource.type}) ---\n`;
          resourceContext += resource.content + '\n';
        }
      });
    }
    
    // Build the user prompt with context
    const userPrompt = `Current file: ${filePath}
Language: ${language}

Current file contents:
${fileContent}
${resourceContext}
Request: ${prompt}

Remember: Return ONLY the complete code for the file. No explanations. No markdown. Just the raw code.`;

  
    
    // Create an AbortController for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
    
      abortController.abort();
    }, 60000); // 60 second timeout
    
    try {
      // Use Claude SDK to generate code with detected Claude path
      const response = query({
        prompt: userPrompt,
        options: {
          abortController,
          model: 'claude-sonnet-4-20250514', // Fast model for code generation
          maxTurns: 1,
          allowedTools: [],
          customSystemPrompt: systemPrompt,
          pathToClaudeCodeExecutable: claudeInfo.path
        }
      });
      
      let generatedCode = '';
      
      // Iterate through the response messages
      for await (const message of response) {
        if (message.type === 'assistant' && message.message?.content) {
          // Extract text from content blocks
          for (const block of message.message.content) {
            if (block.type === 'text') {
              generatedCode += block.text;
            }
          }
        } else if (message.type === 'result') {
        
          break;
        }
      }
      
      clearTimeout(timeoutId);
      
      if (generatedCode) {
      
        
        // Clean the response - remove any markdown code blocks if present
        generatedCode = generatedCode.trim();
        
        // Remove markdown code blocks if they exist
        const codeBlockRegex = /^```[\w]*\n([\s\S]*?)\n```$/;
        const match = generatedCode.match(codeBlockRegex);
        if (match) {
          generatedCode = match[1];
        }
        
        return { 
          success: true, 
          generatedCode,
          replaceWholeFile: true 
        };
      } else {
        return { 
          success: false, 
          error: 'No response from Claude' 
        };
      }
      
    } catch (queryError: unknown) {
      clearTimeout(timeoutId);
      
      if (queryError instanceof Error && queryError.name === 'AbortError') {
        return { 
          success: false, 
          error: 'Request timed out. Try a simpler request.' 
        };
      }
      
      throw queryError;
    }
    
  } catch (error) {
    console.error('[Code Generation] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

// Clean up Claude instances on app quit
app.on('before-quit', async () => {
  // Shutdown LSP servers
  try {
    const { lspManager } = await import('./lsp-manager.js');
    await lspManager.shutdown();
  } catch (error) {
    console.error('Failed to shutdown LSP servers:', error);
  }
  
  // Clean up Claude instances
  for (const [instanceId, claudePty] of claudeInstances) {
    try {
      claudePty.kill();
    } catch (error) {
      console.error(`Failed to kill Claude instance ${instanceId}:`, error);
    }
  }
  claudeInstances.clear();
});

// MCP (Model Context Protocol) Management - Using Claude CLI
ipcMain.handle('mcp:list', async (event, workspacePath?: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Get workspace path from store if not provided
    if (!workspacePath) {
      workspacePath = (store as any).get('workspacePath') || process.cwd();
    }

    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    
    // Get the properly formatted command for running Claude with arguments
    const { command, args, useShell } = ClaudeDetector.getClaudeCommand(claudeInfo, ['mcp', 'list']);
    
    // Build the full command string - when using shell, args[1] contains the actual command
    let fullCommand;
    if (useShell && args[0] === '-c') {
      // The command is already properly formatted in args[1]
      fullCommand = args[1];
    } else {
      // Direct command execution
      fullCommand = `"${command}" ${args.map(arg => `"${arg}"`).join(' ')}`;
    }
    
    const { stdout } = await execAsync(fullCommand, {
      cwd: workspacePath,
      env: process.env,
      timeout: 5000 // 5 second timeout
    });

    // Parse the text output
    const lines = stdout.trim().split('\n');
    const servers: any[] = [];

    // Skip the "No MCP servers configured" message
    if (stdout.includes('No MCP servers configured')) {
      return { success: true, servers: [] };
    }

    for (const line of lines) {
      if (line.includes(':')) {
        // Parse lines like "context7: https://mcp.context7.com/mcp" or "context7: https://mcp.context7.com/mcp (HTTP)"
        const colonIndex = line.indexOf(':');
        const name = line.substring(0, colonIndex).trim();
        const rest = line.substring(colonIndex + 1).trim();

        // Check if transport type is specified in parentheses
        const parenIndex = rest.lastIndexOf('(');
        let url = rest;
        let transport = 'stdio'; // default

        if (parenIndex > -1) {
          url = rest.substring(0, parenIndex).trim();
          transport = rest.substring(parenIndex + 1, rest.length - 1).trim().toLowerCase();
        } else {
          // Infer transport from URL
          if (url.startsWith('http://') || url.startsWith('https://')) {
            transport = 'http';
          }
        }

        servers.push({
          name,
          url: url.trim(),
          transport: transport === 'http' || transport === 'sse' ? transport : 'stdio'
        });
      }
    }

    return { success: true, servers };
  } catch (error: any) {
    // Check if it's a timeout error
    if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM' || error.killed) {
      console.warn('MCP list command timed out - Claude CLI may not be responding');
      return { 
        success: true, 
        servers: [],
        warning: 'Claude CLI timed out - no MCP servers detected'
      };
    }
    
    // Check if it was interrupted (SIGINT)
    if (error.signal === 'SIGINT') {
      console.warn('MCP list command was interrupted');
      return { 
        success: true, 
        servers: [],
        warning: 'Command interrupted'
      };
    }
    
    // Check if Claude CLI is not properly configured
    if (error.code === 127) {
      console.warn('Claude CLI not found or not properly configured');
      return { 
        success: true, 
        servers: [],
        warning: 'Claude CLI not available'
      };
    }
    
    console.error('Failed to list MCP servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list servers'
    };
  }
});

ipcMain.handle('mcp:add', async (event, config) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Get workspace path from store
    const workspacePath = (store as any).get('workspacePath') || process.cwd();

    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;

    // Build the command with proper transport flag
    let command = `${claudeCommand} mcp add`;

    // Add transport type
    command += ` --transport ${config.type}`;

    // Add the name
    command += ` "${config.name}"`;

    // Add environment variables BEFORE the command (they're options for claude mcp add)
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        command += ` -e "${key}=${value}"`;
      }
    }

    // Add headers for SSE/HTTP servers BEFORE the command
    if (config.headers && (config.type === 'sse' || config.type === 'http')) {
      for (const [key, value] of Object.entries(config.headers)) {
        command += ` -H "${key}: ${value}"`;
      }
    }

    // Add -- to stop option parsing, then add the command/URL based on type
    if (config.type === 'stdio') {
      command += ` -- "${config.command}"`;
      if (config.args && config.args.length > 0) {
        // Pass each argument separately
        command += ` ${config.args.map((arg: string) => `"${arg}"`).join(' ')}`;
      }
    } else if (config.type === 'sse' || config.type === 'http') {
      // For HTTP/SSE servers, the URL is the command argument
      command += ` -- "${config.url}"`;
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: workspacePath,
      env: process.env
    });

    if (stderr && !stdout) {
      return { success: false, error: stderr };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to add MCP server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add server'
    };
  }
});

ipcMain.handle('mcp:remove', async (event, name: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Get workspace path from store
    const workspacePath = (store as any).get('workspacePath') || process.cwd();

    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;

    const { stdout, stderr } = await execAsync(`${claudeCommand} mcp remove "${name}"`, {
      cwd: workspacePath,
      env: process.env
    });

    if (stderr && !stdout) {
      return { success: false, error: stderr };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to remove MCP server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove server'
    };
  }
});

ipcMain.handle('mcp:get', async (event, name: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Get workspace path from store
    const workspacePath = (store as any).get('workspacePath') || process.cwd();

    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;

    const { stdout } = await execAsync(`${claudeCommand} mcp get "${name}"`, {
      cwd: workspacePath,
      env: process.env
    });

    // Parse the text output to extract server details
    const server: any = { name };
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      if (line.includes('Type:')) {
        server.transport = line.split(':')[1].trim().toLowerCase();
      } else if (line.includes('URL:')) {
        server.url = line.split('URL:')[1].trim();
      } else if (line.includes('Command:')) {
        server.command = line.split('Command:')[1].trim();
      }
    }

    return { success: true, server };
  } catch (error) {
    console.error('Failed to get MCP server details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get server details'
    };
  }
});

// Test MCP connection by trying to add and immediately remove
ipcMain.handle('mcp:test', async (event, config) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // For HTTP/SSE servers, test the URL directly
    if (config.type === 'sse' || config.type === 'http') {
      const https = await import('https');
      const http = await import('http');
      const url = new URL(config.url);
      const client = url.protocol === 'https:' ? https : http;

      return new Promise((resolve) => {
        const req = client.request(config.url, { method: 'HEAD', timeout: 5000 }, (res) => {
          resolve({ success: res.statusCode !== undefined && res.statusCode < 500 });
        });

        req.on('error', (error: Error) => {
          resolve({
            success: false,
            error: `Connection failed: ${error.message}`
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Connection timed out' });
        });

        req.end();
      });
    }

    // For stdio servers, test if command exists
    if (config.type === 'stdio') {
      const { stdout, stderr } = await execAsync(`which "${config.command}"`, {
        env: process.env
      });

      if (stdout.trim()) {
        return { success: true };
      } else {
        return { success: false, error: 'Command not found' };
      }
    }

    return { success: false, error: 'Unknown server type' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Test failed'
    };
  }
});

// Lightweight Context Handlers
ipcMain.handle('context:initialize', async (event, workspacePath: string) => {
  try {
    await lightweightContext.initialize(workspacePath);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize context'
    };
  }
});

ipcMain.handle('context:searchFiles', async (event, query: string, limit: number = 20) => {
  try {
    const results = await lightweightContext.searchFiles(query, limit);
    return { success: true, results };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search files'
    };
  }
});

ipcMain.handle('context:buildContext', async (event, query: string, workingFiles: string[], maxTokens: number = 2000) => {
  try {
    const context = await lightweightContext.buildContext(query, workingFiles, maxTokens);
    return { success: true, context };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build context'
    };
  }
});

ipcMain.handle('context:getStatistics', async (event) => {
  try {
    const statistics = lightweightContext.getStatistics();
    return { success: true, statistics };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get statistics'
    };
  }
});

ipcMain.handle('context:getFileContent', async (event, filePath: string) => {
  try {
    const content = await lightweightContext.getFileContent(filePath);
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file content'
    };
  }
});

ipcMain.handle('context:getRecentFiles', async (event, hours: number = 24) => {
  try {
    const files = lightweightContext.getRecentFiles(hours);
    return { success: true, files };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recent files'
    };
  }
});

ipcMain.handle('context:rescan', async (event) => {
  try {
    await lightweightContext.scanWorkspace();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rescan workspace'
    };
  }
});

ipcMain.handle('context:startWatching', async (event) => {
  try {
    lightweightContext.startWatching();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start file watching'
    };
  }
});

ipcMain.handle('context:stopWatching', async (event) => {
  try {
    lightweightContext.stopWatching();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop file watching'
    };
  }
});

// Set up file change notifications to frontend
lightweightContext.onFileChange((event, filePath) => {
  if (mainWindow) {
    mainWindow.webContents.send('context:file-changed', { event, filePath });
  }
});

// Context optimization handlers
ipcMain.handle('context:analyzeUsage', async (event, messages: any[], currentContext: string) => {
  try {
    const analysis = contextOptimizer.analyzeContextUsage(messages, currentContext);
    return { success: true, analysis };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze context usage'
    };
  }
});

ipcMain.handle('context:buildOptimized', async (event, query: string, workingFiles: string[], maxTokens: number) => {
  try {
    const result = await contextOptimizer.buildOptimizedContext(query, workingFiles, maxTokens);
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build optimized context'
    };
  }
});

ipcMain.handle('context:optimize', async (event, content: string, strategy: any) => {
  try {
    const result = contextOptimizer.optimizeContext(content, strategy);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to optimize context'
    };
  }
});

ipcMain.handle('context:getRecommendations', async (event, usage: any) => {
  try {
    const recommendations = contextOptimizer.getOptimizationRecommendations(usage);
    return { success: true, recommendations };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommendations'
    };
  }
});

ipcMain.handle('context:shouldInject', async (event, query: string, availableTokens: number, contextSize: number) => {
  try {
    const decision = contextOptimizer.shouldInjectContext(query, availableTokens, contextSize);
    return { success: true, decision };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to evaluate context injection'
    };
  }
});

// Workspace persistence handlers
ipcMain.handle('workspace:loadContext', async (event, workspacePath: string) => {
  try {
    const data = await workspacePersistence.loadWorkspaceContext(workspacePath);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load workspace context'
    };
  }
});

ipcMain.handle('workspace:saveContext', async (event, data: any) => {
  try {
    await workspacePersistence.saveWorkspaceContext(data);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save workspace context'
    };
  }
});

ipcMain.handle('workspace:updateOptimizationTime', async (event, workspacePath: string, lastOptimization: string) => {
  try {
    await workspacePersistence.updateOptimizationTime(workspacePath, lastOptimization);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update optimization time'
    };
  }
});

ipcMain.handle('workspace:updateWorkingFiles', async (event, workspacePath: string, workingFiles: string[]) => {
  try {
    await workspacePersistence.updateWorkingFiles(workspacePath, workingFiles);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update working files'
    };
  }
});



ipcMain.handle('workspace:getRecentHistory', async (event, workspacePath: string, limit: number) => {
  try {
    const history = await workspacePersistence.getRecentContextHistory(workspacePath, limit);
    return { success: true, history };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recent history'
    };
  }
});

ipcMain.handle('workspace:exportContext', async (event, workspacePath: string) => {
  try {
    const jsonData = await workspacePersistence.exportWorkspaceContext(workspacePath);
    return { success: true, data: jsonData };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export workspace context'
    };
  }
});

ipcMain.handle('workspace:importContext', async (event, workspacePath: string, jsonData: string) => {
  try {
    await workspacePersistence.importWorkspaceContext(workspacePath, jsonData);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import workspace context'
    };
  }
});

// Current active services
let currentWorktreeManager: WorktreeManager | null = null;
// let currentGitHooksManager: GitHooksManager | null = null; - now handled by GitHooksManagerGlobal

// Get current workspace path
ipcMain.handle('workspace:getCurrentPath', async () => {
  return (store as any).get('workspacePath') || process.cwd();
});

// Git service initialization when workspace changes
ipcMain.handle('workspace:setPath', async (event, workspacePath: string) => {
  try {
    // Store the workspace path
    (store as any).set('workspacePath', workspacePath);

    try {
      // Update the Git Service Manager with the new workspace
      const gitServiceManager = GitServiceManager.getInstance();
      gitServiceManager.setWorkspace(workspacePath);
    } catch (error) {
      console.error('[Main] Error updating GitServiceManager:', error);
    }


    try {
      // Update the Worktree Manager with the new workspace
      const worktreeManagerGlobal = WorktreeManagerGlobal.getInstance();
      const result = worktreeManagerGlobal.setWorkspace(workspacePath);
    } catch (error) {
      console.error('[Main] Error updating WorktreeManagerGlobal:', error);
    }

    try {
      // Update the Git Hooks Manager with the new workspace
      const gitHooksManagerGlobal = GitHooksManagerGlobal.getInstance();
      const result = gitHooksManagerGlobal.setWorkspace(workspacePath);
    } catch (error) {
      console.error('[Main] Error updating GitHooksManagerGlobal:', error);
    }
    
    // Initialize snapshot service for workspace
    // IMPORTANT: Always use the main repository path for snapshots, not worktree paths
    let snapshotProjectPath = workspacePath;
    
    // Check if this is a worktree path (contains .worktrees in the path)
    if (workspacePath.includes('.worktrees')) {
      // Extract the main repo path (everything before .worktrees)
      const worktreeIndex = workspacePath.indexOf('.worktrees');
      snapshotProjectPath = workspacePath.substring(0, worktreeIndex - 1); // -1 to remove the trailing slash
    }
    
    if (!snapshotServices.has(snapshotProjectPath)) {
      const snapshotService = new SnapshotService(snapshotProjectPath);
      snapshotService.setupIpcHandlers();
      snapshotServices.set(snapshotProjectPath, snapshotService);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set workspace path'
    };
  }
});

// Check if a path is ignored by git
ipcMain.handle('git:checkIgnore', async (event, workspacePath: string, paths: string[]) => {
  try {
    const git = await import('simple-git');
    const gitInstance = git.default(workspacePath);
    
    // First check if this is a git repository
    try {
      const isRepo = await gitInstance.checkIsRepo();
      if (!isRepo) {
        // Not a git repo, return all paths as not ignored
        const results: Record<string, boolean> = {};
        paths.forEach(path => { results[path] = false; });
        return { success: true, results, isGitRepo: false };
      }
    } catch (error) {
      // Git command might not be available
    
      const results: Record<string, boolean> = {};
      paths.forEach(path => { results[path] = false; });
      return { success: true, results, gitAvailable: false };
    }
    
    const results: Record<string, boolean> = {};
    
    for (const path of paths) {
      try {
        await gitInstance.raw(['check-ignore', path]);
        // If check-ignore returns 0 (no error), the path is ignored
        results[path] = true;
      } catch (error) {
        // If check-ignore returns non-zero, the path is not ignored
        results[path] = false;
      }
    }
    
    return { success: true, results, isGitRepo: true, gitAvailable: true };
  } catch (error) {
    // Return safe defaults if git is not available
    const results: Record<string, boolean> = {};
    paths.forEach(path => { results[path] = false; });
    return { success: true, results, gitAvailable: false };
  }
});

// Mode and remote server status
ipcMain.handle('app:getMode', async () => {
  return {
    mode: modeManager.getMode(),
    config: modeManager.getConfig(),
    remoteServerRunning: remoteServer?.isRunning() || false,
    remoteConnections: remoteServer?.getActiveConnectionCount() || 0
  };
});

// App status (same as getMode but following the naming convention)
ipcMain.handle('app:status', async () => {
  return {
    mode: modeManager.getMode(),
    config: modeManager.getConfig(),
    remoteServerRunning: remoteServer?.isRunning() || false,
    remoteConnections: remoteServer?.getActiveConnectionCount() || 0,
    remoteStats: remoteServer?.getStats(),
    tunnel: cloudflareTunnel?.getInfo() || null
  };
});

// Cloudflare tunnel handlers
ipcMain.handle('tunnel:getInfo', async () => {
  return cloudflareTunnel?.getInfo() || { url: '', status: 'stopped' };
});

ipcMain.handle('tunnel:start', async () => {
  if (!cloudflareTunnel) {
    cloudflareTunnel = new CloudflareTunnel();
    cloudflareTunnel.onStatusUpdated((tunnelInfo) => {
      mainWindow?.webContents.send('tunnel:status-updated', tunnelInfo);
    });
  }
  
  try {
    return await cloudflareTunnel.start();
  } catch (error) {
    return { 
      url: '', 
      status: 'error' as const, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

ipcMain.handle('tunnel:stop', async () => {
  if (cloudflareTunnel) {
    cloudflareTunnel.stop();
    return { success: true };
  }
  return { success: false };
});

// Relay client handlers
ipcMain.handle('relay:getInfo', async () => {
  if (!relayClient) return null;
  return relayClient.getInfo();
});

ipcMain.handle('relay:connect', async () => {
  if (!relayClient) {
    relayClient = new RelayClient(
      process.env.RELAY_URL || 'wss://relay.clode.studio'
    );
  }
  
  try {
    const info = await relayClient.connect();
    (global as any).__relayClient = relayClient;
    return info;
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'Failed to connect to relay'
    };
  }
});

ipcMain.handle('relay:disconnect', async () => {
  if (relayClient) {
    relayClient.disconnect();
  }
  return { success: true };
});

// Store token when QR code is generated
ipcMain.handle('remote:store-token', async (event, args) => {
  if (!remoteServer) {
    throw new Error('Remote server not initialized');
  }
  
  const { token, deviceId, deviceName, pairingCode, expiresAt } = args;
  remoteServer.storeToken(token, deviceId, deviceName, pairingCode, expiresAt);
  
  return { success: true };
});

// Get active remote connections
ipcMain.handle('remote:get-connections', async () => {
  if (!remoteServer) {
    return [];
  }
  
  return remoteServer.getConnections();
});

// Get active tokens
ipcMain.handle('remote:get-active-tokens', async () => {
  if (!remoteServer) {
    return [];
  }
  
  return remoteServer.getActiveTokens();
});

// Revoke a token
ipcMain.handle('remote:revoke-token', async (event, token: string) => {
  if (!remoteServer) {
    throw new Error('Remote server not initialized');
  }
  
  return remoteServer.revokeToken(token);
});

// Disconnect a specific device
ipcMain.handle('remote:disconnect-device', async (event, sessionId: string) => {
  if (!remoteServer) {
    throw new Error('Remote server not initialized');
  }
  
  return remoteServer.disconnectDevice(sessionId);
});

// Load persisted token from workspace
ipcMain.handle('remote:load-persisted-token', async () => {
  const workspacePath = (store as any).get('workspacePath');
  if (!workspacePath) return null;
  
  const tokenFile = path.join(workspacePath, '.clode', 'remote-token.json');
  
  try {
    if (fs.existsSync(tokenFile)) {
      const data = fs.readFileSync(tokenFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load persisted token:', error);
  }
  
  return null;
});

// Persist token to workspace
ipcMain.handle('remote:persist-token', async (event, tokenData: any) => {
  const workspacePath = (store as any).get('workspacePath');
  if (!workspacePath) return false;
  
  const clodeDir = path.join(workspacePath, '.clode');
  const tokenFile = path.join(clodeDir, 'remote-token.json');
  
  try {
    // Create .clode directory if it doesn't exist
    if (!fs.existsSync(clodeDir)) {
      fs.mkdirSync(clodeDir, { recursive: true });
    }
    
    // Write token data
    fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to persist token:', error);
    return false;
  }
});

// Function to enable hybrid mode
async function enableHybridMode(selectedRelayType?: string, customRelayUrl?: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    // Check if already in hybrid mode
    if (remoteServer && remoteServer.isRunning()) {
      return { success: true, message: 'Hybrid mode already enabled' };
    }
    
    // Update mode manager
    modeManager.setMode(MainProcessMode.HYBRID);
    
    // Get configuration
    const config = modeManager.getConfig();
    
    // Start remote server
    if (mainWindow) {
      remoteServer = new RemoteServer({
        config,
        mainWindow
      });
      
      await remoteServer.start();
      
      // Use selected relay type from UI, fallback to env var, then default to CLODE
      const relayType = (selectedRelayType || process.env.RELAY_TYPE || 'CLODE').toUpperCase();
      
      if (relayType === 'CLODE' || relayType === 'TRUE') {
        // Start Clode relay client
        if (!relayClient) {
          // Use custom URL if provided, otherwise use env var or default
          const relayUrl = customRelayUrl || process.env.RELAY_URL || 'wss://relay.clode.studio';
          relayClient = new RelayClient(relayUrl);
          
          relayClient.on('registered', (info) => {
            console.log(`[Main] Clode Relay registered: ${info.url}`);
            mainWindow?.webContents.send('relay:connected', info);
          });
          
          relayClient.on('reconnected', () => {
            console.log('[Main] Clode Relay reconnected');
            mainWindow?.webContents.send('relay:reconnected');
          });
          
          relayClient.on('connection_lost', () => {
            console.log('[Main] Clode Relay connection lost');
            mainWindow?.webContents.send('relay:disconnected');
          });
        }
        
        // Connect to relay
        try {
          const info = await relayClient.connect();
          console.log(`[Main] Connected to Clode Relay: ${info.url}`);
          (global as any).__relayClient = relayClient;
        } catch (error) {
          console.error('[Main] Failed to connect to Clode Relay:', error);
          // Continue without relay - fallback to local network
        }
      } else if (relayType === 'CLOUDFLARE') {
        // Start Cloudflare tunnel
        if (!cloudflareTunnel) {
          cloudflareTunnel = new CloudflareTunnel();
        }
        
        try {
          const url = await cloudflareTunnel.start();
          console.log(`[Main] Cloudflare tunnel started: ${url}`);
          mainWindow?.webContents.send('tunnel:connected', { url });
        } catch (error) {
          console.error('[Main] Failed to start Cloudflare tunnel:', error);
        }
      } else if (relayType === 'CUSTOM') {
        // Custom tunnel - user needs to set it up
        console.log('[Main] Custom tunnel mode - user needs to set up their own tunnel');
        mainWindow?.webContents.send('tunnel:custom', {
          message: 'Please set up your custom tunnel to expose port 3000',
          port: 3000
        });
      } else if (relayType === 'NONE') {
        // No tunnel - local network only
        console.log('[Main] No tunnel mode - local network access only');
        console.log('[Main] UI available at http://localhost:3000');
        console.log('[Main] Remote server available at http://localhost:' + config.serverPort);
        setTimeout(() => {
          mainWindow?.webContents.send('tunnel:local-only', {
            port: 3000,
            serverPort: config.serverPort,
          });
        }, 1000);
      }
      // Default: no additional setup needed
      
      return { success: true, message: 'Hybrid mode enabled successfully' };
    } else {
      return { success: false, error: 'Main window not available' };
    }
  } catch (error) {
    console.error('Failed to enable hybrid mode:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// IPC handler for enabling hybrid mode
ipcMain.handle('remote:enable-hybrid-mode', async (event, options?: any) => {
  // Support both old string format and new options object
  if (typeof options === 'string') {
    return enableHybridMode(options);
  }
  return enableHybridMode(options?.relayType, options?.customUrl);
});

ipcMain.handle('remote:disable-hybrid-mode', async () => {
  try {
    // Check if hybrid mode is enabled
    if (!remoteServer || !remoteServer.isRunning()) {
      return { success: true, message: 'Hybrid mode already disabled' };
    }
    
    // Stop remote server
    await remoteServer.stop();
    remoteServer = null;
    
    // Stop relay client if running
    if (relayClient && relayClient.isConnected()) {
      relayClient.disconnect();
      relayClient = null;
    }
    
    // Stop cloudflare tunnel if running
    if (cloudflareTunnel && cloudflareTunnel.isRunning()) {
      cloudflareTunnel.stop();
      cloudflareTunnel = null;
    }
    
    // Update mode manager
    modeManager.setMode(MainProcessMode.DESKTOP);
    
    return { success: true, message: 'Hybrid mode disabled successfully' };
  } catch (error) {
    console.error('Failed to disable hybrid mode:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

ipcMain.handle('remote:get-mode-status', async () => {
  return {
    mode: modeManager.getMode(),
    isHybrid: modeManager.isHybridMode(),
    isRemoteEnabled: modeManager.isRemoteEnabled(),
    serverRunning: remoteServer ? remoteServer.isRunning() : false,
    config: modeManager.getConfig()
  };
});

// Local Database handlers removed - SQLite not actively used

// Clean up on app quit
app.on('before-quit', async () => {
  // Stop remote server if running
  if (remoteServer && remoteServer.isRunning()) {
   
    await remoteServer.stop();
  }

  // Stop Cloudflare tunnel if running
  if (cloudflareTunnel && cloudflareTunnel.isRunning()) {
    cloudflareTunnel.stop();
  }
  
  // Database cleanup removed - SQLite not actively used
  for (const [path, service] of gitServices) {
    service.cleanup();
  }
  gitServices.clear();
});