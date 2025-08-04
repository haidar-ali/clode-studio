/**
 * Remote access server for hybrid mode
 * Provides Socket.IO server for remote connections
 */
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import type { ModeConfig } from './mode-config';
import type { BrowserWindow } from 'electron';
import { RemoteSessionManager } from './remote-session-manager.js';
import { RemoteFileHandler } from './remote-handlers/RemoteFileHandler.js';
import { RemoteTerminalHandler } from './remote-handlers/RemoteTerminalHandler.js';
import { RemoteClaudeHandler } from './remote-handlers/RemoteClaudeHandler.js';
import { RemoteSyncHandler } from './remote-handlers/RemoteSyncHandler.js';
import { RemoteWorkspaceHandler } from './remote-handlers/RemoteWorkspaceHandler.js';
import { RemoteEvent } from './remote-protocol.js';

export interface RemoteServerOptions {
  config: ModeConfig;
  mainWindow: BrowserWindow;
}

export class RemoteServer {
  private io: SocketIOServer | null = null;
  private httpServer: any = null;
  private config: ModeConfig;
  private mainWindow: BrowserWindow;
  private sessionManager: RemoteSessionManager;
  private fileHandler: RemoteFileHandler;
  private terminalHandler: RemoteTerminalHandler;
  private claudeHandler: RemoteClaudeHandler;
  private syncHandler: RemoteSyncHandler;
  private workspaceHandler: RemoteWorkspaceHandler;
  
  constructor(options: RemoteServerOptions) {
    this.config = options.config;
    this.mainWindow = options.mainWindow;
    
    // Initialize session manager
    this.sessionManager = new RemoteSessionManager(
      this.config.authRequired || false
    );
    
    // Initialize handlers
    this.fileHandler = new RemoteFileHandler(
      this.mainWindow,
      this.sessionManager
    );
    
    this.terminalHandler = new RemoteTerminalHandler(
      this.mainWindow,
      this.sessionManager
    );
    
    this.claudeHandler = new RemoteClaudeHandler(
      this.mainWindow,
      this.sessionManager
    );
    
    this.syncHandler = new RemoteSyncHandler(
      this.mainWindow,
      this.sessionManager
    );
    
    this.workspaceHandler = new RemoteWorkspaceHandler(
      this.mainWindow,
      this.sessionManager
    );
  }
  
  async start(): Promise<void> {
    if (!this.config.enableRemoteAccess) {
      console.log('Remote access not enabled');
      return;
    }
    
    console.log(`Starting remote server on ${this.config.serverHost}:${this.config.serverPort}`);
    
    // Create HTTP server
    this.httpServer = createServer();
    
    // Create Socket.IO server
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['polling', 'websocket'], // Start with polling for mobile
      pingTimeout: 60000,
      pingInterval: 25000
    });
    
    // Set up connection handlers
    this.setupHandlers();
    
    // Start listening
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.serverPort, this.config.serverHost, () => {
        console.log(`Remote server listening on ${this.config.serverHost}:${this.config.serverPort}`);
        resolve();
      });
      
      this.httpServer.on('error', (error: Error) => {
        console.error('Failed to start remote server:', error);
        reject(error);
      });
    });
  }
  
  private setupHandlers(): void {
    if (!this.io) return;
    
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        // Create session
        const authData = socket.handshake.auth;
        const session = await this.sessionManager.createSession(socket, authData);
        
        // Store session ID in socket data
        (socket as any).sessionId = session.id;
        
        // Check connection limit
        const stats = this.sessionManager.getStats();
        if (stats.totalSessions >= (this.config.maxRemoteConnections || 10)) {
          return next(new Error('Connection limit reached'));
        }
        
        next();
      } catch (error) {
        next(error as Error);
      }
    });
    
    // Connection handler
    this.io.on('connection', (socket) => {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      console.log(`Remote client connected: ${socket.id}, session: ${session?.id}`);
      
      // Register handlers
      this.fileHandler.registerHandlers(socket);
      this.terminalHandler.registerHandlers(socket);
      this.claudeHandler.registerHandlers(socket);
      this.syncHandler.registerHandlers(socket);
      this.workspaceHandler.registerHandlers(socket);
      
      // Set up desktop terminal data forwarding
      this.setupDesktopTerminalForwarding(socket);
      
      // Send initial connection success
      socket.emit('connection:ready', {
        sessionId: (socket as any).sessionId,
        permissions: session?.permissions || []
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Remote client disconnected: ${socket.id}`);
        
        // Clean up terminals and Claude instances for this socket
        this.terminalHandler.cleanupSocketTerminals(socket.id);
        this.claudeHandler.cleanupSocketInstances(socket.id);
        
        // Remove session
        this.sessionManager.removeSession(socket.id);
      });
      
      // Handle ping for keep-alive
      socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
          callback({ pong: Date.now() });
        }
      });
    });
  }
  
  async stop(): Promise<void> {
    // Disconnect all clients
    if (this.io) {
      this.io.disconnectSockets(true);
    }
    
    // Stop Socket.IO
    if (this.io) {
      await new Promise<void>((resolve) => {
        this.io!.close(() => resolve());
      });
      this.io = null;
    }
    
    // Stop HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => resolve());
      });
      this.httpServer = null;
    }
    
    console.log('Remote server stopped');
  }
  
  getActiveConnectionCount(): number {
    return this.sessionManager.getStats().totalSessions;
  }
  
  isRunning(): boolean {
    return this.io !== null && this.httpServer !== null;
  }
  
  getStats() {
    return {
      running: this.isRunning(),
      ...this.sessionManager.getStats(),
      config: this.config
    };
  }
  
  forwardTerminalData(socketId: string, terminalId: string, data: string): void {
    if (!this.io) return;
    
    // Get the specific socket
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket && socket.connected) {
      // Forward the terminal data to this specific socket
      socket.emit(RemoteEvent.TERMINAL_DATA, {
        terminalId,
        data: Buffer.from(data)
      });
    }
  }
  
  forwardDesktopTerminalData(ptyId: string, data: string): void {
    if (!this.io) return;
    
    console.log(`[RemoteServer] Forwarding terminal data from PTY ${ptyId}, data length: ${data.length}`);
    
    // Forward to all connected sockets
    let forwardedCount = 0;
    this.io.sockets.sockets.forEach((socket) => {
      // Check if this socket has terminal forwarding set up
      const ptyToInstanceMap = (socket as any).__ptyToInstanceMap;
      if (ptyToInstanceMap && ptyToInstanceMap.has(ptyId)) {
        const instanceId = ptyToInstanceMap.get(ptyId);
        console.log(`[RemoteServer] Forwarding to socket ${socket.id} for terminal ${instanceId}`);
        console.log(`[RemoteServer] Emitting event: ${RemoteEvent.TERMINAL_DATA}`);
        socket.emit(RemoteEvent.TERMINAL_DATA, {
          terminalId: instanceId,
          data: Buffer.from(data).toString('base64')
        });
        forwardedCount++;
      }
    });
    
    if (forwardedCount === 0) {
      console.log(`[RemoteServer] No sockets found with mapping for PTY ${ptyId}`);
    }
  }
  
  updateSocketTerminalMapping(socketId: string, terminals: any[]): void {
    if (!this.io) return;
    
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;
    
    // Create a map of PTY ID to terminal instance ID
    const ptyToInstanceMap = new Map<string, string>();
    terminals.forEach(terminal => {
      if (terminal.ptyProcessId) {
        ptyToInstanceMap.set(terminal.ptyProcessId, terminal.id);
        console.log(`[RemoteServer] Mapping PTY ${terminal.ptyProcessId} to terminal ${terminal.id}`);
      }
    });
    
    // Store the mapping on the socket
    (socket as any).__ptyToInstanceMap = ptyToInstanceMap;
    console.log(`[RemoteServer] Updated terminal mapping for socket ${socketId}: ${ptyToInstanceMap.size} terminals`);
  }
  
  private setupDesktopTerminalForwarding(socket: any): void {
    const socketId = socket.id;
    
    // Initial setup - try to get terminals after a short delay
    const timeoutId = setTimeout(() => {
      // Check if mainWindow still exists and isn't destroyed
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.executeJavaScript(`
          (() => {
            if (typeof window.__getTerminalInstances === 'function') {
              return window.__getTerminalInstances();
            }
            return null;
          })()
        `).then(instances => {
          if (instances && Array.isArray(instances) && instances.length > 0) {
            this.updateSocketTerminalMapping(socketId, instances);
          }
        }).catch(err => {
          console.error('Failed to get initial terminal instances:', err);
        });
      }
    }, 1000); // Wait 1 second for terminal store to be ready
    
    // Clean up when socket disconnects
    socket.on('disconnect', () => {
      // Clear the timeout if socket disconnects early
      clearTimeout(timeoutId);
      
      // Remove mapping for this socket
      const sock = this.io?.sockets.sockets.get(socketId);
      if (sock && (sock as any).__ptyToInstanceMap) {
        delete (sock as any).__ptyToInstanceMap;
      }
    });
  }
}