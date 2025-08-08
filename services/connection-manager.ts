/**
 * Connection State Management
 * Implements a state machine for managing connection states
 */
import { EventEmitter } from 'events';
import type { Socket } from 'socket.io-client';

export enum ConnectionState {
  OFFLINE = 'offline',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  SYNCING = 'syncing',
  DISCONNECTING = 'disconnecting',
  ERROR = 'error'
}

export interface ConnectionStateChange {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ConnectionMetrics {
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastSyncAt?: Date;
  syncCount: number;
  errorCount: number;
  reconnectCount: number;
  averageLatency: number;
  dataTransferred: {
    sent: number;
    received: number;
  };
}

export interface ConnectionConfig {
  autoReconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  syncInterval: number;
  heartbeatInterval: number;
  timeout: number;
}

export class ConnectionManager extends EventEmitter {
  private currentState: ConnectionState = ConnectionState.OFFLINE;
  private stateHistory: ConnectionStateChange[] = [];
  private socket: Socket | null = null;
  private config: ConnectionConfig;
  private metrics: ConnectionMetrics;
  private syncTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private latencyMeasurements: number[] = [];
  
  constructor(config?: Partial<ConnectionConfig>) {
    super();
    
    this.config = {
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      syncInterval: 30000, // 30 seconds
      heartbeatInterval: 5000, // 5 seconds
      timeout: 10000, // 10 seconds
      ...config
    };
    
    this.metrics = {
      syncCount: 0,
      errorCount: 0,
      reconnectCount: 0,
      averageLatency: 0,
      dataTransferred: {
        sent: 0,
        received: 0
      }
    };
  }
  
  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.currentState;
  }
  
  /**
   * Get connection state history
   */
  getStateHistory(): ConnectionStateChange[] {
    return [...this.stateHistory];
  }
  
  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.currentState === ConnectionState.CONNECTED || 
           this.currentState === ConnectionState.SYNCING;
  }
  
  /**
   * Check if syncing
   */
  isSyncing(): boolean {
    return this.currentState === ConnectionState.SYNCING;
  }
  
  /**
   * Connect to server
   */
  async connect(socket: Socket): Promise<void> {
    if (this.isConnected()) {
      throw new Error('Already connected');
    }
    
    this.socket = socket;
    this.transitionTo(ConnectionState.CONNECTING, 'User initiated connection');
    
    // Set up socket event handlers
    this.setupSocketHandlers();
    
    // Wait for connection with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.transitionTo(ConnectionState.ERROR, 'Connection timeout');
        reject(new Error('Connection timeout'));
      }, this.config.timeout);
      
      const handleConnect = () => {
        clearTimeout(timeout);
        this.socket?.off('connect', handleConnect);
        this.socket?.off('connect_error', handleError);
        resolve();
      };
      
      const handleError = (error: Error) => {
        clearTimeout(timeout);
        this.socket?.off('connect', handleConnect);
        this.socket?.off('connect_error', handleError);
        this.transitionTo(ConnectionState.ERROR, error.message);
        reject(error);
      };
      
      this.socket?.once('connect', handleConnect);
      this.socket?.once('connect_error', handleError);
    });
  }
  
  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (!this.socket) return;
    
    this.transitionTo(ConnectionState.DISCONNECTING, 'User initiated disconnect');
    
    // Clean up timers
    this.stopHeartbeat();
    this.stopSyncTimer();
    this.stopReconnectTimer();
    
    // Disconnect socket
    this.socket.disconnect();
    this.socket = null;
    
    this.transitionTo(ConnectionState.OFFLINE, 'Disconnected');
  }
  
  /**
   * Start syncing
   */
  startSync(): void {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    this.transitionTo(ConnectionState.SYNCING, 'Sync started');
    this.emit('sync:start');
  }
  
  /**
   * Complete syncing
   */
  completeSync(success: boolean = true): void {
    if (this.currentState !== ConnectionState.SYNCING) return;
    
    if (success) {
      this.metrics.syncCount++;
      this.metrics.lastSyncAt = new Date();
      this.transitionTo(ConnectionState.CONNECTED, 'Sync completed');
      this.emit('sync:complete');
    } else {
      this.transitionTo(ConnectionState.CONNECTED, 'Sync failed');
      this.emit('sync:error');
    }
  }
  
  /**
   * Update metrics
   */
  updateMetrics(type: 'sent' | 'received', bytes: number): void {
    this.metrics.dataTransferred[type] += bytes;
  }
  
  /**
   * Add latency measurement
   */
  addLatencyMeasurement(latency: number): void {
    this.latencyMeasurements.push(latency);
    if (this.latencyMeasurements.length > 100) {
      this.latencyMeasurements.shift();
    }
    
    // Update average
    const sum = this.latencyMeasurements.reduce((a, b) => a + b, 0);
    this.metrics.averageLatency = Math.round(sum / this.latencyMeasurements.length);
  }
  
  /**
   * Transition to new state
   */
  private transitionTo(newState: ConnectionState, reason?: string, metadata?: Record<string, any>): void {
    const oldState = this.currentState;
    if (oldState === newState) return;
    
    const change: ConnectionStateChange = {
      from: oldState,
      to: newState,
      timestamp: new Date(),
      reason,
      metadata
    };
    
    this.currentState = newState;
    this.stateHistory.push(change);
    
    // Keep history limited
    if (this.stateHistory.length > 100) {
      this.stateHistory.shift();
    }
    
    // Emit state change event
    this.emit('state:change', change);
    this.emit(`state:${newState}`, change);
    
    // Handle state-specific logic
    this.handleStateTransition(oldState, newState);
  }
  
  /**
   * Handle state transition logic
   */
  private handleStateTransition(from: ConnectionState, to: ConnectionState): void {
    switch (to) {
      case ConnectionState.CONNECTED:
        this.metrics.connectedAt = new Date();
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.startSyncTimer();
        break;
        
      case ConnectionState.OFFLINE:
      case ConnectionState.ERROR:
        this.metrics.disconnectedAt = new Date();
        this.stopHeartbeat();
        this.stopSyncTimer();
        if (this.config.autoReconnect && from !== ConnectionState.DISCONNECTING) {
          this.scheduleReconnect();
        }
        break;
        
      case ConnectionState.SYNCING:
        // Pause heartbeat during sync
        this.stopHeartbeat();
        break;
    }
  }
  
  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;
    
    this.socket.on('connect', () => {
      this.transitionTo(ConnectionState.CONNECTED, 'Socket connected');
    });
    
    this.socket.on('disconnect', (reason) => {
      if (this.currentState !== ConnectionState.DISCONNECTING) {
        this.transitionTo(ConnectionState.OFFLINE, `Socket disconnected: ${reason}`);
      }
    });
    
    this.socket.on('connect_error', (error) => {
      this.metrics.errorCount++;
      this.transitionTo(ConnectionState.ERROR, error.message);
    });
    
    // Handle ping/pong for latency measurement
    this.socket.on('pong', (latency: number) => {
      this.addLatencyMeasurement(latency);
    });
  }
  
  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        const start = Date.now();
        this.socket.emit('ping', () => {
          const latency = Date.now() - start;
          this.addLatencyMeasurement(latency);
        });
      }
    }, this.config.heartbeatInterval);
  }
  
  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  /**
   * Start sync timer
   */
  private startSyncTimer(): void {
    this.stopSyncTimer();
    
    this.syncTimer = setInterval(() => {
      if (this.isConnected() && !this.isSyncing()) {
        this.emit('sync:needed');
      }
    }, this.config.syncInterval);
  }
  
  /**
   * Stop sync timer
   */
  private stopSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
  
  /**
   * Schedule reconnect attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnect:failed', 'Max reconnect attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    this.reconnectTimer = setTimeout(() => {
      this.emit('reconnect:attempt', this.reconnectAttempts);
      this.metrics.reconnectCount++;
      
      if (this.socket) {
        this.socket.connect();
      }
    }, delay);
  }
  
  /**
   * Stop reconnect timer
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  /**
   * Clean up
   */
  dispose(): void {
    this.stopHeartbeat();
    this.stopSyncTimer();
    this.stopReconnectTimer();
    this.removeAllListeners();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();