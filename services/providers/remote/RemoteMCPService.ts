/**
 * Remote MCP Service
 * Implements MCP operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { IMCPService } from '../../interfaces/IMCPService.js';

export class RemoteMCPService implements IMCPService {
  constructor(private getSocket: () => Socket | null) {}
  
  // TODO: Implement all MCP methods via Socket.IO
  async listServers(): Promise<any[]> {
    throw new Error('Not implemented');
  }
  
  async startServer(serverId: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async stopServer(serverId: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async getServerStatus(serverId: string): Promise<any> {
    throw new Error('Not implemented');
  }
}