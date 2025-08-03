/**
 * Remote Claude instance handler
 * Manages Claude CLI instances for remote clients
 */
import type { BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';
import * as pty from 'node-pty';
import path from 'path';
import { 
  ClaudeProtocol, 
  RemoteRequest, 
  RemoteResponse,
  RemoteEvent,
  Permission
} from '../remote-protocol.js';
import type { RemoteSession } from '../remote-session-manager.js';
import { RemoteSessionManager } from '../remote-session-manager.js';
import { ClaudeDetector } from '../../claude-detector.js';

interface RemoteClaudeInstance {
  instanceId: string;
  pty: pty.IPty;
  sessionId: string;
  socketId: string;
  workingDirectory: string;
  instanceName?: string;
  createdAt: Date;
  claudeInfo?: {
    path: string;
    version: string;
    source: string;
  };
}

export class RemoteClaudeHandler {
  private instances: Map<string, RemoteClaudeInstance> = new Map();
  private instancesBySocket: Map<string, Set<string>> = new Map();
  private claudePath: string | null = null;
  
  constructor(
    private mainWindow: BrowserWindow,
    private sessionManager: RemoteSessionManager
  ) {
    // Detect Claude installation on startup
    this.detectClaude();
  }
  
  /**
   * Register Claude operation handlers on a socket
   */
  registerHandlers(socket: Socket): void {
    // Spawn Claude instance
    socket.on('claude:spawn', async (request: RemoteRequest<ClaudeProtocol.SpawnRequest>, callback) => {
      await this.handleClaudeSpawn(socket, request, callback);
    });
    
    // Send to Claude
    socket.on('claude:send', async (request: RemoteRequest<ClaudeProtocol.SendRequest>, callback) => {
      await this.handleClaudeSend(socket, request, callback);
    });
    
    // Stop Claude instance
    socket.on('claude:stop', async (request: RemoteRequest<ClaudeProtocol.StopRequest>, callback) => {
      await this.handleClaudeStop(socket, request, callback);
    });
    
    // Resize Claude terminal
    socket.on('claude:resize', async (request: RemoteRequest<ClaudeProtocol.ResizeRequest>, callback) => {
      await this.handleClaudeResize(socket, request, callback);
    });
    
    // Get active instances
    socket.on('claude:getInstances', async (request: RemoteRequest<void>, callback) => {
      await this.handleGetInstances(socket, request, callback);
    });
  }
  
  /**
   * Clean up instances for a disconnected socket
   */
  cleanupSocketInstances(socketId: string): void {
    const instanceIds = this.instancesBySocket.get(socketId);
    if (instanceIds) {
      instanceIds.forEach(instanceId => {
        this.stopInstance(instanceId);
      });
      this.instancesBySocket.delete(socketId);
    }
  }
  
  private async detectClaude(): Promise<void> {
    try {
      const claudeInfo = await ClaudeDetector.detectClaude();
      if (claudeInfo) {
        this.claudePath = claudeInfo.path;
        console.log(`Claude detected at: ${this.claudePath}`);
      }
    } catch (error) {
      console.error('Failed to detect Claude:', error);
    }
  }
  
  private async handleClaudeSpawn(
    socket: Socket,
    request: RemoteRequest<ClaudeProtocol.SpawnRequest>,
    callback: (response: RemoteResponse<ClaudeProtocol.SpawnResponse>) => void
  ): Promise<void> {
    try {
      // Check session and permissions
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.CLAUDE_SPAWN)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Claude spawn permission required' }
        });
      }
      
      // Check if Claude is available
      if (!this.claudePath) {
        await this.detectClaude();
        if (!this.claudePath) {
          return callback({
            id: request.id,
            success: false,
            error: { code: 'CLAUDE_NOT_FOUND', message: 'Claude CLI not found' }
          });
        }
      }
      
      // Check if instance already exists
      if (this.instances.has(request.payload.instanceId)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INSTANCE_EXISTS', message: 'Instance already exists' }
        });
      }
      
      // Validate working directory
      const workingDir = request.payload.workingDirectory || process.env.HOME || '/';
      
      // Build Claude command
      const args: string[] = [];
      if (request.payload.config?.args) {
        args.push(...request.payload.config.args);
      }
      
      // Spawn Claude PTY
      const claudePty = pty.spawn(this.claudePath, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          CLAUDE_INSTANCE_NAME: request.payload.instanceName || 'Remote Claude'
        }
      });
      
      // Store instance info
      const instance: RemoteClaudeInstance = {
        instanceId: request.payload.instanceId,
        pty: claudePty,
        sessionId: session.id,
        socketId: socket.id,
        workingDirectory: workingDir,
        instanceName: request.payload.instanceName,
        createdAt: new Date(),
        claudeInfo: {
          path: this.claudePath,
          version: 'Unknown', // TODO: Get from ClaudeDetector
          source: 'remote'
        }
      };
      this.instances.set(request.payload.instanceId, instance);
      
      // Track instances by socket
      if (!this.instancesBySocket.has(socket.id)) {
        this.instancesBySocket.set(socket.id, new Set());
      }
      this.instancesBySocket.get(socket.id)!.add(request.payload.instanceId);
      
      // Set up PTY data handler
      claudePty.onData((data) => {
        socket.emit(RemoteEvent.CLAUDE_OUTPUT, {
          instanceId: request.payload.instanceId,
          data
        });
      });
      
      // Set up PTY exit handler
      claudePty.onExit((exitCode) => {
        socket.emit(RemoteEvent.CLAUDE_EXIT, {
          instanceId: request.payload.instanceId,
          code: exitCode.exitCode,
          signal: exitCode.signal
        });
        
        // Clean up
        this.stopInstance(request.payload.instanceId);
      });
      
      console.log(`Spawned Claude instance ${request.payload.instanceId} for session ${session.id}`);
      
      callback({
        id: request.id,
        success: true,
        data: {
          success: true,
          pid: claudePty.pid
        }
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Send error event
      socket.emit(RemoteEvent.CLAUDE_ERROR, {
        instanceId: request.payload.instanceId,
        error: errorMessage
      });
      
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'SPAWN_ERROR', 
          message: errorMessage 
        }
      });
    }
  }
  
  private async handleClaudeSend(
    socket: Socket,
    request: RemoteRequest<ClaudeProtocol.SendRequest>,
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
      
      if (!this.sessionManager.hasPermission(session, Permission.CLAUDE_CONTROL)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Claude control permission required' }
        });
      }
      
      const instance = this.instances.get(request.payload.instanceId);
      if (!instance) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' }
        });
      }
      
      // Verify ownership
      if (instance.sessionId !== session.id) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Instance belongs to another session' }
        });
      }
      
      // Send to Claude
      instance.pty.write(request.payload.data);
      
      callback({
        id: request.id,
        success: true
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'SEND_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleClaudeStop(
    socket: Socket,
    request: RemoteRequest<ClaudeProtocol.StopRequest>,
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
      
      const instance = this.instances.get(request.payload.instanceId);
      if (!instance) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' }
        });
      }
      
      // Verify ownership
      if (instance.sessionId !== session.id) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Instance belongs to another session' }
        });
      }
      
      // Stop instance
      this.stopInstance(request.payload.instanceId);
      
      callback({
        id: request.id,
        success: true
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'STOP_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleClaudeResize(
    socket: Socket,
    request: RemoteRequest<ClaudeProtocol.ResizeRequest>,
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
      
      const instance = this.instances.get(request.payload.instanceId);
      if (!instance) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' }
        });
      }
      
      // Verify ownership
      if (instance.sessionId !== session.id) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Instance belongs to another session' }
        });
      }
      
      // Resize PTY
      instance.pty.resize(request.payload.cols, request.payload.rows);
      
      callback({
        id: request.id,
        success: true
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'RESIZE_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleGetInstances(
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
      
      // Get instances for this session
      const sessionInstances = Array.from(this.instances.values())
        .filter(inst => inst.sessionId === session.id)
        .map(inst => ({
          instanceId: inst.instanceId,
          workingDirectory: inst.workingDirectory,
          instanceName: inst.instanceName,
          createdAt: inst.createdAt,
          claudeInfo: inst.claudeInfo
        }));
      
      callback({
        id: request.id,
        success: true,
        data: sessionInstances
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'GET_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private stopInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    try {
      // Kill the PTY process
      instance.pty.kill();
    } catch (error) {
      console.error(`Error killing Claude instance ${instanceId}:`, error);
    }
    
    // Remove from tracking
    this.instances.delete(instanceId);
    
    // Remove from socket tracking
    const socketInstances = this.instancesBySocket.get(instance.socketId);
    if (socketInstances) {
      socketInstances.delete(instanceId);
      if (socketInstances.size === 0) {
        this.instancesBySocket.delete(instance.socketId);
      }
    }
    
    console.log(`Stopped Claude instance ${instanceId}`);
  }
  
  /**
   * Get instance statistics
   */
  getStats() {
    const instancesBySession = new Map<string, number>();
    this.instances.forEach(inst => {
      const count = instancesBySession.get(inst.sessionId) || 0;
      instancesBySession.set(inst.sessionId, count + 1);
    });
    
    return {
      totalInstances: this.instances.size,
      instancesBySession: Object.fromEntries(instancesBySession),
      instancesBySocket: Object.fromEntries(
        Array.from(this.instancesBySocket.entries()).map(([k, v]) => [k, v.size])
      ),
      claudeAvailable: this.claudePath !== null
    };
  }
}