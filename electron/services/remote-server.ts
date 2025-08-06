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
import { RemoteDesktopFeaturesHandler } from './remote-handlers/RemoteDesktopFeaturesHandler.js';
import { RemoteSnapshotsHandler } from './remote-handlers/RemoteSnapshotsHandler.js';
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
  private desktopFeaturesHandler: RemoteDesktopFeaturesHandler;
  private snapshotsHandler: RemoteSnapshotsHandler;
  
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
    
    this.desktopFeaturesHandler = new RemoteDesktopFeaturesHandler(
      this.mainWindow,
      this.sessionManager
    );
    
    this.snapshotsHandler = new RemoteSnapshotsHandler();
  }
  
  async start(): Promise<void> {
    if (!this.config.enableRemoteAccess) {
     
      return;
    }
    
   
    
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
     
      
      // Register handlers
      this.fileHandler.registerHandlers(socket);
      this.terminalHandler.registerHandlers(socket);
      this.claudeHandler.registerHandlers(socket);
      this.syncHandler.registerHandlers(socket);
      this.workspaceHandler.registerHandlers(socket);
      this.desktopFeaturesHandler.registerHandlers(socket);
      this.snapshotsHandler.registerHandlers(socket);
      
      // Register LSP proxy for remote editor
      this.setupLSPProxy(socket);
      
      // Register Ghost Text and Code Generation proxy
      this.setupAIProxy(socket);
      
      // Set up desktop terminal data forwarding
      this.setupDesktopTerminalForwarding(socket);
      
      // Send initial connection success
      socket.emit('connection:ready', {
        sessionId: (socket as any).sessionId,
        permissions: session?.permissions || []
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
       
        
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
  
  forwardClaudeOutput(socketId: string, instanceId: string, data: string): void {
    if (!this.io) return;
    
    // Get the specific socket
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket && socket.connected) {
      // Forward the Claude output to this specific socket
      socket.emit(RemoteEvent.CLAUDE_OUTPUT, {
        instanceId,
        data
      });
    }
  }
  
  broadcastClaudeInstancesUpdate(): void {
    if (!this.io) return;
    
    // Broadcast to all connected clients that Claude instances have been updated
    this.io.emit(RemoteEvent.CLAUDE_INSTANCES_UPDATED);
  }
  
  forwardClaudeResponseComplete(socketId: string, instanceId: string): void {
   
    
    if (!this.io) {
     
      return;
    }
    
    // Get the specific socket
    const socket = this.io.sockets.sockets.get(socketId);
    
    if (socket && socket.connected) {
     
      // Forward the response complete event to this specific socket
      socket.emit(RemoteEvent.CLAUDE_RESPONSE_COMPLETE, {
        instanceId
      });
    } else {
     
      // Try broadcasting to all sockets as fallback
      this.io.emit(RemoteEvent.CLAUDE_RESPONSE_COMPLETE, {
        instanceId
      });
    }
  }
  
  forwardDesktopTerminalData(ptyId: string, data: string): void {
    if (!this.io) return;
    
   
    
    // Forward to all connected sockets
    let forwardedCount = 0;
    this.io.sockets.sockets.forEach((socket) => {
      // Check if this socket has terminal forwarding set up
      const ptyToInstanceMap = (socket as any).__ptyToInstanceMap;
      if (ptyToInstanceMap && ptyToInstanceMap.has(ptyId)) {
        const instanceId = ptyToInstanceMap.get(ptyId);
       
       
        socket.emit(RemoteEvent.TERMINAL_DATA, {
          terminalId: instanceId,
          data: Buffer.from(data).toString('base64')
        });
        forwardedCount++;
      }
    });
    
    if (forwardedCount === 0) {
     
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
       
      }
    });
    
    // Store the mapping on the socket
    (socket as any).__ptyToInstanceMap = ptyToInstanceMap;
   
  }
  
  private setupLSPProxy(socket: any): void {
    // Handle LSP requests from remote clients
    socket.on('lsp:request', async (request: any) => {
      try {
        // Forward LSP request to desktop's LSP service
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          // Convert LSP params to desktop format
          // The desktop LSP expects 'filepath' but remote sends 'uri'
          const desktopParams = {
            filepath: request.params.uri, // Map uri to filepath
            content: request.params.content || '', // Include content for LSP
            position: request.params.position,
            context: request.params.context
          };
          
          const result = await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.lsp) {
                // Forward the LSP request based on method
                const method = '${request.method}';
                const params = ${JSON.stringify(desktopParams)};
                
                switch(method) {
                  case 'textDocument/completion':
                    return await window.electronAPI.lsp.getCompletions(params);
                  case 'textDocument/hover':
                    return await window.electronAPI.lsp.getHover(params);
                  case 'textDocument/definition':
                    return await window.electronAPI.lsp.getDefinition(params);
                  case 'textDocument/references':
                    return await window.electronAPI.lsp.getReferences(params);
                  case 'textDocument/documentSymbol':
                    return await window.electronAPI.lsp.getDocumentSymbols(params);
                  case 'textDocument/formatting':
                    return await window.electronAPI.lsp.formatDocument(params);
                  default:
                    throw new Error('Unsupported LSP method: ' + method);
                }
              }
              return null;
            })()
          `);
          
          // Send response back to client
          socket.emit('lsp:response', {
            requestId: request.requestId,
            result: result
          });
        }
      } catch (error) {
        socket.emit('lsp:response', {
          requestId: request.requestId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    // Handle document lifecycle events
    socket.on('lsp:didOpen', async (params: any) => {
      // Forward to desktop LSP
      console.log('[Server LSP] Document opened:', params.uri);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.lsp) {
                // The desktop LSP manager needs to be notified about document open
                const { lspManager } = await import('./lsp-manager.js');
                const language = lspManager.detectLanguage('${params.uri}');
                if (language) {
                  const connection = lspManager.connections.get(language);
                  if (connection) {
                    // Send didOpen notification
                    connection.sendNotification('textDocument/didOpen', {
                      textDocument: {
                        uri: 'file://${params.uri}',
                        languageId: '${params.languageId || 'typescript'}',
                        version: 1,
                        text: ${JSON.stringify(params.content || '')}
                      }
                    });
                  }
                }
              }
            })()
          `);
        } catch (error) {
          console.error('[Server LSP] Failed to notify didOpen:', error);
        }
      }
    });
    
    socket.on('lsp:didChange', async (params: any) => {
      // Forward to desktop LSP
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.lsp) {
                const { lspManager } = await import('./lsp-manager.js');
                const language = lspManager.detectLanguage('${params.uri}');
                if (language) {
                  const connection = lspManager.connections.get(language);
                  if (connection) {
                    // Send didChange notification
                    connection.sendNotification('textDocument/didChange', {
                      textDocument: {
                        uri: 'file://${params.uri}',
                        version: Date.now()
                      },
                      contentChanges: [{
                        text: ${JSON.stringify(params.content || '')}
                      }]
                    });
                  }
                }
              }
            })()
          `);
        } catch (error) {
          console.error('[Server LSP] Failed to notify didChange:', error);
        }
      }
    });
    
    socket.on('lsp:didClose', async (params: any) => {
      // Forward to desktop LSP
      console.log('[Server LSP] Document closed:', params.uri);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.lsp) {
                const { lspManager } = await import('./lsp-manager.js');
                const language = lspManager.detectLanguage('${params.uri}');
                if (language) {
                  const connection = lspManager.connections.get(language);
                  if (connection) {
                    // Send didClose notification
                    connection.sendNotification('textDocument/didClose', {
                      textDocument: {
                        uri: 'file://${params.uri}'
                      }
                    });
                  }
                }
              }
            })()
          `);
        } catch (error) {
          console.error('[Server LSP] Failed to notify didClose:', error);
        }
      }
    });
  }
  
  private setupAIProxy(socket: any): void {
    // Handle Ghost Text requests from remote clients
    socket.on('ai:ghost-text', async (request: any) => {
      try {
        const { requestId, prefix, suffix, forceManual } = request;
        
        // Forward to desktop's autocomplete service
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          const result = await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.autocomplete?.getGhostText) {
                return await window.electronAPI.autocomplete.getGhostText(${JSON.stringify({
                  prefix: prefix || '',
                  suffix: suffix || '',
                  forceManual: forceManual || false
                })});
              }
              return { success: false, error: 'Ghost text API not available' };
            })()
          `);
          
          // Send response back to client
          socket.emit('ai:ghost-text-response', {
            requestId,
            result
          });
        } else {
          socket.emit('ai:ghost-text-response', {
            requestId,
            result: { success: false, error: 'Desktop app not available' }
          });
        }
      } catch (error) {
        socket.emit('ai:ghost-text-response', {
          requestId: request.requestId,
          result: { success: false, error: error instanceof Error ? error.message : String(error) }
        });
      }
    });
    
    // Handle Code Generation requests from remote clients
    socket.on('ai:code-generation', async (request: any) => {
      try {
        const { requestId, prompt, fileContent, filePath, language, resources } = request;
        
        // Forward to desktop's code generation service
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          const result = await this.mainWindow.webContents.executeJavaScript(`
            (async () => {
              if (window.electronAPI?.codeGeneration?.generate) {
                return await window.electronAPI.codeGeneration.generate(${JSON.stringify({
                  prompt: prompt || '',
                  fileContent: fileContent || '',
                  filePath: filePath || 'untitled',
                  language: language || 'text',
                  resources: resources || []
                })});
              }
              return { success: false, error: 'Code generation API not available' };
            })()
          `);
          
          // Send response back to client
          socket.emit('ai:code-generation-response', {
            requestId,
            result
          });
        } else {
          socket.emit('ai:code-generation-response', {
            requestId,
            result: { success: false, error: 'Desktop app not available' }
          });
        }
      } catch (error) {
        socket.emit('ai:code-generation-response', {
          requestId: request.requestId,
          result: { success: false, error: error instanceof Error ? error.message : String(error) }
        });
      }
    });
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