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
  IQueueManager
} from '../interfaces/index.js';
import { AppMode } from '../interfaces/index.js';
import { RemoteFileService } from './remote/RemoteFileService.js';
import { RemoteClaudeService } from './remote/RemoteClaudeService.js';
import { RemoteGitService } from './remote/RemoteGitService.js';
import { RemoteTerminalService } from './remote/RemoteTerminalService.js';
import { RemoteKnowledgeService } from './remote/RemoteKnowledgeService.js';
import { RemoteMCPService } from './remote/RemoteMCPService.js';
import { RemoteStorageService } from './remote/RemoteStorageService.js';
import { RemoteQueueManager } from './remote/RemoteQueueManager.js';
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
  public readonly queue: IQueueManager;
  
  // Minimal cache implementation for remote mode
  public readonly cache = {
    saveSessionState: async (state: any) => {
      // In remote mode, session state is managed by the server
      console.log('Remote mode: Session state managed by server');
    },
    getSessionState: async () => {
      // Return minimal state for remote mode
      return {
        openFiles: [],
        terminalSessions: [],
        claudeConversations: []
      };
    },
    getCacheStats: async () => {
      // Return minimal stats for remote mode
      return {
        totalSize: 0,
        fileCount: 0,
        oldestEntry: new Date(),
        newestEntry: new Date()
      };
    },
    getPerformanceMetrics: async () => {
      // Return minimal metrics for remote mode
      return {
        cacheHitRate: 0,
        averageResponseTime: 0,
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0
      };
    }
  };
  
  private socket: Socket | null = null;
  private config: RemoteServiceConfig;
  private sessionId: string | null = null;
  private syncService: SyncService;
  
  constructor(config: RemoteServiceConfig) {
    this.config = config;
    
    // Initialize services with null socket (will be set on connect)
    this.file = new RemoteFileService(() => this.socket);
    this.claude = new RemoteClaudeService(() => this.socket);
    this.git = new RemoteGitService(() => this.socket);
    this.terminal = new RemoteTerminalService(() => this.socket);
    this.knowledge = new RemoteKnowledgeService(() => this.socket);
    this.mcp = new RemoteMCPService(() => this.socket);
    this.storage = new RemoteStorageService(() => this.socket);
    this.queue = new RemoteQueueManager(() => this.socket, connectionManager);
    
    // Initialize sync service
    this.syncService = new SyncService(() => this.socket, config.syncOptions);
    
    // Set up connection state listeners
    this.setupConnectionListeners();
  }
  
  async initialize(): Promise<void> {
    if (this.config.autoConnect !== false) {
      await this.connect();
    }
  }
  
  async dispose(): Promise<void> {
    await this.disconnect();
    this.syncService.dispose();
    connectionManager.dispose();
  }
  
  /**
   * Connect to remote server
   */
  async connect(): Promise<void> {
    // Check if we have a shared connection from useRemoteConnection or mobile
    const sharedSocket = remoteConnection.getSocket();
    if (sharedSocket && sharedSocket.connected) {
      console.log('Using shared Socket.IO connection');
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
      console.log('[RemoteServiceProvider] Mobile device detected, waiting for mobile connection...');
      
      // Try multiple times to get the mobile socket with longer timeout
      for (let i = 0; i < 20; i++) {
        const mobileSocket = remoteConnection.getSocket();
        if (mobileSocket && mobileSocket.connected) {
          console.log('[RemoteServiceProvider] Using mobile Socket.IO connection');
          console.log('[RemoteServiceProvider] Mobile socket connected:', mobileSocket.connected);
          console.log('[RemoteServiceProvider] Mobile socket ID:', mobileSocket.id);
          this.socket = mobileSocket;
          
          // Set up socket event handlers
          this.setupSocketHandlers();
          
          // Skip connection manager for already-connected mobile socket
          console.log('[RemoteServiceProvider] Mobile socket already connected, skipping connection manager');
          
          // Just mark as connected in connection manager without waiting
          (connectionManager as any).transitionTo(ConnectionState.CONNECTED, 'Mobile connection reused');
          
          // Check if session ID is already available
          const storedSessionId = (window as any).__remoteSessionId;
          if (storedSessionId) {
            console.log('[RemoteServiceProvider] Using stored session ID:', storedSessionId);
            this.sessionId = storedSessionId;
          }
          
          // Wait for session ready (should be immediate if we have stored session)
          await this.waitForSession();
          console.log('[RemoteServiceProvider] Mobile connection established successfully');
          return;
        }
        
        // Wait before trying again
        console.log(`[RemoteServiceProvider] Attempt ${i + 1}/20 - waiting for mobile socket...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      throw new Error('Mobile connection not available after 10 seconds');
    }
    
    if (this.socket?.connected) {
      console.log('Already connected to remote server');
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
      
      // Flush queue
      await this.queue.flush();
      
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
      console.log(`Connection state changed: ${change.from} -> ${change.to}`, change.reason);
    });
    
    // Auto-sync when needed
    connectionManager.on('sync:needed', () => {
      this.sync().catch(error => {
        console.error('Auto-sync failed:', error);
      });
    });
    
    // Handle reconnect attempts
    connectionManager.on('reconnect:attempt', (attempt) => {
      console.log(`Reconnect attempt ${attempt}`);
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
      console.log('Remote session ready:', this.sessionId);
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
        console.log('[RemoteServiceProvider] Session already ready:', this.sessionId);
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        console.error('[RemoteServiceProvider] Session initialization timeout');
        reject(new Error('Session initialization timeout'));
      }, 15000); // Longer timeout for mobile
      
      const checkSession = () => {
        if (this.sessionId) {
          console.log('[RemoteServiceProvider] Session ready:', this.sessionId);
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