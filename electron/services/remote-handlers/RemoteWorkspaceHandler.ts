/**
 * Remote Workspace Handler
 * Handles workspace operations for remote clients
 */
import type { BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';
import { 
  RemoteRequest, 
  RemoteResponse,
  Permission
} from '../remote-protocol.js';
import { RemoteSessionManager } from '../remote-session-manager.js';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class RemoteWorkspaceHandler {
  constructor(
    private mainWindow: BrowserWindow,
    private sessionManager: RemoteSessionManager
  ) {}
  
  /**
   * Register workspace handlers on a socket
   */
  registerHandlers(socket: Socket): void {
    // Get workspace information
    socket.on('workspace:get', async (request: RemoteRequest<void>, callback) => {
      await this.handleGetWorkspace(socket, request, callback);
    });
  }
  
  /**
   * Handle get workspace request
   */
  private async handleGetWorkspace(
    socket: Socket,
    request: RemoteRequest<void>,
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
      
      // In headless mode, get workspace from config
      if (!this.mainWindow) {
        const Store = (await import('electron-store')).default;
        const store = new Store();
        const workspacePath = (store as any).get('workspacePath') || process.cwd();
        
        return callback({
          id: request.id,
          success: true,
          data: {
            currentPath: workspacePath,
            workspaceName: path.basename(workspacePath),
            hasWorkspace: true
          }
        });
      }
      
      // Get workspace path from the main window
      // First try to get from the workspace manager state
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (() => {
          // Try to get from workspace state
          const workspaceState = window.workspaceState;
          if (workspaceState && workspaceState.currentWorkspacePath) {
            return {
              currentPath: workspaceState.currentWorkspacePath.value,
              workspaceName: workspaceState.workspaceName.value,
              hasWorkspace: workspaceState.hasWorkspace.value
            };
          }
          
          // Fallback to store
          const workspaceStore = window.useWorkspaceStore?.();
          if (!workspaceStore) return null;
          
          return {
            currentPath: workspaceStore.currentPath || workspaceStore.currentWorkspacePath,
            workspaceName: workspaceStore.workspaceName,
            hasWorkspace: workspaceStore.hasWorkspace
          };
        })();
      `).catch(() => null);
      
      // If we couldn't get it from the store, try from global variable
      let workspacePath = result?.currentPath;
      if (!workspacePath) {
        try {
          // Try to get from global variable that might be set by the app
          const globalResult = await this.mainWindow.webContents.executeJavaScript(`
            (() => {
              // Check various possible locations
              if (global.currentWorkspacePath) return global.currentWorkspacePath;
              if (window.__workspacePath) return window.__workspacePath;
              if (window.electronAPI?.workspace?.getPath) {
                return window.electronAPI.workspace.getPath();
              }
              return null;
            })();
          `);
          
          if (globalResult) {
            workspacePath = globalResult;
          }
        } catch (e) {
          console.error('Failed to get workspace from globals:', e);
        }
      }
      
      // Try to get from the app's stored workspace
      if (!workspacePath) {
        // Use already imported modules
        
        try {
          const userDataPath = app.getPath('userData');
          const storePath = path.join(userDataPath, 'config.json');
          
          if (fs.existsSync(storePath)) {
            const storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            workspacePath = storeData.workspacePath || storeData['workspace.lastPath'];
          }
        } catch (e) {
          console.error('Failed to read store file:', e);
        }
      }
      
      // Last resort - use home directory
      if (!workspacePath) {
        console.warn('No workspace found, defaulting to home directory');
        workspacePath = app.getPath('home');
      }
      
      callback({
        id: request.id,
        success: true,
        data: {
          path: workspacePath,
          name: result?.workspaceName || workspacePath.split('/').pop() || 'Workspace',
          hasWorkspace: result?.hasWorkspace ?? true
        }
      });
    } catch (error) {
      callback({
        id: request.id,
        success: false,
        error: { 
          code: 'WORKSPACE_ERROR', 
          message: error instanceof Error ? error.message : 'Failed to get workspace' 
        }
      });
    }
  }
}