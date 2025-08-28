import type { BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';
import type { RemoteSessionManager } from '../remote-session-manager';

export declare class RemoteClaudeHandler {
  constructor(mainWindow: BrowserWindow, sessionManager: RemoteSessionManager);
  registerHandlers(socket: Socket): void;
  disconnectSocket(socketId: string): void;
  getBootstrapData(instanceId: string): any;
  cleanupSocketInstances(socketId: string): void;
}