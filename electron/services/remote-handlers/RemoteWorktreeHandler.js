import { ipcMain, BrowserWindow } from 'electron';
export class RemoteWorktreeHandler {
    constructor() { }
    registerHandlers(socket) {
        // Handle worktree list
        socket.on('worktree:list', async (request, callback) => {
            try {
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-list-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-list');
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] List error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    data: []
                });
            }
        });
        // Handle worktree sessions
        socket.on('worktree:sessions', async (request, callback) => {
            try {
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-sessions-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-sessions');
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] Sessions error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    data: []
                });
            }
        });
        // Handle worktree switch
        socket.on('worktree:switch', async (request, callback) => {
            try {
                const { worktreePath } = request.payload;
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-switch-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-switch', {
                            worktreePath
                        });
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] Switch error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        // Handle worktree remove
        socket.on('worktree:remove', async (request, callback) => {
            try {
                const { worktreePath, force } = request.payload;
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-remove-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-remove', {
                            worktreePath,
                            force
                        });
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] Remove error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        // Handle worktree lock/unlock
        socket.on('worktree:lock', async (request, callback) => {
            try {
                const { worktreePath, lock } = request.payload;
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-lock-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-lock', {
                            worktreePath,
                            lock
                        });
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] Lock error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        // Handle worktree compare
        socket.on('worktree:compare', async (request, callback) => {
            try {
                const { path1, path2 } = request.payload;
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-compare-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-compare', {
                            path1,
                            path2
                        });
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] Compare error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        // Handle worktree create session
        socket.on('worktree:createSession', async (request, callback) => {
            try {
                const { sessionData } = request.payload;
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-createSession-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-createSession', {
                            sessionData
                        });
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] CreateSession error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        // Handle worktree delete session
        socket.on('worktree:deleteSession', async (request, callback) => {
            try {
                const { sessionId } = request.payload;
                const result = await new Promise((resolve) => {
                    ipcMain.once('worktree-deleteSession-response', (event, response) => {
                        resolve(response);
                    });
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    if (mainWindow) {
                        mainWindow.webContents.send('remote-worktree-deleteSession', {
                            sessionId
                        });
                    }
                });
                callback({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('[RemoteWorktreeHandler] DeleteSession error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
    }
}
