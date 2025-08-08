/**
 * Remote Storage Service
 * Implements storage operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { IStorageService } from '../../interfaces/IStorageService.js';

export class RemoteStorageService implements IStorageService {
  constructor(private getSocket: () => Socket | null) {}
  
  // TODO: Implement all storage methods via Socket.IO
  async get(key: string): Promise<any> {
    throw new Error('Not implemented');
  }
  
  async set(key: string, value: any): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async remove(key: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async clear(): Promise<void> {
    throw new Error('Not implemented');
  }
}