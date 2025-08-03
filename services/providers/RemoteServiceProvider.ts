/**
 * Remote Service Provider
 * Implements all services for remote access via Socket.IO
 */
import { io, Socket } from 'socket.io-client';
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
    if (this.socket?.connected) {
      console.log('Already connected to remote server');
      return;
    }
    
    // Create socket connection
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
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('Session initialization timeout'));
      }, 10000);
      
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
}