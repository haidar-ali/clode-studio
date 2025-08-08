import { Socket, io } from 'socket.io-client';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Store from 'electron-store';
import { HttpHandler } from './http-handler.js';

interface RelayInfo {
  sessionId: string;
  url: string;
  token: string;
  connectUrl: string;
}

export class RelayClient extends EventEmitter {
  private relaySocket: Socket | null = null;
  private localSocket: Socket | null = null;
  private relayInfo: RelayInfo | null = null;
  private store: Store;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  private httpHandler: HttpHandler;
  private socketIoPort: number = 3789;  // Socket.IO server port
  
  constructor(
    private relayUrl: string = process.env.RELAY_URL || 'wss://relay.clode.studio',
    private localPort: number = 3000  // HTTP proxy port for Nuxt UI
  ) {
    super();
    this.store = new Store();
    this.httpHandler = new HttpHandler(this.localPort);
  }
  
  async connect(): Promise<RelayInfo> {
    return new Promise((resolve, reject) => {
      // Get or create device ID
      let deviceId = (this.store as any).get('deviceId') as string;
      if (!deviceId) {
        deviceId = uuidv4();
        (this.store as any).set('deviceId', deviceId);
      }
      
      // Connect to relay server
      console.log(`[RelayClient] Connecting to relay: ${this.relayUrl}`);
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
      this.relaySocket.once('registered', (info: RelayInfo) => {
        console.log(`[RelayClient] Registered with session: ${info.sessionId}`);
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
      this.relaySocket.once('error', (error: string) => {
        console.error(`[RelayClient] Connection error: ${error}`);
        reject(new Error(error));
      });
      
      // Handle reconnection
      this.relaySocket.on('reconnect', (attemptNumber: number) => {
        console.log(`[RelayClient] Reconnected after ${attemptNumber} attempts`);
        this.emit('reconnected');
      });
      
      this.relaySocket.on('reconnect_attempt', (attemptNumber: number) => {
        console.log(`[RelayClient] Reconnection attempt ${attemptNumber}`);
        this.reconnectAttempts = attemptNumber;
      });
      
      this.relaySocket.on('reconnect_failed', () => {
        console.error('[RelayClient] Failed to reconnect after maximum attempts');
        this.emit('connection_lost');
      });
      
      // Handle disconnect
      this.relaySocket.on('disconnect', (reason: string) => {
        console.log(`[RelayClient] Disconnected: ${reason}`);
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't auto-reconnect
          this.relaySocket?.connect();
        }
      });
    });
  }
  
  private setupLocalBridge() {
    if (!this.relaySocket) return;
    
    // Connect to local Socket.IO server (port 3789, not HTTP port 3000)
    console.log(`[RelayClient] Connecting to local Socket.IO server on port ${this.socketIoPort}`);
    this.localSocket = io(`http://localhost:${this.socketIoPort}`, {
      transports: ['websocket'],
      reconnection: true
    });
    
    this.localSocket.on('connect', () => {
      console.log('[RelayClient] Connected to local server');
      
      // Request-response tracking for callback preservation
      const pendingRequests = new Map<string, any>();
      
      // Handle special request-response pattern from relay
      this.relaySocket!.on('bridge:request', (data: any) => {
        const { requestId, event, args } = data;
        console.log(`[RelayClient] Relay→Local request: ${event} (${requestId})`);
        
        // Emit to local with callback that sends response back through relay
        this.localSocket!.emit(event, ...args, (response: any) => {
          console.log(`[RelayClient] Local response for ${event} (${requestId})`);
          this.relaySocket!.emit('bridge:response', {
            requestId,
            response
          });
        });
      });
      
      // Forward regular events from relay to local (no callback)
      this.relaySocket!.onAny((event, ...args) => {
        // Skip internal events and bridge events
        if (event.startsWith('$') || event.startsWith('relay:') || event.startsWith('bridge:')) return;
        
        console.log(`[RelayClient] Relay→Local: ${event}`);
        this.localSocket!.emit(event, ...args);
      });
      
      // Forward events from local to relay
      this.localSocket!.onAny((event, ...args) => {
        // Skip internal events
        if (event.startsWith('$')) return;
        
        console.log(`[RelayClient] Local→Relay: ${event}`);
        this.relaySocket!.emit(event, ...args);
      });
    });
    
    this.localSocket.on('connect_error', (error) => {
      console.error('[RelayClient] Local connection error:', error.message);
    });
  }
  
  getInfo(): RelayInfo | null {
    return this.relayInfo;
  }
  
  getUrl(): string {
    return this.relayInfo?.url || '';
  }
  
  getConnectUrl(): string {
    return this.relayInfo?.connectUrl || '';
  }
  
  getSessionId(): string {
    return this.relayInfo?.sessionId || '';
  }
  
  isConnected(): boolean {
    return this.relaySocket?.connected || false;
  }
  
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
  
  disconnect() {
    console.log('[RelayClient] Disconnecting...');
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