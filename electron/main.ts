import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import Store from 'electron-store';
import * as pty from 'node-pty';
import { watch, FSWatcher, existsSync } from 'fs';
import { readFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { claudeCodeService } from './claude-sdk-service.js';
import { lightweightContext } from './lightweight-context.js';
import { contextOptimizer } from './context-optimizer.js';
import { workspacePersistence } from './workspace-persistence.js';
import { claudeSettingsManager } from './claude-settings-manager.js';
import { ClaudeDetector } from './claude-detector.js';
import { fileWatcherService } from './file-watcher.js';
import { createKnowledgeCache } from './knowledge-cache.js';
import { GitService } from './git-service.js';
import { GitServiceManager } from './git-service-manager.js';
import { CheckpointService } from './checkpoint-service.js';
import { CheckpointServiceManager } from './checkpoint-service-manager.js';
import { WorktreeManager } from './worktree-manager.js';
import { WorktreeManagerGlobal } from './worktree-manager-global.js';
import { GitHooksManagerGlobal } from './git-hooks-manager-global.js';
import { GitHooksManager } from './git-hooks.js';

// Load environment variables from .env file
import { config } from 'dotenv';
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const store = new Store<Record<string, any>>();
const fileWatchers: Map<string, FSWatcher> = new Map();
const fileDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

// Multi-instance Claude support
const claudeInstances: Map<string, pty.IPty> = new Map();

// Knowledge cache instances per workspace
const knowledgeCaches: Map<string, any> = new Map();

// Git service instances per workspace
const gitServices: Map<string, GitService> = new Map();

// Checkpoint service instances per workspace
const checkpointServices: Map<string, CheckpointService> = new Map();

// Worktree manager instances per workspace
const worktreeManagers: Map<string, WorktreeManager> = new Map();

// Git hooks manager instances per workspace - now handled by GitHooksManagerGlobal
// const gitHooksManagers: Map<string, GitHooksManager> = new Map();

const isDev = process.env.NODE_ENV !== 'production';
const nuxtURL = isDev ? 'http://localhost:3000' : `file://${join(__dirname, '../.output/public/index.html')}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'Clode Studio',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 15, y: 13 }, // macOS traffic light position
    backgroundColor: '#1e1e1e',
    show: false
  });

  mainWindow.loadURL(nuxtURL);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Clean up all Claude instances
    claudeInstances.forEach((pty, instanceId) => {
      pty.kill();
    });
    claudeInstances.clear();
  });
}

app.whenReady().then(() => {
  // Initialize all service managers (singletons)
  GitServiceManager.getInstance();
  CheckpointServiceManager.getInstance();
  WorktreeManagerGlobal.getInstance();
  GitHooksManagerGlobal.getInstance();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Claude Process Management using PTY with multi-instance support
ipcMain.handle('claude:start', async (event, instanceId: string, workingDirectory: string, instanceName?: string) => {
  if (claudeInstances.has(instanceId)) {
    return { success: false, error: 'Claude instance already running' };
  }

  try {
    // Detect Claude installation
    const claudeInfo = await ClaudeDetector.detectClaude(workingDirectory);
    
    // Get the command configuration
    const debugArgs = process.env.CLAUDE_DEBUG === 'true' ? ['--debug'] : [];
    const { command, args: commandArgs, useShell } = ClaudeDetector.getClaudeCommand(claudeInfo, debugArgs);
    
    // Log settings file to verify it exists
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    if (!existsSync(settingsPath)) {
      console.warn('Claude settings file not found!');
    }
    
    // Get the user's default shell
    const userShell = process.env.SHELL || '/bin/bash';
    
    const claudePty = pty.spawn(command, commandArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: workingDirectory,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
        HOME: process.env.HOME, // Ensure HOME is set so Claude can find ~/.claude/settings.json
        USER: process.env.USER, // Ensure USER is set
        SHELL: userShell, // Ensure SHELL is set
        // Add instance-specific environment variables for hooks
        CLAUDE_INSTANCE_ID: instanceId,
        CLAUDE_INSTANCE_NAME: instanceName || `Claude-${instanceId.slice(7, 15)}`, // Use provided name or short ID
        CLAUDE_IDE_INSTANCE: 'true'
      }
    });


    // Store this instance
    claudeInstances.set(instanceId, claudePty);

    // Handle output from Claude
    claudePty.onData((data: string) => {
      // Send data with instance ID
      mainWindow?.webContents.send(`claude:output:${instanceId}`, data);
    });

    // Handle exit
    claudePty.onExit(({ exitCode, signal }) => {
      mainWindow?.webContents.send(`claude:exit:${instanceId}`, exitCode);
      claudeInstances.delete(instanceId);
    });

    return { 
      success: true, 
      pid: claudePty.pid,
      claudeInfo: {
        path: claudeInfo.path,
        version: claudeInfo.version,
        source: claudeInfo.source
      }
    };
  } catch (error) {
    console.error(`Failed to start Claude for ${instanceId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:send', async (event, instanceId: string, command: string) => {
  const claudePty = claudeInstances.get(instanceId);
  if (!claudePty) {
    return { success: false, error: `Claude PTY not running for instance ${instanceId}` };
  }

  try {
    // Write raw data to PTY (xterm.js will handle line endings)
    claudePty.write(command);
    
    return { success: true };
  } catch (error) {
    console.error(`Failed to send command to Claude PTY ${instanceId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:stop', async (event, instanceId: string) => {
  const claudePty = claudeInstances.get(instanceId);
  if (claudePty) {
    claudePty.kill();
    claudeInstances.delete(instanceId);
    return { success: true };
  }
  return { success: false, error: `No Claude PTY running for instance ${instanceId}` };
});

ipcMain.handle('claude:resize', async (event, instanceId: string, cols: number, rows: number) => {
  const claudePty = claudeInstances.get(instanceId);
  if (claudePty) {
    try {
      claudePty.resize(cols, rows);
      return { success: true };
    } catch (error) {
      console.error(`Failed to resize PTY for ${instanceId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { success: false, error: `No Claude PTY running for instance ${instanceId}` };
});

// Get home directory
ipcMain.handle('getHomeDir', () => {
  return homedir();
});

// File Watcher operations
ipcMain.handle('fileWatcher:start', async (event, dirPath: string, options?: any) => {
  try {
    await fileWatcherService.watchDirectory(dirPath, options);
    
    // Set up event forwarding to renderer
    fileWatcherService.on('file:change', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file:change', data);
      }
    });
    
    fileWatcherService.on('batch:change', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('batch:change', data);
      }
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fileWatcher:stop', async (event, dirPath: string) => {
  try {
    await fileWatcherService.unwatchDirectory(dirPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fileWatcher:indexFile', async (event, filePath: string) => {
  try {
    const result = await fileWatcherService.performIncrementalIndex(filePath, 'change');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fileWatcher:getStats', () => {
  try {
    const stats = fileWatcherService.getStatistics();
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Knowledge Cache operations
ipcMain.handle('knowledgeCache:recordQuery', async (event, workspacePath: string, metrics: any) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }
    
    await cache.learnFromQuery(
      metrics.query,
      metrics.result || {},
      metrics.responseTime,
      metrics.success
    );
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:getStats', async (event, workspacePath: string) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }
    
    const stats = cache.getStatistics();
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:predict', async (event, workspacePath: string, context: any) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }
    
    const predictions = await cache.predictNextQueries(context);
    return { success: true, predictions };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:clear', async (event, workspacePath: string) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }
    
    await cache.clear();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('knowledgeCache:invalidate', async (event, workspacePath: string, pattern?: string, tags?: string[]) => {
  try {
    let cache = knowledgeCaches.get(workspacePath);
    if (!cache) {
      cache = createKnowledgeCache(workspacePath);
      knowledgeCaches.set(workspacePath, cache);
    }
    
    const count = await cache.invalidate(pattern, tags);
    return { success: true, count };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// File System operations
ipcMain.handle('fs:readFile', async (event, filePath: string) => {
  const fs = await import('fs/promises');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:exists', async (event, filePath: string) => {
  const fs = await import('fs/promises');
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs:ensureDir', async (event, dirPath: string) => {
  try {
    await mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:rename', async (event, oldPath: string, newPath: string) => {
  const fs = await import('fs/promises');
  try {
    await fs.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:delete', async (event, filePath: string) => {
  const fs = await import('fs/promises');
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      await fs.rmdir(filePath, { recursive: true });
    } else {
      await fs.unlink(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:writeFile', async (event, filePath: string, content: string) => {
  const fs = await import('fs/promises');
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:readDir', async (event, dirPath: string) => {
  const fs = await import('fs/promises');
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      path: join(dirPath, entry.name),
      isDirectory: entry.isDirectory()
    }));
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Storage operations
ipcMain.handle('store:get', (event, key: string) => {
  return (store as any).get(key);
});

ipcMain.handle('store:set', (event, key: string, value: any) => {
  (store as any).set(key, value);
  return { success: true };
});

ipcMain.handle('store:delete', (event, key: string) => {
  (store as any).delete(key);
  return { success: true };
});

ipcMain.handle('store:getHomePath', () => {
  return app.getPath('home');
});

// Session operations
ipcMain.handle('claude:listSessions', async () => {
  try {
    // For now, return mock data. In a real implementation, this would read from session storage
    return {
      success: true,
      sessions: [
        {
          id: 'session-1',
          name: 'Previous Session',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          messageCount: 15,
          duration: 1800000,
          preview: 'Working on implementing the context system...'
        },
        {
          id: 'session-2',
          name: 'Older Session',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          messageCount: 25,
          duration: 3600000,
          preview: 'Fixed the memory issue with the knowledge base...'
        }
      ]
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:resumeSession', async (event, instanceId: string, sessionId: string) => {
  try {
    // For now, just return success. In a real implementation, this would restore the session
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Hook operations
ipcMain.handle('claude:getHooks', async () => {
  try {
    // Return hooks from Claude's settings file
    const hooks = await claudeSettingsManager.getHooks();
    return { success: true, hooks };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:addHook', async (event, hook: any) => {
  try {
    const existingHooks = await claudeSettingsManager.getHooks();
    const newHook = {
      ...hook,
      id: `hook_${Date.now()}`,
      disabled: hook.disabled !== undefined ? hook.disabled : false
    };
    existingHooks.push(newHook);
    await claudeSettingsManager.saveHooks(existingHooks);
    return { success: true, hook: newHook };
  } catch (error) {
    console.error('Error in claude:addHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:updateHook', async (event, hookId: string, updates: any) => {
  try {
    const hooks = await claudeSettingsManager.getHooks();
    const index = hooks.findIndex((h: any) => h.id === hookId);
    if (index !== -1) {
      hooks[index] = { ...hooks[index], ...updates };
      await claudeSettingsManager.saveHooks(hooks);
      return { success: true };
    }
    return { success: false, error: 'Hook not found' };
  } catch (error) {
    console.error('Error in claude:updateHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Add removeHook as an alias for deleteHook for compatibility
ipcMain.handle('claude:removeHook', async (event, hookId: string) => {
  try {
    const hooks = await claudeSettingsManager.getHooks();
    const filteredHooks = hooks.filter((h: any) => h.id !== hookId);
    await claudeSettingsManager.saveHooks(filteredHooks);
    return { success: true };
  } catch (error) {
    console.error('Error in claude:removeHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:deleteHook', async (event, hookId: string) => {
  try {
    const hooks = await claudeSettingsManager.getHooks();
    const filtered = hooks.filter((h: any) => h.id !== hookId);
    await claudeSettingsManager.saveHooks(filtered);
    return { success: true };
  } catch (error) {
    console.error('Error in claude:deleteHook:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Clear Claude detector cache (useful if installation changes)
ipcMain.handle('claude:clearCache', async () => {
  ClaudeDetector.clearCache();
  return { success: true };
});

// Test a hook
ipcMain.handle('claude:testHook', async (event, hook: any) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const testCommand = claudeSettingsManager.createTestCommand(hook);
    const { stdout, stderr } = await execAsync(testCommand, {
      timeout: 5000 // 5 second timeout
    });
    
    return { 
      success: true, 
      output: stdout + (stderr ? '\n\nErrors:\n' + stderr : '')
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || String(error),
      output: error.stdout || ''
    };
  }
});

// Open external links
ipcMain.handle('shell:openExternal', async (event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Dialog operations
ipcMain.handle('dialog:selectFolder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Workspace Folder'
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dialog:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Open File',
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss', 'html'] }
      ]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, options);
    return result;
  } catch (error) {
    return { canceled: true, filePaths: [] };
  }
});

ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, options);
    return result;
  } catch (error) {
    return { canceled: true, filePath: undefined };
  }
});

// Claude installation detection
ipcMain.handle('claude:detectInstallation', async () => {
  try {
    const claudeInfo = await ClaudeDetector.detectClaude();
    return { success: true, info: claudeInfo };
  } catch (error) {
    return { success: false };
  }
});

// File watching operations
ipcMain.handle('fs:watchFile', async (event, filePath: string) => {
  try {
    // Don't create duplicate watchers
    if (fileWatchers.has(filePath)) {
      return { success: true };
    }

    const watcher = watch(filePath, async (eventType, filename) => {
      if (eventType === 'change') {
        // Clear existing timer for this file
        const existingTimer = fileDebounceTimers.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        // Set new timer with debounce
        const timer = setTimeout(async () => {
          try {
            // Read the new content
            const content = await readFile(filePath, 'utf-8');
            
            // Send update to renderer
            mainWindow?.webContents.send('file:changed', {
              path: filePath,
              content
            });
          } catch (error) {
            console.error('Error reading changed file:', error);
          }
          
          // Clean up timer
          fileDebounceTimers.delete(filePath);
        }, 300); // 300ms debounce
        
        fileDebounceTimers.set(filePath, timer);
      }
    });

    fileWatchers.set(filePath, watcher);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to watch file:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Directory watching operations
ipcMain.handle('fs:watchDirectory', async (event, dirPath: string) => {
  try {
    // Don't create duplicate watchers
    const watchKey = `dir:${dirPath}`;
    if (fileWatchers.has(watchKey)) {
      return { success: true };
    }

    const watcher = watch(dirPath, { recursive: false }, async (eventType, filename) => {
      // Send update to renderer
      mainWindow?.webContents.send('directory:changed', {
        path: dirPath,
        eventType,
        filename
      });
    });

    fileWatchers.set(watchKey, watcher);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to watch directory:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:unwatchDirectory', async (event, dirPath: string) => {
  try {
    const watchKey = `dir:${dirPath}`;
    const watcher = fileWatchers.get(watchKey);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(watchKey);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('fs:unwatchFile', async (event, filePath: string) => {
  try {
    const watcher = fileWatchers.get(filePath);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(filePath);
      
      // Clear any pending debounce timer
      const timer = fileDebounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        fileDebounceTimers.delete(filePath);
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Clean up watchers on app quit
app.on('before-quit', () => {
  for (const [path, watcher] of fileWatchers) {
    watcher.close();
  }
  fileWatchers.clear();
  
  // Clean up any pending debounce timers
  for (const [path, timer] of fileDebounceTimers) {
    clearTimeout(timer);
  }
  fileDebounceTimers.clear();
});

// Claude SDK operations
ipcMain.handle('claude:sdk:getTodos', async (event, projectPath: string) => {
  try {
    const result = await claudeCodeService.getCurrentTodos(projectPath);
    return result;
  } catch (error) {
    console.error('Error getting todos via SDK:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:sdk:createTodos', async (event, taskDescription: string, projectPath: string) => {
  try {
    const result = await claudeCodeService.createTodosForTask(taskDescription, projectPath);
    return result;
  } catch (error) {
    console.error('Error creating todos via SDK:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:sdk:updateTodo', async (event, todoId: string, newStatus: string, projectPath: string) => {
  try {
    const result = await claudeCodeService.updateTodoStatus(todoId, newStatus, projectPath);
    return result;
  } catch (error) {
    console.error('Error updating todo via SDK:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Search operations
ipcMain.handle('search:findInFiles', async (event, options) => {
  const { query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern, workspacePath } = options;
  const { promisify } = await import('util');
  const { exec } = await import('child_process');
  const execAsync = promisify(exec);
  const path = await import('path');
  const fs = await import('fs/promises');
  
  // Use workspace path if provided, otherwise fall back to current directory
  const workingDir = workspacePath || process.cwd();
  
  // Validate that the workspace path exists
  try {
    await fs.access(workingDir);
  } catch (error) {
    throw new Error(`Workspace directory not found: ${workingDir}`);
  }
  
  try {
    // Try ripgrep first
    let cmd = `rg "${query}"`;
    if (caseSensitive) cmd += ' -s';
    if (wholeWord) cmd += ' -w';
    if (!useRegex) cmd += ' -F';
    if (includePattern) cmd += ` -g "${includePattern}"`;
    if (excludePattern) {
      const patterns = excludePattern.split(',').map((p: string) => p.trim());
      patterns.forEach((p: string) => cmd += ` -g "!${p}"`);
    }
    cmd += ' --json';
    
    const { stdout } = await execAsync(cmd, { 
      cwd: workingDir,
      maxBuffer: 10 * 1024 * 1024
    });
    
    // Parse ripgrep JSON output
    const results = new Map<string, any>();
    const lines = stdout.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type === 'match') {
          const filePath = data.data.path.text;
          const relativePath = path.relative(workingDir, filePath);
          
          if (!results.has(filePath)) {
            results.set(filePath, {
              path: filePath,
              relativePath: relativePath,
              matches: []
            });
          }
          
          results.get(filePath)!.matches.push({
            line: data.data.line_number,
            column: data.data.submatches[0].start,
            text: data.data.lines.text,
            length: data.data.submatches[0].end - data.data.submatches[0].start
          });
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    }
    
    return Array.from(results.values());
  } catch (error) {
    // Fallback to Node.js implementation
    return await fallbackSearch(workingDir, options);
  }
});

// Fallback search implementation using Node.js
async function fallbackSearch(workingDir: string, options: any) {
  const { query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern } = options;
  const path = await import('path');
  const fs = await import('fs/promises');
  
  const results = new Map<string, any>();
  
  // Build regex pattern
  let pattern = query;
  if (!useRegex) {
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }
  
  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  
  // Default exclude patterns
  const defaultExcludes = ['node_modules', 'dist', '.git', '.next', 'build', 'out'];
  const excludes = excludePattern 
    ? [...defaultExcludes, ...excludePattern.split(',').map((p: string) => p.trim().replace('**/', '').replace('/**', ''))]
    : defaultExcludes;
  
  const searchInDirectory = async (dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip excluded directories/files
        if (excludes.some(exclude => entry.name.includes(exclude) || fullPath.includes(exclude))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await searchInDirectory(fullPath);
        } else if (entry.isFile()) {
          // Check include pattern
          if (includePattern) {
            const patterns = includePattern.split(',').map((p: string) => p.trim());
            const matchesInclude = patterns.some((p: string) => {
              if (p.startsWith('*.')) {
                return entry.name.endsWith(p.substring(1));
              }
              return entry.name.includes(p);
            });
            if (!matchesInclude) continue;
          }
          
          // Search in text files only
          const ext = path.extname(entry.name).toLowerCase();
          const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.json', '.md', '.txt', '.css', '.scss', '.html', '.xml', '.yaml', '.yml', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'];
          
          if (!textExtensions.includes(ext)) continue;
          
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            const matches: any[] = [];
            
            lines.forEach((line, lineIndex) => {
              let match;
              regex.lastIndex = 0; // Reset regex
              while ((match = regex.exec(line)) !== null) {
                matches.push({
                  line: lineIndex + 1,
                  column: match.index,
                  text: line,
                  length: match[0].length
                });
                if (!regex.global) break;
              }
            });
            
            if (matches.length > 0) {
              const relativePath = path.relative(workingDir, fullPath);
              results.set(fullPath, {
                path: fullPath,
                relativePath: relativePath,
                matches: matches
              });
            }
          } catch (err) {
            // Skip files that can't be read
          }
        }
      }
    } catch (err) {
      // Skip directories that can't be accessed
    }
  };
  
  await searchInDirectory(workingDir);
  return Array.from(results.values());
}

ipcMain.handle('search:replaceInFile', async (event, options) => {
  const fs = await import('fs/promises');
  const { filePath, searchQuery, replaceQuery, line, column, caseSensitive, wholeWord, useRegex } = options;
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    if (line > 0 && line <= lines.length) {
      const lineContent = lines[line - 1];
      let pattern = searchQuery;
      
      if (!useRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      
      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      lines[line - 1] = lineContent.replace(regex, replaceQuery);
      
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Replace failed:', error);
    throw error;
  }
});

ipcMain.handle('search:replaceAllInFile', async (event, options) => {
  const fs = await import('fs/promises');
  const { filePath, searchQuery, replaceQuery, caseSensitive, wholeWord, useRegex } = options;
  
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let pattern = searchQuery;
    
    if (!useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    
    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    content = content.replace(regex, replaceQuery);
    
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Replace all failed:', error);
    throw error;
  }
});

// Terminal operations
const terminals = new Map<string, any>();

ipcMain.handle('terminal:create', async (event, options) => {
  const pty = await import('node-pty');
  const { v4: uuidv4 } = await import('uuid');
  
  try {
    const id = uuidv4();
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
    
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.cwd(),
      env: process.env as any
    });
    
    terminals.set(id, ptyProcess);
    
    ptyProcess.onData((data) => {
      mainWindow?.webContents.send(`terminal:data:${id}`, data);
    });
    
    ptyProcess.onExit(({ exitCode, signal }) => {
      terminals.delete(id);
      mainWindow?.webContents.send(`terminal:exit:${id}`, { exitCode, signal });
    });
    
    return { success: true, id };
  } catch (error) {
    console.error('Failed to create terminal:', error);
    throw error;
  }
});

ipcMain.handle('terminal:write', async (event, id: string, data: string) => {
  const terminal = terminals.get(id);
  if (terminal) {
    terminal.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('terminal:resize', async (event, id: string, cols: number, rows: number) => {
  const terminal = terminals.get(id);
  if (terminal) {
    terminal.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('terminal:destroy', async (event, id: string) => {
  const terminal = terminals.get(id);
  if (terminal) {
    terminal.kill();
    terminals.delete(id);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Clean up terminals on app quit
app.on('before-quit', () => {
  for (const [id, terminal] of terminals) {
    terminal.kill();
  }
  terminals.clear();
});

// MCP (Model Context Protocol) Management - Using Claude CLI
ipcMain.handle('mcp:list', async (event, workspacePath?: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Get workspace path from store if not provided
    if (!workspacePath) {
      workspacePath = (store as any).get('workspacePath') || process.cwd();
    }
    
    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;
    
    const { stdout } = await execAsync(`${claudeCommand} mcp list`, {
      cwd: workspacePath,
      env: process.env
    });
    
    // Parse the text output
    const lines = stdout.trim().split('\n');
    const servers: any[] = [];
    
    // Skip the "No MCP servers configured" message
    if (stdout.includes('No MCP servers configured')) {
      return { success: true, servers: [] };
    }
    
    for (const line of lines) {
      if (line.includes(':')) {
        // Parse lines like "context7: https://mcp.context7.com/mcp" or "context7: https://mcp.context7.com/mcp (HTTP)"
        const colonIndex = line.indexOf(':');
        const name = line.substring(0, colonIndex).trim();
        const rest = line.substring(colonIndex + 1).trim();
        
        // Check if transport type is specified in parentheses
        const parenIndex = rest.lastIndexOf('(');
        let url = rest;
        let transport = 'stdio'; // default
        
        if (parenIndex > -1) {
          url = rest.substring(0, parenIndex).trim();
          transport = rest.substring(parenIndex + 1, rest.length - 1).trim().toLowerCase();
        } else {
          // Infer transport from URL
          if (url.startsWith('http://') || url.startsWith('https://')) {
            transport = 'http';
          }
        }
        
        servers.push({
          name,
          url: url.trim(),
          transport: transport === 'http' || transport === 'sse' ? transport : 'stdio'
        });
      }
    }
    
    return { success: true, servers };
  } catch (error) {
    console.error('Failed to list MCP servers:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to list servers' 
    };
  }
});

ipcMain.handle('mcp:add', async (event, config) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Get workspace path from store
    const workspacePath = (store as any).get('workspacePath') || process.cwd();
    
    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;
    
    // Build the command with proper transport flag
    let command = `${claudeCommand} mcp add`;
    
    // Add transport type
    command += ` --transport ${config.type}`;
    
    // Add the name
    command += ` "${config.name}"`;
    
    // Add environment variables BEFORE the command (they're options for claude mcp add)
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        command += ` -e "${key}=${value}"`;
      }
    }
    
    // Add headers for SSE/HTTP servers BEFORE the command
    if (config.headers && (config.type === 'sse' || config.type === 'http')) {
      for (const [key, value] of Object.entries(config.headers)) {
        command += ` -H "${key}: ${value}"`;
      }
    }
    
    // Add -- to stop option parsing, then add the command/URL based on type
    if (config.type === 'stdio') {
      command += ` -- "${config.command}"`;
      if (config.args && config.args.length > 0) {
        // Pass each argument separately
        command += ` ${config.args.map((arg: string) => `"${arg}"`).join(' ')}`;
      }
    } else if (config.type === 'sse' || config.type === 'http') {
      // For HTTP/SSE servers, the URL is the command argument
      command += ` -- "${config.url}"`;
    }
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspacePath,
      env: process.env
    });
    
    if (stderr && !stdout) {
      return { success: false, error: stderr };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to add MCP server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add server' 
    };
  }
});

ipcMain.handle('mcp:remove', async (event, name: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Get workspace path from store
    const workspacePath = (store as any).get('workspacePath') || process.cwd();
    
    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;
    
    const { stdout, stderr } = await execAsync(`${claudeCommand} mcp remove "${name}"`, {
      cwd: workspacePath,
      env: process.env
    });
    
    if (stderr && !stdout) {
      return { success: false, error: stderr };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to remove MCP server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove server' 
    };
  }
});

ipcMain.handle('mcp:get', async (event, name: string) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Get workspace path from store
    const workspacePath = (store as any).get('workspacePath') || process.cwd();
    
    // Detect Claude to use the correct binary
    const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
    const claudeCommand = claudeInfo.path;
    
    const { stdout } = await execAsync(`${claudeCommand} mcp get "${name}"`, {
      cwd: workspacePath,
      env: process.env
    });
    
    // Parse the text output to extract server details
    const server: any = { name };
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      if (line.includes('Type:')) {
        server.transport = line.split(':')[1].trim().toLowerCase();
      } else if (line.includes('URL:')) {
        server.url = line.split('URL:')[1].trim();
      } else if (line.includes('Command:')) {
        server.command = line.split('Command:')[1].trim();
      }
    }
    
    return { success: true, server };
  } catch (error) {
    console.error('Failed to get MCP server details:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get server details' 
    };
  }
});

// Test MCP connection by trying to add and immediately remove
ipcMain.handle('mcp:test', async (event, config) => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // For HTTP/SSE servers, test the URL directly
    if (config.type === 'sse' || config.type === 'http') {
      const https = await import('https');
      const http = await import('http');
      const url = new URL(config.url);
      const client = url.protocol === 'https:' ? https : http;

      return new Promise((resolve) => {
        const req = client.request(config.url, { method: 'HEAD', timeout: 5000 }, (res) => {
          resolve({ success: res.statusCode !== undefined && res.statusCode < 500 });
        });

        req.on('error', (error: Error) => {
          resolve({ 
            success: false, 
            error: `Connection failed: ${error.message}` 
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Connection timed out' });
        });

        req.end();
      });
    }
    
    // For stdio servers, test if command exists
    if (config.type === 'stdio') {
      const { stdout, stderr } = await execAsync(`which "${config.command}"`, {
        env: process.env
      });
      
      if (stdout.trim()) {
        return { success: true };
      } else {
        return { success: false, error: 'Command not found' };
      }
    }
    
    return { success: false, error: 'Unknown server type' };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Test failed' 
    };
  }
});

// Lightweight Context Handlers
ipcMain.handle('context:initialize', async (event, workspacePath: string) => {
  try {
    await lightweightContext.initialize(workspacePath);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to initialize context' 
    };
  }
});

ipcMain.handle('context:searchFiles', async (event, query: string, limit: number = 20) => {
  try {
    const results = await lightweightContext.searchFiles(query, limit);
    return { success: true, results };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to search files' 
    };
  }
});

ipcMain.handle('context:buildContext', async (event, query: string, workingFiles: string[], maxTokens: number = 2000) => {
  try {
    const context = await lightweightContext.buildContext(query, workingFiles, maxTokens);
    return { success: true, context };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to build context' 
    };
  }
});

ipcMain.handle('context:getStatistics', async (event) => {
  try {
    const statistics = lightweightContext.getStatistics();
    return { success: true, statistics };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get statistics' 
    };
  }
});

ipcMain.handle('context:getFileContent', async (event, filePath: string) => {
  try {
    const content = await lightweightContext.getFileContent(filePath);
    return { success: true, content };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get file content' 
    };
  }
});

ipcMain.handle('context:getRecentFiles', async (event, hours: number = 24) => {
  try {
    const files = lightweightContext.getRecentFiles(hours);
    return { success: true, files };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get recent files' 
    };
  }
});

ipcMain.handle('context:rescan', async (event) => {
  try {
    await lightweightContext.scanWorkspace();
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to rescan workspace' 
    };
  }
});

ipcMain.handle('context:startWatching', async (event) => {
  try {
    lightweightContext.startWatching();
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start file watching' 
    };
  }
});

ipcMain.handle('context:stopWatching', async (event) => {
  try {
    lightweightContext.stopWatching();
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to stop file watching' 
    };
  }
});

// Set up file change notifications to frontend
lightweightContext.onFileChange((event, filePath) => {
  if (mainWindow) {
    mainWindow.webContents.send('context:file-changed', { event, filePath });
  }
});

// Context optimization handlers
ipcMain.handle('context:analyzeUsage', async (event, messages: any[], currentContext: string) => {
  try {
    const analysis = contextOptimizer.analyzeContextUsage(messages, currentContext);
    return { success: true, analysis };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to analyze context usage' 
    };
  }
});

ipcMain.handle('context:buildOptimized', async (event, query: string, workingFiles: string[], maxTokens: number) => {
  try {
    const result = await contextOptimizer.buildOptimizedContext(query, workingFiles, maxTokens);
    return { success: true, ...result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to build optimized context' 
    };
  }
});

ipcMain.handle('context:optimize', async (event, content: string, strategy: any) => {
  try {
    const result = contextOptimizer.optimizeContext(content, strategy);
    return { success: true, result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to optimize context' 
    };
  }
});

ipcMain.handle('context:getRecommendations', async (event, usage: any) => {
  try {
    const recommendations = contextOptimizer.getOptimizationRecommendations(usage);
    return { success: true, recommendations };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get recommendations' 
    };
  }
});

ipcMain.handle('context:shouldInject', async (event, query: string, availableTokens: number, contextSize: number) => {
  try {
    const decision = contextOptimizer.shouldInjectContext(query, availableTokens, contextSize);
    return { success: true, decision };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to evaluate context injection' 
    };
  }
});

// Workspace persistence handlers
ipcMain.handle('workspace:loadContext', async (event, workspacePath: string) => {
  try {
    const data = await workspacePersistence.loadWorkspaceContext(workspacePath);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to load workspace context' 
    };
  }
});

ipcMain.handle('workspace:saveContext', async (event, data: any) => {
  try {
    await workspacePersistence.saveWorkspaceContext(data);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save workspace context' 
    };
  }
});

ipcMain.handle('workspace:updateOptimizationTime', async (event, workspacePath: string, lastOptimization: string) => {
  try {
    await workspacePersistence.updateOptimizationTime(workspacePath, lastOptimization);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update optimization time' 
    };
  }
});

ipcMain.handle('workspace:updateWorkingFiles', async (event, workspacePath: string, workingFiles: string[]) => {
  try {
    await workspacePersistence.updateWorkingFiles(workspacePath, workingFiles);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update working files' 
    };
  }
});

ipcMain.handle('workspace:saveCheckpoint', async (event, workspacePath: string, checkpoint: any) => {
  try {
    await workspacePersistence.saveCheckpoint(workspacePath, checkpoint);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save checkpoint' 
    };
  }
});

ipcMain.handle('workspace:removeCheckpoint', async (event, workspacePath: string, checkpointId: string) => {
  try {
    await workspacePersistence.removeCheckpoint(workspacePath, checkpointId);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove checkpoint' 
    };
  }
});

ipcMain.handle('workspace:getRecentHistory', async (event, workspacePath: string, limit: number) => {
  try {
    const history = await workspacePersistence.getRecentContextHistory(workspacePath, limit);
    return { success: true, history };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get recent history' 
    };
  }
});

ipcMain.handle('workspace:exportContext', async (event, workspacePath: string) => {
  try {
    const jsonData = await workspacePersistence.exportWorkspaceContext(workspacePath);
    return { success: true, data: jsonData };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to export workspace context' 
    };
  }
});

ipcMain.handle('workspace:importContext', async (event, workspacePath: string, jsonData: string) => {
  try {
    await workspacePersistence.importWorkspaceContext(workspacePath, jsonData);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import workspace context' 
    };
  }
});

// Current active services
let currentCheckpointService: CheckpointService | null = null;
let currentWorktreeManager: WorktreeManager | null = null;
// let currentGitHooksManager: GitHooksManager | null = null; - now handled by GitHooksManagerGlobal

// Git service initialization when workspace changes
ipcMain.handle('workspace:setPath', async (event, workspacePath: string) => {
  console.log('[Main] workspace:setPath called with:', workspacePath);
  
  try {
    // Store the workspace path
    (store as any).set('workspacePath', workspacePath);
    
    try {
      // Update the Git Service Manager with the new workspace
      console.log('[Main] Updating GitServiceManager...');
      const gitServiceManager = GitServiceManager.getInstance();
      gitServiceManager.setWorkspace(workspacePath);
      console.log('[Main] GitServiceManager updated successfully');
    } catch (error) {
      console.error('[Main] Error updating GitServiceManager:', error);
    }
    
    try {
      // Update the Checkpoint Service Manager with the new workspace
      console.log('[Main] Updating CheckpointServiceManager...');
      const checkpointServiceManager = CheckpointServiceManager.getInstance();
      checkpointServiceManager.setWorkspace(workspacePath);
      console.log('[Main] CheckpointServiceManager updated successfully');
    } catch (error) {
      console.error('[Main] Error updating CheckpointServiceManager:', error);
    }
    
    try {
      // Update the Worktree Manager with the new workspace
      console.log('[Main] Updating WorktreeManagerGlobal...');
      const worktreeManagerGlobal = WorktreeManagerGlobal.getInstance();
      console.log('[Main] Got WorktreeManagerGlobal instance');
      const result = worktreeManagerGlobal.setWorkspace(workspacePath);
      console.log('[Main] WorktreeManagerGlobal.setWorkspace returned:', result ? 'manager created' : 'null');
    } catch (error) {
      console.error('[Main] Error updating WorktreeManagerGlobal:', error);
    }
    
    try {
      // Update the Git Hooks Manager with the new workspace
      console.log('[Main] Updating GitHooksManagerGlobal...');
      const gitHooksManagerGlobal = GitHooksManagerGlobal.getInstance();
      console.log('[Main] Got GitHooksManagerGlobal instance');
      const result = gitHooksManagerGlobal.setWorkspace(workspacePath);
      console.log('[Main] GitHooksManagerGlobal.setWorkspace returned:', result ? 'manager created' : 'null');
    } catch (error) {
      console.error('[Main] Error updating GitHooksManagerGlobal:', error);
    }
    
    console.log('[Main] All service managers updated with workspace:', workspacePath);
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to set workspace path' 
    };
  }
});

// Clean up git services on app quit
app.on('before-quit', () => {
  for (const [path, service] of gitServices) {
    service.cleanup();
  }
  gitServices.clear();
});