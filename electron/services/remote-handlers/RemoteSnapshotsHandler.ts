import { ipcMain, BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';

export class RemoteSnapshotsHandler {
  constructor() {}

  registerHandlers(socket: Socket) {
    // Handle snapshot capture
    socket.on('snapshot:capture', async (request, callback) => {
      try {
        const { name, trigger, ideState } = request.payload;
        
        // Trigger the desktop snapshot capture
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-capture-response', (event, response) => {
            resolve(response);
          });
          
          // Send to the main window
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-capture', {
              name,
              trigger,
              ideState
            });
          }
        });
        
        callback({
          success: true,
          data: result
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] Capture error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle snapshot list
    socket.on('snapshot:list', async (request, callback) => {
      try {
        const { allBranches, branch } = request.payload;
        
        // Get snapshots from desktop
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-list-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-list', {
              allBranches,
              branch
            });
          }
        });
        
        callback({
          success: true,
          data: result
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] List error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          data: []
        });
      }
    });

    // Handle snapshot restore
    socket.on('snapshot:restore', async (request, callback) => {
      try {
        const { snapshotId, options } = request.payload;
        
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-restore-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-restore', {
              snapshotId,
              options
            });
          }
        });
        
        callback({
          success: true,
          ideState: result
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] Restore error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle snapshot delete
    socket.on('snapshot:delete', async (request, callback) => {
      try {
        const { snapshotId, branch } = request.payload;
        
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-delete-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-delete', {
              snapshotId,
              branch
            });
          }
        });
        
        callback({
          success: true
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] Delete error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle snapshot update
    socket.on('snapshot:update', async (request, callback) => {
      try {
        const { snapshot } = request.payload;
        
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-update-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-update', {
              snapshot
            });
          }
        });
        
        callback({
          success: true
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] Update error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle snapshot content requests
    socket.on('snapshot:content', async (request, callback) => {
      try {
        const { hash, projectPath } = request.payload;
        
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-content-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-content', {
              hash,
              projectPath
            });
          }
        });
        
        callback({
          success: true,
          data: result
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] Content error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle snapshot getDiff requests
    socket.on('snapshot:getDiff', async (request, callback) => {
      try {
        const { hash, projectPath } = request.payload;
        
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-getDiff-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-getDiff', {
              hash,
              projectPath
            });
          }
        });
        
        callback({
          success: true,
          data: result
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] GetDiff error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle snapshot scanProjectFiles requests
    socket.on('snapshot:scanProjectFiles', async (request, callback) => {
      try {
        const { projectPath } = request.payload;
        
        const result = await new Promise((resolve) => {
          ipcMain.once('snapshots-scanProjectFiles-response', (event, response) => {
            resolve(response);
          });
          
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('remote-snapshot-scanProjectFiles', {
              projectPath
            });
          }
        });
        
        callback({
          success: true,
          data: result
        });
      } catch (error) {
        console.error('[RemoteSnapshotsHandler] ScanProjectFiles error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }
}