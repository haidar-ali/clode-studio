/**
 * Remote Service Provider
 * Implements all services for remote access via Socket.IO
 */
import { io, Socket } from 'socket.io-client';
import { remoteConnection } from '../remote-client/RemoteConnectionSingleton.js';
import type { 
  IServiceProvider, 
  IFileService, 
  IClaudeService, 
  IGitService, 
  ITerminalService,
  IKnowledgeService,
  IMCPService,
  IStorageService,
  IPerformanceCache,
  ITasksService
} from '../interfaces/index.js';
import { AppMode } from '../interfaces/index.js';
import { RemoteFileService } from './remote/RemoteFileService.js';
import { RemoteClaudeService } from './remote/RemoteClaudeService.js';
import { RemoteGitService } from './remote/RemoteGitService.js';
import { RemoteTerminalService } from './remote/RemoteTerminalService.js';
import { RemoteKnowledgeService } from './remote/RemoteKnowledgeService.js';
import { RemoteMCPService } from './remote/RemoteMCPService.js';
import { RemoteStorageService } from './remote/RemoteStorageService.js';
import { RemoteTasksService } from './remote/RemoteTasksService.js';
import { RemoteMemoryCache } from './remote/RemoteMemoryCache.js';
import { RemoteDesktopFeaturesService } from './remote/RemoteDesktopFeaturesService.js';
import { connectionManager, ConnectionState } from '../connection-manager.js';
import { SyncService } from '../sync/sync-service.js';

export interface RemoteServiceConfig {
  serverUrl: string;
  authToken?: string;
  autoConnect?: boolean;
  reconnectOptions?: {
    enabled: boolean;
    maxAttempts?: number;
    delay?: number;
  };
  syncOptions?: {
    autoSync?: boolean;
    syncInterval?: number;
    conflictResolution?: 'local' | 'remote' | 'manual';
  };
}

export class RemoteServiceProvider implements IServiceProvider {
  public readonly mode = AppMode.REMOTE;
  
  // Services
  public readonly file: IFileService;
  public readonly claude: IClaudeService;
  public readonly git: IGitService;
  public readonly terminal: ITerminalService;
  public readonly knowledge: IKnowledgeService;
  public readonly mcp: IMCPService;
  public readonly storage: IStorageService;
  public readonly tasks: ITasksService;
  public readonly cache: IPerformanceCache;
  
  private socket: Socket | null = null;
  private config: RemoteServiceConfig;
  private sessionId: string | null = null;
  private syncService: SyncService;
  private desktopFeaturesService: RemoteDesktopFeaturesService;
  
  constructor(config: RemoteServiceConfig) {
    this.config = config;
    
    // Initialize cache service
    this.cache = new RemoteMemoryCache();
    
    // Initialize services with null socket (will be set on connect)
    this.file = new RemoteFileService(() => this.socket);
    this.claude = new RemoteClaudeService(() => this.socket);
    this.git = new RemoteGitService(() => this.socket);
    this.terminal = new RemoteTerminalService(() => this.socket);
    this.knowledge = new RemoteKnowledgeService(() => this.socket);
    this.mcp = new RemoteMCPService(() => this.socket);
    this.storage = new RemoteStorageService(() => this.socket);
    this.tasks = new RemoteTasksService(this.file);
    
    // Initialize sync service
    this.syncService = new SyncService(() => this.socket, config.syncOptions);
    
    // Initialize desktop features service
    this.desktopFeaturesService = new RemoteDesktopFeaturesService(() => this.socket);
    
    // Set up connection state listeners
    this.setupConnectionListeners();
  }
  
  async initialize(): Promise<void> {
    // Check if we already have a connection from remoteConnection singleton
    const existingSocket = remoteConnection.getSocket();
    if (existingSocket && existingSocket.connected) {
      
      this.socket = existingSocket;
      this.setupSocketHandlers();
      // Mark connectionManager as connected since we're reusing an existing connection
      (connectionManager as any).currentState = ConnectionState.CONNECTED;
      (connectionManager as any).socket = existingSocket;
      return;
    }
    
    // If no existing connection and autoConnect is enabled, try to connect
    if (this.config.autoConnect !== false) {
      // For remote mode, don't wait here - let the event system handle it
      
      
      // Quick check if connection is already available
      const socket = remoteConnection.getSocket();
      if (socket && socket.connected) {
        
        this.socket = socket;
        this.setupSocketHandlers();
        (connectionManager as any).currentState = ConnectionState.CONNECTED;
        (connectionManager as any).socket = socket;
        return;
      }
      
      // Otherwise, we'll wait for the remote-connection-ready event to call updateSocket()
      
    }
  }
  
  async dispose(): Promise<void> {
    await this.disconnect();
    this.syncService.dispose();
    connectionManager.dispose();
  }
  
  /**
   * Update the socket connection after it's established
   */
  async updateSocket(): Promise<void> {
    const sharedSocket = remoteConnection.getSocket();
    
    if (sharedSocket && sharedSocket.connected) {
      // Update even if we already have a socket (it might be disconnected)
      if (!this.socket || !this.socket.connected) {
        
        this.socket = sharedSocket;
        this.setupSocketHandlers();
        
        // Update connection manager
        (connectionManager as any).currentState = ConnectionState.CONNECTED;
        (connectionManager as any).socket = sharedSocket;
        
        
        // The services already use () => this.socket, so they'll get the updated socket automatically
      } else {
        
      }
    } else {
      
    }
  }
  
  /**
   * Connect to remote server
   */
  async connect(): Promise<void> {
    // Check if we have a shared connection from useRemoteConnection or mobile
    const sharedSocket = remoteConnection.getSocket();
    if (sharedSocket && sharedSocket.connected) {
     
      this.socket = sharedSocket;
      
      // Set up socket event handlers
      this.setupSocketHandlers();
      
      // Connect via connection manager
      await connectionManager.connect(this.socket);
      
      // Wait for session ready
      await this.waitForSession();
      return;
    }
    
    // For mobile, wait for the mobile connection to be established
    if (typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
     
      
      // Try multiple times to get the mobile socket with longer timeout
      for (let i = 0; i < 20; i++) {
        const mobileSocket = remoteConnection.getSocket();
        if (mobileSocket && mobileSocket.connected) {
         
         
         
          this.socket = mobileSocket;
          
          // Set up socket event handlers
          this.setupSocketHandlers();
          
          // Skip connection manager for already-connected mobile socket
         
          
          // Just mark as connected in connection manager without waiting
          (connectionManager as any).transitionTo(ConnectionState.CONNECTED, 'Mobile connection reused');
          
          // Check if session ID is already available
          const storedSessionId = (window as any).__remoteSessionId;
          if (storedSessionId) {
           
            this.sessionId = storedSessionId;
          }
          
          // Wait for session ready (should be immediate if we have stored session)
          await this.waitForSession();
         
          return;
        }
        
        // Wait before trying again
       
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      throw new Error('Mobile connection not available after 10 seconds');
    }
    
    if (this.socket?.connected) {
     
      return;
    }
    
    // Create socket connection if no shared connection
    this.socket = io(this.config.serverUrl, {
      auth: this.config.authToken ? { token: this.config.authToken } : undefined,
      reconnection: this.config.reconnectOptions?.enabled ?? true,
      reconnectionAttempts: this.config.reconnectOptions?.maxAttempts ?? 10,
      reconnectionDelay: this.config.reconnectOptions?.delay ?? 1000,
      transports: ['websocket', 'polling']
    });
    
    // Set up socket event handlers
    this.setupSocketHandlers();
    
    // Connect via connection manager
    await connectionManager.connect(this.socket);
    
    // Wait for session ready
    await this.waitForSession();
  }
  
  /**
   * Disconnect from remote server
   */
  async disconnect(): Promise<void> {
    await connectionManager.disconnect();
    this.socket = null;
    this.sessionId = null;
  }
  
  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return connectionManager.getState();
  }
  
  /**
   * Get connection metrics
   */
  getConnectionMetrics() {
    return connectionManager.getMetrics();
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return connectionManager.isConnected();
  }
  
  /**
   * Trigger manual sync
   */
  async sync(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to remote server');
    }
    
    connectionManager.startSync();
    
    try {
      // Perform sync via sync service
      await this.syncService.sync();
      
      connectionManager.completeSync(true);
    } catch (error) {
      connectionManager.completeSync(false);
      throw error;
    }
  }
  
  /**
   * Get sync service for direct access
   */
  getSyncService(): SyncService {
    return this.syncService;
  }
  
  /**
   * Set up connection state listeners
   */
  private setupConnectionListeners(): void {
    // Listen for state changes
    connectionManager.on('state:change', (change) => {
     
    });
    
    // Auto-sync when needed
    connectionManager.on('sync:needed', () => {
      this.sync().catch(error => {
        console.error('Auto-sync failed:', error);
      });
    });
    
    // Handle reconnect attempts
    connectionManager.on('reconnect:attempt', (attempt) => {
     
    });
    
    connectionManager.on('reconnect:failed', (reason) => {
      console.error('Failed to reconnect:', reason);
    });
  }
  
  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;
    
    // Handle session ready
    this.socket.on('connection:ready', (data) => {
      this.sessionId = data.sessionId;
     
    });
    
    // Track data transfer
    const originalEmit = this.socket.emit.bind(this.socket);
    this.socket.emit = (...args: any[]) => {
      // Estimate data size (rough)
      const dataSize = JSON.stringify(args).length;
      connectionManager.updateMetrics('sent', dataSize);
      return originalEmit(...args);
    };
    
    this.socket.on('message', (data) => {
      const dataSize = JSON.stringify(data).length;
      connectionManager.updateMetrics('received', dataSize);
    });
  }
  
  /**
   * Wait for session to be ready
   */
  private waitForSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.sessionId) {
       
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        console.error('[RemoteServiceProvider] Session initialization timeout');
        reject(new Error('Session initialization timeout'));
      }, 15000); // Longer timeout for mobile
      
      const checkSession = () => {
        if (this.sessionId) {
         
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      };
      
      const interval = setInterval(checkSession, 100);
    });
  }
  
  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
  
  /**
   * Get socket for debugging
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}