import { BrowserWindow, ipcMain, screen, shell } from 'electron';
import Store from 'electron-store';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FloatingWindowConfig {
  moduleId: string;
  title: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  alwaysOnTop?: boolean;
  workspacePath?: string;
}

export interface WindowState {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  alwaysOnTop: boolean;
  moduleId: string;
}

export class FloatingWindowManager {
  private static instance: FloatingWindowManager;
  private floatingWindows: Map<string, BrowserWindow> = new Map();
  private store: Store<Record<string, any>>;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {
    this.store = new Store<Record<string, any>>({
      name: 'floating-windows'
    });
    this.setupIpcHandlers();
  }

  public static getInstance(): FloatingWindowManager {
    if (!FloatingWindowManager.instance) {
      FloatingWindowManager.instance = new FloatingWindowManager();
    }
    return FloatingWindowManager.instance;
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupIpcHandlers(): void {
    // Create floating window
    ipcMain.handle('floating-window:create', async (event, config: FloatingWindowConfig) => {
      return this.createFloatingWindow(config);
    });

    // Close floating window
    ipcMain.handle('floating-window:close', async (event, moduleId: string) => {
      return this.closeFloatingWindow(moduleId);
    });

    // Update floating window
    ipcMain.handle('floating-window:update', async (event, moduleId: string, data: any) => {
      const window = this.floatingWindows.get(moduleId);
      if (window && !window.isDestroyed()) {
        window.webContents.send('floating-window:data-update', data);
      }
    });

    // Get all floating windows
    ipcMain.handle('floating-window:list', async () => {
      return Array.from(this.floatingWindows.keys());
    });

    // Toggle always on top
    ipcMain.handle('floating-window:toggle-always-on-top', async (event, moduleId: string) => {
      const window = this.floatingWindows.get(moduleId);
      if (window && !window.isDestroyed()) {
        const currentState = window.isAlwaysOnTop();
        window.setAlwaysOnTop(!currentState);
        this.saveWindowState(moduleId, window);
        return !currentState;
      }
      return false;
    });

    // Focus floating window
    ipcMain.handle('floating-window:focus', async (event, moduleId: string) => {
      const window = this.floatingWindows.get(moduleId);
      if (window && !window.isDestroyed()) {
        window.focus();
        return true;
      }
      return false;
    });

    // Check if module is floating
    ipcMain.handle('floating-window:is-floating', async (event, moduleId: string) => {
      return this.floatingWindows.has(moduleId);
    });

    // Handle data from floating window back to main
    ipcMain.handle('floating-window:send-to-main', async (event, data: any) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('floating-window:data-from-floating', data);
      }
    });

    // Broadcast to all windows (main + floating)
    ipcMain.handle('floating-window:broadcast', async (event, eventName: string, data: any) => {
      // Send to main window
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(eventName, data);
      }
      
      // Send to all floating windows
      this.floatingWindows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(eventName, data);
        }
      });
    });
  }

  private createFloatingWindow(config: FloatingWindowConfig): string {
    // Check if window already exists for this module
    if (this.floatingWindows.has(config.moduleId)) {
      const existingWindow = this.floatingWindows.get(config.moduleId);
      if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.focus();
        return config.moduleId;
      }
    }

    // Load saved state or use defaults
    const savedState = this.loadWindowState(config.moduleId);
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;

    // Calculate default position (slightly offset from center)
    const defaultWidth = config.width || 800;
    const defaultHeight = config.height || 600;
    const offsetMultiplier = this.floatingWindows.size * 30; // Cascade windows
    
    const floatingWindow = new BrowserWindow({
      width: savedState?.bounds.width || defaultWidth,
      height: savedState?.bounds.height || defaultHeight,
      x: savedState?.bounds.x ?? Math.floor((screenWidth - defaultWidth) / 2) + offsetMultiplier,
      y: savedState?.bounds.y ?? Math.floor((screenHeight - defaultHeight) / 2) + offsetMultiplier,
      minWidth: 400,
      minHeight: 300,
      title: config.title || `${config.moduleId} - Clode Studio`,
      frame: true,
      alwaysOnTop: savedState?.alwaysOnTop || config.alwaysOnTop || false,
      webPreferences: {
        preload: join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: process.env.NODE_ENV === 'production'
      },
      backgroundColor: '#1e1e1e',
      show: false,
      icon: process.platform === 'darwin' ? undefined : join(__dirname, '../../build/icon.png'),
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 15, y: 13 }
    });

    // Store the window
    this.floatingWindows.set(config.moduleId, floatingWindow);

    // Load the appropriate URL with module parameter and workspace
    const isDev = process.env.NODE_ENV !== 'production';
    const baseUrl = isDev ? 'http://localhost:3000' : `file://${join(__dirname, '../../.output/public/index.html')}`;
    let url = `${baseUrl}#floating-module=${config.moduleId}`;
    
    // Add workspace path if provided
    if (config.workspacePath) {
      url += `&workspace=${encodeURIComponent(config.workspacePath)}`;
    }
    
    floatingWindow.loadURL(url);

    // Setup window event handlers
    floatingWindow.once('ready-to-show', () => {
      floatingWindow.show();
      
      // Send workspace path to the floating window after it's ready
      if (config.workspacePath) {
        setTimeout(() => {
          if (!floatingWindow.isDestroyed()) {
            floatingWindow.webContents.send('floating-window:set-workspace', config.workspacePath);
          }
        }, 500);
      }
      
      // Notify main window that a module is now floating
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('floating-window:opened', config.moduleId);
      }
    });

    floatingWindow.on('closed', () => {
      this.floatingWindows.delete(config.moduleId);
      // Notify main window that the module is no longer floating
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('floating-window:closed', config.moduleId);
      }
    });

    // Save state on move/resize
    floatingWindow.on('moved', () => {
      this.saveWindowState(config.moduleId, floatingWindow);
    });

    floatingWindow.on('resized', () => {
      this.saveWindowState(config.moduleId, floatingWindow);
    });

    // Handle focus events for window coordination
    floatingWindow.on('focus', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('floating-window:focused', config.moduleId);
      }
    });

    return config.moduleId;
  }

  private closeFloatingWindow(moduleId: string): boolean {
    const window = this.floatingWindows.get(moduleId);
    if (window && !window.isDestroyed()) {
      window.close();
      return true;
    }
    return false;
  }

  private saveWindowState(moduleId: string, window: BrowserWindow): void {
    if (window.isDestroyed()) return;

    const state: WindowState = {
      bounds: window.getBounds(),
      alwaysOnTop: window.isAlwaysOnTop(),
      moduleId
    };

    (this.store as any).set(`window-state-${moduleId}`, state);
  }

  private loadWindowState(moduleId: string): WindowState | null {
    return (this.store as any).get(`window-state-${moduleId}`) as WindowState | null;
  }

  public closeAllFloatingWindows(): void {
    this.floatingWindows.forEach((window, moduleId) => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });
    this.floatingWindows.clear();
  }

  public getFloatingWindow(moduleId: string): BrowserWindow | undefined {
    return this.floatingWindows.get(moduleId);
  }

  public isModuleFloating(moduleId: string): boolean {
    const window = this.floatingWindows.get(moduleId);
    return window !== undefined && !window.isDestroyed();
  }
}