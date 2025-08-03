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
      transports: ['websocket', 'polling']
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
      
      // TODO: Register other handlers
      // this.terminalHandler.registerHandlers(socket);
      // this.claudeHandler.registerHandlers(socket);
      
      // Send initial connection success
      socket.emit('connection:ready', {
        sessionId: (socket as any).sessionId,
        permissions: session?.permissions || []
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Remote client disconnected: ${socket.id}`);
        this.sessionManager.removeSession(socket.id);
        // TODO: Clean up any resources for this client
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
}