/**
 * Remote file operation handler
 * Processes file requests from Socket.IO clients
 */
import type { BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  FileProtocol, 
  RemoteRequest, 
  RemoteResponse,
  Permission
} from '../remote-protocol.js';
import type { RemoteSession } from '../remote-session-manager.js';
import { RemoteSessionManager } from '../remote-session-manager.js';

export class RemoteFileHandler {
  constructor(
    private mainWindow: BrowserWindow,
    private sessionManager: RemoteSessionManager
  ) {}
  
  /**
   * Register file operation handlers on a socket
   */
  registerHandlers(socket: Socket): void {
    // Read file
    socket.on('file:read', async (request: RemoteRequest<FileProtocol.ReadRequest>, callback) => {
      await this.handleFileRead(socket, request, callback);
    });
    
    // Write file
    socket.on('file:write', async (request: RemoteRequest<FileProtocol.WriteRequest>, callback) => {
      await this.handleFileWrite(socket, request, callback);
    });
    
    // List directory
    socket.on('file:list', async (request: RemoteRequest<FileProtocol.ListRequest>, callback) => {
      await this.handleFileList(socket, request, callback);
    });
    
    // Delete file
    socket.on('file:delete', async (request: RemoteRequest<FileProtocol.DeleteRequest>, callback) => {
      await this.handleFileDelete(socket, request, callback);
    });
    
    // Get file stats
    socket.on('file:stat', async (request: RemoteRequest<FileProtocol.StatRequest>, callback) => {
      await this.handleFileStat(socket, request, callback);
    });
    
    // Watch file
    socket.on('file:watch', async (request: RemoteRequest<FileProtocol.WatchRequest>, callback) => {
      await this.handleFileWatch(socket, request, callback);
    });
  }
  
  private async handleFileRead(
    socket: Socket,
    request: RemoteRequest<FileProtocol.ReadRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      // Check session and permissions
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.FILE_READ)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'File read permission required' }
        });
      }
      
      // Validate path (security check)
      const safePath = this.validatePath(request.payload.path, session);
      if (!safePath) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid or forbidden path' }
        });
      }
      
      // Read file directly
      const content = await fs.readFile(safePath, request.payload.encoding || 'utf8');
      
      callback({
        id: request.id,
        success: true,
        data: content
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'READ_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleFileWrite(
    socket: Socket,
    request: RemoteRequest<FileProtocol.WriteRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      // Check session and permissions
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.FILE_WRITE)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'File write permission required' }
        });
      }
      
      // Validate path
      const safePath = this.validatePath(request.payload.path, session);
      if (!safePath) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid or forbidden path' }
        });
      }
      
      // Write file directly
      await fs.writeFile(safePath, request.payload.content, request.payload.encoding || 'utf8');
      
      callback({
        id: request.id,
        success: true
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'WRITE_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleFileList(
    socket: Socket,
    request: RemoteRequest<FileProtocol.ListRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.FILE_READ)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'File read permission required' }
        });
      }
      
      const safePath = this.validatePath(request.payload.path, session);
      if (!safePath) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid or forbidden path' }
        });
      }
      
      // List directory directly
      const entries = await fs.readdir(safePath, { withFileTypes: true });
      const result = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(safePath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            size: stats.size,
            modified: stats.mtime
          };
        } catch (error) {
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            error: (error as Error).message
          };
        }
      }));
      
      callback({
        id: request.id,
        success: true,
        data: result
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'LIST_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleFileDelete(
    socket: Socket,
    request: RemoteRequest<FileProtocol.DeleteRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.FILE_DELETE)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'File delete permission required' }
        });
      }
      
      const safePath = this.validatePath(request.payload.path, session);
      if (!safePath) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid or forbidden path' }
        });
      }
      
      // Delete file directly
      const stats = await fs.stat(safePath);
      if (stats.isDirectory()) {
        await fs.rm(safePath, { recursive: true, force: true });
      } else {
        await fs.unlink(safePath);
      }
      
      callback({
        id: request.id,
        success: true
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'DELETE_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleFileStat(
    socket: Socket,
    request: RemoteRequest<FileProtocol.StatRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.FILE_READ)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'File read permission required' }
        });
      }
      
      const safePath = this.validatePath(request.payload.path, session);
      if (!safePath) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid or forbidden path' }
        });
      }
      
      // Get file stats directly
      const stats = await fs.stat(safePath);
      const result = {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        mode: stats.mode,
        path: safePath
      };
      
      callback({
        id: request.id,
        success: true,
        data: result
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'STAT_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  private async handleFileWatch(
    socket: Socket,
    request: RemoteRequest<FileProtocol.WatchRequest>,
    callback: (response: RemoteResponse) => void
  ): Promise<void> {
    try {
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'NO_SESSION', message: 'No active session' }
        });
      }
      
      if (!this.sessionManager.hasPermission(session, Permission.FILE_READ)) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'File read permission required' }
        });
      }
      
      const safePath = this.validatePath(request.payload.path, session);
      if (!safePath) {
        return callback({
          id: request.id,
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid or forbidden path' }
        });
      }
      
      // Set up file watcher through IPC
      // TODO: Implement file watching with event forwarding
      
      callback({
        id: request.id,
        success: true,
        data: { watching: safePath }
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'WATCH_ERROR', 
          message: (error as Error).message 
        }
      });
    }
  }
  
  /**
   * Validate and sanitize file path for security
   */
  private validatePath(requestPath: string, session: RemoteSession): string | null {
    // Normalize and resolve path
    const normalized = path.normalize(requestPath);
    
    // TODO: Implement workspace-based path restrictions
    // For now, prevent access to sensitive directories
    const forbidden = [
      '/etc',
      '/sys',
      '/proc',
      process.env.HOME + '/.ssh',
      process.env.HOME + '/.aws',
      process.env.HOME + '/.config'
    ];
    
    for (const dir of forbidden) {
      if (normalized.startsWith(dir)) {
        return null;
      }
    }
    
    // Prevent directory traversal
    if (normalized.includes('..')) {
      return null;
    }
    
    return normalized;
  }
}