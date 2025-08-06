import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import Store from 'electron-store';
import * as pty from 'node-pty';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { readFile, mkdir } from 'fs/promises';
import { watch as chokidarWatch } from 'chokidar';
import { homedir } from 'os';
import { claudeCodeService } from './claude-sdk-service.js';
import { lightweightContext } from './lightweight-context.js';
import { contextOptimizer } from './context-optimizer.js';
import { workspacePersistence } from './workspace-persistence.js';
import { searchWithRipgrep } from './search-ripgrep.js';
import { claudeSettingsManager } from './claude-settings-manager.js';
import { ClaudeDetector } from './claude-detector.js';
import { fileWatcherService } from './file-watcher.js';
import { createKnowledgeCache } from './knowledge-cache.js';
import { GitServiceManager } from './git-service-manager.js';
import { WorktreeManagerGlobal } from './worktree-manager-global.js';
import { GitHooksManagerGlobal } from './git-hooks-manager-global.js';
import { SnapshotService } from './snapshot-service.js';
import { setupGitTimelineHandlers } from './git-timeline-handlers.js';
import { ghostTextService } from './ghost-text-service.js';
// Load environment variables from .env file
import { config } from 'dotenv';
config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let mainWindow = null;
const store = new Store();
const fileWatchers = new Map();
// Multi-instance Claude support
const claudeInstances = new Map();
const claudeSessions = new Map();
// Knowledge cache instances per workspace
const knowledgeCaches = new Map();
// Git service instances per workspace
const gitServices = new Map();
// Worktree manager instances per workspace
const worktreeManagers = new Map();
// Git hooks manager instances per workspace - now handled by GitHooksManagerGlobal
// const gitHooksManagers: Map<string, GitHooksManager> = new Map();
// Snapshot service instances per workspace
const snapshotServices = new Map();
const isDev = process.env.NODE_ENV !== 'production';
const nuxtURL = isDev ? 'http://localhost:3000' : `file://${join(__dirname, '../.output/public/index.html')}`;
// Helper function to save sessions to project-level .claude/sessions/
function saveSessionsToDisk() {
    try {
        // Get current workspace path
        const workspacePath = store.get('workspacePath') || process.cwd();
        const sessionsDir = join(workspacePath, '.claude', 'sessions');
        // Ensure directory exists
        if (!existsSync(sessionsDir)) {
            mkdirSync(sessionsDir, { recursive: true });
        }
        // Save each session to its own file
        claudeSessions.forEach((session) => {
            const sessionFile = join(sessionsDir, `${session.instanceId}.json`);
            writeFileSync(sessionFile, JSON.stringify(session, null, 2));
        });
        // Also save a manifest of active sessions
        const manifest = {
            sessions: Array.from(claudeSessions.keys()),
            lastUpdated: Date.now()
        };
        writeFileSync(join(sessionsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        console.log(`Saved ${claudeSessions.size} sessions to .claude/sessions/`);
    }
    catch (error) {
        console.error('Failed to save sessions to disk:', error);
    }
}
// Helper function to load sessions from project-level .claude/sessions/
function loadSessionsFromDisk() {
    try {
        // Get current workspace path
        const workspacePath = store.get('workspacePath') || process.cwd();
        const sessionsDir = join(workspacePath, '.claude', 'sessions');
        if (!existsSync(sessionsDir)) {
            return;
        }
        // Load manifest if it exists
        const manifestFile = join(sessionsDir, 'manifest.json');
        if (existsSync(manifestFile)) {
            const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
            // Load each session file
            manifest.sessions.forEach((sessionId) => {
                const sessionFile = join(sessionsDir, `${sessionId}.json`);
                if (existsSync(sessionFile)) {
                    try {
                        const session = JSON.parse(readFileSync(sessionFile, 'utf-8'));
                        // Load all sessions, no time limit
                        claudeSessions.set(session.instanceId, session);
                    }
                    catch (err) {
                        console.error(`Failed to load session ${sessionId}:`, err);
                    }
                }
            });
            console.log(`Loaded ${claudeSessions.size} sessions from .claude/sessions/`);
        }
    }
    catch (error) {
        console.error('Failed to load sessions from disk:', error);
    }
}
// Helper function to clean up all resources on reload/refresh
function cleanupResourcesOnReload() {
    console.log('Cleaning up resources on reload...');
    // Don't kill Claude instances immediately - just clear the map
    // The sessions will be restored after reload
    if (claudeInstances.size > 0) {
        console.log(`Preserving ${claudeInstances.size} Claude sessions for restoration...`);
        // Mark all active sessions for auto-start
        claudeInstances.forEach((pty, instanceId) => {
            const session = claudeSessions.get(instanceId);
            if (session) {
                session.shouldAutoStart = true;
                console.log(`Marked session ${instanceId} for auto-start`);
            }
        });
        // Save sessions to disk before clearing
        saveSessionsToDisk();
        // Clear the instances map without killing processes
        claudeInstances.clear();
    }
    // Clean up terminal instances (these can't be restored easily)
    if (terminals.size > 0) {
        console.log(`Cleaning up ${terminals.size} terminal instances...`);
        terminals.forEach((terminal, id) => {
            console.log(`Killing terminal: ${id}`);
            try {
                terminal.kill();
            }
            catch (error) {
                console.error(`Error killing terminal ${id}:`, error);
            }
        });
        terminals.clear();
    }
    // No cleanup - sessions are kept indefinitely until explicitly deleted by user
    console.log(`Preserved ${claudeSessions.size} recent Claude sessions for restoration`);
    console.log('Resource cleanup completed');
}
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
    // Clean up resources when the renderer process navigates/reloads
    mainWindow.webContents.on('will-navigate', () => {
        cleanupResourcesOnReload();
    });
    // Also handle reload specifically
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // Detect Cmd+R or Ctrl+R for reload
        if ((input.control || input.meta) && input.key === 'r' && input.type === 'keyDown') {
            cleanupResourcesOnReload();
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
app.whenReady().then(async () => {
    // Load preserved sessions from .claude/sessions/
    loadSessionsFromDisk();
    // Initialize all service managers (singletons)
    GitServiceManager.getInstance();
    WorktreeManagerGlobal.getInstance();
    GitHooksManagerGlobal.getInstance();
    // Initialize autocomplete services
    await ghostTextService.initialize();
    // Setup Git Timeline handlers
    setupGitTimelineHandlers();
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
ipcMain.handle('claude:start', async (event, instanceId, workingDirectory, instanceName, runConfig) => {
    if (claudeInstances.has(instanceId)) {
        return { success: false, error: 'Claude instance already running' };
    }
    // Check if we have a preserved session for this instance
    const preservedSession = claudeSessions.get(instanceId);
    // Always try to restore if session exists
    const shouldRestore = !!preservedSession;
    // If restoring, add a small delay to ensure clean state
    if (shouldRestore) {
        console.log(`Preparing to restore session for ${instanceId}...`);
        // Small delay to ensure clean state
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    try {
        // Detect Claude installation
        const claudeInfo = await ClaudeDetector.detectClaude(workingDirectory);
        // Get the command configuration
        const debugArgs = process.env.CLAUDE_DEBUG === 'true' ? ['--debug'] : [];
        // Session management strategy:
        // - Use --resume <sessionId> when restoring to continue the conversation
        // - Use --session-id <uuid> for new sessions to have a specific ID
        // - We need to capture the NEW session ID that Claude creates after resuming
        let sessionUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        // Build base arguments
        let baseArgs;
        if (shouldRestore && preservedSession?.sessionId) {
            // Use --resume to continue the previous conversation
            baseArgs = ['--resume', preservedSession.sessionId, ...debugArgs];
            console.log(`Resuming conversation with session ID ${preservedSession.sessionId} for instance ${instanceId}`);
        }
        else {
            // Start a new session with a specific ID
            baseArgs = ['--session-id', sessionUuid, ...debugArgs];
            console.log(`Starting new session with ID ${sessionUuid} for instance ${instanceId}`);
        }
        let { command, args: commandArgs, useShell } = ClaudeDetector.getClaudeCommand(claudeInfo, baseArgs);
        // Override with run config if provided
        if (runConfig) {
            if (runConfig.command) {
                // If the command is just 'claude', use the detected path
                command = runConfig.command === 'claude' ? command : runConfig.command;
            }
            if (runConfig.args && runConfig.args.length > 0) {
                // When we have custom args, we need to rebuild the command
                // Include resume or session-id based on whether we're restoring
                let allArgs;
                if (shouldRestore && preservedSession?.sessionId) {
                    allArgs = ['--resume', preservedSession.sessionId, ...runConfig.args, ...debugArgs];
                }
                else {
                    allArgs = ['--session-id', sessionUuid, ...runConfig.args, ...debugArgs];
                }
                const result = ClaudeDetector.getClaudeCommand(claudeInfo, allArgs);
                command = result.command;
                commandArgs = result.args;
                useShell = result.useShell;
            }
        }
        if (shouldRestore) {
            console.log(`Attempting to restore Claude session for instance ${instanceId}`);
        }
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
        // Store session data for potential restoration
        // Store the initial session ID (either new UUID or the one we're trying to resume)
        const initialSessionId = shouldRestore && preservedSession?.sessionId
            ? preservedSession.sessionId
            : sessionUuid;
        claudeSessions.set(instanceId, {
            sessionId: initialSessionId,
            instanceId,
            workingDirectory,
            instanceName,
            runConfig,
            lastActive: Date.now()
        });
        // Save to disk immediately
        saveSessionsToDisk();
        if (shouldRestore) {
            console.log(`Successfully restored Claude session for instance ${instanceId}`);
        }
        // After starting Claude, detect the new session file
        if (shouldRestore) {
            // Get the Claude project directory for this workspace
            const projectDirName = workingDirectory.replace(/\//g, '-');
            const claudeProjectDir = join(homedir(), '.claude', 'projects', projectDirName);
            // Wait a bit for Claude to create the new session file
            setTimeout(async () => {
                try {
                    if (existsSync(claudeProjectDir)) {
                        // Get all .jsonl files sorted by creation time
                        const files = readdirSync(claudeProjectDir)
                            .filter(f => f.endsWith('.jsonl'))
                            .map(f => {
                            const fullPath = join(claudeProjectDir, f);
                            const stats = statSync(fullPath);
                            return { name: f.replace('.jsonl', ''), time: stats.mtimeMs };
                        })
                            .sort((a, b) => b.time - a.time);
                        if (files.length > 0) {
                            const newestSessionId = files[0].name;
                            const session = claudeSessions.get(instanceId);
                            if (session && newestSessionId !== session.sessionId) {
                                console.log(`[Claude Session] Updated session ID for ${instanceId}: ${newestSessionId} (was: ${session.sessionId})`);
                                session.sessionId = newestSessionId;
                                saveSessionsToDisk();
                                // Send log to renderer
                                mainWindow?.webContents.send('log', `Session updated to: ${newestSessionId}`);
                            }
                        }
                    }
                }
                catch (error) {
                    console.error('Failed to detect new session ID:', error);
                }
            }, 3000); // Wait 3 seconds for Claude to create the session file
        }
        // Handle output from Claude
        claudePty.onData((data) => {
            // Update last active time on any output
            const session = claudeSessions.get(instanceId);
            if (session) {
                session.lastActive = Date.now();
            }
            // Send data with instance ID
            mainWindow?.webContents.send(`claude:output:${instanceId}`, data);
        });
        // Handle exit
        claudePty.onExit(({ exitCode, signal }) => {
            mainWindow?.webContents.send(`claude:exit:${instanceId}`, exitCode);
            claudeInstances.delete(instanceId);
            // Clear auto-start flag when session exits normally
            const session = claudeSessions.get(instanceId);
            if (session) {
                session.shouldAutoStart = false;
                saveSessionsToDisk();
            }
        });
        return {
            success: true,
            pid: claudePty.pid,
            claudeInfo: {
                path: claudeInfo.path,
                version: claudeInfo.version,
                source: claudeInfo.source
            },
            restored: shouldRestore
        };
    }
    catch (error) {
        console.error(`Failed to start Claude for ${instanceId}:`, error);
        // If restoration failed, try again without --continue
        if (shouldRestore) {
            console.log(`Session restoration failed for ${instanceId}, starting fresh session...`);
            try {
                // Re-detect Claude installation for fallback
                const claudeInfo = await ClaudeDetector.detectClaude(workingDirectory);
                // Get fresh command without --continue
                const debugArgs = process.env.CLAUDE_DEBUG === 'true' ? ['--debug'] : [];
                let { command, args: commandArgs } = ClaudeDetector.getClaudeCommand(claudeInfo, debugArgs);
                // Apply run config if provided
                if (runConfig && runConfig.args && runConfig.args.length > 0) {
                    const allArgs = [...runConfig.args, ...debugArgs];
                    const result = ClaudeDetector.getClaudeCommand(claudeInfo, allArgs);
                    command = result.command;
                    commandArgs = result.args;
                }
                // Start fresh Claude instance
                const claudePty = pty.spawn(command, commandArgs, {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 30,
                    cwd: workingDirectory,
                    env: {
                        ...process.env,
                        FORCE_COLOR: '1',
                        TERM: 'xterm-256color',
                        HOME: process.env.HOME,
                        USER: process.env.USER,
                        SHELL: process.env.SHELL || '/bin/bash',
                        CLAUDE_INSTANCE_ID: instanceId,
                        CLAUDE_INSTANCE_NAME: instanceName || `Claude-${instanceId.slice(7, 15)}`,
                        CLAUDE_IDE_INSTANCE: 'true'
                    }
                });
                // Store instance and session data
                claudeInstances.set(instanceId, claudePty);
                claudeSessions.set(instanceId, {
                    instanceId,
                    workingDirectory,
                    instanceName,
                    runConfig,
                    lastActive: Date.now()
                });
                // Set up handlers
                claudePty.onData((data) => {
                    const session = claudeSessions.get(instanceId);
                    if (session) {
                        session.lastActive = Date.now();
                    }
                    mainWindow?.webContents.send(`claude:output:${instanceId}`, data);
                });
                claudePty.onExit(({ exitCode }) => {
                    mainWindow?.webContents.send(`claude:exit:${instanceId}`, exitCode);
                    claudeInstances.delete(instanceId);
                });
                console.log(`Started fresh Claude session for ${instanceId} after restoration failed`);
                return {
                    success: true,
                    pid: claudePty.pid,
                    claudeInfo: {
                        path: claudeInfo.path,
                        version: claudeInfo.version,
                        source: claudeInfo.source
                    },
                    restored: false,
                    restorationFailed: true
                };
            }
            catch (fallbackError) {
                console.error(`Fallback to fresh session also failed for ${instanceId}:`, fallbackError);
                return { success: false, error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) };
            }
        }
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:send', async (event, instanceId, command) => {
    const claudePty = claudeInstances.get(instanceId);
    if (!claudePty) {
        return { success: false, error: `Claude instance is not running. Please start a Claude instance in the terminal first.` };
    }
    try {
        // Write raw data to PTY (xterm.js will handle line endings)
        claudePty.write(command);
        return { success: true };
    }
    catch (error) {
        console.error(`Failed to send command to Claude PTY ${instanceId}:`, error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Get preserved sessions that should auto-start
ipcMain.handle('claude:getPreservedSessions', async () => {
    const preserved = [];
    claudeSessions.forEach((session) => {
        if (session.shouldAutoStart) {
            preserved.push({ ...session });
        }
    });
    return preserved;
});
// Check if a session exists for an instance
ipcMain.handle('claude:hasSession', async (event, instanceId) => {
    return claudeSessions.has(instanceId);
});
// Clear auto-start flag after session is restored
ipcMain.handle('claude:clearAutoStart', async (event, instanceId) => {
    const session = claudeSessions.get(instanceId);
    if (session) {
        session.shouldAutoStart = false;
    }
    return { success: true };
});
// Pause Claude instance (keeps session data)
ipcMain.handle('claude:stop', async (event, instanceId) => {
    const claudePty = claudeInstances.get(instanceId);
    if (claudePty) {
        try {
            console.log(`Stopping Claude instance ${instanceId} (PID: ${claudePty.pid})...`);
            // Send SIGINT (Ctrl+C) for graceful shutdown
            // This should trigger Claude to save the session
            claudePty.kill('SIGINT');
            console.log(`Sent SIGINT to process ${claudePty.pid}`);
            // Wait for graceful shutdown and session save
            // Claude likely auto-saves on exit, so give it time
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Check if process is still alive and send SIGTERM if needed
            try {
                process.kill(claudePty.pid, 0); // Check if process exists
                console.log(`Process ${claudePty.pid} still alive, sending SIGTERM...`);
                claudePty.kill('SIGTERM');
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            catch (e) {
                // Process already dead, which is good
                console.log(`Process ${claudePty.pid} terminated gracefully`);
            }
            // Final force kill if still running
            try {
                process.kill(claudePty.pid, 0); // Check if process exists
                console.log(`Process ${claudePty.pid} still alive, forcing SIGKILL...`);
                claudePty.kill('SIGKILL');
            }
            catch (e) {
                // Process already dead
            }
        }
        catch (error) {
            console.error(`Error stopping Claude instance ${instanceId}:`, error);
        }
        claudeInstances.delete(instanceId);
        // Ensure session data is saved
        const session = claudeSessions.get(instanceId);
        if (session) {
            session.lastActive = Date.now();
            saveSessionsToDisk();
            console.log(`Session data saved for instance ${instanceId}`);
        }
        return { success: true };
    }
    return { success: false, error: `No Claude PTY running for instance ${instanceId}` };
});
// Stop and delete Claude session permanently
ipcMain.handle('claude:deleteSession', async (event, instanceId) => {
    console.log(`Deleting session for instance ${instanceId}...`);
    // Stop the process if running (with graceful shutdown)
    const claudePty = claudeInstances.get(instanceId);
    if (claudePty) {
        try {
            // Send SIGINT for graceful shutdown
            claudePty.kill('SIGINT');
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Force kill if needed
            try {
                process.kill(claudePty.pid, 0);
                claudePty.kill('SIGKILL');
            }
            catch (e) {
                // Process already dead
            }
        }
        catch (error) {
            console.error(`Error stopping Claude instance ${instanceId}:`, error);
        }
        claudeInstances.delete(instanceId);
    }
    // Remove from session storage
    claudeSessions.delete(instanceId);
    // Delete session file from disk
    try {
        const workspacePath = store.get('workspacePath') || process.cwd();
        const sessionsDir = join(workspacePath, '.claude', 'sessions');
        const sessionFile = join(sessionsDir, `${instanceId}.json`);
        if (existsSync(sessionFile)) {
            unlinkSync(sessionFile);
        }
        // Update manifest
        saveSessionsToDisk();
        return { success: true };
    }
    catch (error) {
        console.error(`Failed to delete session ${instanceId}:`, error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:resize', async (event, instanceId, cols, rows) => {
    const claudePty = claudeInstances.get(instanceId);
    if (claudePty) {
        try {
            claudePty.resize(cols, rows);
            return { success: true };
        }
        catch (error) {
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
// Show notification
ipcMain.handle('showNotification', async (event, options) => {
    const { Notification } = await import('electron');
    if (Notification.isSupported()) {
        new Notification(options).show();
    }
    return { success: true };
});
// File Watcher operations
ipcMain.handle('fileWatcher:start', async (event, dirPath, options) => {
    try {
        await fileWatcherService.watchDirectory(dirPath, options);
        // Set up event forwarding to renderer
        fileWatcherService.on('file:change', (data) => {
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(window => {
                if (!window.isDestroyed()) {
                    window.webContents.send('file:change', data);
                }
            });
        });
        fileWatcherService.on('batch:change', (data) => {
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(window => {
                if (!window.isDestroyed()) {
                    window.webContents.send('batch:change', data);
                }
            });
        });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fileWatcher:stop', async (event, dirPath) => {
    try {
        await fileWatcherService.unwatchDirectory(dirPath);
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fileWatcher:indexFile', async (event, filePath) => {
    try {
        const result = await fileWatcherService.performIncrementalIndex(filePath, 'change');
        return { success: true, data: result };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fileWatcher:getStats', () => {
    try {
        const stats = fileWatcherService.getStatistics();
        return { success: true, stats };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Knowledge Cache operations
ipcMain.handle('knowledgeCache:recordQuery', async (event, workspacePath, metrics) => {
    try {
        let cache = knowledgeCaches.get(workspacePath);
        if (!cache) {
            cache = createKnowledgeCache(workspacePath);
            knowledgeCaches.set(workspacePath, cache);
        }
        await cache.learnFromQuery(metrics.query, metrics.result || {}, metrics.responseTime, metrics.success);
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('knowledgeCache:getStats', async (event, workspacePath) => {
    try {
        let cache = knowledgeCaches.get(workspacePath);
        if (!cache) {
            cache = createKnowledgeCache(workspacePath);
            knowledgeCaches.set(workspacePath, cache);
        }
        const stats = cache.getStatistics();
        return { success: true, stats };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('knowledgeCache:predict', async (event, workspacePath, context) => {
    try {
        let cache = knowledgeCaches.get(workspacePath);
        if (!cache) {
            cache = createKnowledgeCache(workspacePath);
            knowledgeCaches.set(workspacePath, cache);
        }
        const predictions = await cache.predictNextQueries(context);
        return { success: true, predictions };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('knowledgeCache:clear', async (event, workspacePath) => {
    try {
        let cache = knowledgeCaches.get(workspacePath);
        if (!cache) {
            cache = createKnowledgeCache(workspacePath);
            knowledgeCaches.set(workspacePath, cache);
        }
        await cache.clear();
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('knowledgeCache:invalidate', async (event, workspacePath, pattern, tags) => {
    try {
        let cache = knowledgeCaches.get(workspacePath);
        if (!cache) {
            cache = createKnowledgeCache(workspacePath);
            knowledgeCaches.set(workspacePath, cache);
        }
        const count = await cache.invalidate(pattern, tags);
        return { success: true, count };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// File System operations
ipcMain.handle('fs:readFile', async (event, filePath) => {
    const fs = await import('fs/promises');
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return { success: true, content };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:exists', async (event, filePath) => {
    const fs = await import('fs/promises');
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
});
ipcMain.handle('fs:ensureDir', async (event, dirPath) => {
    try {
        await mkdir(dirPath, { recursive: true });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
    const fs = await import('fs/promises');
    try {
        await fs.rename(oldPath, newPath);
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:delete', async (event, filePath) => {
    const fs = await import('fs/promises');
    try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
            await fs.rmdir(filePath, { recursive: true });
        }
        else {
            await fs.unlink(filePath);
        }
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
    const fs = await import('fs/promises');
    try {
        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:readDir', async (event, dirPath) => {
    const fs = await import('fs/promises');
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = entries.map(entry => ({
            name: entry.name,
            path: join(dirPath, entry.name),
            isDirectory: entry.isDirectory()
        }));
        return { success: true, files };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Storage operations
ipcMain.handle('store:get', (event, key) => {
    return store.get(key);
});
ipcMain.handle('store:set', (event, key, value) => {
    store.set(key, value);
    return { success: true };
});
ipcMain.handle('store:delete', (event, key) => {
    store.delete(key);
    return { success: true };
});
ipcMain.handle('store:getAll', () => {
    return store.store;
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
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:resumeSession', async (event, instanceId, sessionId) => {
    try {
        // For now, just return success. In a real implementation, this would restore the session
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Hook operations
ipcMain.handle('claude:getHooks', async () => {
    try {
        // Return hooks from Claude's settings file
        const hooks = await claudeSettingsManager.getHooks();
        return { success: true, hooks };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:addHook', async (event, hook) => {
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
    }
    catch (error) {
        console.error('Error in claude:addHook:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:updateHook', async (event, hookId, updates) => {
    try {
        const hooks = await claudeSettingsManager.getHooks();
        const index = hooks.findIndex((h) => h.id === hookId);
        if (index !== -1) {
            hooks[index] = { ...hooks[index], ...updates };
            await claudeSettingsManager.saveHooks(hooks);
            return { success: true };
        }
        return { success: false, error: 'Hook not found' };
    }
    catch (error) {
        console.error('Error in claude:updateHook:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Add removeHook as an alias for deleteHook for compatibility
ipcMain.handle('claude:removeHook', async (event, hookId) => {
    try {
        const hooks = await claudeSettingsManager.getHooks();
        const filteredHooks = hooks.filter((h) => h.id !== hookId);
        await claudeSettingsManager.saveHooks(filteredHooks);
        return { success: true };
    }
    catch (error) {
        console.error('Error in claude:removeHook:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:deleteHook', async (event, hookId) => {
    try {
        const hooks = await claudeSettingsManager.getHooks();
        const filtered = hooks.filter((h) => h.id !== hookId);
        await claudeSettingsManager.saveHooks(filtered);
        return { success: true };
    }
    catch (error) {
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
ipcMain.handle('claude:testHook', async (event, hook) => {
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
    }
    catch (error) {
        return {
            success: false,
            error: error.message || String(error),
            output: error.stdout || ''
        };
    }
});
// Open external links
ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Dialog operations
ipcMain.handle('dialog:selectFolder', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Workspace Folder'
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }
        return { success: true, path: result.filePaths[0] };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('dialog:selectFile', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
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
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, options);
        return result;
    }
    catch (error) {
        return { canceled: true, filePaths: [] };
    }
});
ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, options);
        return result;
    }
    catch (error) {
        return { canceled: true, filePath: undefined };
    }
});
ipcMain.handle('dialog:showInputBox', async (event, options) => {
    try {
        // Electron doesn't have a built-in input box, so we'll use a custom implementation
        // For now, return a simple response indicating this needs to be handled in the renderer
        return { canceled: true, value: '' };
    }
    catch (error) {
        return { canceled: true, value: '' };
    }
});
ipcMain.handle('dialog:showMessageBox', async (event, options) => {
    try {
        const result = await dialog.showMessageBox(mainWindow, options);
        return result;
    }
    catch (error) {
        return { response: 0, checkboxChecked: false };
    }
});
// Claude installation detection
ipcMain.handle('claude:detectInstallation', async () => {
    try {
        const claudeInfo = await ClaudeDetector.detectClaude();
        return { success: true, info: claudeInfo };
    }
    catch (error) {
        return { success: false };
    }
});
// File watching operations
ipcMain.handle('fs:watchFile', async (event, filePath) => {
    try {
        // Don't create duplicate watchers
        if (fileWatchers.has(filePath)) {
            return { success: true };
        }
        const watcher = chokidarWatch(filePath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100
            }
        });
        watcher.on('change', async (path) => {
            try {
                // Read the new content immediately (chokidar already handles debouncing with awaitWriteFinish)
                const content = await readFile(filePath, 'utf-8');
                // Send update to all windows
                const windows = BrowserWindow.getAllWindows();
                windows.forEach(window => {
                    if (!window.isDestroyed()) {
                        window.webContents.send('file:changed', {
                            path: filePath,
                            content
                        });
                    }
                });
                // Also log if no windows are available
                if (windows.length === 0) {
                    console.error('[FileWatcher] No windows available to send file:changed event');
                }
            }
            catch (error) {
                console.error('[FileWatcher] Error reading changed file:', error);
            }
        });
        // Add error handler
        watcher.on('error', (error) => {
            console.error('[FileWatcher] Watcher error for', filePath, ':', error);
        });
        fileWatchers.set(filePath, watcher);
        return { success: true };
    }
    catch (error) {
        console.error('Failed to watch file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Directory watching operations
ipcMain.handle('fs:watchDirectory', async (event, dirPath) => {
    try {
        // Don't create duplicate watchers
        const watchKey = `dir:${dirPath}`;
        if (fileWatchers.has(watchKey)) {
            return { success: true };
        }
        const watcher = chokidarWatch(dirPath, {
            persistent: true,
            ignoreInitial: true,
            depth: 0, // Only watch the directory itself, not subdirectories
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100
            }
        });
        watcher.on('all', (eventType, filePath) => {
            // Send update to renderer
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(window => {
                if (!window.isDestroyed()) {
                    window.webContents.send('directory:changed', {
                        path: dirPath,
                        eventType,
                        filename: filePath
                    });
                }
            });
        });
        fileWatchers.set(watchKey, watcher);
        return { success: true };
    }
    catch (error) {
        console.error('Failed to watch directory:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:unwatchDirectory', async (event, dirPath) => {
    try {
        const watchKey = `dir:${dirPath}`;
        const watcher = fileWatchers.get(watchKey);
        if (watcher) {
            watcher.close();
            fileWatchers.delete(watchKey);
        }
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('fs:unwatchFile', async (event, filePath) => {
    try {
        const watcher = fileWatchers.get(filePath);
        if (watcher) {
            watcher.close();
            fileWatchers.delete(filePath);
        }
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Clean up watchers on app quit
app.on('before-quit', () => {
    for (const [path, watcher] of fileWatchers) {
        watcher.close();
    }
    fileWatchers.clear();
});
// Claude SDK operations
ipcMain.handle('claude:sdk:getTodos', async (event, projectPath) => {
    try {
        const result = await claudeCodeService.getCurrentTodos(projectPath);
        return result;
    }
    catch (error) {
        console.error('Error getting todos via SDK:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:sdk:createTodos', async (event, taskDescription, projectPath) => {
    try {
        const result = await claudeCodeService.createTodosForTask(taskDescription, projectPath);
        return result;
    }
    catch (error) {
        console.error('Error creating todos via SDK:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('claude:sdk:updateTodo', async (event, todoId, newStatus, projectPath) => {
    try {
        const result = await claudeCodeService.updateTodoStatus(todoId, newStatus, projectPath);
        return result;
    }
    catch (error) {
        console.error('Error updating todo via SDK:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Search operations
ipcMain.handle('search:findInFiles', async (event, options) => {
    // Add a response wrapper to ensure clean IPC communication
    const sendResponse = (data) => {
        return data;
    };
    const { promisify } = await import('util');
    const { exec } = await import('child_process');
    const execAsync = promisify(exec);
    const path = await import('path');
    const fs = await import('fs/promises');
    try {
        const { query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern, workspacePath } = options;
        // Use workspace path if provided, otherwise fall back to current directory
        const workingDir = workspacePath || process.cwd();
        // Validate that the workspace path exists
        try {
            await fs.access(workingDir);
        }
        catch (error) {
            console.error('[Main] Workspace directory not found:', workingDir);
            throw new Error(`Workspace directory not found: ${workingDir}`);
        }
        try {
            // Try ripgrep first
            // Check for bundled ripgrep first
            const platform = process.platform;
            const arch = process.arch;
            const platformKey = platform === 'darwin'
                ? (arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64')
                : platform === 'linux' ? 'linux-x64'
                    : platform === 'win32' ? 'win32-x64'
                        : null;
            let rgPath = 'rg'; // Default to system rg
            if (platformKey) {
                const rgBinary = platform === 'win32' ? 'rg.exe' : 'rg';
                const bundledRgPath = path.join(__dirname, '..', 'vendor', 'ripgrep', platformKey, rgBinary);
                if (existsSync(bundledRgPath)) {
                    rgPath = bundledRgPath;
                }
                else {
                }
            }
            // Use streaming ripgrep search
            const results = await searchWithRipgrep(rgPath, query, workingDir, {
                caseSensitive,
                wholeWord,
                useRegex,
                includePattern,
                excludePattern
            });
            return sendResponse(results);
        }
        catch (error) {
            // Ripgrep failed (likely timeout), fallback to Node.js implementation
            const fallbackResults = await fallbackSearch(workingDir, options);
            return sendResponse(fallbackResults);
        }
    }
    catch (error) {
        console.error('[Main] search:findInFiles error:', error);
        if (error instanceof Error) {
            console.error('[Main] Error stack:', error.stack);
        }
        throw error;
    }
});
// Fallback search implementation using Node.js
async function fallbackSearch(workingDir, options) {
    const startTime = Date.now();
    const { query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern } = options;
    const path = await import('path');
    const fs = await import('fs/promises');
    const results = new Map();
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
    const defaultExcludes = ['node_modules', 'dist', '.git', '.next', 'build', 'out', '.claude', '', '.worktrees', '.output', 'coverage', '.nyc_output', 'tmp', 'temp', '.cache', '.parcel-cache', '.vscode', '.idea', '__pycache__', '.DS_Store', '.nuxt'];
    const excludes = excludePattern
        ? [...defaultExcludes, ...excludePattern.split(',').map((p) => p.trim().replace('**/', '').replace('/**', ''))]
        : defaultExcludes;
    const searchInDirectory = async (dir) => {
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
                }
                else if (entry.isFile()) {
                    // Check include pattern
                    if (includePattern) {
                        const patterns = includePattern.split(',').map((p) => p.trim());
                        const matchesInclude = patterns.some((p) => {
                            if (p.startsWith('*.')) {
                                return entry.name.endsWith(p.substring(1));
                            }
                            return entry.name.includes(p);
                        });
                        if (!matchesInclude)
                            continue;
                    }
                    // Search in text files only
                    const ext = path.extname(entry.name).toLowerCase();
                    const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.json', '.md', '.txt', '.css', '.scss', '.html', '.xml', '.yaml', '.yml', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'];
                    if (!textExtensions.includes(ext))
                        continue;
                    try {
                        // Skip files larger than 5MB to prevent hanging
                        const stats = await fs.stat(fullPath);
                        if (stats.size > 5 * 1024 * 1024) {
                            continue;
                        }
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        const matches = [];
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
                                if (!regex.global)
                                    break;
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
                    }
                    catch (err) {
                        // Skip files that can't be read
                    }
                }
            }
        }
        catch (err) {
            // Skip directories that can't be accessed
        }
    };
    await searchInDirectory(workingDir);
    const resultsArray = Array.from(results.values());
    return resultsArray;
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('Replace all failed:', error);
        throw error;
    }
});
// Terminal operations
const terminals = new Map();
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
            env: process.env
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
    }
    catch (error) {
        console.error('Failed to create terminal:', error);
        throw error;
    }
});
ipcMain.handle('terminal:write', async (event, id, data) => {
    const terminal = terminals.get(id);
    if (terminal) {
        terminal.write(data);
        return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
});
ipcMain.handle('terminal:resize', async (event, id, cols, rows) => {
    const terminal = terminals.get(id);
    if (terminal) {
        terminal.resize(cols, rows);
        return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
});
ipcMain.handle('terminal:destroy', async (event, id) => {
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
// Ghost text handler (for inline AI suggestions)
ipcMain.handle('autocomplete:getGhostText', async (event, { prefix, suffix, forceManual = false }) => {
    try {
        // Check if ghost text is enabled in settings (but skip check if manual trigger)
        if (!forceManual) {
            const settings = store.get('autocompleteSettings');
            // If no settings exist yet, ghost text should be disabled by default
            if (!settings || !settings.providers || !settings.providers.claude || !settings.providers.claude.enabled) {
                return { success: true, suggestion: '' }; // Return empty if disabled or settings don't exist
            }
        }
        const suggestion = await ghostTextService.getGhostTextSuggestion(prefix, suffix);
        return { success: true, suggestion };
    }
    catch (error) {
        console.error('[Main] Ghost text error:', error);
        return { success: false, suggestion: '', error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('autocomplete:initializeProject', async (event, projectPath) => {
    try {
        await ghostTextService.initializeProject(projectPath);
        return { success: true };
    }
    catch (error) {
        console.error('Ghost text project initialization error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Ghost text health check
ipcMain.handle('autocomplete:checkHealth', async () => {
    try {
        return await ghostTextService.checkHealth();
    }
    catch (error) {
        console.error('Ghost text health check error:', error);
        return { available: false, status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
});
// Debug: Check what settings are actually stored
ipcMain.handle('debug:getStoredSettings', async () => {
    try {
        const settings = store.get('autocompleteSettings');
        return { success: true, settings };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('autocomplete:checkLSPServers', async () => {
    try {
        const { lspManager } = await import('./lsp-manager.js');
        const servers = await lspManager.getAvailableServers();
        return { success: true, servers };
    }
    catch (error) {
        console.error('LSP servers check error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('autocomplete:getLSPStatus', async () => {
    try {
        const { lspManager } = await import('./lsp-manager.js');
        const status = {
            connected: lspManager.getConnectedServers(),
            available: await lspManager.getAvailableServers()
        };
        return { success: true, status };
    }
    catch (error) {
        console.error('LSP status check error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// LSP Bridge handlers for codemirror-languageservice
ipcMain.handle('lsp:getCompletions', async (event, params) => {
    try {
        const { lspManager } = await import('./lsp-manager.js');
        const completions = await lspManager.getCompletions(params.filepath, params.content, params.position, params.context?.triggerCharacter);
        // Return in LSP format expected by codemirror-languageservice
        return {
            success: true,
            completions: completions.map(item => ({
                label: item.label,
                kind: item.kind,
                detail: item.detail,
                documentation: item.documentation,
                insertText: item.insertText,
                insertTextFormat: item.insertTextFormat,
                filterText: item.filterText,
                sortText: item.sortText,
                preselect: item.preselect,
                commitCharacters: item.commitCharacters,
                additionalTextEdits: item.additionalTextEdits,
                command: item.command,
                data: item.data
            }))
        };
    }
    catch (error) {
        console.error('LSP completions error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('lsp:getHover', async (event, params) => {
    try {
        const { lspManager } = await import('./lsp-manager.js');
        const hover = await lspManager.getHover(params.filepath, params.content, params.position);
        if (!hover) {
            return { success: true, hover: null };
        }
        return {
            success: true,
            hover: {
                content: hover.content,
                range: hover.range
            }
        };
    }
    catch (error) {
        console.error('LSP hover error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('lsp:getDiagnostics', async (event, params) => {
    try {
        const { lspManager } = await import('./lsp-manager.js');
        const diagnostics = await lspManager.getDiagnostics(params.filepath, params.content);
        return {
            success: true,
            diagnostics: diagnostics || []
        };
    }
    catch (error) {
        console.error('LSP diagnostics error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// LSP Installation handlers
ipcMain.handle('lsp:install', async (event, params) => {
    try {
        const { id, command, packageManager } = params;
        return new Promise((resolve) => {
            // Parse the command into executable and arguments
            const commandParts = command.split(' ');
            const executable = commandParts[0];
            const args = commandParts.slice(1);
            const installProcess = spawn(executable, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });
            let stdout = '';
            let stderr = '';
            installProcess.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            installProcess.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            installProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output: stdout });
                }
                else {
                    console.error(`Failed to install LSP server: ${id}`, stderr);
                    resolve({
                        success: false,
                        error: `Installation failed with code ${code}: ${stderr || 'Unknown error'}`
                    });
                }
            });
            installProcess.on('error', (error) => {
                console.error(`Error installing LSP server: ${id}`, error);
                resolve({
                    success: false,
                    error: `Failed to start installation: ${error.message}`
                });
            });
            // Set timeout for installation (5 minutes)
            setTimeout(() => {
                try {
                    installProcess.kill();
                }
                catch (e) {
                    // Ignore kill errors
                }
                resolve({
                    success: false,
                    error: 'Installation timed out after 5 minutes'
                });
            }, 5 * 60 * 1000);
        });
    }
    catch (error) {
        console.error('LSP install error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle('lsp:uninstall', async (event, params) => {
    try {
        const { id, packageManager } = params;
        // Define uninstall commands for different package managers
        const uninstallCommands = {
            npm: ['npm', 'uninstall', '-g'],
            pip: ['pip', 'uninstall', '-y'],
            brew: ['brew', 'uninstall'],
            go: ['rm', '-f'], // Go modules are in GOPATH/bin
            gem: ['gem', 'uninstall'],
            rustup: ['rustup', 'component', 'remove'],
            dotnet: ['dotnet', 'tool', 'uninstall', '-g']
        };
        // Map server IDs to package names
        const packageNames = {
            typescript: 'typescript-language-server',
            python: 'python-lsp-server',
            rust: 'rust-analyzer',
            go: `${homedir()}/go/bin/gopls`,
            vue: '@vue/language-server',
            html: 'vscode-langservers-extracted',
            php: 'intelephense',
            csharp: 'omnisharp',
            kotlin: 'kotlin-language-server',
            ruby: 'ruby-lsp',
            svelte: 'svelte-language-server',
            lua: 'lua-language-server',
            yaml: 'yaml-language-server',
            java: 'jdtls',
            cpp: 'llvm'
        };
        const command = uninstallCommands[packageManager];
        const packageName = packageNames[id];
        if (!command || !packageName) {
            return { success: false, error: `Unsupported uninstall for ${id} with ${packageManager}` };
        }
        return new Promise((resolve) => {
            const uninstallProcess = spawn(command[0], [...command.slice(1), packageName], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });
            let stdout = '';
            let stderr = '';
            uninstallProcess.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            uninstallProcess.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            uninstallProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output: stdout });
                }
                else {
                    console.error(`Failed to uninstall LSP server: ${id}`, stderr);
                    resolve({
                        success: false,
                        error: `Uninstallation failed with code ${code}: ${stderr || 'Unknown error'}`
                    });
                }
            });
            uninstallProcess.on('error', (error) => {
                console.error(`Error uninstalling LSP server: ${id}`, error);
                resolve({
                    success: false,
                    error: `Failed to start uninstallation: ${error.message}`
                });
            });
        });
    }
    catch (error) {
        console.error('LSP uninstall error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Check if a command is available
ipcMain.handle('lsp:checkCommand', async (event, command) => {
    try {
        return new Promise((resolve) => {
            const checkProcess = spawn('which', [command], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });
            checkProcess.on('close', (code) => {
                resolve({ available: code === 0 });
            });
            checkProcess.on('error', () => {
                resolve({ available: false });
            });
            // Timeout after 2 seconds
            setTimeout(() => {
                try {
                    checkProcess.kill();
                }
                catch (e) {
                    // Ignore kill errors
                }
                resolve({ available: false });
            }, 2000);
        });
    }
    catch (error) {
        console.error('Command check error:', error);
        return { available: false };
    }
});
// Code generation handler
ipcMain.handle('codeGeneration:generate', async (event, { prompt, fileContent, filePath, language, resources = [] }) => {
    try {
        // Import Claude SDK
        const { query } = await import('@anthropic-ai/claude-code');
        // Load resource contents
        const loadedResources = await Promise.all(resources.map(async (resource) => {
            if (resource.type === 'file' && resource.path) {
                try {
                    const content = await readFile(resource.path, 'utf-8');
                    return { ...resource, content };
                }
                catch (error) {
                    console.error(`Failed to read resource file ${resource.path}:`, error);
                    return resource;
                }
            }
            else if (resource.type === 'knowledge' && resource.id) {
                // Load from knowledge store
                const knowledgeData = store.get('knowledgeBases');
                for (const kbName in knowledgeData) {
                    const kb = knowledgeData[kbName];
                    if (kb.entries && kb.entries[resource.id]) {
                        return { ...resource, content: kb.entries[resource.id].content };
                    }
                }
            }
            return resource;
        }));
        // Construct the system prompt for code generation
        const systemPrompt = `You are an expert code generation assistant. When given a file and a request to modify it, you must return ONLY the complete updated file contents. No explanations, no markdown code blocks, no comments about what changed - just the raw code for the entire file.

CRITICAL: Your response must be ONLY code. Do not include any text before or after the code. Do not wrap the code in markdown blocks. Do not explain what you're doing. Just output the raw code that should replace the file contents.`;
        // Build resource context
        let resourceContext = '';
        if (loadedResources.length > 0) {
            resourceContext = '\n\nReference Resources:\n';
            loadedResources.forEach((resource, index) => {
                if (resource.content) {
                    resourceContext += `\n--- Resource ${index + 1}: ${resource.name} (${resource.type}) ---\n`;
                    resourceContext += resource.content + '\n';
                }
            });
        }
        // Build the user prompt with context
        const userPrompt = `Current file: ${filePath}
Language: ${language}

Current file contents:
${fileContent}
${resourceContext}
Request: ${prompt}

Remember: Return ONLY the complete code for the file. No explanations. No markdown. Just the raw code.`;
        // Create an AbortController for timeout
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, 60000); // 60 second timeout
        try {
            // Use Claude SDK to generate code
            const response = query({
                prompt: userPrompt,
                options: {
                    abortController,
                    model: 'claude-sonnet-4-20250514', // Fast model for code generation
                    maxTurns: 1,
                    allowedTools: [],
                    customSystemPrompt: systemPrompt
                }
            });
            let generatedCode = '';
            // Iterate through the response messages
            for await (const message of response) {
                if (message.type === 'assistant' && message.message?.content) {
                    // Extract text from content blocks
                    for (const block of message.message.content) {
                        if (block.type === 'text') {
                            generatedCode += block.text;
                        }
                    }
                }
                else if (message.type === 'result') {
                    break;
                }
            }
            clearTimeout(timeoutId);
            if (generatedCode) {
                // Clean the response - remove any markdown code blocks if present
                generatedCode = generatedCode.trim();
                // Remove markdown code blocks if they exist
                const codeBlockRegex = /^```[\w]*\n([\s\S]*?)\n```$/;
                const match = generatedCode.match(codeBlockRegex);
                if (match) {
                    generatedCode = match[1];
                }
                return {
                    success: true,
                    generatedCode,
                    replaceWholeFile: true
                };
            }
            else {
                return {
                    success: false,
                    error: 'No response from Claude'
                };
            }
        }
        catch (queryError) {
            clearTimeout(timeoutId);
            if (queryError instanceof Error && queryError.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Request timed out. Try a simpler request.'
                };
            }
            throw queryError;
        }
    }
    catch (error) {
        console.error('[Code Generation] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});
// Clean up Claude instances on app quit
app.on('before-quit', async () => {
    // Shutdown LSP servers
    try {
        const { lspManager } = await import('./lsp-manager.js');
        await lspManager.shutdown();
    }
    catch (error) {
        console.error('Failed to shutdown LSP servers:', error);
    }
    // Clean up Claude instances
    for (const [instanceId, claudePty] of claudeInstances) {
        try {
            claudePty.kill();
        }
        catch (error) {
            console.error(`Failed to kill Claude instance ${instanceId}:`, error);
        }
    }
    claudeInstances.clear();
});
// MCP (Model Context Protocol) Management - Using Claude CLI
ipcMain.handle('mcp:list', async (event, workspacePath) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
        // Get workspace path from store if not provided
        if (!workspacePath) {
            workspacePath = store.get('workspacePath') || process.cwd();
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
        const servers = [];
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
                }
                else {
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
    }
    catch (error) {
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
        const workspacePath = store.get('workspacePath') || process.cwd();
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
                command += ` ${config.args.map((arg) => `"${arg}"`).join(' ')}`;
            }
        }
        else if (config.type === 'sse' || config.type === 'http') {
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
    }
    catch (error) {
        console.error('Failed to add MCP server:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to add server'
        };
    }
});
ipcMain.handle('mcp:remove', async (event, name) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
        // Get workspace path from store
        const workspacePath = store.get('workspacePath') || process.cwd();
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
    }
    catch (error) {
        console.error('Failed to remove MCP server:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to remove server'
        };
    }
});
ipcMain.handle('mcp:get', async (event, name) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
        // Get workspace path from store
        const workspacePath = store.get('workspacePath') || process.cwd();
        // Detect Claude to use the correct binary
        const claudeInfo = await ClaudeDetector.detectClaude(workspacePath);
        const claudeCommand = claudeInfo.path;
        const { stdout } = await execAsync(`${claudeCommand} mcp get "${name}"`, {
            cwd: workspacePath,
            env: process.env
        });
        // Parse the text output to extract server details
        const server = { name };
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
            if (line.includes('Type:')) {
                server.transport = line.split(':')[1].trim().toLowerCase();
            }
            else if (line.includes('URL:')) {
                server.url = line.split('URL:')[1].trim();
            }
            else if (line.includes('Command:')) {
                server.command = line.split('Command:')[1].trim();
            }
        }
        return { success: true, server };
    }
    catch (error) {
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
                req.on('error', (error) => {
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
            }
            else {
                return { success: false, error: 'Command not found' };
            }
        }
        return { success: false, error: 'Unknown server type' };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Test failed'
        };
    }
});
// Lightweight Context Handlers
ipcMain.handle('context:initialize', async (event, workspacePath) => {
    try {
        await lightweightContext.initialize(workspacePath);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to initialize context'
        };
    }
});
ipcMain.handle('context:searchFiles', async (event, query, limit = 20) => {
    try {
        const results = await lightweightContext.searchFiles(query, limit);
        return { success: true, results };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to search files'
        };
    }
});
ipcMain.handle('context:buildContext', async (event, query, workingFiles, maxTokens = 2000) => {
    try {
        const context = await lightweightContext.buildContext(query, workingFiles, maxTokens);
        return { success: true, context };
    }
    catch (error) {
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
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get statistics'
        };
    }
});
ipcMain.handle('context:getFileContent', async (event, filePath) => {
    try {
        const content = await lightweightContext.getFileContent(filePath);
        return { success: true, content };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get file content'
        };
    }
});
ipcMain.handle('context:getRecentFiles', async (event, hours = 24) => {
    try {
        const files = lightweightContext.getRecentFiles(hours);
        return { success: true, files };
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
ipcMain.handle('context:analyzeUsage', async (event, messages, currentContext) => {
    try {
        const analysis = contextOptimizer.analyzeContextUsage(messages, currentContext);
        return { success: true, analysis };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to analyze context usage'
        };
    }
});
ipcMain.handle('context:buildOptimized', async (event, query, workingFiles, maxTokens) => {
    try {
        const result = await contextOptimizer.buildOptimizedContext(query, workingFiles, maxTokens);
        return { success: true, ...result };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to build optimized context'
        };
    }
});
ipcMain.handle('context:optimize', async (event, content, strategy) => {
    try {
        const result = contextOptimizer.optimizeContext(content, strategy);
        return { success: true, result };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to optimize context'
        };
    }
});
ipcMain.handle('context:getRecommendations', async (event, usage) => {
    try {
        const recommendations = contextOptimizer.getOptimizationRecommendations(usage);
        return { success: true, recommendations };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get recommendations'
        };
    }
});
ipcMain.handle('context:shouldInject', async (event, query, availableTokens, contextSize) => {
    try {
        const decision = contextOptimizer.shouldInjectContext(query, availableTokens, contextSize);
        return { success: true, decision };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to evaluate context injection'
        };
    }
});
// Workspace persistence handlers
ipcMain.handle('workspace:loadContext', async (event, workspacePath) => {
    try {
        const data = await workspacePersistence.loadWorkspaceContext(workspacePath);
        return { success: true, data };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load workspace context'
        };
    }
});
ipcMain.handle('workspace:saveContext', async (event, data) => {
    try {
        await workspacePersistence.saveWorkspaceContext(data);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save workspace context'
        };
    }
});
ipcMain.handle('workspace:updateOptimizationTime', async (event, workspacePath, lastOptimization) => {
    try {
        await workspacePersistence.updateOptimizationTime(workspacePath, lastOptimization);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update optimization time'
        };
    }
});
ipcMain.handle('workspace:updateWorkingFiles', async (event, workspacePath, workingFiles) => {
    try {
        await workspacePersistence.updateWorkingFiles(workspacePath, workingFiles);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update working files'
        };
    }
});
ipcMain.handle('workspace:getRecentHistory', async (event, workspacePath, limit) => {
    try {
        const history = await workspacePersistence.getRecentContextHistory(workspacePath, limit);
        return { success: true, history };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get recent history'
        };
    }
});
ipcMain.handle('workspace:exportContext', async (event, workspacePath) => {
    try {
        const jsonData = await workspacePersistence.exportWorkspaceContext(workspacePath);
        return { success: true, data: jsonData };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to export workspace context'
        };
    }
});
ipcMain.handle('workspace:importContext', async (event, workspacePath, jsonData) => {
    try {
        await workspacePersistence.importWorkspaceContext(workspacePath, jsonData);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to import workspace context'
        };
    }
});
// Current active services
let currentWorktreeManager = null;
// let currentGitHooksManager: GitHooksManager | null = null; - now handled by GitHooksManagerGlobal
// Get current workspace path
ipcMain.handle('workspace:getCurrentPath', async () => {
    return store.get('workspacePath') || process.cwd();
});
// Git service initialization when workspace changes
ipcMain.handle('workspace:setPath', async (event, workspacePath) => {
    try {
        // Store the workspace path
        store.set('workspacePath', workspacePath);
        try {
            // Update the Git Service Manager with the new workspace
            const gitServiceManager = GitServiceManager.getInstance();
            gitServiceManager.setWorkspace(workspacePath);
        }
        catch (error) {
            console.error('[Main] Error updating GitServiceManager:', error);
        }
        try {
            // Update the Worktree Manager with the new workspace
            const worktreeManagerGlobal = WorktreeManagerGlobal.getInstance();
            const result = worktreeManagerGlobal.setWorkspace(workspacePath);
        }
        catch (error) {
            console.error('[Main] Error updating WorktreeManagerGlobal:', error);
        }
        try {
            // Update the Git Hooks Manager with the new workspace
            const gitHooksManagerGlobal = GitHooksManagerGlobal.getInstance();
            const result = gitHooksManagerGlobal.setWorkspace(workspacePath);
        }
        catch (error) {
            console.error('[Main] Error updating GitHooksManagerGlobal:', error);
        }
        // Initialize snapshot service for workspace
        // IMPORTANT: Always use the main repository path for snapshots, not worktree paths
        let snapshotProjectPath = workspacePath;
        // Check if this is a worktree path (contains .worktrees in the path)
        if (workspacePath.includes('.worktrees')) {
            // Extract the main repo path (everything before .worktrees)
            const worktreeIndex = workspacePath.indexOf('.worktrees');
            snapshotProjectPath = workspacePath.substring(0, worktreeIndex - 1); // -1 to remove the trailing slash
        }
        if (!snapshotServices.has(snapshotProjectPath)) {
            const snapshotService = new SnapshotService(snapshotProjectPath);
            snapshotService.setupIpcHandlers();
            snapshotServices.set(snapshotProjectPath, snapshotService);
        }
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to set workspace path'
        };
    }
});
// Check if a path is ignored by git
ipcMain.handle('git:checkIgnore', async (event, workspacePath, paths) => {
    try {
        const git = await import('simple-git');
        const gitInstance = git.default(workspacePath);
        // First check if this is a git repository
        try {
            const isRepo = await gitInstance.checkIsRepo();
            if (!isRepo) {
                // Not a git repo, return all paths as not ignored
                const results = {};
                paths.forEach(path => { results[path] = false; });
                return { success: true, results, isGitRepo: false };
            }
        }
        catch (error) {
            // Git command might not be available
            const results = {};
            paths.forEach(path => { results[path] = false; });
            return { success: true, results, gitAvailable: false };
        }
        const results = {};
        for (const path of paths) {
            try {
                await gitInstance.raw(['check-ignore', path]);
                // If check-ignore returns 0 (no error), the path is ignored
                results[path] = true;
            }
            catch (error) {
                // If check-ignore returns non-zero, the path is not ignored
                results[path] = false;
            }
        }
        return { success: true, results, isGitRepo: true, gitAvailable: true };
    }
    catch (error) {
        // Return safe defaults if git is not available
        const results = {};
        paths.forEach(path => { results[path] = false; });
        return { success: true, results, gitAvailable: false };
    }
});
// Clean up git services on app quit
app.on('before-quit', () => {
    for (const [path, service] of gitServices) {
        service.cleanup();
    }
    gitServices.clear();
});
