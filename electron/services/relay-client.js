import { io } from 'socket.io-client';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Store from 'electron-store';
import { HttpHandler } from './http-handler.js';
export class RelayClient extends EventEmitter {
    relayUrl;
    localPort;
    relaySocket = null;
    localSocket = null;
    relayInfo = null;
    store;
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    httpHandler;
    socketIoPort = 3789; // Socket.IO server port
    constructor(relayUrl = process.env.RELAY_URL || 'wss://relay.clode.studio', localPort = 3000 // HTTP proxy port for Nuxt UI
    ) {
        super();
        this.relayUrl = relayUrl;
        this.localPort = localPort;
        this.store = new Store();
        this.httpHandler = new HttpHandler(this.localPort);
    }
    async connect() {
        return new Promise((resolve, reject) => {
            // Get or create device ID
            let deviceId = this.store.get('deviceId');
            if (!deviceId) {
                deviceId = uuidv4();
                this.store.set('deviceId', deviceId);
            }
            // Connect to relay server
            this.relaySocket = io(this.relayUrl, {
                auth: {
                    role: 'desktop',
                    deviceId,
                    version: process.env.npm_package_version || '1.0.0'
                },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: this.maxReconnectAttempts
            });
            // Handle registration
            this.relaySocket.once('registered', (info) => {
                this.relayInfo = info;
                // Set up HTTP proxy handlers
                if (this.relaySocket) {
                    this.httpHandler.setupHandlers(this.relaySocket);
                }
                // Set up Socket.IO bridge
                this.setupLocalBridge();
                this.emit('registered', info);
                resolve(info);
            });
            // Handle errors
            this.relaySocket.once('error', (error) => {
                console.error(`[RelayClient] Connection error: ${error}`);
                reject(new Error(error));
            });
            // Handle reconnection
            this.relaySocket.on('reconnect', (attemptNumber) => {
                this.emit('reconnected');
            });
            this.relaySocket.on('reconnect_attempt', (attemptNumber) => {
                this.reconnectAttempts = attemptNumber;
            });
            this.relaySocket.on('reconnect_failed', () => {
                console.error('[RelayClient] Failed to reconnect after maximum attempts');
                this.emit('connection_lost');
            });
            // Handle disconnect
            this.relaySocket.on('disconnect', (reason) => {
                if (reason === 'io server disconnect') {
                    // Server initiated disconnect, don't auto-reconnect
                    this.relaySocket?.connect();
                }
            });
        });
    }
    setupLocalBridge() {
        if (!this.relaySocket)
            return;
        // Connect to local Socket.IO server (port 3789, not HTTP port 3000)
        this.localSocket = io(`http://localhost:${this.socketIoPort}`, {
            transports: ['websocket'],
            reconnection: true
        });
        this.localSocket.on('connect', () => {
            // Request-response tracking for callback preservation
            const pendingRequests = new Map();
            // Handle special request-response pattern from relay
            this.relaySocket.on('bridge:request', (data) => {
                const { requestId, event, args } = data;
                // Emit to local with callback that sends response back through relay
                this.localSocket.emit(event, ...args, (response) => {
                    this.relaySocket.emit('bridge:response', {
                        requestId,
                        response
                    });
                });
            });
            // Forward regular events from relay to local (no callback)
            this.relaySocket.onAny((event, ...args) => {
                // Skip internal events and bridge events
                if (event.startsWith('$') || event.startsWith('relay:') || event.startsWith('bridge:'))
                    return;
                this.localSocket.emit(event, ...args);
            });
            // Forward events from local to relay
            this.localSocket.onAny((event, ...args) => {
                // Skip internal events
                if (event.startsWith('$'))
                    return;
                this.relaySocket.emit(event, ...args);
            });
        });
        this.localSocket.on('connect_error', (error) => {
            console.error('[RelayClient] Local connection error:', error.message);
        });
    }
    getInfo() {
        return this.relayInfo;
    }
    getUrl() {
        return this.relayInfo?.url || '';
    }
    getConnectUrl() {
        return this.relayInfo?.connectUrl || '';
    }
    getSessionId() {
        return this.relayInfo?.sessionId || '';
    }
    isConnected() {
        return this.relaySocket?.connected || false;
    }
    getReconnectAttempts() {
        return this.reconnectAttempts;
    }
    disconnect() {
        this.localSocket?.disconnect();
        this.relaySocket?.disconnect();
        this.relayInfo = null;
    }
    // Force reconnect
    reconnect() {
        this.disconnect();
        return this.connect();
    }
}
