import * as pty from 'node-pty';
import { RemoteEvent, Permission } from '../remote-protocol.js';
export class RemoteTerminalHandler {
    mainWindow;
    sessionManager;
    terminals = new Map();
    terminalsBySocket = new Map();
    constructor(mainWindow, sessionManager) {
        this.mainWindow = mainWindow;
        this.sessionManager = sessionManager;
    }
    /**
     * Register terminal operation handlers on a socket
     */
    registerHandlers(socket) {
        // Create terminal
        socket.on('terminal:create', async (request, callback) => {
            await this.handleTerminalCreate(socket, request, callback);
        });
        // Write to terminal
        socket.on('terminal:write', async (request, callback) => {
            await this.handleTerminalWrite(socket, request, callback);
        });
        // Resize terminal
        socket.on('terminal:resize', async (request, callback) => {
            await this.handleTerminalResize(socket, request, callback);
        });
        // Destroy terminal
        socket.on('terminal:destroy', async (request, callback) => {
            await this.handleTerminalDestroy(socket, request, callback);
        });
        // List terminals for current workspace
        socket.on('terminal:list', async (request, callback) => {
            await this.handleTerminalList(socket, request, callback);
        });
    }
    /**
     * Clean up terminals for a disconnected socket
     */
    cleanupSocketTerminals(socketId) {
        const terminalIds = this.terminalsBySocket.get(socketId);
        if (terminalIds) {
            terminalIds.forEach(terminalId => {
                this.destroyTerminal(terminalId);
            });
            this.terminalsBySocket.delete(socketId);
        }
    }
    async handleTerminalCreate(socket, request, callback) {
        try {
            // Check session and permissions
            const session = this.sessionManager.getSessionBySocket(socket.id);
            if (!session) {
                console.error('[RemoteTerminalHandler] No session found for socket:', socket.id);
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'NO_SESSION', message: 'No active session' }
                });
            }
            if (!this.sessionManager.hasPermission(session, Permission.TERMINAL_CREATE)) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'PERMISSION_DENIED', message: 'Terminal create permission required' }
                });
            }
            // Generate terminal ID
            const terminalId = `term-${session.id}-${Date.now()}`;
            // Create PTY instance
            const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
            // In headless mode, use the global workspace path if no cwd is provided
            // This is set in main.ts when starting in headless mode
            const workingDirectory = process.cwd() ||
                global.__currentWorkspace ||
                process.env.HOME;
            const termPty = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: request.payload.cols || 80,
                rows: request.payload.rows || 24,
                cwd: workingDirectory,
                env: {
                    ...process.env,
                    ...request.payload.env,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor'
                }
            });
            // Store terminal info
            const terminal = {
                id: terminalId,
                pty: termPty,
                sessionId: session.id,
                socketId: socket.id,
                workspacePath: workingDirectory,
                createdAt: new Date(),
                name: request.payload.name
            };
            this.terminals.set(terminalId, terminal);
            // Track terminals by socket
            if (!this.terminalsBySocket.has(socket.id)) {
                this.terminalsBySocket.set(socket.id, new Set());
            }
            this.terminalsBySocket.get(socket.id).add(terminalId);
            // Set up PTY data handler - stream binary data
            termPty.onData((data) => {
                // Send as base64 string for Socket.IO polling compatibility
                socket.emit(RemoteEvent.TERMINAL_DATA, {
                    terminalId,
                    data: Buffer.from(data).toString('base64')
                });
            });
            // Set up PTY exit handler
            termPty.onExit((exitCode) => {
                socket.emit(RemoteEvent.TERMINAL_EXIT, {
                    terminalId,
                    code: exitCode.exitCode,
                    signal: exitCode.signal
                });
                // Clean up
                this.destroyTerminal(terminalId);
            });
            callback({
                id: request.id,
                success: true,
                data: { terminalId }
            });
        }
        catch (error) {
            callback({
                id: request.id,
                success: false,
                error: {
                    code: 'CREATE_ERROR',
                    message: error.message
                }
            });
        }
    }
    async handleTerminalWrite(socket, request, callback) {
        try {
            const session = this.sessionManager.getSessionBySocket(socket.id);
            if (!session) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'NO_SESSION', message: 'No active session' }
                });
            }
            if (!this.sessionManager.hasPermission(session, Permission.TERMINAL_WRITE)) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'PERMISSION_DENIED', message: 'Terminal write permission required' }
                });
            }
            // Check if it's a remote terminal first
            const terminal = this.terminals.get(request.payload.terminalId);
            if (terminal) {
                // Verify ownership
                if (terminal.sessionId !== session.id) {
                    return callback({
                        id: request.id,
                        success: false,
                        error: { code: 'ACCESS_DENIED', message: 'Terminal belongs to another session' }
                    });
                }
                // Write to PTY
                terminal.pty.write(request.payload.data);
                return callback({
                    id: request.id,
                    success: true
                });
            }
            // Not a remote terminal, try desktop terminal
            // In headless mode, there are no desktop terminals
            if (!this.mainWindow) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'TERMINAL_NOT_FOUND', message: 'Terminal not found (headless mode)' }
                });
            }
            // We need to find the PTY ID for this terminal instance ID
            try {
                const ptyInfo = await this.mainWindow.webContents.executeJavaScript(`
          (() => {
            if (typeof window.__getTerminalInstances === 'function') {
              const instances = window.__getTerminalInstances();
              const instance = instances.find(inst => inst.id === '${request.payload.terminalId}');
              if (instance && instance.ptyProcessId) {
                return { ptyId: instance.ptyProcessId };
              }
            }
            return null;
          })()
        `);
                if (!ptyInfo || !ptyInfo.ptyId) {
                    return callback({
                        id: request.id,
                        success: false,
                        error: { code: 'TERMINAL_NOT_FOUND', message: 'Desktop terminal not found or no PTY process' }
                    });
                }
                // Now write to the desktop terminal using its PTY ID
                const result = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            if (window.electronAPI?.terminal?.write) {
              return await window.electronAPI.terminal.write('${ptyInfo.ptyId}', ${JSON.stringify(request.payload.data)});
            }
            return { success: false, error: 'Terminal API not available' };
          })()
        `);
                if (result && result.success) {
                    callback({
                        id: request.id,
                        success: true
                    });
                }
                else {
                    callback({
                        id: request.id,
                        success: false,
                        error: { code: 'WRITE_FAILED', message: result?.error || 'Failed to write to desktop terminal' }
                    });
                }
            }
            catch (e) {
                callback({
                    id: request.id,
                    success: false,
                    error: { code: 'TERMINAL_NOT_FOUND', message: 'Terminal not found' }
                });
            }
        }
        catch (error) {
            callback({
                id: request.id,
                success: false,
                error: {
                    code: 'WRITE_ERROR',
                    message: error.message
                }
            });
        }
    }
    async handleTerminalResize(socket, request, callback) {
        try {
            const session = this.sessionManager.getSessionBySocket(socket.id);
            if (!session) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'NO_SESSION', message: 'No active session' }
                });
            }
            const terminal = this.terminals.get(request.payload.terminalId);
            if (!terminal) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'TERMINAL_NOT_FOUND', message: 'Terminal not found' }
                });
            }
            // Verify ownership
            if (terminal.sessionId !== session.id) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'ACCESS_DENIED', message: 'Terminal belongs to another session' }
                });
            }
            // Resize PTY
            terminal.pty.resize(request.payload.cols, request.payload.rows);
            callback({
                id: request.id,
                success: true
            });
        }
        catch (error) {
            callback({
                id: request.id,
                success: false,
                error: {
                    code: 'RESIZE_ERROR',
                    message: error.message
                }
            });
        }
    }
    async handleTerminalDestroy(socket, request, callback) {
        try {
            const session = this.sessionManager.getSessionBySocket(socket.id);
            if (!session) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'NO_SESSION', message: 'No active session' }
                });
            }
            const terminal = this.terminals.get(request.payload.terminalId);
            if (!terminal) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'TERMINAL_NOT_FOUND', message: 'Terminal not found' }
                });
            }
            // Verify ownership
            if (terminal.sessionId !== session.id) {
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'ACCESS_DENIED', message: 'Terminal belongs to another session' }
                });
            }
            // Destroy terminal
            this.destroyTerminal(request.payload.terminalId);
            callback({
                id: request.id,
                success: true
            });
        }
        catch (error) {
            callback({
                id: request.id,
                success: false,
                error: {
                    code: 'DESTROY_ERROR',
                    message: error.message
                }
            });
        }
    }
    destroyTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal)
            return;
        try {
            // Kill the PTY process
            terminal.pty.kill();
        }
        catch (error) {
            console.error(`Error killing terminal ${terminalId}:`, error);
        }
        // Remove from tracking
        this.terminals.delete(terminalId);
        // Remove from socket tracking
        const socketTerminals = this.terminalsBySocket.get(terminal.socketId);
        if (socketTerminals) {
            socketTerminals.delete(terminalId);
            if (socketTerminals.size === 0) {
                this.terminalsBySocket.delete(terminal.socketId);
            }
        }
    }
    async handleTerminalList(socket, request, callback) {
        try {
            const session = this.sessionManager.getSessionBySocket(socket.id);
            if (!session) {
                console.error('[RemoteTerminalHandler] No session found for list, socket:', socket.id);
                return callback({
                    id: request.id,
                    success: false,
                    error: { code: 'NO_SESSION', message: 'No active session' }
                });
            }
            // Get desktop terminal instances from the renderer
            let desktopTerminals = [];
            // In headless mode, there are no desktop terminals
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                try {
                    // Use the global function exposed by the terminal store
                    const result = await this.mainWindow.webContents.executeJavaScript(`
            (() => {
              if (typeof window.__getTerminalInstances === 'function') {
                const terminals = window.__getTerminalInstances();
                // Try to get current buffer for each terminal
                return terminals.map(t => {
                  let currentBuffer = null;
                  if (typeof window.__getTerminalBuffer === 'function') {
                    try {
                      currentBuffer = window.__getTerminalBuffer(t.id);
                    } catch (e) {
                      console.error('Failed to get terminal buffer:', e);
                    }
                  }
                  return {
                    ...t,
                    currentBuffer: currentBuffer || t.savedBuffer || null
                  };
                });
              }
              return [];
            })()
          `);
                    if (result && Array.isArray(result)) {
                        desktopTerminals = result;
                        // Update the socket's terminal mapping for forwarding
                        this.updateSocketTerminalMapping(socket.id, desktopTerminals);
                    }
                }
                catch (e) {
                }
            }
            // Get remote-created terminals for this session
            const remoteTerminals = Array.from(this.terminals.values())
                .filter(term => term.sessionId === session.id)
                .map(term => ({
                id: term.id,
                name: term.name || `Terminal ${term.id.split('-').pop()}`,
                workingDirectory: term.workspacePath,
                createdAt: term.createdAt.toISOString(),
                isRemote: true
            }));
            // Combine desktop and remote terminals
            const allTerminals = [...desktopTerminals, ...remoteTerminals];
            callback({
                id: request.id,
                success: true,
                data: allTerminals
            });
        }
        catch (error) {
            callback({
                id: request.id,
                success: false,
                error: {
                    code: 'LIST_ERROR',
                    message: error.message
                }
            });
        }
    }
    updateSocketTerminalMapping(socketId, terminals) {
        // Access the remote server through the global scope
        const remoteServer = global.__remoteServer;
        if (remoteServer && typeof remoteServer.updateSocketTerminalMapping === 'function') {
            remoteServer.updateSocketTerminalMapping(socketId, terminals);
        }
    }
    /**
     * Get terminal statistics
     */
    getStats() {
        const terminalsBySession = new Map();
        this.terminals.forEach(term => {
            const count = terminalsBySession.get(term.sessionId) || 0;
            terminalsBySession.set(term.sessionId, count + 1);
        });
        return {
            totalTerminals: this.terminals.size,
            terminalsBySession: Object.fromEntries(terminalsBySession),
            terminalsBySocket: Object.fromEntries(Array.from(this.terminalsBySocket.entries()).map(([k, v]) => [k, v.size]))
        };
    }
}
