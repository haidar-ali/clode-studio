/**
 * Mode configuration for Electron main process
 * Determines and manages the application operation mode
 */
import path from 'path';
import fs from 'fs';

export enum MainProcessMode {
  DESKTOP = 'desktop',    // Pure desktop mode (default)
  HYBRID = 'hybrid',      // Desktop + remote server
  HEADLESS = 'headless'   // Headless server only (no GUI)
}

export interface ModeConfig {
  mode: MainProcessMode;
  serverPort?: number;
  serverHost?: string;
  enableRemoteAccess?: boolean;
  maxRemoteConnections?: number;
  authRequired?: boolean;
  workspacePath?: string;  // For headless mode
  relayType?: 'local' | 'cloudflare' | 'relay';
  relayConfig?: Record<string, any>;
}

export class ModeManager {
  private config: ModeConfig;
  private initialMode: MainProcessMode;
  
  constructor() {
    this.config = this.detectMode();
    this.initialMode = this.config.mode;
  }
  
  private detectMode(): ModeConfig {
    // 1. Check command line arguments
    const args = process.argv.slice(2);
    const modeArg = args.find(arg => arg.startsWith('--mode='));
    
    // Parse workspace path from command line
    const workspaceArg = args.find(arg => arg.startsWith('--workspace='));
    const workspacePath = workspaceArg ? workspaceArg.split('=')[1] : undefined;
    
    if (modeArg) {
      const mode = modeArg.split('=')[1] as MainProcessMode;
      if (Object.values(MainProcessMode).includes(mode)) {
        const config = this.loadConfigForMode(mode);
        if (workspacePath) config.workspacePath = workspacePath;
        return config;
      }
    }
    
    // 2. Check environment variable
    const envMode = process.env.CLODE_MODE || process.env.APP_MODE;
    if (envMode && Object.values(MainProcessMode).includes(envMode as MainProcessMode)) {
      const config = this.loadConfigForMode(envMode as MainProcessMode);
      if (workspacePath) config.workspacePath = workspacePath;
      return config;
    }
    
    // 3. Check config file
    const configPath = path.join(process.cwd(), 'clode.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const configFile = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (configFile.mode && Object.values(MainProcessMode).includes(configFile.mode)) {
          return {
            mode: configFile.mode,
            ...configFile
          };
        }
      } catch (error) {
        console.error('Failed to load config file:', error);
      }
    }
    
    // 4. Default to desktop mode
    return this.loadConfigForMode(MainProcessMode.DESKTOP);
  }
  
  private loadConfigForMode(mode: MainProcessMode): ModeConfig {
    switch (mode) {
      case MainProcessMode.HYBRID:
        return {
          mode: MainProcessMode.HYBRID,
          serverPort: parseInt(process.env.CLODE_SERVER_PORT || '3789'),
          serverHost: process.env.CLODE_SERVER_HOST || '0.0.0.0',
          enableRemoteAccess: true,
          maxRemoteConnections: parseInt(process.env.CLODE_MAX_CONNECTIONS || '10'),
          authRequired: process.env.CLODE_AUTH_REQUIRED === 'true'  // Changed to opt-in
        };
        
      case MainProcessMode.HEADLESS:
        // Map RELAY_TYPE environment variable to relayType
        // Default is CLODE relay for headless mode
        let relayType: 'local' | 'cloudflare' | 'relay' = 'relay';
        let relayConfig: Record<string, any> = {};
        
        const envRelayType = process.env.RELAY_TYPE || process.env.USE_RELAY;
        if (envRelayType) {
          switch (envRelayType.toUpperCase()) {
            case 'CLODE':
            case 'TRUE':
              relayType = 'relay';
              // Support custom RELAY_URL with CLODE type
              if (process.env.RELAY_URL) {
                relayConfig.url = process.env.RELAY_URL;
              }
              break;
            case 'CLOUDFLARE':
              relayType = 'cloudflare';
              break;
            case 'LOCAL':
            case 'NONE':
            case 'FALSE':
              relayType = 'local';
              break;
            default:
              relayType = 'relay'; // Default to CLODE
              if (process.env.RELAY_URL) {
                relayConfig.url = process.env.RELAY_URL;
              }
              break;
          }
        } else {
          // No RELAY_TYPE specified, but check for RELAY_URL
          if (process.env.RELAY_URL) {
            relayConfig.url = process.env.RELAY_URL;
          }
        }
        
        return {
          mode: MainProcessMode.HEADLESS,
          serverPort: parseInt(process.env.CLODE_SERVER_PORT || '3789'),
          serverHost: process.env.CLODE_SERVER_HOST || '0.0.0.0',
          enableRemoteAccess: true,
          maxRemoteConnections: parseInt(process.env.CLODE_MAX_CONNECTIONS || '50'),
          authRequired: process.env.CLODE_AUTH_REQUIRED === 'true',
          workspacePath: process.env.CLODE_WORKSPACE_PATH || process.cwd(),
          relayType,
          relayConfig
        };
        
      case MainProcessMode.DESKTOP:
      default:
        return {
          mode: MainProcessMode.DESKTOP,
          enableRemoteAccess: false
        };
    }
  }
  
  getMode(): MainProcessMode {
    return this.config.mode;
  }
  
  getConfig(): ModeConfig {
    return { ...this.config };
  }
  
  isDesktopMode(): boolean {
    return this.config.mode === MainProcessMode.DESKTOP;
  }
  
  isHybridMode(): boolean {
    return this.config.mode === MainProcessMode.HYBRID;
  }
  
  isHeadlessMode(): boolean {
    return this.config.mode === MainProcessMode.HEADLESS;
  }
  
  isRemoteEnabled(): boolean {
    return this.config.enableRemoteAccess === true;
  }
  
  // Runtime mode change support
  setMode(mode: MainProcessMode): void {
    this.config = this.loadConfigForMode(mode);
  }
  
  getInitialMode(): MainProcessMode {
    return this.initialMode;
  }
  
  canChangeMode(): boolean {
    // Allow mode changes at runtime
    return true;
  }
}

// Singleton instance
let modeManager: ModeManager | null = null;

export function getModeManager(): ModeManager {
  if (!modeManager) {
    modeManager = new ModeManager();
  }
  return modeManager;
}