/**
 * Service Factory
 * Detects app mode and provides appropriate service implementation
 */
import type { IServiceProvider } from './interfaces/index.js';
import { AppMode } from './interfaces/index.js';
import { DesktopServiceProvider } from './providers/index.js';
import { RemoteServiceProvider } from './providers/RemoteServiceProvider.js';

export class ServiceFactory {
  private static instance: IServiceProvider | null = null;
  private static mode: AppMode | null = null;
  
  /**
   * Get the current app mode from environment or config
   */
  static detectMode(): AppMode {
    // Check for mode override in environment
    const envMode = import.meta.env.VITE_APP_MODE || process.env.APP_MODE;
    if (envMode && Object.values(AppMode).includes(envMode as AppMode)) {
      return envMode as AppMode;
    }
    
    // Check if running in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Check for server/hybrid mode flags
      // For now, default to desktop mode
      // In future phases, we'll check for server components
      return AppMode.DESKTOP;
    }
    
    // If not in Electron, must be web (remote mode)
    return AppMode.REMOTE;
  }
  
  /**
   * Create service provider based on detected mode
   */
  static async create(mode?: AppMode): Promise<IServiceProvider> {
    // Use provided mode or detect
    const appMode = mode || this.detectMode();
    
    // Return cached instance if mode hasn't changed
    if (this.instance && this.mode === appMode) {
      return this.instance;
    }
    
    // Clean up previous instance if mode changed
    if (this.instance && this.mode !== appMode) {
      await this.instance.dispose();
      this.instance = null;
    }
    
    // Create new provider based on mode
    let provider: IServiceProvider;
    
    switch (appMode) {
      case AppMode.DESKTOP:
        provider = new DesktopServiceProvider();
        break;
        
      case AppMode.SERVER:
        // Headless server mode - not applicable for frontend
        throw new Error('Server mode not applicable for frontend');
        
      case AppMode.REMOTE:
        // For remote-only mode (browser access)
        const remoteConfig = {
          serverUrl: import.meta.env.VITE_REMOTE_SERVER_URL || 'http://localhost:3789',
          authToken: import.meta.env.VITE_REMOTE_AUTH_TOKEN,
          autoConnect: true
        };
        provider = new RemoteServiceProvider(remoteConfig);
        break;
        
      case AppMode.HYBRID:
        // Will be implemented in later phases
        // provider = new HybridServiceProvider();
        throw new Error('Hybrid mode not yet implemented');
        
      default:
        throw new Error(`Unknown app mode: ${appMode}`);
    }
    
    // Initialize the provider
    await provider.initialize();
    
    // Cache the instance
    this.instance = provider;
    this.mode = appMode;
    
    return provider;
  }
  
  /**
   * Get the current service provider instance
   */
  static async getInstance(): Promise<IServiceProvider> {
    if (!this.instance) {
      return this.create();
    }
    return this.instance;
  }
  
  /**
   * Get the current app mode
   */
  static getCurrentMode(): AppMode {
    return this.mode || this.detectMode();
  }
  
  /**
   * Force a mode change (useful for testing)
   */
  static async setMode(mode: AppMode): Promise<IServiceProvider> {
    return this.create(mode);
  }
  
  /**
   * Dispose of the current provider
   */
  static async dispose(): Promise<void> {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
      this.mode = null;
    }
  }
}