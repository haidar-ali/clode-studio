import * as pty from 'node-pty';
import type { BrowserWindow } from 'electron';
import type { Socket } from 'socket.io';
import { RemoteEvent } from '../remote-protocol.js';

interface InstanceInfo {
  instanceId: string;
  workingDirectory: string;
  instanceName?: string;
  socketId: string;
  // If headless fallback
  pty?: pty.IPty;
}

export class RemoteCodexHandler {
  private mainWindow: BrowserWindow | null;
  private instances = new Map<string, InstanceInfo>(); // instanceId -> info
  private instancesBySocket = new Map<string, Set<string>>();
  private codexForwardHandlers = new Map<string, Function>(); // key: socketId-instanceId

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow;
  }

  registerHandlers(socket: Socket) {
    console.log('[RemoteCodexHandler] Registering handlers for socket:', socket.id);
    socket.on('codex:spawn', async (request: any, callback: Function) => {
      await this.handleSpawn(socket, request, callback);
    });
    socket.on('codex:send', async (request: any, callback: Function) => {
      await this.handleSend(socket, request, callback);
    });
    socket.on('codex:stop', async (request: any, callback: Function) => {
      await this.handleStop(socket, request, callback);
    });
    socket.on('codex:resize', async (request: any, callback: Function) => {
      await this.handleResize(socket, request, callback);
    });
    socket.on('codex:getInstances', async (_request: any, callback: Function) => {
      const list = await this.listDesktopInstances();
      callback({ id: _request?.id, success: true, data: list });
    });
    socket.on('codex:createInstance', async (request: any, callback: Function) => {
      await this.handleCreateInstance(socket, request, callback);
    });
    socket.on('codex:getBuffer', async (request: any, callback: Function) => {
      console.log('[RemoteCodexHandler] codex:getBuffer event received');
      await this.handleGetBuffer(socket, request, callback);
    });
    socket.on('codex:configureTerminal', async (request: any, callback: Function) => {
      console.log('[RemoteCodexHandler] codex:configureTerminal event received');
      await this.handleConfigureTerminal(socket, request, callback);
    });
  }

  async cleanupSocketInstances(socketId: string) {
    const ids = this.instancesBySocket.get(socketId);
    if (ids) {
      for (const id of ids) {
        await this.stopInstance(id);
        const key = `${socketId}-${id}`;
        if (this.mainWindow) {
          try {
            await this.mainWindow.webContents.executeJavaScript(`
              (function() {
                try {
                  // Clean up new forwarding mechanism
                  if (window.__remoteCodexForwarding && window.__remoteCodexForwarding.has('${id}')) {
                    window.__remoteCodexForwarding.delete('${id}');
                  }
                  if (window.__remoteCodexListeners && window.__remoteCodexListeners.has('${id}')) {
                    const listener = window.__remoteCodexListeners.get('${id}');
                    if (listener && listener.cleanup) {
                      try { listener.cleanup(); } catch (e) {}
                    }
                    window.__remoteCodexListeners.delete('${id}');
                  }
                  // Clean up old mechanism too for compatibility
                  if (window.__codexForwardOff && window.__codexForwardOff.has('${key}')) {
                    var off = window.__codexForwardOff.get('${key}');
                    if (typeof off === 'function') { try { off(); } catch (e) {} }
                    window.__codexForwardOff.delete('${key}');
                  }
                } catch (e) {}
              })();
            `);
          } catch {}
        }
        // Clean up handler tracking
        this.codexForwardHandlers.delete(key);
      }
      this.instancesBySocket.delete(socketId);
    }
  }

  private async setupDesktopForwarding(socket: Socket, instanceId: string) {
    if (!this.mainWindow) return;
    
    console.log(`[RemoteCodexHandler] Setting up desktop forwarding for ${instanceId} on socket ${socket.id}`);

    // Inject a renderer-side bridge: subscribe to codex output and forward to main
    try {
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            if (!window.__remoteCodexForwarding) {
              window.__remoteCodexForwarding = new Map();
              window.__remoteCodexListeners = new Map();
            }
            
            const instanceId = '${instanceId}';
            const socketId = '${socket.id}';
            
            // Check if already forwarding
            if (window.__remoteCodexForwarding.has(instanceId)) {
              const existingSocketId = window.__remoteCodexForwarding.get(instanceId);
              if (existingSocketId === socketId) {
                console.log('[RemoteCodex] Already forwarding for', instanceId);
                return true;
              } else {
                console.log('[RemoteCodex] Updating socket for', instanceId, 'from', existingSocketId, 'to', socketId);
                // Update to new socket ID
                window.__remoteCodexForwarding.set(instanceId, socketId);
                
                // Clean up old listener if it exists
                const existingListener = window.__remoteCodexListeners.get(instanceId);
                if (existingListener && existingListener.cleanup) {
                  console.log('[RemoteCodex] Cleaning up old listener for', instanceId);
                  existingListener.cleanup();
                  window.__remoteCodexListeners.delete(instanceId);
                }
              }
            }
            
            // Mark instance as being forwarded
            window.__remoteCodexForwarding.set(instanceId, socketId);
            
            // Set up Codex output listener with instance ID
            if (window.electronAPI?.codex?.onOutput) {
              const outputHandler = (data) => {
                console.log('[RemoteCodex] Output handler called for', instanceId, 'data length:', data?.length);
                // Get current socket ID from the map to handle socket changes
                const currentSocketId = window.__remoteCodexForwarding.get(instanceId);
                if (currentSocketId) {
                  console.log('[RemoteCodex] Forwarding output to socket', currentSocketId);
                  window.electronAPI.send('forward-codex-output', {
                    instanceId,
                    socketId: currentSocketId,
                    data
                  });
                } else {
                  console.log('[RemoteCodex] No socket ID found for', instanceId);
                }
              };
              
              // Clean up any existing listener first
              const existingListener = window.__remoteCodexListeners.get(instanceId);
              if (existingListener && existingListener.cleanup) {
                console.log('[RemoteCodex] Cleaning up existing listener');
                existingListener.cleanup();
                window.__remoteCodexListeners.delete(instanceId);
              }
              
              // Store handler reference for cleanup
              if (!window.__remoteCodexListeners.has(instanceId)) {
                window.__remoteCodexListeners.set(instanceId, {
                  output: outputHandler
                });
              }
              
              // Listen to Codex output for this specific instance
              const cleanup = window.electronAPI.codex.onOutput(instanceId, outputHandler);
              window.__remoteCodexListeners.get(instanceId).cleanup = cleanup;
              
              console.log('[RemoteCodex] Set up forwarding for', instanceId, 'to socket', socketId);
              
              // IMPORTANT: Force immediate output capture
              if (window.__getCodexStore) {
                const store = window.__getCodexStore();
                const inst = store.instances.get(instanceId);
                if (inst && inst.status === 'connected') {
                  console.log('[RemoteCodex] Instance connected, triggering output capture');
                  
                  // Send a harmless command to trigger output
                  setTimeout(() => {
                    if (window.electronAPI?.codex?.send) {
                      // Send empty input to trigger a prompt redraw
                      window.electronAPI.codex.send(instanceId, '').then(() => {
                        console.log('[RemoteCodex] Sent trigger command for', instanceId);
                      });
                    }
                  }, 200);
                  
                  // Also try resize to trigger redraw
                  setTimeout(() => {
                    if (window.electronAPI?.codex?.resize) {
                      window.electronAPI.codex.resize(instanceId, 120, 30).then(() => {
                        console.log('[RemoteCodex] Triggered terminal resize for', instanceId);
                      });
                    }
                  }, 500);
                }
              }
              
              return true;
            } else {
              console.error('[RemoteCodex] Codex API not available');
              return false;
            }
          } catch (e) {
            console.error('[RemoteCodex] Error setting up forwarding:', e);
            return false;
          }
        })()
      `);
      
      if (result) {
        console.log('[RemoteCodexHandler] Successfully set up desktop forwarding');
        
        // Track the forwarding handler
        const forwardKey = `${socket.id}-${instanceId}`;
        this.codexForwardHandlers.set(forwardKey, () => {}); // Store empty function as marker
      } else {
        console.error('[RemoteCodexHandler] Failed to set up desktop forwarding');
      }
    } catch (e) {
      console.error('[RemoteCodexHandler] Exception setting up forwarding:', e);
    }
  }

  private async handleSpawn(socket: Socket, request: any, callback: Function) {
    const { instanceId, workingDirectory, instanceName } = request.payload || {};
    const info: InstanceInfo = { instanceId, workingDirectory, instanceName, socketId: socket.id };
    this.instances.set(instanceId, info);
    if (!this.instancesBySocket.has(socket.id)) this.instancesBySocket.set(socket.id, new Set());
    this.instancesBySocket.get(socket.id)!.add(instanceId);

    if (this.mainWindow) {
      try {
        const result = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            if (window.electronAPI?.codex?.start) {
              const r = await window.electronAPI.codex.start('${instanceId}', '${workingDirectory}', '${instanceName || ''}');
              // Update Codex store if available
              if (window.__getCodexStore) {
                const store = window.__getCodexStore();
                const inst = store.instances.get('${instanceId}');
                if (inst) {
                  inst.status = r.success ? 'connected' : 'disconnected';
                  inst.pid = r.pid;
                  store.saveInstances();
                }
              }
              return r;
            }
            return { success: false, error: 'Codex API not available' };
          })()
        `);
        if (result?.success) {
          await this.setupDesktopForwarding(socket, instanceId);
          callback({ id: request.id, success: true, data: { pid: result.pid } });
        } else {
          callback({ id: request.id, success: false, error: { code: 'START_ERROR', message: result?.error || 'Failed to start Codex' } });
        }
        return;
      } catch (e: any) {
        callback({ id: request.id, success: false, error: { code: 'START_EXCEPTION', message: e?.message || String(e) } });
        return;
      }
    }
    // Headless mode: spawn codex directly 
    try {
      console.log(`[RemoteCodexHandler] Starting headless Codex instance ${instanceId} in ${workingDirectory}`);
      
      // Spawn codex directly instead of shell + codex command
      const p = pty.spawn('codex', [], {
        name: 'xterm-256color', 
        cols: 120, 
        rows: 30, 
        cwd: workingDirectory || process.cwd(), 
        env: process.env as any
      });
      
      info.pty = p;
      
      // Store in global for access by other handlers
      if (!(global as any).codexInstances) {
        (global as any).codexInstances = {};
      }
      (global as any).codexInstances[instanceId] = p;
      
      // Initialize buffer storage
      if (!(global as any).codexBuffers) {
        (global as any).codexBuffers = new Map<string, string>();
      }
      
      // Store output in buffer and broadcast to socket
      p.onData((data: string) => {
        // Store in buffer
        const currentBuffer = (global as any).codexBuffers.get(instanceId) || '';
        (global as any).codexBuffers.set(instanceId, (currentBuffer + data).slice(-50000));
        
        // Broadcast to socket
        socket.emit(RemoteEvent.CODEX_OUTPUT, { instanceId, data });
        
        // Also broadcast to any other connected sockets via remoteServer
        if ((global as any).remoteServer) {
          (global as any).remoteServer.broadcastCodexOutput(instanceId, data);
        }
      });
      
      // Handle PTY exit
      p.onExit(({ exitCode }) => {
        console.log(`[RemoteCodexHandler] Codex ${instanceId} exited with code ${exitCode}`);
        delete (global as any).codexInstances[instanceId];
        info.pty = undefined;
        socket.emit(RemoteEvent.CODEX_EXIT, { instanceId, exitCode });
      });
      callback({ id: request.id, success: true, data: { pid: p.pid } });
    } catch (e: any) {
      callback({ id: request.id, success: false, error: { code: 'HEADLESS_START_ERROR', message: e?.message || String(e) } });
    }
  }

  private async handleSend(_socket: Socket, request: any, callback: Function) {
    const { instanceId, data } = request.payload || {};
    if (this.mainWindow) {
      try {
        await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            if (window.electronAPI?.codex?.send) {
              await window.electronAPI.codex.send('${instanceId}', ${JSON.stringify(data)});
              return { success: true };
            }
            return { success: false };
          })()
        `);
        callback({ id: request.id, success: true });
        return;
      } catch (e) {}
    }
    // Headless
    const info = this.instances.get(instanceId);
    if (info?.pty) {
      info.pty.write(data);
      callback({ id: request.id, success: true });
    } else {
      callback({ id: request.id, success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Codex instance not found' } });
    }
  }

  private async handleStop(_socket: Socket, request: any, callback: Function) {
    const { instanceId } = request.payload || {};
    if (this.mainWindow) {
      try {
        await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            if (window.electronAPI?.codex?.stop) {
              await window.electronAPI.codex.stop('${instanceId}');
              if (window.__getCodexStore) {
                const store = window.__getCodexStore();
                const inst = store.instances.get('${instanceId}');
                if (inst) { inst.status = 'disconnected'; delete inst.pid; store.saveInstances(); }
              }
              return { success: true };
            }
            return { success: false };
          })()
        `);
        await this.stopInstance(instanceId);
        callback({ id: request.id, success: true });
        return;
      } catch (e) {}
    }
    await this.stopInstance(instanceId);
    callback({ id: request.id, success: true });
  }

  private async handleCreateInstance(_socket: Socket, request: any, callback: Function) {
    const { name, workingDirectory } = request.payload || {};
    if (!this.mainWindow) {
      return callback({ id: request.id, success: false, error: { code: 'NO_DESKTOP', message: 'Desktop window not available' } });
    }
    try {
      const id = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          if (window.__getCodexStore) {
            const store = window.__getCodexStore();
            const newId = await store.createInstance(${JSON.stringify(name || 'Codex')}, undefined, ${JSON.stringify(workingDirectory || '/')});
            return newId;
          }
          return null;
        })()
      `);
      if (id) {
        callback({ id: request.id, success: true, data: { id } });
        try { (this.mainWindow as any)?.webContents?.send?.('codex:instances:updated'); } catch {}
      } else {
        callback({ id: request.id, success: false, error: { code: 'CREATE_FAILED', message: 'Failed to create instance' } });
      }
    } catch (e: any) {
      callback({ id: request.id, success: false, error: { code: 'CREATE_EXCEPTION', message: e?.message || String(e) } });
    }
  }

  private async handleResize(_socket: Socket, request: any, callback: Function) {
    const { instanceId, cols, rows } = request.payload || {};
    if (this.mainWindow) {
      try {
        await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            if (window.electronAPI?.codex?.resize) {
              await window.electronAPI.codex.resize('${instanceId}', ${cols}, ${rows});
              return { success: true };
            }
            return { success: false };
          })()
        `);
        callback({ id: request.id, success: true });
        return;
      } catch (e) {}
    }
    const info = this.instances.get(instanceId);
    if (info?.pty) {
      info.pty.resize(cols, rows);
      callback({ id: request.id, success: true });
    } else {
      callback({ id: request.id, success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Codex instance not found' } });
    }
  }

  private async stopInstance(instanceId: string) {
    const info = this.instances.get(instanceId);
    if (!info) return;
    
    // Kill PTY if it exists
    try { info.pty?.kill(); } catch {}
    
    // Clean up global storage in headless mode
    if ((global as any).codexInstances?.[instanceId]) {
      delete (global as any).codexInstances[instanceId];
    }
    if ((global as any).codexBuffers?.has(instanceId)) {
      (global as any).codexBuffers.delete(instanceId);
    }
    
    // Remove from instance tracking
    this.instances.delete(instanceId);
    const set = this.instancesBySocket.get(info.socketId);
    if (set) { 
      set.delete(instanceId); 
      if (set.size === 0) this.instancesBySocket.delete(info.socketId); 
    }
  }

  private async handleGetBuffer(_socket: Socket, request: any, callback: Function) {
    const { instanceId } = request.payload || {};
    console.log('[RemoteCodexHandler] handleGetBuffer called for:', instanceId);
    
    // In headless mode, get buffer directly from global storage
    if (!this.mainWindow) {
      try {
        // Access the global codexBuffers directly
        const buffer = (global as any).codexBuffers?.get(instanceId) || '';
        console.log(`[RemoteCodexHandler] Headless mode - returning buffer for ${instanceId}, size: ${buffer.length}`);
        callback({ 
          id: request.id, 
          success: true, 
          data: { buffer } 
        });
        return;
      } catch (error) {
        console.error('[RemoteCodexHandler] Error getting buffer in headless mode:', error);
        callback({ 
          id: request.id, 
          success: false, 
          error: { code: 'BUFFER_ERROR', message: 'Failed to get buffer in headless mode' } 
        });
        return;
      }
    }
    
    // Desktop/hybrid mode - use mainWindow
    if (this.mainWindow) {
      try {
        const result = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            try {
              console.log('[Renderer] Checking for codex.getBuffer API...');
              if (window.electronAPI?.codex?.getBuffer) {
                console.log('[Renderer] Calling codex.getBuffer for: ${instanceId}');
                const r = await window.electronAPI.codex.getBuffer('${instanceId}');
                console.log('[Renderer] Got result:', r);
                return r;
              }
              console.log('[Renderer] codex.getBuffer API not available');
              return { success: false, error: 'Codex getBuffer API not available' };
            } catch (e) {
              console.error('[Renderer] Error in getBuffer:', e);
              return { success: false, error: e.message || String(e) };
            }
          })()
        `);
        console.log('[RemoteCodexHandler] Result from renderer:', result);
        if (result?.success) {
          callback({ id: request.id, success: true, data: { buffer: result.buffer } });
        } else {
          callback({ id: request.id, success: false, error: { code: 'GET_BUFFER_ERROR', message: result?.error || 'Failed to get buffer' } });
        }
      } catch (e: any) {
        console.error('[RemoteCodexHandler] Exception:', e);
        callback({ id: request.id, success: false, error: { code: 'GET_BUFFER_EXCEPTION', message: e?.message || String(e) } });
      }
    } else {
      console.log('[RemoteCodexHandler] No mainWindow available');
      callback({ id: request.id, success: false, error: { code: 'NO_DESKTOP', message: 'Desktop window not available' } });
    }
  }

  private async handleConfigureTerminal(_socket: Socket, request: any, callback: Function) {
    const { instanceId, cols, rows } = request.payload || {};
    
    // In headless mode, check if the instance exists and is connected
    if (!this.mainWindow) {
      try {
        // Check if codex instance exists
        const codexInstances = (global as any).codexInstances;
        if (!codexInstances || !codexInstances[instanceId]) {
          console.log(`[RemoteCodexHandler] No Codex PTY running for instance ${instanceId} in headless mode`);
          callback({ 
            id: request.id, 
            success: false, 
            error: { code: 'NO_INSTANCE', message: `No Codex PTY running for instance ${instanceId}` } 
          });
          return;
        }
        
        // Resize the PTY if it exists
        const pty = codexInstances[instanceId];
        if (pty && pty.resize) {
          pty.resize(cols, rows);
          console.log(`[RemoteCodexHandler] Resized headless Codex terminal ${instanceId} to ${cols}x${rows}`);
          callback({ id: request.id, success: true });
        } else {
          callback({ 
            id: request.id, 
            success: false, 
            error: { code: 'RESIZE_ERROR', message: 'Could not resize terminal' } 
          });
        }
        return;
      } catch (error) {
        console.error('[RemoteCodexHandler] Error configuring terminal in headless mode:', error);
        callback({ 
          id: request.id, 
          success: false, 
          error: { code: 'CONFIG_ERROR', message: 'Failed to configure terminal in headless mode' } 
        });
        return;
      }
    }
    
    // Desktop/hybrid mode - use mainWindow
    if (this.mainWindow) {
      try {
        const result = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            try {
              if (window.electronAPI?.codex?.configureTerminal) {
                const r = await window.electronAPI.codex.configureTerminal('${instanceId}', ${cols}, ${rows});
                return r;
              }
              return { success: false, error: 'Codex configureTerminal API not available' };
            } catch (e) {
              return { success: false, error: e.message || String(e) };
            }
          })()
        `);
        if (result?.success) {
          callback({ id: request.id, success: true });
        } else {
          callback({ id: request.id, success: false, error: { code: 'CONFIG_TERMINAL_ERROR', message: result?.error || 'Failed to configure terminal' } });
        }
      } catch (e: any) {
        callback({ id: request.id, success: false, error: { code: 'CONFIG_TERMINAL_EXCEPTION', message: e?.message || String(e) } });
      }
    } else {
      // Fallback for headless - try to resize PTY if available
      const info = this.instances.get(instanceId);
      if (info?.pty) {
        try {
          info.pty.resize(cols, rows);
          callback({ id: request.id, success: true });
        } catch (e: any) {
          callback({ id: request.id, success: false, error: { code: 'RESIZE_ERROR', message: e?.message || 'Failed to resize' } });
        }
      } else {
        callback({ id: request.id, success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Codex instance not found' } });
      }
    }
  }

  private async listDesktopInstances() {
    // In headless mode, return instances from our local tracking
    if (!this.mainWindow) {
      const instances: any[] = [];
      this.instances.forEach((info, instanceId) => {
        instances.push({
          id: instanceId,
          instanceId: instanceId,
          name: info.instanceName || `Codex ${instances.length + 1}`,
          workingDirectory: info.workingDirectory || process.cwd(),
          cwd: info.workingDirectory || process.cwd(),
          status: info.pty ? 'connected' : 'disconnected',
          pid: info.pty?.pid,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          isDesktop: false, // Mark as headless instance
          isHeadless: true
        });
      });
      console.log('[RemoteCodexHandler] Returning headless instances:', instances);
      return instances;
    }
    
    // Desktop/hybrid mode - get from mainWindow
    try {
      const list = await this.mainWindow.webContents.executeJavaScript(`
        (() => {
          if (window.__getCodexInstances) {
            return window.__getCodexInstances();
          }
          return [];
        })()
      `);
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }
}
