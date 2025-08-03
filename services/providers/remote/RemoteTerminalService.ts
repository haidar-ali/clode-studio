/**
 * Remote Terminal Service
 * Implements terminal operations via Socket.IO
 */
import type { Socket } from 'socket.io-client';
import type { ITerminalService } from '../../interfaces/ITerminalService.js';

export class RemoteTerminalService implements ITerminalService {
  constructor(private getSocket: () => Socket | null) {}
  
  // TODO: Implement all terminal methods via Socket.IO
  async create(cols: number, rows: number): Promise<string> {
    throw new Error('Not implemented');
  }
  
  async write(terminalId: string, data: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async resize(terminalId: string, cols: number, rows: number): Promise<void> {
    throw new Error('Not implemented');
  }
  
  async destroy(terminalId: string): Promise<void> {
    throw new Error('Not implemented');
  }
  
  onData(terminalId: string, callback: (data: string) => void): () => void {
    return () => {};
  }
  
  onExit(terminalId: string, callback: (code: number) => void): () => void {
    return () => {};
  }
}