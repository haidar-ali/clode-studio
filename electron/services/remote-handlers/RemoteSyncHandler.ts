/**
 * Remote Sync Handler
 * Handles sync operations for remote clients
 */
import type { BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';
import { 
  RemoteRequest, 
  RemoteResponse,
  Permission
} from '../remote-protocol.js';
import type { RemoteSession } from '../remote-session-manager.js';
import { RemoteSessionManager } from '../remote-session-manager.js';
import type { SyncPatch } from '../types/sync-types.js';
import { LocalDatabase } from '../local-database.js';

interface SyncPushRequest {
  patches: SyncPatch[];
  compressed: boolean;
}

interface SyncPullRequest {
  since: Date | null;
  types?: string[];
}

export class RemoteSyncHandler {
  private patchStore: Map<string, SyncPatch[]> = new Map();
  private database: LocalDatabase;
  
  constructor(
    private mainWindow: BrowserWindow,
    private sessionManager: RemoteSessionManager
  ) {
    // Initialize database for persistent storage
    this.database = new LocalDatabase();
  }
  
  /**
   * Register sync handlers on a socket
   */
  registerHandlers(socket: Socket): void {
    // Push patches from client
    socket.on('sync:push', async (request: RemoteRequest<SyncPushRequest>, callback) => {
      await this.handleSyncPush(socket, request, callback);
    });
    
    // Pull patches to client
    socket.on('sync:pull', async (request: RemoteRequest<SyncPullRequest>, callback) => {
      await this.handleSyncPull(socket, request, callback);
    });
    
    // Get sync status
    socket.on('sync:status', async (request: RemoteRequest<void>, callback) => {
      await this.handleSyncStatus(socket, request, callback);
    });
  }
  
  /**
   * Handle push of patches from client
   */
  private async handleSyncPush(
    socket: Socket,
    request: RemoteRequest<SyncPushRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      // Check permissions
      if (!this.sessionManager.hasPermission(session, Permission.WORKSPACE_MANAGE)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Sync permission required' }
        });
      }
      
      let patches = request.payload.patches;
      
      // Decompress if needed
      if (request.payload.compressed) {
        // TODO: Implement decompression
      }
      
      // Store patches by user/workspace
      const storeKey = `${session.userId}:${session.workspaceId || 'default'}`;
      if (!this.patchStore.has(storeKey)) {
        this.patchStore.set(storeKey, []);
      }
      
      // Add patches with metadata
      const enrichedPatches = patches.map(patch => ({
        ...patch,
        userId: session.userId,
        sessionId: session.id,
        receivedAt: new Date()
      }));
      
      this.patchStore.get(storeKey)!.push(...enrichedPatches);
      
      // Persist to database
      await this.database.addSyncPatches(storeKey, enrichedPatches);
      
      // Broadcast to other sessions of same user/workspace
      this.broadcastPatches(session, enrichedPatches);
      
      callback({
        id: request.id,
        success: true
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'SYNC_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  /**
   * Handle pull of patches to client
   */
  private async handleSyncPull(
    socket: Socket,
    request: RemoteRequest<SyncPullRequest>,
    callback: (response: RemoteResponse<{ patches: SyncPatch[], compressed: boolean }>) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      const storeKey = `${session.userId}:${session.workspaceId || 'default'}`;
      
      // Get patches from database
      let patches = await this.database.getSyncPatches(
        storeKey,
        request.payload.since,
        request.payload.types
      );
      
      // Filter out patches from this session to avoid echoing
      patches = patches.filter((p: any) => p.sessionId !== session.id);
      
      // Compress if beneficial
      let compressed = false;
      if (patches.length > 10 || JSON.stringify(patches).length > 10240) {
        // TODO: Implement compression
        compressed = true;
      }
      
      callback({
        id: request.id,
        success: true,
        data: {
          patches,
          compressed
        }
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'SYNC_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  /**
   * Handle sync status request
   */
  private async handleSyncStatus(
    socket: Socket,
    request: RemoteRequest<void>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      const storeKey = `${session.userId}:${session.workspaceId || 'default'}`;
      const stats = await this.database.getSyncStats(storeKey);
      
      callback({
        id: request.id,
        success: true,
        data: stats
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'SYNC_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  /**
   * Broadcast patches to other sessions
   */
  private broadcastPatches(
    senderSession: RemoteSession,
    patches: any[]
  ): void {
    // Get all sessions for same user/workspace
    const sessions = this.sessionManager.getSessionsForUser(senderSession.userId);
    
    sessions.forEach(session => {
      if (session.id === senderSession.id) return; // Skip sender
      if (session.workspaceId !== senderSession.workspaceId) return; // Different workspace
      
      // Find socket for session
      const socket = this.findSocketForSession(session.id);
      if (socket) {
        socket.emit('sync:patches', {
          patches,
          from: senderSession.id
        });
      }
    });
  }
  
  /**
   * Find socket for a session
   */
  private findSocketForSession(sessionId: string): Socket | null {
    // TODO: Implement socket lookup
    // This would require maintaining a map of sessionId -> socket
    return null;
  }
  
  /**
   * Clean up patches for a disconnected session
   */
  cleanupSession(sessionId: string): void {
    // Patches are persisted, so no cleanup needed
    // Could implement patch expiration logic here
  }
  
  /**
   * Get sync statistics
   */
  getStats() {
    const stats: any = {
      totalPatches: 0,
      patchesByType: {},
      userCount: this.patchStore.size
    };
    
    this.patchStore.forEach((patches) => {
      stats.totalPatches += patches.length;
      patches.forEach(patch => {
        const type = patch.entityType || 'unknown';
        stats.patchesByType[type] = 
          (stats.patchesByType[type] || 0) + 1;
      });
    });
    
    return stats;
  }
}