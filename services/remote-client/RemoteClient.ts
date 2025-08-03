/**
 * Remote client for connecting to Clode Studio server
 * This can be used by web apps or other clients to access Clode Studio remotely
 */
import { io, Socket } from 'socket.io-client';
import { 
  RemoteRequest, 
  RemoteResponse, 
  FileProtocol,
  TerminalProtocol,
  RemoteEvent 
} from '../../electron/services/remote-protocol';

export interface RemoteClientOptions {
  url: string;
  auth?: {
    token?: string;
    apiKey?: string;
    username?: string;
  };
  autoConnect?: boolean;
}

export class RemoteClient {
  private socket: Socket | null = null;
  private requestCounter = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();
  
  constructor(private options: RemoteClientOptions) {
    if (options.autoConnect !== false) {
      this.connect();
    }
  }
  
  /**
   * Connect to the remote server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.options.url, {
        auth: this.options.auth,
        transports: ['websocket', 'polling']
      });
      
      // Connection events
      this.socket.on('connect', () => {
        console.log('Connected to remote server');
      });
      
      this.socket.on('connection:ready', (data) => {
        console.log('Session ready:', data);
        resolve();
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        reject(error);
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
      });
      
      // Error events
      this.socket.on(RemoteEvent.CONNECTION_ERROR, (error) => {
        console.error('Server error:', error);
      });
      
      this.socket.on(RemoteEvent.SESSION_EXPIRED, () => {
        console.warn('Session expired, reconnecting...');
        this.socket?.connect();
      });
    });
  }
  
  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
  
  /**
   * Make a request to the server
   */
  private request<TRequest, TResponse>(
    event: string, 
    payload: TRequest
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }
      
      const requestId = `req-${++this.requestCounter}`;
      const request: RemoteRequest<TRequest> = {
        id: requestId,
        payload
      };
      
      // Set up response handler
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);
      
      // Send request with callback
      this.socket.emit(event, request, (response: RemoteResponse<TResponse>) => {
        clearTimeout(timeout);
        
        if (response.success) {
          resolve(response.data!);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
  }
  
  /**
   * File operations
   */
  async readFile(path: string, encoding?: BufferEncoding): Promise<string> {
    return this.request<FileProtocol.ReadRequest, string>('file:read', {
      path,
      encoding
    });
  }
  
  async writeFile(path: string, content: string, encoding?: BufferEncoding): Promise<void> {
    return this.request<FileProtocol.WriteRequest, void>('file:write', {
      path,
      content,
      encoding
    });
  }
  
  async listDirectory(path: string): Promise<any[]> {
    return this.request<FileProtocol.ListRequest, any[]>('file:list', {
      path,
      recursive: false
    });
  }
  
  async deleteFile(path: string): Promise<void> {
    return this.request<FileProtocol.DeleteRequest, void>('file:delete', {
      path
    });
  }
  
  async getFileStats(path: string): Promise<any> {
    return this.request<FileProtocol.StatRequest, any>('file:stat', {
      path
    });
  }
  
  /**
   * Terminal operations
   */
  async createTerminal(cols: number = 80, rows: number = 24, cwd?: string): Promise<string> {
    const response = await this.request<TerminalProtocol.CreateRequest, TerminalProtocol.CreateResponse>('terminal:create', {
      cols,
      rows,
      cwd
    });
    
    return response.terminalId;
  }
  
  async writeTerminal(terminalId: string, data: string): Promise<void> {
    return this.request<TerminalProtocol.WriteRequest, void>('terminal:write', {
      terminalId,
      data
    });
  }
  
  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    return this.request<TerminalProtocol.ResizeRequest, void>('terminal:resize', {
      terminalId,
      cols,
      rows
    });
  }
  
  async destroyTerminal(terminalId: string): Promise<void> {
    return this.request<TerminalProtocol.DestroyRequest, void>('terminal:destroy', {
      terminalId
    });
  }
  
  /**
   * Terminal event handlers
   */
  onTerminalData(callback: (event: { terminalId: string; data: Buffer }) => void): () => void {
    this.socket?.on(RemoteEvent.TERMINAL_DATA, callback);
    return () => {
      this.socket?.off(RemoteEvent.TERMINAL_DATA, callback);
    };
  }
  
  onTerminalExit(callback: (event: { terminalId: string; code: number | null }) => void): () => void {
    this.socket?.on(RemoteEvent.TERMINAL_EXIT, callback);
    return () => {
      this.socket?.off(RemoteEvent.TERMINAL_EXIT, callback);
    };
  }
  
  /**
   * Keep connection alive
   */
  startKeepAlive(interval: number = 30000): void {
    setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', (response: any) => {
          // Keep alive
        });
      }
    }, interval);
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  (window as any).ClodeRemoteClient = RemoteClient;
}