/**
 * Sync Engine for State Synchronization
 * Implements intelligent sync with JSON patches and conflict resolution
 */
import { EventEmitter } from 'events';
import * as jsonpatch from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';

export interface SyncableState {
  id: string;
  type: string;
  version: number;
  lastModified: Date;
  data: any;
  checksum?: string;
}

export interface SyncPatch {
  id: string;
  entityId: string;
  entityType: string;
  fromVersion: number;
  toVersion: number;
  operations: Operation[];
  timestamp: Date;
  source: 'local' | 'remote';
}

export interface SyncConflict {
  entityId: string;
  entityType: string;
  localVersion: number;
  remoteVersion: number;
  localPatch: SyncPatch;
  remotePatch: SyncPatch;
  resolution?: 'local' | 'remote' | 'merge';
}

export interface SyncPriority {
  type: string;
  priority: number;
  strategy: 'immediate' | 'batch' | 'lazy';
}

export interface SyncMetrics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  conflictsResolved: number;
  dataTransferred: number;
  lastSyncTime?: Date;
  averageSyncDuration: number;
}

export class SyncEngine extends EventEmitter {
  private localState: Map<string, SyncableState> = new Map();
  private pendingPatches: Map<string, SyncPatch[]> = new Map();
  private syncPriorities: Map<string, SyncPriority> = new Map();
  private conflicts: Map<string, SyncConflict> = new Map();
  private metrics: SyncMetrics;
  private syncInProgress: boolean = false;
  private lastSyncTimestamp: Map<string, Date> = new Map();
  
  constructor() {
    super();
    
    this.metrics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflictsResolved: 0,
      dataTransferred: 0,
      averageSyncDuration: 0
    };
    
    // Set default priorities
    this.setupDefaultPriorities();
  }
  
  /**
   * Register a syncable entity type with priority
   */
  registerEntityType(type: string, priority: number, strategy: 'immediate' | 'batch' | 'lazy' = 'batch'): void {
    this.syncPriorities.set(type, { type, priority, strategy });
  }
  
  /**
   * Track state changes and generate patches
   */
  trackState(entity: SyncableState): void {
    const key = `${entity.type}:${entity.id}`;
    const existing = this.localState.get(key);
    
    if (existing) {
      // Generate patch from existing to new state
      const patch = this.generatePatch(existing, entity);
      if (patch.operations.length > 0) {
        this.addPendingPatch(patch);
        
        // Check if immediate sync needed
        const priority = this.syncPriorities.get(entity.type);
        if (priority?.strategy === 'immediate') {
          this.emit('sync:needed', entity.type);
        }
      }
    }
    
    // Update local state
    this.localState.set(key, entity);
  }
  
  /**
   * Get pending patches for sync
   */
  getPendingPatches(types?: string[]): SyncPatch[] {
    const patches: SyncPatch[] = [];
    
    // Filter by types if specified
    const entriesToSync = types 
      ? Array.from(this.pendingPatches.entries()).filter(([key]) => 
          types.some(type => key.startsWith(type + ':'))
        )
      : Array.from(this.pendingPatches.entries());
    
    // Sort by priority
    entriesToSync.sort(([keyA], [keyB]) => {
      const typeA = keyA.split(':')[0];
      const typeB = keyB.split(':')[0];
      const priorityA = this.syncPriorities.get(typeA)?.priority || 0;
      const priorityB = this.syncPriorities.get(typeB)?.priority || 0;
      return priorityB - priorityA;
    });
    
    // Collect patches
    for (const [_, entityPatches] of entriesToSync) {
      patches.push(...entityPatches);
    }
    
    return patches;
  }
  
  /**
   * Apply remote patches and detect conflicts
   */
  applyRemotePatches(patches: SyncPatch[]): SyncConflict[] {
    const conflicts: SyncConflict[] = [];
    
    for (const patch of patches) {
      const key = `${patch.entityType}:${patch.entityId}`;
      const localEntity = this.localState.get(key);
      
      if (!localEntity) {
        // No local version, apply patch to empty object
        const newEntity: SyncableState = {
          id: patch.entityId,
          type: patch.entityType,
          version: patch.toVersion,
          lastModified: patch.timestamp,
          data: {}
        };
        
        try {
          const result = jsonpatch.applyPatch(newEntity.data, patch.operations);
          newEntity.data = result.newDocument;
          this.localState.set(key, newEntity);
        } catch (error) {
          console.error('Failed to apply remote patch:', error);
        }
      } else if (localEntity.version < patch.fromVersion) {
        // Local version is behind, need to sync up first
        this.emit('sync:behind', { entity: localEntity, patch });
      } else if (localEntity.version > patch.fromVersion) {
        // Conflict detected
        const localPatches = this.pendingPatches.get(key) || [];
        const conflict: SyncConflict = {
          entityId: patch.entityId,
          entityType: patch.entityType,
          localVersion: localEntity.version,
          remoteVersion: patch.toVersion,
          localPatch: localPatches[localPatches.length - 1],
          remotePatch: patch
        };
        conflicts.push(conflict);
        this.conflicts.set(key, conflict);
      } else {
        // Versions match, apply patch
        try {
          const result = jsonpatch.applyPatch(localEntity.data, patch.operations);
          localEntity.data = result.newDocument;
          localEntity.version = patch.toVersion;
          localEntity.lastModified = patch.timestamp;
          
          // Clear pending local patches as they're now obsolete
          this.pendingPatches.delete(key);
        } catch (error) {
          console.error('Failed to apply remote patch:', error);
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Resolve conflicts
   */
  resolveConflict(entityId: string, entityType: string, resolution: 'local' | 'remote' | 'merge'): void {
    const key = `${entityType}:${entityId}`;
    const conflict = this.conflicts.get(key);
    
    if (!conflict) return;
    
    switch (resolution) {
      case 'local':
        // Keep local version, will sync on next cycle
        break;
        
      case 'remote':
        // Accept remote version
        const localEntity = this.localState.get(key);
        if (localEntity && conflict.remotePatch) {
          try {
            const result = jsonpatch.applyPatch(localEntity.data, conflict.remotePatch.operations);
            localEntity.data = result.newDocument;
            localEntity.version = conflict.remotePatch.toVersion;
            localEntity.lastModified = conflict.remotePatch.timestamp;
            this.pendingPatches.delete(key);
          } catch (error) {
            console.error('Failed to apply remote patch in conflict resolution:', error);
          }
        }
        break;
        
      case 'merge':
        // TODO: Implement three-way merge
        console.warn('Merge resolution not yet implemented');
        break;
    }
    
    conflict.resolution = resolution;
    this.conflicts.delete(key);
    this.metrics.conflictsResolved++;
    
    this.emit('conflict:resolved', conflict);
  }
  
  /**
   * Perform sync operation
   */
  async performSync(
    sendPatches: (patches: SyncPatch[]) => Promise<void>,
    receivePatches: () => Promise<SyncPatch[]>
  ): Promise<{ sent: number; received: number; conflicts: SyncConflict[] }> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }
    
    this.syncInProgress = true;
    const startTime = Date.now();
    
    try {
      this.metrics.totalSyncs++;
      
      // Get patches to send
      const outgoingPatches = this.getPendingPatches();
      
      // Send local patches
      if (outgoingPatches.length > 0) {
        await sendPatches(outgoingPatches);
        this.metrics.dataTransferred += JSON.stringify(outgoingPatches).length;
        
        // Clear sent patches
        for (const patch of outgoingPatches) {
          const key = `${patch.entityType}:${patch.entityId}`;
          this.pendingPatches.delete(key);
        }
      }
      
      // Receive remote patches
      const incomingPatches = await receivePatches();
      this.metrics.dataTransferred += JSON.stringify(incomingPatches).length;
      
      // Apply remote patches
      const conflicts = this.applyRemotePatches(incomingPatches);
      
      // Update metrics
      this.metrics.successfulSyncs++;
      this.metrics.lastSyncTime = new Date();
      
      const duration = Date.now() - startTime;
      this.metrics.averageSyncDuration = 
        (this.metrics.averageSyncDuration * (this.metrics.totalSyncs - 1) + duration) / this.metrics.totalSyncs;
      
      this.emit('sync:complete', {
        sent: outgoingPatches.length,
        received: incomingPatches.length,
        conflicts: conflicts.length,
        duration
      });
      
      return {
        sent: outgoingPatches.length,
        received: incomingPatches.length,
        conflicts
      };
    } catch (error) {
      this.metrics.failedSyncs++;
      this.emit('sync:error', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }
  
  /**
   * Generate patch between two states
   */
  private generatePatch(oldState: SyncableState, newState: SyncableState): SyncPatch {
    const operations = jsonpatch.compare(oldState.data, newState.data);
    
    return {
      id: `patch-${Date.now()}-${Math.random()}`,
      entityId: oldState.id,
      entityType: oldState.type,
      fromVersion: oldState.version,
      toVersion: newState.version,
      operations,
      timestamp: new Date(),
      source: 'local'
    };
  }
  
  /**
   * Add patch to pending queue
   */
  private addPendingPatch(patch: SyncPatch): void {
    const key = `${patch.entityType}:${patch.entityId}`;
    
    if (!this.pendingPatches.has(key)) {
      this.pendingPatches.set(key, []);
    }
    
    this.pendingPatches.get(key)!.push(patch);
  }
  
  /**
   * Set up default sync priorities
   */
  private setupDefaultPriorities(): void {
    // High priority - sync immediately
    this.registerEntityType('claude.conversation', 100, 'immediate');
    this.registerEntityType('editor.activeFile', 95, 'immediate');
    
    // Medium priority - batch sync
    this.registerEntityType('tasks.update', 80, 'batch');
    this.registerEntityType('knowledge.entry', 70, 'batch');
    this.registerEntityType('git.status', 60, 'batch');
    
    // Low priority - lazy sync
    this.registerEntityType('layout.config', 40, 'lazy');
    this.registerEntityType('settings.preference', 30, 'lazy');
  }
  
  /**
   * Get sync metrics
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Reset sync engine
   */
  reset(): void {
    this.localState.clear();
    this.pendingPatches.clear();
    this.conflicts.clear();
    this.lastSyncTimestamp.clear();
    this.syncInProgress = false;
  }
  
  /**
   * Get conflicts
   */
  getConflicts(): SyncConflict[] {
    return Array.from(this.conflicts.values());
  }
  
  /**
   * Check if entity needs sync
   */
  needsSync(entityType: string, entityId: string): boolean {
    const key = `${entityType}:${entityId}`;
    return this.pendingPatches.has(key) && this.pendingPatches.get(key)!.length > 0;
  }
}

// Export singleton instance
export const syncEngine = new SyncEngine();