import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import Store from 'electron-store';
import * as pty from 'node-pty';
import { watch, FSWatcher } from 'fs';
import { readFile, mkdir } from 'fs/promises';
import { claudeCodeService } from './claude-sdk-service.js';

// Load environment variables from .env file
import { config } from 'dotenv';
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let claudeProcess: ChildProcess | null = null;
let claudePty: pty.IPty | null = null;
const store = new Store();
const fileWatchers: Map<string, FSWatcher> = new Map();
const fileDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

const isDev = process.env.NODE_ENV !== 'production';
const nuxtURL = isDev ? 'http://localhost:3000' : `file://${join(__dirname, '../.output/public/index.html')}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev
    },
    titleBarStyle: 'hiddenInset',
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
    if (claudePty) {
      claudePty.kill();
      claudePty = null;
    }
  });
}

app.whenReady().then(() => {
  console.log('=== ELECTRON MAIN PROCESS STARTED ===');
  console.log('Node version:', process.version);
  console.log('Electron version:', process.versions.electron);
  
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

// Claude Process Management using PTY
ipcMain.handle('claude:start', async (event, workingDirectory: string) => {
  if (claudePty) {
    return { success: false, error: 'Claude process already running' };
  }

  try {
    console.log('=== STARTING CLAUDE CLI WITH PTY ===');
    console.log('Working directory:', workingDirectory);
    // Get Node.js bin path from environment or use system PATH
    const nodeBinPath = process.env.NODE_BIN_PATH || '';
    const claudeCommand = process.env.CLAUDE_CLI_PATH || 'claude';
    const enhancedPath = nodeBinPath ? `${nodeBinPath}:${process.env.PATH}` : process.env.PATH;
    
    console.log('Enhanced PATH:', enhancedPath);
    console.log('Claude command:', claudeCommand);
    
    // Create a pseudo-terminal for Claude
    claudePty = pty.spawn(claudeCommand, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: workingDirectory,
      env: {
        ...process.env,
        PATH: enhancedPath,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      }
    });

    console.log('=== CLAUDE PTY SPAWNED ===');
    console.log('PID:', claudePty.pid);
    console.log('Process:', claudePty.process);

    // Handle output from Claude
    claudePty.onData((data: string) => {
      // Only log errors or important events, not every character
      // console.log('Claude PTY output (raw):', JSON.stringify(data));
      // console.log('Claude PTY output (clean):', data);
      mainWindow?.webContents.send('claude:output', data);
    });

    // Handle exit
    claudePty.onExit(({ exitCode, signal }) => {
      console.log('Claude PTY exited with code:', exitCode, 'signal:', signal);
      mainWindow?.webContents.send('claude:exit', exitCode);
      claudePty = null;
    });

    // Log PTY status after a short delay
    setTimeout(() => {
      if (claudePty) {
        console.log('Claude PTY still running after 1 second');
        console.log('PID:', claudePty.pid);
      } else {
        console.log('Claude PTY not running after 1 second');
      }
    }, 1000);

    return { success: true, pid: claudePty.pid };
  } catch (error) {
    console.error('Failed to start Claude with PTY:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:send', async (event, command: string) => {
  if (!claudePty) {
    return { success: false, error: 'Claude PTY not running' };
  }

  try {
    // Only log important commands, not every keystroke
    if (command.includes('\n') || command.includes('\r')) {
      console.log('Sending command to Claude PTY');
    }
    
    // Write raw data to PTY (xterm.js will handle line endings)
    claudePty.write(command);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to send command to Claude PTY:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('claude:stop', async () => {
  if (claudePty) {
    claudePty.kill();
    claudePty = null;
    return { success: true };
  }
  return { success: false, error: 'No Claude PTY running' };
});

ipcMain.handle('claude:resize', async (event, cols: number, rows: number) => {
  if (claudePty) {
    try {
      claudePty.resize(cols, rows);
      return { success: true };
    } catch (error) {
      console.error('Failed to resize PTY:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { success: false, error: 'No Claude PTY running' };
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

// File watching operations
ipcMain.handle('fs:watchFile', async (event, filePath: string) => {
  try {
    // Don't create duplicate watchers
    if (fileWatchers.has(filePath)) {
      return { success: true };
    }

    console.log('Starting file watcher for:', filePath);
    
    const watcher = watch(filePath, async (eventType, filename) => {
      if (eventType === 'change') {
        // Clear existing timer for this file
        const existingTimer = fileDebounceTimers.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        // Set new timer with debounce
        const timer = setTimeout(async () => {
          console.log('File changed:', filePath);
          
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

    console.log('Starting directory watcher for:', dirPath);
    
    const watcher = watch(dirPath, { recursive: false }, async (eventType, filename) => {
      console.log('Directory change detected:', eventType, filename, 'in', dirPath);
      
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
      console.log('Stopped watching directory:', dirPath);
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
      
      console.log('Stopped watching file:', filePath);
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
    console.log('Ripgrep not available, falling back to Node.js search...');
    
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