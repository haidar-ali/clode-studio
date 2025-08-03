/**
 * Connection Manager Composable
 * Handles remote connection state and synchronization
 */
import { ref, computed, watch } from 'vue';
import { useServices } from './useServices';
import { useToast } from './useToast';

export type ConnectionState = 
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'synchronized'
  | 'error'
  | 'disconnected';

export interface ConnectedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'laptop' | 'tablet' | 'phone';
  lastActive: Date;
  isCurrent: boolean;
}

class ConnectionManager {
  // State
  state = ref<ConnectionState>('offline');
  error = ref<string | null>(null);
  serverUrl = ref<string | null>(null);
  sessionId = ref<string | null>(null);
  currentDeviceId = ref<string | null>(null);
  connectedDevices = ref<ConnectedDevice[]>([]);
  
  // Metrics
  latency = ref(0);
  lastSync = ref<Date | null>(null);
  hasUpdates = ref(false);
  
  // Internal
  private socket: any = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  private servicesComposable = useServices();
  private toast = useToast();
  
  constructor() {
    // Auto-connect in hybrid/remote modes
    this.initialize().catch(error => {
      console.error('Failed to initialize ConnectionManager:', error);
    });
  }
  
  private async initialize() {
    // Wait for services to be initialized
    await this.servicesComposable.initialize();
    
    const provider = this.servicesComposable.services.value;
    if (!provider) {
      console.error('Service provider not available');
      return;
    }
    
    const appMode = provider.mode;
    
    if (appMode === 'hybrid' || appMode === 'remote') {
      // Auto-connect after a short delay
      setTimeout(() => this.connect(), 500);
    }
  }
  
  async connect(url?: string) {
    if (this.state.value === 'connecting' || this.state.value === 'connected') {
      return;
    }
    
    this.state.value = 'connecting';
    this.error.value = null;
    
    try {
      // Ensure services are initialized
      await this.servicesComposable.initialize();
      
      const provider = this.servicesComposable.services.value;
      if (!provider) {
        throw new Error('Service provider not available');
      }
      
      // Get server URL from config or parameter
      this.serverUrl.value = url || this.getServerUrl();
      
      // For remote mode, the service handles connection
      if (provider.mode === 'remote') {
        // Remote service provider handles Socket.IO
        await this.setupRemoteConnection();
      } else if (provider.mode === 'hybrid') {
        // Hybrid mode connects to local server
        await this.setupHybridConnection();
      }
      
      this.state.value = 'connected';
      this.reconnectAttempts = 0;
      this.startPingMonitoring();
      
      // Initial sync
      await this.sync();
      
    } catch (error) {
      console.error('Connection failed:', error);
      this.state.value = 'error';
      this.error.value = (error as Error).message;
      this.handleConnectionError();
    }
  }
  
  async reconnect() {
    // Don't attempt reconnect if services aren't available
    if (!this.servicesComposable.services.value) {
      console.error('Cannot reconnect: services not available');
      this.state.value = 'offline';
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.state.value = 'error';
      this.error.value = 'Max reconnection attempts reached';
      this.toast.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    this.toast.info(`Reconnecting in ${delay / 1000}s...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  async disconnect() {
    this.stopPingMonitoring();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.state.value = 'offline';
    this.sessionId.value = null;
    this.connectedDevices.value = [];
  }
  
  async sync() {
    if (this.state.value !== 'connected' && this.state.value !== 'synchronized') {
      return;
    }
    
    this.state.value = 'syncing';
    
    try {
      const provider = this.servicesComposable.services.value;
      if (!provider) {
        throw new Error('Service provider not available');
      }
      
      // Sync using performance cache
      const cache = provider.cache;
      
      // Get current session state
      const sessionState = await this.buildSessionState();
      await cache.saveSessionState(sessionState);
      
      // Perform sync operations
      // This would normally sync with remote server
      
      this.lastSync.value = new Date();
      this.state.value = 'synchronized';
      
    } catch (error) {
      console.error('Sync failed:', error);
      this.state.value = 'connected';
    }
  }
  
  async forceSync() {
    // Clear cache and force full sync
    const provider = this.servicesComposable.services.value;
    if (!provider) {
      throw new Error('Service provider not available');
    }
    
    const cache = provider.cache;
    
    // Invalidate all cached data
    await cache.clear();
    
    // Reconnect and sync
    await this.disconnect();
    await this.connect();
  }
  
  async applyUpdates() {
    // Apply any pending updates
    this.hasUpdates.value = false;
    await this.sync();
  }
  
  async syncNow() {
    // Immediate sync
    await this.sync();
  }
  
  async refreshDevices() {
    // Request updated device list from server
    if (this.socket && this.socket.connected) {
      this.socket.emit('devices:list', {}, (response: any) => {
        if (response.success && response.devices) {
          this.connectedDevices.value = response.devices.map((d: any) => ({
            id: d.id,
            name: d.name,
            type: d.type || 'desktop',
            lastActive: new Date(d.lastActive),
            isCurrent: d.id === this.currentDeviceId.value
          }));
        }
      });
    }
  }
  
  async switchToDevice(deviceId: string) {
    const device = this.connectedDevices.value.find(d => d.id === deviceId);
    if (!device) {
      this.toast.error('Device not found');
      return;
    }
    
    // Don't switch to current device
    if (device.id === this.currentDeviceId.value) {
      this.toast.info('Already on this device');
      return;
    }
    
    try {
      this.toast.info(`Switching to ${device.name}...`);
      
      // Import device switching service
      const { DeviceSwitchingService } = await import('../services/device-switching');
      const provider = this.servicesComposable.services.value;
      if (!provider) {
        throw new Error('Service provider not available');
      }
      
      const deviceSwitcher = new DeviceSwitchingService(provider);
      
      // Create checkpoint of current state
      this.toast.info('Creating checkpoint...');
      const checkpoint = await deviceSwitcher.createCheckpoint();
      
      // Emit device switch event with checkpoint
      if (this.socket) {
        this.socket.emit('device:switch', { 
          from: this.currentDeviceId.value,
          to: deviceId,
          checkpoint
        });
        
        // Listen for switch confirmation
        this.socket.once('device:switch:complete', async (data) => {
          if (data.success && data.checkpoint) {
            // Restore the other device's checkpoint
            this.toast.info('Restoring device state...');
            await deviceSwitcher.restoreCheckpoint(data.checkpoint);
            
            // Update current device
            this.currentDeviceId.value = deviceId;
            this.toast.success(`Switched to ${device.name}`);
          } else {
            this.toast.error('Device switch failed: ' + (data.error || 'Unknown error'));
          }
        });
      } else {
        // Local switch (no socket connection)
        this.currentDeviceId.value = deviceId;
        this.toast.success(`Switched to ${device.name} (local only)`);
      }
    } catch (error) {
      console.error('Device switch error:', error);
      this.toast.error('Failed to switch device: ' + (error as Error).message);
    }
  }
  
  private async setupRemoteConnection() {
    // Remote connection is handled by RemoteServiceProvider
    // Just set up event listeners
    const provider = this.servicesComposable.services.value;
    if (!provider) {
      throw new Error('Service provider not available');
    }
    
    // The remote provider should expose socket events
    // For now, simulate connection
    this.sessionId.value = this.generateSessionId();
    this.currentDeviceId.value = this.getDeviceId();
  }
  
  private async setupHybridConnection() {
    // Connect to local Socket.IO server
    const io = (window as any).io;
    if (!io) {
      throw new Error('Socket.IO not available');
    }
    
    this.socket = io(this.serverUrl.value, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts
    });
    
    // Set up event handlers
    this.socket.on('connect', () => {
      this.sessionId.value = this.socket.id;
      this.state.value = 'connected';
      
      // Initialize with current device and mock devices for testing
      const currentId = this.getDeviceId();
      this.currentDeviceId.value = currentId;
      this.connectedDevices.value = [
        {
          id: currentId,
          name: 'This Device',
          type: 'desktop',
          lastActive: new Date(),
          isCurrent: true
        },
        {
          id: 'device-mock-1',
          name: 'MacBook Pro',
          type: 'laptop',
          lastActive: new Date(Date.now() - 300000), // 5 minutes ago
          isCurrent: false
        },
        {
          id: 'device-mock-2',
          name: 'iPad Pro',
          type: 'tablet',
          lastActive: new Date(Date.now() - 3600000), // 1 hour ago
          isCurrent: false
        }
      ];
    });
    
    this.socket.on('disconnect', () => {
      this.state.value = 'disconnected';
      this.handleConnectionError();
    });
    
    this.socket.on('device:list', (devices: ConnectedDevice[]) => {
      this.connectedDevices.value = devices;
    });
    
    this.socket.on('sync:update', () => {
      this.hasUpdates.value = true;
    });
    
    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error);
      this.error.value = error.message;
    });
  }
  
  private startPingMonitoring() {
    this.pingInterval = setInterval(async () => {
      if (this.state.value === 'connected' || this.state.value === 'synchronized') {
        const start = Date.now();
        
        try {
          if (this.socket && this.socket.connected) {
            // Use Socket.IO's built-in ping
            this.socket.emit('ping', () => {
              this.latency.value = Date.now() - start;
            });
          }
        } catch (error) {
          console.error('Ping failed:', error);
        }
      }
    }, 5000); // Every 5 seconds
  }
  
  private stopPingMonitoring() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private handleConnectionError() {
    this.stopPingMonitoring();
    
    // Don't attempt reconnect if services aren't available
    if (!this.servicesComposable.services.value) {
      console.error('Cannot reconnect: services not available');
      this.state.value = 'offline';
      return;
    }
    
    if (this.state.value !== 'offline') {
      this.reconnect();
    }
  }
  
  private getServerUrl(): string {
    // Check environment variables
    const envUrl = import.meta.env.VITE_REMOTE_SERVER_URL;
    if (envUrl) return envUrl;
    
    // Default to local server for hybrid mode
    return 'http://localhost:3001';
  }
  
  private getDeviceId(): string {
    // Get or generate device ID
    let deviceId = localStorage.getItem('clode-device-id');
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('clode-device-id', deviceId);
    }
    return deviceId;
  }
  
  private generateDeviceId(): string {
    return `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  private async buildSessionState() {
    const provider = this.servicesComposable.services.value;
    if (!provider) {
      throw new Error('Service provider not available');
    }
    
    // Get current workspace state
    const workspace = localStorage.getItem('currentWorkspace') || '';
    const openFiles = JSON.parse(localStorage.getItem('openFiles') || '[]');
    
    // Get Claude instances
    const claudeInstances = []; // Would get from claude service
    
    // Get layout
    const layout = JSON.parse(localStorage.getItem('layout') || '{}');
    
    return {
      sessionId: this.sessionId.value || this.generateSessionId(),
      userId: this.getDeviceId(), // For now, device ID as user ID
      workspace,
      openFiles,
      claudeInstances,
      layout,
      lastActivity: new Date()
    };
  }
}

// Singleton instance
let connectionManager: ConnectionManager | null = null;

export function useConnectionManager() {
  if (!connectionManager) {
    connectionManager = new ConnectionManager();
  }
  return connectionManager;
}