/**
 * Remote access server for hybrid mode
 * Provides Socket.IO server for remote connections
 */
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
export class RemoteServer {
    io = null;
    httpServer = null;
    config;
    mainWindow;
    activeConnections = new Map();
    constructor(options) {
        this.config = options.config;
        this.mainWindow = options.mainWindow;
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
            if (this.config.authRequired) {
                const token = socket.handshake.auth.token;
                // TODO: Implement proper authentication
                if (!token) {
                    return next(new Error('Authentication required'));
                }
            }
            // Check connection limit
            if (this.activeConnections.size >= (this.config.maxRemoteConnections || 10)) {
                return next(new Error('Connection limit reached'));
            }
            next();
        });
        // Connection handler
        this.io.on('connection', (socket) => {
            console.log(`Remote client connected: ${socket.id}`);
            this.activeConnections.set(socket.id, socket);
            // Handle file operations
            socket.on('file:read', async (data, callback) => {
                try {
                    // Forward to main window IPC
                    const result = await this.mainWindow.webContents.executeJavaScript(`
            window.electronAPI.file.readFile('${data.path}')
          `);
                    callback({ success: true, data: result });
                }
                catch (error) {
                    callback({ success: false, error: error.message });
                }
            });
            socket.on('file:write', async (data, callback) => {
                try {
                    const result = await this.mainWindow.webContents.executeJavaScript(`
            window.electronAPI.file.writeFile('${data.path}', '${data.content}')
          `);
                    callback({ success: true });
                }
                catch (error) {
                    callback({ success: false, error: error.message });
                }
            });
            // Handle terminal operations
            socket.on('terminal:create', async (data, callback) => {
                try {
                    // TODO: Implement terminal creation for remote clients
                    callback({ success: true, terminalId: `remote-${socket.id}-${Date.now()}` });
                }
                catch (error) {
                    callback({ success: false, error: error.message });
                }
            });
            // Handle Claude operations
            socket.on('claude:spawn', async (data, callback) => {
                try {
                    // TODO: Implement Claude spawn for remote clients
                    callback({ success: true, instanceId: `remote-${socket.id}-${Date.now()}` });
                }
                catch (error) {
                    callback({ success: false, error: error.message });
                }
            });
            // Handle disconnection
            socket.on('disconnect', () => {
                console.log(`Remote client disconnected: ${socket.id}`);
                this.activeConnections.delete(socket.id);
                // TODO: Clean up any resources for this client
            });
        });
    }
    async stop() {
        // Disconnect all clients
        this.activeConnections.forEach((socket) => {
            socket.disconnect(true);
        });
        this.activeConnections.clear();
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
        return this.activeConnections.size;
    }
    isRunning() {
        return this.io !== null && this.httpServer !== null;
    }
}
