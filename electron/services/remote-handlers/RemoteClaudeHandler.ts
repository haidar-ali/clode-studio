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
import { userIsolation } from '../user-isolation.js';

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
    
    // List desktop Claude instances
    socket.on('claude:listDesktop', async (request: RemoteRequest<void>, callback) => {
      await this.handleListDesktopInstances(socket, request, callback);
    });
    
    // Get Claude instance buffer
    socket.on('claude:getBuffer', async (request: RemoteRequest<{ instanceId: string }>, callback) => {
      await this.handleGetClaudeBuffer(socket, request, callback);
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
    
    // Also cleanup any orphaned instances by session
    // Get session from socket through session manager
    const session = this.sessionManager.getSessionBySocket(socketId);
    if (session) {
      userIsolation.cleanupSessionInstances(session.id);
    }
    
    // Clean up desktop Claude forwarding
    if (this.desktopClaudeForwarding?.has(socketId)) {
      const forwardedInstances = this.desktopClaudeForwarding.get(socketId);
      if (forwardedInstances) {
        forwardedInstances.forEach(instanceId => {
          const handlerKey = `${socketId}-${instanceId}`;
          const handler = this.claudeForwardHandlers?.get(handlerKey);
          if (handler) {
            this.mainWindow.webContents.ipc.removeListener('forward-claude-output', handler);
            this.claudeForwardHandlers?.delete(handlerKey);
          }
        });
      }
      this.desktopClaudeForwarding.delete(socketId);
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
      
      // Check if it's a desktop Claude instance by checking if we're forwarding it
      const isDesktopInstance = this.desktopClaudeForwarding?.get(socket.id)?.has(request.payload.instanceId) || false;
      
      // If not already tracked, check if it exists on desktop
      if (!isDesktopInstance) {
        try {
          const desktopCheck = await this.mainWindow.webContents.executeJavaScript(`
            (() => {
              if (typeof window.__getClaudeStore === 'function') {
                const claudeStore = window.__getClaudeStore();
                const instance = claudeStore.instances.get('${request.payload.instanceId}');
                return instance ? true : false;
              }
              return false;
            })()
          `);
          
          if (desktopCheck) {
            // Mark as desktop instance
            if (!this.desktopClaudeForwarding) {
              this.desktopClaudeForwarding = new Map();
            }
            let socketForwarding = this.desktopClaudeForwarding.get(socket.id);
            if (!socketForwarding) {
              socketForwarding = new Set();
              this.desktopClaudeForwarding.set(socket.id, socketForwarding);
            }
            socketForwarding.add(request.payload.instanceId);
          }
        } catch (e) {
          console.log('[RemoteClaudeHandler] Could not check desktop instance:', e);
        }
      }
      
      if (isDesktopInstance || this.desktopClaudeForwarding?.get(socket.id)?.has(request.payload.instanceId)) {
        // This is a desktop Claude instance - we need to forward communication
        console.log(`[RemoteClaudeHandler] Forwarding desktop Claude instance ${request.payload.instanceId}`);
        
        // Set up forwarding from desktop Claude to socket FIRST
        this.setupDesktopClaudeForwarding(socket, request.payload.instanceId);
        
        // Check if the desktop instance needs to be started
        try {
          const isConnected = await this.mainWindow.webContents.executeJavaScript(`
            (() => {
              // Check if Claude is connected for this instance
              const claudeStore = window.__getClaudeStore ? window.__getClaudeStore() : null;
              
              if (claudeStore) {
                const instance = claudeStore.instances.get('${request.payload.instanceId}');
                if (instance) {
                  console.log('[RemoteClaudeHandler] Desktop instance status:', instance.status);
                  return instance.status === 'connected';
                }
              }
              
              return false;
            })()
          `);
          
          if (!isConnected) {
            console.log(`[RemoteClaudeHandler] Desktop Claude instance ${request.payload.instanceId} is not connected, starting it`);
            
            // Start the desktop Claude instance
            const startResult = await this.mainWindow.webContents.executeJavaScript(`
              (async () => {
                if (window.electronAPI?.claude?.start) {
                  const instanceId = '${request.payload.instanceId}';
                  const workingDir = '${request.payload.workingDirectory}';
                  const instanceName = '${request.payload.instanceName || ''}';
                  
                  const result = await window.electronAPI.claude.start(
                    instanceId,
                    workingDir,
                    instanceName
                  );
                  
                  // Update the Claude instance status in the store
                  if (result.success && window.__getClaudeStore) {
                    const store = window.__getClaudeStore();
                    const instance = store.instances.get(instanceId);
                    if (instance) {
                      instance.status = 'connected';
                      instance.pid = result.pid;
                      // Trigger save which will broadcast update
                      store.saveInstances();
                    }
                  }
                  
                  return result;
                }
                return { success: false, error: 'Claude API not available' };
              })()
            `);
            
            if (!startResult.success) {
              console.error('[RemoteClaudeHandler] Failed to start desktop Claude:', startResult.error);
            }
          }
        } catch (error) {
          console.error('[RemoteClaudeHandler] Error checking/starting desktop Claude:', error);
        }
        
        return callback({
          id: request.id,
          success: true,
          data: {
            success: true,
            pid: -1 // Desktop PID not directly accessible
          }
        });
      }
      
      // Check if this is a desktop instance that needs to be started
      const instanceExists = await this.mainWindow.webContents.executeJavaScript(`
        (() => {
          if (window.__getClaudeStore) {
            const store = window.__getClaudeStore();
            const instance = store.instances.get('${request.payload.instanceId}');
            return instance ? { exists: true, status: instance.status } : { exists: false };
          }
          return { exists: false };
        })()
      `);
      
      if (instanceExists.exists && instanceExists.status === 'disconnected') {
        // This is a desktop instance that needs to be started
        console.log(`[RemoteClaudeHandler] Starting disconnected desktop instance ${request.payload.instanceId}`);
        
        const startResult = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            if (window.electronAPI?.claude?.start) {
              const instanceId = '${request.payload.instanceId}';
              const workingDir = '${request.payload.workingDirectory}';
              const instanceName = '${request.payload.instanceName || ''}';
              
              const result = await window.electronAPI.claude.start(
                instanceId,
                workingDir,
                instanceName
              );
              
              // Update the Claude instance status in the store
              if (result.success && window.__getClaudeStore) {
                const store = window.__getClaudeStore();
                const instance = store.instances.get(instanceId);
                if (instance) {
                  instance.status = 'connected';
                  instance.pid = result.pid;
                  // Trigger save which will broadcast update
                  store.saveInstances();
                }
              }
              
              return result;
            }
            return { success: false, error: 'Claude API not available' };
          })()
        `);
        
        if (startResult.success) {
          // Set up forwarding
          this.setupDesktopClaudeForwarding(socket, request.payload.instanceId);
          
          return callback({
            id: request.id,
            success: true,
            data: {
              success: true,
              pid: startResult.pid
            }
          });
        } else {
          return callback({
            id: request.id,
            success: false,
            error: { code: 'START_ERROR', message: startResult.error || 'Failed to start Claude' }
          });
        }
      }
      
      // Check if instance already exists (skip for desktop instances)
      const isDesktop = this.desktopClaudeForwarding?.get(socket.id)?.has(request.payload.instanceId) || false;
      if (!isDesktop && this.instances.has(request.payload.instanceId)) {
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
      
      // Add personality instructions if provided
      let customInstructions: string | undefined;
      if (request.payload.config?.personality?.instructions) {
        customInstructions = request.payload.config.personality.instructions;
      }
      
      // Register with user isolation service
      try {
        userIsolation.registerInstance(
          session.userId,
          request.payload.instanceId,
          session,
          {
            personalityId: request.payload.config?.personalityId,
            workingDirectory: workingDir,
            instanceName: request.payload.instanceName,
            workspaceId: session.workspaceId
          }
        );
      } catch (error) {
        return callback({
          id: request.id,
          success: false,
          error: { 
            code: 'QUOTA_EXCEEDED', 
            message: (error as Error).message 
          }
        });
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
          CLAUDE_INSTANCE_NAME: request.payload.instanceName || 'Remote Claude',
          CLAUDE_USER_ID: session.userId,
          // MCP server context for remote Claude instances
          CLAUDE_INSTANCE_ID: request.payload.instanceId,
          USER_ID: session.userId,
          WORKSPACE_ID: session.workspaceId || workingDir,
          REMOTE_MODE: 'true',
          // Add custom instructions if provided
          ...(customInstructions ? { CLAUDE_CUSTOM_INSTRUCTIONS: customInstructions } : {})
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
      
      // Check if it's a desktop Claude instance first
      const isDesktopInstance = this.desktopClaudeForwarding?.get(socket.id)?.has(request.payload.instanceId) || false;
      
      if (isDesktopInstance) {
        // Forward to desktop Claude
        console.log(`[RemoteClaudeHandler] Forwarding send to desktop Claude ${request.payload.instanceId}`);
        
        try {
          // Properly escape the data for JavaScript execution
          const escapedData = JSON.stringify(request.payload.data);
          
          await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              // Send data to Claude with instance ID
              if (window.electronAPI?.claude?.send) {
                const data = ${escapedData};
                const instanceId = '${request.payload.instanceId}';
                await window.electronAPI.claude.send(instanceId, data);
                return true;
              } else {
                throw new Error('Claude API not available');
              }
            })()
          `);
          
          return callback({
            id: request.id,
            success: true
          });
        } catch (error) {
          return callback({
            id: request.id,
            success: false,
            error: { 
              code: 'SEND_ERROR', 
              message: `Failed to send to desktop Claude: ${error}` 
            }
          });
        }
      }
      
      const instance = this.instances.get(request.payload.instanceId);
      if (!instance) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' }
        });
      }
      
      // Verify ownership using user isolation service
      if (!userIsolation.userOwnsInstance(session.userId, request.payload.instanceId)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Instance belongs to another user' }
        });
      }
      
      // Update activity
      userIsolation.updateInstanceActivity(request.payload.instanceId);
      
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
      
      // Check if it's a desktop instance
      const isDesktopInstance = this.desktopClaudeForwarding?.get(socket.id)?.has(request.payload.instanceId) || false;
      
      if (isDesktopInstance) {
        // Stop desktop Claude
        console.log(`[RemoteClaudeHandler] Stopping desktop Claude ${request.payload.instanceId}`);
        
        try {
          await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.claude?.stop) {
                const instanceId = '${request.payload.instanceId}';
                await window.electronAPI.claude.stop(instanceId);
                return true;
              }
              return false;
            })()
          `);
          
          return callback({
            id: request.id,
            success: true
          });
        } catch (error) {
          return callback({
            id: request.id,
            success: false,
            error: { 
              code: 'STOP_ERROR', 
              message: `Failed to stop desktop Claude: ${error}` 
            }
          });
        }
      }
      
      const instance = this.instances.get(request.payload.instanceId);
      if (!instance) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' }
        });
      }
      
      // Verify ownership using user isolation service
      if (!userIsolation.userOwnsInstance(session.userId, request.payload.instanceId)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Instance belongs to another user' }
        });
      }
      
      // Update activity
      userIsolation.updateInstanceActivity(request.payload.instanceId);
      
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
      
      // Verify ownership using user isolation service
      if (!userIsolation.userOwnsInstance(session.userId, request.payload.instanceId)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Instance belongs to another user' }
        });
      }
      
      // Update activity
      userIsolation.updateInstanceActivity(request.payload.instanceId);
      
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
      
      // Get instances for this user using isolation service
      const userInstances = userIsolation.getUserInstances(session.userId);
      const sessionInstances = userInstances.map(userInst => {
        const inst = this.instances.get(userInst.instanceId);
        if (!inst) return null;
        return {
          instanceId: inst.instanceId,
          workingDirectory: inst.workingDirectory,
          instanceName: inst.instanceName,
          createdAt: inst.createdAt,
          claudeInfo: inst.claudeInfo,
          personalityId: userInst.personalityId
        };
      }).filter(inst => inst !== null);
      
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
    
    // Unregister from user isolation service
    userIsolation.unregisterInstance(instanceId);
    
    console.log(`Stopped Claude instance ${instanceId}`);
  }
  
  private async handleListDesktopInstances(
    socket: Socket,
    request: RemoteRequest<void>,
    callback: (response: RemoteResponse<any>) => void
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
      
      // Get desktop Claude instances from the renderer
      let desktopInstances: any[] = [];
      try {
        const result = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            try {
              // Use global function to get Claude instances
              if (typeof window.__getClaudeInstances === 'function') {
                const instances = window.__getClaudeInstances();
                
                // Get current workspace path
                let workspacePath = window.__remoteWorkspace?.path || null;
                if (!workspacePath && window.electronAPI?.store?.get) {
                  try {
                    workspacePath = await window.electronAPI.store.get('workspacePath');
                  } catch (e) {
                    console.log('Could not get workspace path from store');
                  }
                }
                
                // Filter instances for current workspace only
                const workspaceInstances = workspacePath 
                  ? instances.filter(inst => inst.workingDirectory === workspacePath)
                  : instances;
                
                // Format for remote
                const formattedInstances = workspaceInstances.map(instance => ({
                  instanceId: instance.id,
                  name: instance.name,
                  status: instance.status,
                  personalityId: instance.personalityId,
                  workingDirectory: instance.workingDirectory,
                  createdAt: instance.createdAt,
                  lastActiveAt: instance.lastActiveAt,
                  color: instance.color,
                  pid: instance.pid,
                  isDesktop: true
                }));
                
                console.log('Found desktop Claude instances:', formattedInstances.length, 'for workspace:', workspacePath);
                return formattedInstances;
              } else {
                console.log('Claude instances function not found');
                return [];
              }
            } catch (e) {
              console.error('Error getting Claude instances:', e);
              return [];
            }
          })()
        `);
        
        if (result && Array.isArray(result)) {
          desktopInstances = result;
          console.log(`[RemoteClaudeHandler] Found ${desktopInstances.length} desktop Claude instances`);
        }
      } catch (e) {
        console.error('[RemoteClaudeHandler] Could not get desktop Claude instances:', e);
      }
      
      // Get remote Claude instances for this user
      const userInstances = userIsolation.getUserInstances(session.userId);
      const remoteInstances = userInstances.map(userInst => {
        const inst = this.instances.get(userInst.instanceId);
        if (!inst) return null;
        return {
          instanceId: inst.instanceId,
          workingDirectory: inst.workingDirectory,
          instanceName: inst.instanceName,
          createdAt: inst.createdAt,
          claudeInfo: inst.claudeInfo,
          personalityId: userInst.personalityId,
          isRemote: true
        };
      }).filter(inst => inst !== null);
      
      // Combine desktop and remote instances
      const allInstances = [...desktopInstances, ...remoteInstances];
      
      console.log(`[RemoteClaudeHandler] Returning ${allInstances.length} instances (${desktopInstances.length} desktop, ${remoteInstances.length} remote)`);
      
      callback({
        id: request.id,
        success: true,
        data: allInstances
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'LIST_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleGetClaudeBuffer(
    socket: Socket,
    request: RemoteRequest<{ instanceId: string }>,
    callback: (response: RemoteResponse<{ buffer?: string }>) => void
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
      
      // Get buffer from desktop Claude instance
      const buffer = await this.mainWindow.webContents.executeJavaScript(`
        (() => {
          if (typeof window.__getClaudeTerminalBuffer === 'function') {
            return window.__getClaudeTerminalBuffer('${request.payload.instanceId}');
          }
          return null;
        })()
      `);
      
      callback({
        id: request.id,
        success: true,
        data: { buffer }
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'GET_BUFFER_ERROR', 
          message: (error as Error).message 
        }
      });
    }
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
    
    // Get user isolation stats
    const isolationStats = userIsolation.getStats();
    
    return {
      totalInstances: this.instances.size,
      instancesBySession: Object.fromEntries(instancesBySession),
      instancesBySocket: Object.fromEntries(
        Array.from(this.instancesBySocket.entries()).map(([k, v]) => [k, v.size])
      ),
      claudeAvailable: this.claudePath !== null,
      userIsolation: isolationStats
    };
  }
  
  /**
   * Set up forwarding for desktop Claude instances
   */
  private setupDesktopClaudeForwarding(socket: Socket, instanceId: string): void {
    // Store mapping for this socket
    if (!this.desktopClaudeForwarding) {
      this.desktopClaudeForwarding = new Map();
    }
    
    let socketForwarding = this.desktopClaudeForwarding.get(socket.id);
    if (!socketForwarding) {
      socketForwarding = new Set();
      this.desktopClaudeForwarding.set(socket.id, socketForwarding);
    }
    
    socketForwarding.add(instanceId);
    console.log(`[RemoteClaudeHandler] Set up forwarding for desktop Claude ${instanceId} to socket ${socket.id}`);
    
    // Set up listeners for Claude output from desktop
    this.mainWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          if (!window.__remoteClaudeForwarding) {
            window.__remoteClaudeForwarding = new Map();
            window.__remoteClaudeListeners = new Map();
          }
          
          const instanceId = '${instanceId}';
          const socketId = '${socket.id}';
          
          // Check if already forwarding
          if (window.__remoteClaudeForwarding.has(instanceId)) {
            const existingSocketId = window.__remoteClaudeForwarding.get(instanceId);
            if (existingSocketId === socketId) {
              console.log('[RemoteClaudeForwarding] Already forwarding to same socket:', instanceId);
              return true;
            } else {
              console.log('[RemoteClaudeForwarding] Updating forwarding to new socket:', instanceId, 'from', existingSocketId, 'to', socketId);
              // Update to new socket ID
              window.__remoteClaudeForwarding.set(instanceId, socketId);
              return true;
            }
          }
          
          // Mark instance as being forwarded
          window.__remoteClaudeForwarding.set(instanceId, socketId);
          
          // Set up Claude output listener with instance ID
          if (window.electronAPI?.claude?.onOutput) {
            const outputHandler = (data) => {
              // Get current socket ID from the map to handle socket changes after refresh
              const currentSocketId = window.__remoteClaudeForwarding.get(instanceId);
              if (currentSocketId) {
                // Send to main process for forwarding
                window.electronAPI.send('forward-claude-output', {
                  instanceId,
                  socketId: currentSocketId,
                  data
                });
              }
            };
            
            // Store handler reference for cleanup
            if (!window.__remoteClaudeListeners.has(instanceId)) {
              window.__remoteClaudeListeners.set(instanceId, {
                output: outputHandler,
                error: null,
                exit: null
              });
            }
            
            // Listen to Claude output for this specific instance
            const cleanup = window.electronAPI.claude.onOutput(instanceId, outputHandler);
            window.__remoteClaudeListeners.get(instanceId).cleanup = cleanup;
            
            console.log('[RemoteClaudeForwarding] Set up output forwarding for:', instanceId);
            return true;
          } else {
            console.error('[RemoteClaudeForwarding] Claude API not available');
            return false;
          }
        } catch (e) {
          console.error('[RemoteClaudeForwarding] Error:', e);
          return false;
        }
      })()
    `).then(result => {
      if (result) {
        console.log(`[RemoteClaudeHandler] Successfully set up forwarding for ${instanceId}`);
        
        // Set up IPC listener to forward Claude output
        const forwardHandler = (event: any, data: any) => {
          if (data.instanceId === instanceId && data.socketId === socket.id) {
            socket.emit(RemoteEvent.CLAUDE_OUTPUT, {
              instanceId: data.instanceId,
              data: data.data
            });
          }
        };
        
        // Store handler for cleanup
        if (!this.claudeForwardHandlers) {
          this.claudeForwardHandlers = new Map();
        }
        this.claudeForwardHandlers.set(`${socket.id}-${instanceId}`, forwardHandler);
        
        // Listen for forwarded Claude output
        this.mainWindow.webContents.ipc.on('forward-claude-output', forwardHandler);
      }
    }).catch(error => {
      console.error('[RemoteClaudeHandler] Failed to set up desktop Claude forwarding:', error);
    });
  }
  
  // Add property for tracking desktop Claude forwarding
  private desktopClaudeForwarding?: Map<string, Set<string>>;
  private claudeForwardHandlers?: Map<string, (event: any, data: any) => void>;
}