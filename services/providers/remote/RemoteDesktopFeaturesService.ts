/**
 * Remote Desktop Features Service
 * Stores and retrieves desktop features via the remote server
 */
import type { Socket } from 'socket.io-client';
import type { RemoteRequest, RemoteResponse } from '../../../electron/services/remote-protocol.js';

export interface DesktopFeatures {
  hooks: any[];
  commands: {
    projectCommands: any[];
    personalCommands: any[];
  };
  mcp: {
    servers: any[];
  };
  lastSync: number;
}

export class RemoteDesktopFeaturesService {
  constructor(private getSocket: () => Socket | null) {}
  
  private async request<T, R>(event: string, payload: T): Promise<R> {
    const socket = this.getSocket();
    if (!socket?.connected) {
      throw new Error('Not connected to remote server');
    }
    
    return new Promise((resolve, reject) => {
      const request: RemoteRequest<T> = {
        id: `req-${Date.now()}-${Math.random()}`,
        payload
      };
      
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${event}`));
      }, 10000);
      
      socket.emit(event, request, (response: RemoteResponse<R>) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve(response.data!);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
  }
  
  async storeFeatures(features: DesktopFeatures): Promise<void> {
    console.log('[RemoteDesktopFeaturesService] Storing desktop features on server');
    await this.request('desktop:features:store', features);
  }
  
  async getFeatures(): Promise<DesktopFeatures | null> {
    console.log('[RemoteDesktopFeaturesService] Getting desktop features from server');
    try {
      return await this.request('desktop:features:get', {});
    } catch (error) {
      console.error('[RemoteDesktopFeaturesService] Failed to get features:', error);
      return null;
    }
  }
}