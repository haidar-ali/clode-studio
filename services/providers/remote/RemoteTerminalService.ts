/**
 * Remote Terminal Service
 * Implements terminal operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { 
  ITerminalService, 
  TerminalOptions, 
  TerminalInfo, 
  TerminalState 
} from '../../interfaces/ITerminalService.js';

export class RemoteTerminalService implements ITerminalService {
  private eventHandlers = new Map<string, Set<Function>>();
  
  constructor(private getSocket: () => Socket | null) {}
  
  private async emit(event: string, payload?: any): Promise<any> {
    const socket = this.getSocket();
    if (!socket || !socket.connected) {
      throw new Error('Not connected to remote server');
    }
    
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${event}`));
      }, 10000); // 10 second timeout
      
      // Format request according to RemoteRequest interface
      const request = {
        id: requestId,
        payload: payload || {}
      };
      
      console.log(`[RemoteTerminalService] Sending ${event}:`, request);
      
      socket.emit(event, request, (response: any) => {
        clearTimeout(timeout);
        console.log(`[RemoteTerminalService] Response for ${event}:`, response);
        
        if (!response) {
          console.error(`[RemoteTerminalService] No response for ${event}`);
          reject(new Error(`No response from server for ${event}`));
        } else if (response.error) {
          const errorMessage = typeof response.error === 'string' 
            ? response.error 
            : response.error.message || JSON.stringify(response.error);
          console.error(`[RemoteTerminalService] Error for ${event}:`, errorMessage);
          reject(new Error(errorMessage));
        } else if (response.success === false) {
          const errorMessage = response.error?.message || response.message || `Failed to execute ${event}`;
          console.error(`[RemoteTerminalService] Failed ${event}:`, errorMessage);
          reject(new Error(errorMessage));
        } else {
          resolve(response.data !== undefined ? response.data : response);
        }
      });
    });
  }
  
  // Terminal lifecycle
  async createTerminal(options: TerminalOptions): Promise<string> {
    console.log('[RemoteTerminalService] Creating terminal with options:', options);
    const response = await this.emit('terminal:create', options);
    const terminalId = response.terminalId;
    console.log('[RemoteTerminalService] Created terminal:', terminalId);
    return terminalId;
  }
  
  async destroyTerminal(terminalId: string): Promise<void> {
    console.log('[RemoteTerminalService] Destroying terminal:', terminalId);
    await this.emit('terminal:destroy', { terminalId });
    // Clean up any event handlers for this terminal
    this.eventHandlers.delete(`terminal:data:${terminalId}`);
    this.eventHandlers.delete(`terminal:exit:${terminalId}`);
  }
  
  // Terminal interaction
  async writeToTerminal(terminalId: string, data: string): Promise<void> {
    await this.emit('terminal:write', { terminalId, data });
  }
  
  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    await this.emit('terminal:resize', { terminalId, cols, rows });
  }
  
  // Terminal state
  async getTerminalInfo(terminalId: string): Promise<TerminalInfo | null> {
    return await this.emit('terminal:info', { terminalId });
  }
  
  async listActiveTerminals(): Promise<TerminalInfo[]> {
    console.log('[RemoteTerminalService] Listing active terminals');
    try {
      const terminals = await this.emit('terminal:list');
      console.log('[RemoteTerminalService] Active terminals:', terminals);
      return terminals || [];
    } catch (error) {
      console.error('[RemoteTerminalService] Failed to list terminals:', error);
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }
  }
  
  // Event handlers
  onTerminalData(terminalId: string, callback: (data: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) {
      return () => {};
    }
    
    // Desktop sends data as TERMINAL_DATA event with { terminalId, data }
    const eventName = 'TERMINAL_DATA';
    const handler = (event: { terminalId: string; data: Buffer | string }) => {
      if (event.terminalId === terminalId) {
        // Convert Buffer to string if needed
        const dataStr = event.data instanceof Buffer 
          ? event.data.toString('utf8') 
          : event.data;
        callback(dataStr);
      }
    };
    
    // Store handler for cleanup
    if (!this.eventHandlers.has(`${eventName}:${terminalId}`)) {
      this.eventHandlers.set(`${eventName}:${terminalId}`, new Set());
    }
    this.eventHandlers.get(`${eventName}:${terminalId}`)!.add(handler);
    
    // Listen for data events
    socket.on(eventName, handler);
    
    // Return cleanup function
    return () => {
      socket.off(eventName, handler);
      const handlers = this.eventHandlers.get(`${eventName}:${terminalId}`);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(`${eventName}:${terminalId}`);
        }
      }
    };
  }
  
  onTerminalExit(terminalId: string, callback: (code: number) => void): () => void {
    const socket = this.getSocket();
    if (!socket) {
      return () => {};
    }
    
    // Desktop sends exit as TERMINAL_EXIT event with { terminalId, code, signal }
    const eventName = 'TERMINAL_EXIT';
    const handler = (event: { terminalId: string; code: number; signal?: string }) => {
      if (event.terminalId === terminalId) {
        callback(event.code);
      }
    };
    
    // Store handler for cleanup
    if (!this.eventHandlers.has(`${eventName}:${terminalId}`)) {
      this.eventHandlers.set(`${eventName}:${terminalId}`, new Set());
    }
    this.eventHandlers.get(`${eventName}:${terminalId}`)!.add(handler);
    
    // Listen for exit events
    socket.on(eventName, handler);
    
    // Return cleanup function
    return () => {
      socket.off(eventName, handler);
      const handlers = this.eventHandlers.get(`${eventName}:${terminalId}`);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(`${eventName}:${terminalId}`);
        }
      }
    };
  }
  
  // Session management (for remote)
  async saveTerminalState(terminalId: string): Promise<TerminalState> {
    return await this.emit('terminal:saveState', terminalId);
  }
  
  async restoreTerminalState(state: TerminalState): Promise<string> {
    return await this.emit('terminal:restoreState', state);
  }
  
  // Legacy methods for backward compatibility
  async create(cols: number, rows: number): Promise<string> {
    return this.createTerminal({ cols, rows });
  }
  
  async write(terminalId: string, data: string): Promise<void> {
    return this.writeToTerminal(terminalId, data);
  }
  
  async resize(terminalId: string, cols: number, rows: number): Promise<void> {
    return this.resizeTerminal(terminalId, cols, rows);
  }
  
  async destroy(terminalId: string): Promise<void> {
    return this.destroyTerminal(terminalId);
  }
  
  onData(terminalId: string, callback: (data: string) => void): () => void {
    return this.onTerminalData(terminalId, callback);
  }
  
  onExit(terminalId: string, callback: (code: number) => void): () => void {
    return this.onTerminalExit(terminalId, callback);
  }
}