/**
 * Remote access server for hybrid mode
 * Provides Socket.IO server for remote connections
 */
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { RemoteSessionManager } from './remote-session-manager.js';
import { RemoteFileHandler } from './remote-handlers/RemoteFileHandler.js';
import { RemoteTerminalHandler } from './remote-handlers/RemoteTerminalHandler.js';
import { RemoteClaudeHandler } from './remote-handlers/RemoteClaudeHandler.js';
import { RemoteSyncHandler } from './remote-handlers/RemoteSyncHandler.js';
import { RemoteWorkspaceHandler } from './remote-handlers/RemoteWorkspaceHandler.js';
import { RemoteDesktopFeaturesHandler } from './remote-handlers/RemoteDesktopFeaturesHandler.js';
import { RemoteSnapshotsHandler } from './remote-handlers/RemoteSnapshotsHandler.js';
import { RemoteWorktreeHandler } from './remote-handlers/RemoteWorktreeHandler.js';
import { RemoteEvent } from './remote-protocol.js';
import { TokenStore } from './token-store.js';
export class RemoteServer {
    io = null;
    httpServer = null;
    config;
    mainWindow;
    sessionManager;
    fileHandler;
    terminalHandler;
    claudeHandler;
    syncHandler;
    workspaceHandler;
    desktopFeaturesHandler;
    snapshotsHandler;
    worktreeHandler;
    constructor(options) {
        this.config = options.config;
        this.mainWindow = options.mainWindow;
        // Initialize session manager
        this.sessionManager = new RemoteSessionManager(this.config.authRequired || false);
        // Initialize handlers
        this.fileHandler = new RemoteFileHandler(this.mainWindow, this.sessionManager);
        this.terminalHandler = new RemoteTerminalHandler(this.mainWindow, this.sessionManager);
        this.claudeHandler = new RemoteClaudeHandler(this.mainWindow, this.sessionManager);
        this.syncHandler = new RemoteSyncHandler(this.mainWindow, this.sessionManager);
        this.workspaceHandler = new RemoteWorkspaceHandler(this.mainWindow, this.sessionManager);
        this.desktopFeaturesHandler = new RemoteDesktopFeaturesHandler(this.mainWindow, this.sessionManager);
        this.snapshotsHandler = new RemoteSnapshotsHandler();
        this.worktreeHandler = new RemoteWorktreeHandler();
    }
    updateMainWindow(mainWindow) {
        this.mainWindow = mainWindow;
        // Update all handlers with new window reference
        this.fileHandler = new RemoteFileHandler(this.mainWindow, this.sessionManager);
        this.terminalHandler = new RemoteTerminalHandler(this.mainWindow, this.sessionManager);
        this.claudeHandler = new RemoteClaudeHandler(this.mainWindow, this.sessionManager);
        this.syncHandler = new RemoteSyncHandler(this.mainWindow, this.sessionManager);
        this.workspaceHandler = new RemoteWorkspaceHandler(this.mainWindow, this.sessionManager);
        this.desktopFeaturesHandler = new RemoteDesktopFeaturesHandler(this.mainWindow, this.sessionManager);
        // Re-register handlers for all existing socket connections
        if (this.io) {
            this.io.sockets.sockets.forEach((socket) => {
                // Remove all old listeners first
                socket.removeAllListeners();
                // Re-register all handlers
                this.fileHandler.registerHandlers(socket);
                this.terminalHandler.registerHandlers(socket);
                this.claudeHandler.registerHandlers(socket);
                this.syncHandler.registerHandlers(socket);
                this.workspaceHandler.registerHandlers(socket);
                this.desktopFeaturesHandler.registerHandlers(socket);
                this.snapshotsHandler.registerHandlers(socket);
                this.worktreeHandler.registerHandlers(socket);
                // Re-register other handlers
                this.setupLSPProxy(socket);
                this.setupAIProxy(socket);
                this.setupDesktopTerminalForwarding(socket);
                // Re-add disconnect handler
                socket.on('disconnect', () => {
                    this.terminalHandler.cleanupSocketTerminals(socket.id);
                    this.claudeHandler.cleanupSocketInstances(socket.id);
                    this.sessionManager.removeSession(socket.id);
                });
                // Re-add ping handler
                socket.on('ping', (callback) => {
                    if (typeof callback === 'function') {
                        callback({ pong: Date.now() });
                    }
                });
            });
        }
    }
    async start() {
        if (!this.config.enableRemoteAccess) {
            return;
        }
        // Create HTTP server with health check endpoint
        this.httpServer = createServer((req, res) => {
            // Handle health check endpoint
            if (req.url === '/health' && req.method === 'GET') {
                const stats = this.sessionManager.getStats();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    mode: this.config.mode,
                    connections: stats.totalSessions,
                    activeConnections: stats.activeSessions,
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString()
                }));
            }
            else {
                // Default response for other routes
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Clode Studio Remote Server');
            }
        });
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
            this.httpServer.on('error', (error) => {
                console.error('Failed to start remote server:', error);
                reject(error);
            });
        });
    }
    setupHandlers() {
        if (!this.io)
            return;
        // Authentication middleware
        this.io.use(async (socket, next) => {
            try {
                // Create session
                const authData = socket.handshake.auth;
                const session = await this.sessionManager.createSession(socket, authData);
                // Store session ID in socket data
                socket.sessionId = session.id;
                // Check connection limit
                const stats = this.sessionManager.getStats();
                if (stats.totalSessions >= (this.config.maxRemoteConnections || 10)) {
                    return next(new Error('Connection limit reached'));
                }
                next();
            }
            catch (error) {
                next(error);
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
            this.worktreeHandler.registerHandlers(socket);
            // Register LSP proxy for remote editor
            this.setupLSPProxy(socket);
            // Register Ghost Text and Code Generation proxy
            this.setupAIProxy(socket);
            // Set up desktop terminal data forwarding
            this.setupDesktopTerminalForwarding(socket);
            // Send initial connection success
            socket.emit('connection:ready', {
                sessionId: socket.sessionId,
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
    async stop() {
        // Disconnect all clients
        if (this.io) {
            this.io.disconnectSockets(true);
        }
        // Stop Socket.IO
        if (this.io) {
            await new Promise((resolve) => {
                this.io.close(() => resolve());
            });
            this.io = null;
        }
        // Stop HTTP server
        if (this.httpServer) {
            await new Promise((resolve) => {
                this.httpServer.close(() => resolve());
            });
            this.httpServer = null;
        }
    }
    getActiveConnectionCount() {
        return this.sessionManager.getStats().totalSessions;
    }
    isRunning() {
        return this.io !== null && this.httpServer !== null;
    }
    getStats() {
        return {
            running: this.isRunning(),
            ...this.sessionManager.getStats(),
            tokenStats: TokenStore.getInstance().getStats(),
            config: this.config
        };
    }
    /**
     * Store a token when QR code is generated (called from desktop app)
     */
    storeToken(token, deviceId, deviceName, pairingCode, expiresAt) {
        TokenStore.getInstance().storeToken(token, deviceId, deviceName, pairingCode, expiresAt);
    }
    /**
     * Get active tokens
     */
    getActiveTokens() {
        return TokenStore.getInstance().getActiveConnections();
    }
    /**
     * Revoke a token
     */
    revokeToken(token) {
        const success = TokenStore.getInstance().revokeToken(token);
        if (success && this.io) {
            // Find and disconnect any active connections using this token
            const sessions = this.sessionManager.getAllSessions();
            for (const session of sessions) {
                if (session.token === token) {
                    const socket = this.io.sockets.sockets.get(session.socketId);
                    if (socket) {
                        // Send a disconnection message before disconnecting
                        socket.emit('server:disconnected', {
                            reason: 'Token revoked',
                            message: 'Your access token has been revoked. Please request a new connection.'
                        });
                        // Give the client a moment to receive the message
                        setTimeout(() => {
                            socket.disconnect(true);
                        }, 100);
                    }
                }
            }
        }
        return success;
    }
    /**
     * Disconnect a specific device by session ID
     */
    disconnectDevice(sessionId) {
        // Find the session
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            return false;
        }
        // Find the socket by socketId stored in session
        const socket = this.io?.sockets.sockets.get(session.socketId);
        if (socket) {
            // Send a disconnection message before disconnecting
            socket.emit('server:disconnected', {
                reason: 'Connection revoked by server',
                message: 'Your connection has been terminated by the desktop application'
            });
            // Give the client a moment to receive the message
            setTimeout(() => {
                socket.disconnect(true);
            }, 100);
            return true;
        }
        return false;
    }
    /**
     * Get active connections with details
     */
    getConnections() {
        return this.sessionManager.getConnections();
    }
    forwardTerminalData(socketId, terminalId, data) {
        if (!this.io)
            return;
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
    forwardClaudeOutput(socketId, instanceId, data) {
        if (!this.io)
            return;
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
    broadcastClaudeInstancesUpdate() {
        if (!this.io)
            return;
        // Broadcast to all connected clients that Claude instances have been updated
        this.io.emit(RemoteEvent.CLAUDE_INSTANCES_UPDATED);
    }
    broadcastClaudeStatusUpdate(instanceId, status, pid) {
        if (!this.io)
            return;
        // Broadcast to all connected clients with the status payload
        this.io.emit(RemoteEvent.CLAUDE_INSTANCES_UPDATED, {
            instanceId,
            status,
            pid
        });
    }
    forwardClaudeResponseComplete(socketId, instanceId) {
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
        }
        else {
            // Try broadcasting to all sockets as fallback
            this.io.emit(RemoteEvent.CLAUDE_RESPONSE_COMPLETE, {
                instanceId
            });
        }
    }
    forwardDesktopTerminalData(ptyId, data) {
        if (!this.io)
            return;
        // Forward to all connected sockets
        let forwardedCount = 0;
        this.io.sockets.sockets.forEach((socket) => {
            // Check if this socket has terminal forwarding set up
            const ptyToInstanceMap = socket.__ptyToInstanceMap;
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
    updateSocketTerminalMapping(socketId, terminals) {
        if (!this.io)
            return;
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket)
            return;
        // Create a map of PTY ID to terminal instance ID
        const ptyToInstanceMap = new Map();
        terminals.forEach(terminal => {
            if (terminal.ptyProcessId) {
                ptyToInstanceMap.set(terminal.ptyProcessId, terminal.id);
            }
        });
        // Store the mapping on the socket
        socket.__ptyToInstanceMap = ptyToInstanceMap;
    }
    setupLSPProxy(socket) {
        // Handle LSP requests from remote clients
        socket.on('lsp:request', async (request) => {
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
            }
            catch (error) {
                socket.emit('lsp:response', {
                    requestId: request.requestId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        // Handle document lifecycle events
        socket.on('lsp:didOpen', async (params) => {
            // Forward to desktop LSP
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
                }
                catch (error) {
                    console.error('[Server LSP] Failed to notify didOpen:', error);
                }
            }
        });
        socket.on('lsp:didChange', async (params) => {
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
                }
                catch (error) {
                    console.error('[Server LSP] Failed to notify didChange:', error);
                }
            }
        });
        socket.on('lsp:didClose', async (params) => {
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
                }
                catch (error) {
                    console.error('[Server LSP] Failed to notify didClose:', error);
                }
            }
        });
    }
    setupAIProxy(socket) {
        // Handle Ghost Text requests from remote clients
        socket.on('ai:ghost-text', async (request) => {
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
                }
                else {
                    socket.emit('ai:ghost-text-response', {
                        requestId,
                        result: { success: false, error: 'Desktop app not available' }
                    });
                }
            }
            catch (error) {
                socket.emit('ai:ghost-text-response', {
                    requestId: request.requestId,
                    result: { success: false, error: error instanceof Error ? error.message : String(error) }
                });
            }
        });
        // Handle Code Generation requests from remote clients
        socket.on('ai:code-generation', async (request) => {
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
                }
                else {
                    socket.emit('ai:code-generation-response', {
                        requestId,
                        result: { success: false, error: 'Desktop app not available' }
                    });
                }
            }
            catch (error) {
                socket.emit('ai:code-generation-response', {
                    requestId: request.requestId,
                    result: { success: false, error: error instanceof Error ? error.message : String(error) }
                });
            }
        });
    }
    setupDesktopTerminalForwarding(socket) {
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
            if (sock && sock.__ptyToInstanceMap) {
                delete sock.__ptyToInstanceMap;
            }
        });
    }
}
