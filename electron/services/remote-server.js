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
export class RemoteServer {
    io = null;
    httpServer = null;
    config;
    mainWindow;
    sessionManager;
    fileHandler;
    terminalHandler;
    claudeHandler;
    constructor(options) {
        this.config = options.config;
        this.mainWindow = options.mainWindow;
        // Initialize session manager
        this.sessionManager = new RemoteSessionManager(this.config.authRequired || false);
        // Initialize handlers
        this.fileHandler = new RemoteFileHandler(this.mainWindow, this.sessionManager);
        this.terminalHandler = new RemoteTerminalHandler(this.mainWindow, this.sessionManager);
        this.claudeHandler = new RemoteClaudeHandler(this.mainWindow, this.sessionManager);
    }
    async start() {
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
            console.log(`Remote client connected: ${socket.id}, session: ${session?.id}`);
            // Register handlers
            this.fileHandler.registerHandlers(socket);
            this.terminalHandler.registerHandlers(socket);
            this.claudeHandler.registerHandlers(socket);
            // Send initial connection success
            socket.emit('connection:ready', {
                sessionId: socket.sessionId,
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
        console.log('Remote server stopped');
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
            config: this.config
        };
    }
}
