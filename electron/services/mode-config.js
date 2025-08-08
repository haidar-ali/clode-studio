/**
 * Mode configuration for Electron main process
 * Determines and manages the application operation mode
 */
import path from 'path';
import fs from 'fs';
export var MainProcessMode;
(function (MainProcessMode) {
    MainProcessMode["DESKTOP"] = "desktop";
    MainProcessMode["HYBRID"] = "hybrid"; // Desktop + remote server
    // SERVER = 'server'    // Headless server only (not yet implemented)
})(MainProcessMode || (MainProcessMode = {}));
export class ModeManager {
    config;
    constructor() {
        this.config = this.detectMode();
    }
    detectMode() {
        // 1. Check command line arguments
        const args = process.argv.slice(2);
        const modeArg = args.find(arg => arg.startsWith('--mode='));
        if (modeArg) {
            const mode = modeArg.split('=')[1];
            if (Object.values(MainProcessMode).includes(mode)) {
                return this.loadConfigForMode(mode);
            }
        }
        // 2. Check environment variable
        const envMode = process.env.CLODE_MODE || process.env.APP_MODE;
        if (envMode && Object.values(MainProcessMode).includes(envMode)) {
            return this.loadConfigForMode(envMode);
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
            }
            catch (error) {
                console.error('Failed to load config file:', error);
            }
        }
        // 4. Default to desktop mode
        return this.loadConfigForMode(MainProcessMode.DESKTOP);
    }
    loadConfigForMode(mode) {
        switch (mode) {
            case MainProcessMode.HYBRID:
                return {
                    mode: MainProcessMode.HYBRID,
                    serverPort: parseInt(process.env.CLODE_SERVER_PORT || '3789'),
                    serverHost: process.env.CLODE_SERVER_HOST || '0.0.0.0',
                    enableRemoteAccess: true,
                    maxRemoteConnections: parseInt(process.env.CLODE_MAX_CONNECTIONS || '10'),
                    authRequired: process.env.CLODE_AUTH_REQUIRED === 'true' // Changed to opt-in
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
    getMode() {
        return this.config.mode;
    }
    getConfig() {
        return { ...this.config };
    }
    isDesktopMode() {
        return this.config.mode === MainProcessMode.DESKTOP;
    }
    isHybridMode() {
        return this.config.mode === MainProcessMode.HYBRID;
    }
    // isServerMode(): boolean {
    //   return this.config.mode === MainProcessMode.SERVER;
    // }
    isRemoteEnabled() {
        return this.config.enableRemoteAccess === true;
    }
}
// Singleton instance
let modeManager = null;
export function getModeManager() {
    if (!modeManager) {
        modeManager = new ModeManager();
    }
    return modeManager;
}
