/**
 * Remote Claude Service
 * Implements Claude operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { IClaudeService } from '../../interfaces/IClaudeService.js';
import type { RemoteRequest, RemoteResponse } from '../../../electron/services/remote-protocol.js';

export class RemoteClaudeService implements IClaudeService {
  constructor(private getSocket: () => Socket | null) {}
  
  private async request<T, R>(event: string, payload: T): Promise<R> {
    const socket = this.getSocket();
    if (!socket) {
      throw new Error('Socket not initialized. Please ensure remote connection is established.');
    }
    if (!socket.connected) {
      throw new Error('Not connected to remote server. Please check your connection status.');
    }
    
    return new Promise((resolve, reject) => {
      const request: RemoteRequest<T> = {
        id: `req-${Date.now()}-${Math.random()}`,
        payload
      };
      
      // Add timeout handling
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${event} after 30 seconds`));
      }, 30000);
      
      socket.emit(event, request, (response: RemoteResponse<R>) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve(response.data!);
        } else {
          console.error(`[RemoteClaudeService] Request failed for ${event}:`, response.error);
          reject(new Error(response.error?.message || `Request failed for ${event}`));
        }
      });
    });
  }
  
  async spawn(instanceId: string, workingDirectory: string, name?: string): Promise<{ pid: number }> {
    const result = await this.request<any, any>('claude:spawn', {
      instanceId,
      workingDirectory,
      instanceName: name,
      config: {
        // Add any config needed for spawn
      }
    });
    // The result has a 'success' field and 'pid' is nested
    return { pid: result.success ? (result.pid || -1) : -1 };
  }
  
  async stop(instanceId: string): Promise<void> {
    await this.request('claude:stop', { instanceId });
  }
  
  async send(instanceId: string, data: string): Promise<void> {
    await this.request('claude:send', { instanceId, data });
  }
  
  async resize(instanceId: string, cols: number, rows: number): Promise<void> {
    await this.request('claude:resize', { instanceId, cols, rows });
  }
  
  async clear(instanceId: string): Promise<void> {
    // Send clear sequence
    await this.send(instanceId, '\x1b[2J\x1b[H');
  }
  
  onData(instanceId: string, callback: (data: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    
    const handler = (event: any) => {
      if (event.instanceId === instanceId) {
        callback(event.data);
      }
    };
    
    socket.on('claude:output', handler);
    return () => socket.off('claude:output', handler);
  }
  
  onExit(instanceId: string, callback: (code: number) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    
    const handler = (event: any) => {
      if (event.instanceId === instanceId) {
        callback(event.code || 0);
      }
    };
    
    socket.on('claude:exit', handler);
    return () => socket.off('claude:exit', handler);
  }
  
  onOutput(instanceId: string, callback: (data: string) => void): () => void {
    return this.onData(instanceId, callback);
  }
  
  onError(instanceId: string, callback: (error: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    
    const handler = (event: any) => {
      if (event.instanceId === instanceId) {
        callback(event.error);
      }
    };
    
    socket.on('claude:error', handler);
    return () => socket.off('claude:error', handler);
  }
  
  async listDesktopInstances(): Promise<any[]> {
    return this.request<void, any[]>('claude:listDesktop', undefined);
  }
  
  async getActiveInstances(): Promise<any[]> {
    return this.request<void, any[]>('claude:getInstances', undefined);
  }
  
  async isInstanceActive(instanceId: string): Promise<boolean> {
    try {
      const instances = await this.getActiveInstances();
      return instances.some(inst => inst.instanceId === instanceId);
    } catch (error) {
      console.error('[RemoteClaudeService] Failed to check instance status:', error);
      return false;
    }
  }
  
  async getClaudeBuffer(instanceId: string): Promise<string | null> {
    try {
      const result = await this.request<{ instanceId: string }, { buffer?: string }>('claude:getBuffer', { instanceId });
      return result.buffer || null;
    } catch (error) {
      console.error('[RemoteClaudeService] Failed to get Claude buffer:', error);
      return null;
    }
  }
  
  async configureTerminal(instanceId: string, cols: number, rows: number): Promise<void> {
    try {
      await this.request('claude:configureTerminal', { instanceId, cols, rows });
    } catch (error) {
      console.error('[RemoteClaudeService] Failed to configure terminal:', error);
      throw error;
    }
  }
}