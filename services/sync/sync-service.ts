/**
 * Sync Service
 * Manages synchronization between local and remote state
 */
import type { Socket } from 'socket.io-client';
import { syncEngine, SyncPatch, SyncableState, SyncConflict } from './sync-engine.js';
import { connectionManager } from '../connection-manager.js';
import type { RemoteRequest, RemoteResponse } from '../../electron/services/remote-protocol.js';

export interface SyncServiceConfig {
  autoSync: boolean;
  syncInterval: number;
  conflictResolution: 'local' | 'remote' | 'manual';
  maxPatchSize: number;
  compressionEnabled: boolean;
}

export class SyncService {
  private config: SyncServiceConfig;
  private syncTimer: NodeJS.Timeout | null = null;
  private getSocket: () => Socket | null;
  private pendingConflicts: SyncConflict[] = [];
  
  constructor(
    getSocket: () => Socket | null,
    config?: Partial<SyncServiceConfig>
  ) {
    this.getSocket = getSocket;
    this.config = {
      autoSync: true,
      syncInterval: 30000, // 30 seconds
      conflictResolution: 'manual',
      maxPatchSize: 1024 * 1024, // 1MB
      compressionEnabled: true,
      ...config
    };
    
    this.setupEventListeners();
    
    if (this.config.autoSync) {
      this.startAutoSync();
    }
  }
  
  /**
   * Track state for synchronization
   */
  trackState(state: SyncableState): void {
    syncEngine.trackState(state);
  }
  
  /**
   * Perform manual sync
   */
  async sync(): Promise<void> {
    if (!connectionManager.isConnected()) {
      throw new Error('Not connected to remote server');
    }
    
    const result = await syncEngine.performSync(
      (patches) => this.sendPatches(patches),
      () => this.receivePatches()
    );
    
    // Handle conflicts based on configuration
    if (result.conflicts.length > 0) {
      await this.handleConflicts(result.conflicts);
    }
  }
  
  /**
   * Start auto-sync
   */
  startAutoSync(): void {
    this.stopAutoSync();
    
    this.syncTimer = setInterval(() => {
      if (connectionManager.isConnected()) {
        this.sync().catch(error => {
          console.error('Auto-sync failed:', error);
        });
      }
    }, this.config.syncInterval);
  }
  
  /**
   * Stop auto-sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
  
  /**
   * Get sync metrics
   */
  getMetrics() {
    return syncEngine.getMetrics();
  }
  
  /**
   * Get pending conflicts
   */
  getPendingConflicts(): SyncConflict[] {
    return [...this.pendingConflicts];
  }
  
  /**
   * Resolve conflict
   */
  resolveConflict(
    entityId: string,
    entityType: string,
    resolution: 'local' | 'remote' | 'merge'
  ): void {
    syncEngine.resolveConflict(entityId, entityType, resolution);
    
    // Remove from pending
    this.pendingConflicts = this.pendingConflicts.filter(
      c => c.entityId !== entityId || c.entityType !== entityType
    );
  }
  
  /**
   * Send patches to remote
   */
  private async sendPatches(patches: SyncPatch[]): Promise<void> {
    const socket = this.getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    
    // Compress if enabled and beneficial
    let data: any = patches;
    let compressed = false;
    
    if (this.config.compressionEnabled) {
      const originalSize = JSON.stringify(patches).length;
      if (originalSize > 1024) { // Only compress if > 1KB
        // TODO: Implement compression
        // data = compress(patches);
        compressed = true;
      }
    }
    
    return new Promise((resolve, reject) => {
      const request: RemoteRequest = {
        id: `sync-${Date.now()}`,
        payload: {
          patches: data,
          compressed
        }
      };
      
      socket.emit('sync:push', request, (response: RemoteResponse) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error?.message || 'Failed to push patches'));
        }
      });
    });
  }
  
  /**
   * Receive patches from remote
   */
  private async receivePatches(): Promise<SyncPatch[]> {
    const socket = this.getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    
    return new Promise((resolve, reject) => {
      const request: RemoteRequest = {
        id: `sync-${Date.now()}`,
        payload: {
          since: this.getLastSyncTimestamp()
        }
      };
      
      socket.emit('sync:pull', request, (response: RemoteResponse<{ patches: SyncPatch[], compressed: boolean }>) => {
        if (response.success && response.data) {
          let patches = response.data.patches;
          
          // Decompress if needed
          if (response.data.compressed) {
            // TODO: Implement decompression
            // patches = decompress(patches);
          }
          
          resolve(patches);
        } else {
          reject(new Error(response.error?.message || 'Failed to pull patches'));
        }
      });
    });
  }
  
  /**
   * Handle conflicts based on configuration
   */
  private async handleConflicts(conflicts: SyncConflict[]): Promise<void> {
    switch (this.config.conflictResolution) {
      case 'local':
        // Always prefer local version
        conflicts.forEach(conflict => {
          syncEngine.resolveConflict(
            conflict.entityId,
            conflict.entityType,
            'local'
          );
        });
        break;
        
      case 'remote':
        // Always prefer remote version
        conflicts.forEach(conflict => {
          syncEngine.resolveConflict(
            conflict.entityId,
            conflict.entityType,
            'remote'
          );
        });
        break;
        
      case 'manual':
        // Add to pending conflicts for user resolution
        this.pendingConflicts.push(...conflicts);
        // Emit event for UI to handle
        this.emit('conflicts:pending', conflicts);
        break;
    }
  }
  
  /**
   * Get last sync timestamp
   */
  private getLastSyncTimestamp(): Date | null {
    const metrics = syncEngine.getMetrics();
    return metrics.lastSyncTime || null;
  }
  
  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for immediate sync needs
    syncEngine.on('sync:needed', (entityType: string) => {
      // Debounce immediate syncs
      setTimeout(() => {
        if (connectionManager.isConnected()) {
          this.sync().catch(error => {
            console.error(`Immediate sync failed for ${entityType}:`, error);
          });
        }
      }, 100);
    });
    
    // Listen for connection state changes
    connectionManager.on('state:connected', () => {
      // Sync on reconnect
      this.sync().catch(error => {
        console.error('Sync on reconnect failed:', error);
      });
    });
  }
  
  /**
   * Event emitter functionality
   */
  private listeners: Map<string, Function[]> = new Map();
  
  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
  
  on(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }
  
  off(event: string, handler: Function): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Dispose
   */
  dispose(): void {
    this.stopAutoSync();
    this.listeners.clear();
  }
}