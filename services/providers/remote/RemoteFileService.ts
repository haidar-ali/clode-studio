/**
 * Remote File Service
 * Implements file operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { IFileService } from '../../interfaces/IFileService.js';
import type { RemoteRequest, RemoteResponse } from '../../../electron/services/remote-protocol.js';

export class RemoteFileService implements IFileService {
  constructor(private getSocket: () => Socket | null) {}
  
  private async request<T, R>(event: string, payload: T): Promise<R> {
    const socket = this.getSocket();
    console.log('[RemoteFileService] Socket check:', {
      hasSocket: !!socket,
      connected: socket?.connected,
      id: socket?.id
    });
    if (!socket?.connected) {
      throw new Error('Not connected to remote server');
    }
    
    return new Promise((resolve, reject) => {
      const request: RemoteRequest<T> = {
        id: `req-${Date.now()}-${Math.random()}`,
        payload
      };
      
      socket.emit(event, request, (response: RemoteResponse<R>) => {
        if (response.success) {
          resolve(response.data!);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
  }
  
  async readFile(path: string): Promise<string> {
    return this.request('file:read', { path });
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    await this.request('file:write', { path, content });
  }
  
  async deleteFile(path: string): Promise<void> {
    await this.request('file:delete', { path });
  }
  
  async createDirectory(path: string): Promise<void> {
    await this.request('file:mkdir', { path });
  }
  
  async listDirectory(path: string): Promise<any[]> {
    return this.request('file:list', { path });
  }
  
  async exists(path: string): Promise<boolean> {
    try {
      await this.request('file:stat', { path });
      return true;
    } catch {
      return false;
    }
  }
  
  async getFileStats(path: string): Promise<any> {
    return this.request('file:stat', { path });
  }
  
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await this.request('file:rename', { oldPath, newPath });
  }
  
  onFileChanged(callback: (path: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    
    socket.on('file:changed', callback);
    return () => socket.off('file:changed', callback);
  }
  
  onFileDeleted(callback: (path: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    
    socket.on('file:deleted', callback);
    return () => socket.off('file:deleted', callback);
  }
}