/**
 * Remote Git Service
 * Implements git operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { IGitService } from '../../interfaces/IGitService.js';

export class RemoteGitService implements IGitService {
  constructor(private getSocket: () => Socket | null) {}
  
  // TODO: Implement all git methods via Socket.IO
  async status(): Promise<any> {
    throw new Error('Not implemented');
  }
  
  async add(files: string[]): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async commit(message: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async push(): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async pull(): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async getCurrentBranch(): Promise<string> {
    throw new Error('Not implemented');
  }
  
  async getBranches(): Promise<string[]> {
    throw new Error('Not implemented');
  }
  
  async createBranch(name: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async checkoutBranch(name: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async stash(): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async stashPop(): Promise<void> {
    throw new Error('Not implemented');
  }
}