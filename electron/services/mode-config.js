/**
 * Mode configuration for Electron main process
 * Determines and manages the application operation mode
 */
import path from 'path';
import fs from 'fs';
export var MainProcessMode;
(function (MainProcessMode) {
    MainProcessMode["DESKTOP"] = "desktop";
    MainProcessMode["HYBRID"] = "hybrid";
    MainProcessMode["HEADLESS"] = "headless"; // Headless server only (no GUI)
})(MainProcessMode || (MainProcessMode = {}));
export class ModeManager {
    config;
    initialMode;
    constructor() {
        this.config = this.detectMode();
        this.initialMode = this.config.mode;
    }
    detectMode() {
        // 1. Check command line arguments
        const args = process.argv.slice(2);
        const modeArg = args.find(arg => arg.startsWith('--mode='));
        // Parse workspace path from command line
        const workspaceArg = args.find(arg => arg.startsWith('--workspace='));
        const workspacePath = workspaceArg ? workspaceArg.split('=')[1] : undefined;
        if (modeArg) {
            const mode = modeArg.split('=')[1];
            if (Object.values(MainProcessMode).includes(mode)) {
                const config = this.loadConfigForMode(mode);
                if (workspacePath)
                    config.workspacePath = workspacePath;
                return config;
            }
        }
        // 2. Check environment variable
        const envMode = process.env.CLODE_MODE || process.env.APP_MODE;
        if (envMode && Object.values(MainProcessMode).includes(envMode)) {
            const config = this.loadConfigForMode(envMode);
            if (workspacePath)
                config.workspacePath = workspacePath;
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
            case MainProcessMode.HEADLESS:
                // Map RELAY_TYPE environment variable to relayType
                // Default is CLODE relay for headless mode
                let relayType = 'relay';
                let relayConfig = {};
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
                }
                else {
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
    isHeadlessMode() {
        return this.config.mode === MainProcessMode.HEADLESS;
    }
    isRemoteEnabled() {
        return this.config.enableRemoteAccess === true;
    }
    // Runtime mode change support
    setMode(mode) {
        this.config = this.loadConfigForMode(mode);
    }
    getInitialMode() {
        return this.initialMode;
    }
    canChangeMode() {
        // Allow mode changes at runtime
        return true;
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
