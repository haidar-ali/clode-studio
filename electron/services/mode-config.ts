/**
 * Mode configuration for Electron main process
 * Determines and manages the application operation mode
 */
import path from 'path';
import fs from 'fs';

export enum MainProcessMode {
  DESKTOP = 'desktop',    // Pure desktop mode (default)
  HYBRID = 'hybrid'       // Desktop + remote server
  // SERVER = 'server'    // Headless server only (not yet implemented)
}

export interface ModeConfig {
  mode: MainProcessMode;
  serverPort?: number;
  serverHost?: string;
  enableRemoteAccess?: boolean;
  maxRemoteConnections?: number;
  authRequired?: boolean;
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
    if (modeArg) {
      const mode = modeArg.split('=')[1] as MainProcessMode;
      if (Object.values(MainProcessMode).includes(mode)) {
        return this.loadConfigForMode(mode);
      }
    }
    
    // 2. Check environment variable
    const envMode = process.env.CLODE_MODE || process.env.APP_MODE;
    if (envMode && Object.values(MainProcessMode).includes(envMode as MainProcessMode)) {
      return this.loadConfigForMode(envMode as MainProcessMode);
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
        
      // case MainProcessMode.SERVER:
      //   return {
      //     mode: MainProcessMode.SERVER,
      //     serverPort: parseInt(process.env.CLODE_SERVER_PORT || '3789'),
      //     serverHost: process.env.CLODE_SERVER_HOST || '0.0.0.0',
      //     enableRemoteAccess: true,
      //     maxRemoteConnections: parseInt(process.env.CLODE_MAX_CONNECTIONS || '50'),
      //     authRequired: true
      //   };
        
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
  
  // isServerMode(): boolean {
  //   return this.config.mode === MainProcessMode.SERVER;
  // }
  
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