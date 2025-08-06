import * as pty from 'node-pty';
import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, statSync } from 'fs';
import { ClaudeDetector } from './claude-detector.js';
import { ClaudeSessionService } from './claude-session-service.js';
import type { IPty } from 'node-pty';

interface ClaudeInstanceConfig {
  instanceId: string;
  workingDirectory: string;
  instanceName?: string;
  runConfig?: {
    command?: string;
    args?: string[];
  };
}

interface ClaudeStartResult {
  success: boolean;
  error?: string;
  pid?: number;
  claudeInfo?: any;
  restored?: boolean;
}

export class ClaudeInstanceService {
  private claudeInstances: Map<string, IPty> = new Map();
  private sessionService: ClaudeSessionService;
  private mainWindow: BrowserWindow | null = null;
  
  constructor(sessionService: ClaudeSessionService) {
    this.sessionService = sessionService;
  }
  
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }
  
  // Get instance by ID
  getInstance(instanceId: string): IPty | undefined {
    return this.claudeInstances.get(instanceId);
  }
  
  // Check if instance exists
  hasInstance(instanceId: string): boolean {
    return this.claudeInstances.has(instanceId);
  }
  
  // Store instance
  setInstance(instanceId: string, instance: IPty): void {
    this.claudeInstances.set(instanceId, instance);
  }
  
  // Remove instance
  deleteInstance(instanceId: string): boolean {
    return this.claudeInstances.delete(instanceId);
  }
  
  // Get all instances
  getAllInstances(): Map<string, IPty> {
    return this.claudeInstances;
  }
  
  // Clear all instances
  clearInstances(): void {
    this.claudeInstances.clear();
  }
  
  // Get instance count
  getInstanceCount(): number {
    return this.claudeInstances.size;
  }
  
  // Send command to instance
  async sendCommand(instanceId: string, command: string): Promise<{ success: boolean; error?: string }> {
    const claudePty = this.claudeInstances.get(instanceId);
    if (claudePty) {
      try {
        claudePty.write(command);
        return { success: true };
      } catch (error) {
        console.error(`Failed to send command to ${instanceId}:`, error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { 
      success: false, 
      error: `No Claude instance running for ${instanceId}` 
    };
  }
  
  // Resize instance terminal
  async resizeTerminal(instanceId: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }> {
    const claudePty = this.claudeInstances.get(instanceId);
    if (claudePty) {
      try {
        claudePty.resize(cols, rows);
        return { success: true };
      } catch (error) {
        console.error(`Failed to resize PTY for ${instanceId}:`, error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { 
      success: false, 
      error: `No Claude PTY running for instance ${instanceId}` 
    };
  }
  
  // Stop instance
  async stopInstance(instanceId: string): Promise<{ success: boolean; error?: string }> {
    const claudePty = this.claudeInstances.get(instanceId);
    if (claudePty) {
      try {
        // First try SIGINT for graceful shutdown
        claudePty.kill('SIGINT');
        
        // Wait a bit for graceful shutdown
        setTimeout(() => {
          // Check if process is still running and force kill if needed
          try {
            if (this.claudeInstances.has(instanceId)) {
              claudePty.kill();
              this.claudeInstances.delete(instanceId);
            }
          } catch (error) {
            console.error(`Error force killing Claude instance ${instanceId}:`, error);
          }
        }, 2000);
        
        // Wait a bit before declaring success
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Mark session for preservation but not auto-start
        const session = this.sessionService.get(instanceId);
        if (session) {
          session.shouldAutoStart = false;
          this.sessionService.saveSessionsToDisk();
        }
        
        return { success: true };
      } catch (error) {
        console.error(`Failed to stop Claude for ${instanceId}:`, error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { 
      success: false, 
      error: `No Claude instance running for ${instanceId}` 
    };
  }
  
  // Helper to detect new session files after restoration
  // Start Claude with session restoration support
  async startClaude(
    instanceId: string,
    workingDirectory: string,
    instanceName?: string,
    runConfig?: { command?: string; args?: string[] }
  ): Promise<ClaudeStartResult> {
    if (this.hasInstance(instanceId)) {
      return { success: false, error: 'Claude instance already running' };
    }

    // Check if we have a preserved session for this instance
    const preservedSession = this.sessionService.get(instanceId);
    const shouldRestore = !!preservedSession;

    // If restoring, add a small delay to ensure clean state
    if (shouldRestore) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      // Get all possible session IDs (current + fallbacks)
      const sessionOptions = this.sessionService.getSessionWithFallbacks(instanceId);
      
      if (shouldRestore && sessionOptions.fallbacks.length > 0) {
        // Try restoration with fallbacks
        const result = await this.startClaudeWithSessionId(
          instanceId,
          workingDirectory,
          instanceName,
          runConfig,
          sessionOptions.fallbacks[0],
          0,
          sessionOptions.fallbacks.length
        );
        
        if (result.success) {
          return { ...result, restored: true };
        }
      }
      
      // Start fresh session if no restoration or restoration failed
      return await this.startClaudeWithSessionId(
        instanceId,
        workingDirectory,
        instanceName,
        runConfig,
        undefined,
        0,
        1
      );
    } catch (error) {
      console.error(`Failed to start Claude for ${instanceId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  // Helper function to start Claude with a specific session ID (used for retries)
  private async startClaudeWithSessionId(
    instanceId: string,
    workingDirectory: string,
    instanceName?: string,
    runConfig?: any,
    sessionId?: string,
    attemptNumber: number = 0,
    totalAttempts: number = 1
  ): Promise<ClaudeStartResult> {
    try {
      const claudeInfo = await ClaudeDetector.detectClaude(workingDirectory);
      
      if (!claudeInfo) {
        throw new Error('Claude CLI not found');
      }
      
      const debugArgs = process.env.CLAUDE_DEBUG === 'true' ? ['--debug'] : [];
      
      // Build arguments for retry
      let baseArgs: string[];
      if (sessionId) {
        baseArgs = ['--resume', sessionId, ...debugArgs];
      } else {
        // Generate new session ID
        const newSessionId = this.generateSessionId();
        baseArgs = ['--session-id', newSessionId, ...debugArgs];
      }
      
      let { command, args: commandArgs, useShell } = ClaudeDetector.getClaudeCommand(claudeInfo, baseArgs);
      
      // Override with run config if provided
      if (runConfig) {
        if (runConfig.command) {
          command = runConfig.command === 'claude' ? command : runConfig.command;
        }
        if (runConfig.args && runConfig.args.length > 0) {
          const allArgs = sessionId 
            ? ['--resume', sessionId, ...runConfig.args, ...debugArgs]
            : baseArgs.concat(runConfig.args);
          const result = ClaudeDetector.getClaudeCommand(claudeInfo, allArgs);
          command = result.command;
          commandArgs = result.args;
          useShell = result.useShell;
        }
      }
      
      // Create the PTY instance
      const claudePty = pty.spawn(command, commandArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: workingDirectory,
        env: { ...process.env, TERM: 'xterm-256color' } as any,
        useConpty: false
      });
      
      // Store the instance
      this.setInstance(instanceId, claudePty);
      
      // Setup data and exit handlers with retry logic
      this.setupInstanceHandlers(
        claudePty,
        instanceId,
        workingDirectory,
        instanceName,
        runConfig,
        sessionId,
        attemptNumber,
        totalAttempts
      );
      
      // Store or update session data
      if (!sessionId) {
        // New session
        const newSessionId = this.generateSessionId();
        this.sessionService.set(instanceId, {
          sessionId: newSessionId,
          instanceId,
          workingDirectory,
          instanceName,
          runConfig,
          lastActive: Date.now()
        });
      } else if (!this.sessionService.hasSession(instanceId)) {
        // Restoring but no session data exists
        this.sessionService.set(instanceId, {
          sessionId,
          instanceId,
          workingDirectory,
          instanceName,
          runConfig,
          lastActive: Date.now()
        });
      }
      
      this.sessionService.saveSessionsToDisk();
      
      return { 
        success: true, 
        pid: claudePty.pid,
        claudeInfo: {
          command,
          path: claudeInfo.path,
          version: claudeInfo.version,
          source: claudeInfo.source
        }
      };
    } catch (error) {
      console.error(`Failed to start Claude with session ID ${sessionId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  // Setup instance handlers with retry logic
  private setupInstanceHandlers(
    claudePty: IPty,
    instanceId: string,
    workingDirectory: string,
    instanceName?: string,
    runConfig?: any,
    sessionId?: string,
    attemptNumber: number = 0,
    totalAttempts: number = 1
  ): void {
    const sessionOptions = this.sessionService.getSessionWithFallbacks(instanceId);
    let localAttemptIndex = attemptNumber;
    let isRetrying = false;
    let isKillingForRetry = false;
    let hasUpdatedSuccessfulSession = false;
    
    // Setup data handler with retry detection
    claudePty.onData((data: string) => {
      // Send output to renderer
      this.mainWindow?.webContents.send(`claude:output:${instanceId}`, data);
      
      // Check for session restoration failure
      if (!isRetrying && data.includes('No conversation found with session ID:')) {
        // Send failure status
        this.mainWindow?.webContents.send(`claude:restoration-status:${instanceId}`, {
          status: 'failed',
          sessionId: sessionId,
          attemptNumber: localAttemptIndex + 1,
          totalAttempts: totalAttempts
        });
        
        // Check if we have more fallbacks
        localAttemptIndex++;
        if (localAttemptIndex < sessionOptions.fallbacks.length) {
          const nextSessionId = sessionOptions.fallbacks[localAttemptIndex];
          
          // Send retry status
          this.mainWindow?.webContents.send(`claude:restoration-status:${instanceId}`, {
            status: 'retrying',
            sessionId: nextSessionId,
            attemptNumber: localAttemptIndex + 1,
            totalAttempts: totalAttempts
          });
          
          isRetrying = true;
          isKillingForRetry = true;
          
          // Kill current process
          try {
            claudePty.kill();
          } catch (error) {
            console.error('Error killing Claude process for retry:', error);
          }
          
          // Remove from instances
          this.deleteInstance(instanceId);
          
          // Retry with next session ID
          setTimeout(async () => {
            const retryResult = await this.startClaudeWithSessionId(
              instanceId,
              workingDirectory,
              instanceName,
              runConfig,
              nextSessionId,
              localAttemptIndex,
              totalAttempts
            );
            
            if (!retryResult.success) {
              console.error(`Failed to retry with fallback session ID: ${retryResult.error}`);
              this.mainWindow?.webContents.send(`claude:restoration-status:${instanceId}`, {
                status: 'all-failed',
                error: retryResult.error,
                totalAttempts: totalAttempts
              });
            }
          }, 1000);
        } else {
          // No more fallbacks
          this.mainWindow?.webContents.send(`claude:restoration-status:${instanceId}`, {
            status: 'all-failed',
            totalAttempts: totalAttempts
          });
        }
      }
      
      // Check for successful restoration
      const plainData = data.replace(/\x1b\[[0-9;]*m/g, '');
      if (!hasUpdatedSuccessfulSession && plainData.includes('Welcome to Claude Code')) {
        if (sessionId) {
          hasUpdatedSuccessfulSession = true;
          this.sessionService.updateSessionId(instanceId, sessionId);
        }
        
        this.mainWindow?.webContents.send(`claude:restoration-status:${instanceId}`, {
          status: 'success',
          sessionId: sessionId,
          attemptNumber: localAttemptIndex + 1
        });
        isRetrying = false;
        
        // Schedule check for new session files after restoration
        this.scheduleSessionFileCheck(instanceId, workingDirectory);
      }
      
      // Update last active time
      const session = this.sessionService.get(instanceId);
      if (session) {
        session.lastActive = Date.now();
      }
    });
    
    // Setup exit handler
    claudePty.onExit((event: { exitCode: number; signal?: number }) => {
      if (!isKillingForRetry) {
        this.mainWindow?.webContents.send(`claude:exit:${instanceId}`, event.exitCode);
        this.deleteInstance(instanceId);
        
        // Clear auto-start flag when session exits normally
        const session = this.sessionService.get(instanceId);
        if (session) {
          session.shouldAutoStart = false;
          this.sessionService.saveSessionsToDisk();
        }
      }
    });
  }
  
  // Schedule check for new session files after restoration
  private scheduleSessionFileCheck(instanceId: string, workingDirectory: string): void {
    const restorationTime = Date.now();
    setTimeout(async () => {
      const newSessionId = await this.detectNewSessionFile(instanceId, workingDirectory, restorationTime);
      if (newSessionId) {
        const currentSession = this.sessionService.get(instanceId);
        if (currentSession && newSessionId !== currentSession.sessionId) {
          this.sessionService.updateSessionId(instanceId, newSessionId);
        }
      }
    }, 10000); // Check after 10 seconds
  }
  
  // Generate a new session ID
  private generateSessionId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Clean up resources on reload/refresh
  cleanupResourcesOnReload(): void {
    if (this.getInstanceCount() > 0) {
      // Mark all active sessions for auto-start
      this.getAllInstances().forEach((pty, instanceId) => {
        const session = this.sessionService.get(instanceId);
        if (session) {
          session.shouldAutoStart = true;
        }
      });
      
      // Save sessions to disk before clearing
      this.sessionService.saveSessionsToDisk();
      
      // Clear the instances map without killing processes
      this.clearInstances();
    }
  }
  
  // Helper to detect new session files after restoration
  private async detectNewSessionFile(
    instanceId: string, 
    workingDirectory: string, 
    restorationTime: number
  ): Promise<string | null> {
    try {
      const projectDirName = workingDirectory.replace(/\//g, '-');
      const claudeProjectDir = join(homedir(), '.claude', 'projects', projectDirName);
      
      if (existsSync(claudeProjectDir)) {
        const files = readdirSync(claudeProjectDir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => {
            const fullPath = join(claudeProjectDir, f);
            const stats = statSync(fullPath);
            return { 
              name: f.replace('.jsonl', ''), 
              time: stats.mtimeMs,
              createdAfterRestore: stats.mtimeMs > restorationTime
            };
          })
          .filter(f => f.createdAfterRestore)
          .sort((a, b) => b.time - a.time);
        
        if (files.length > 0) {
          return files[0].name;
        }
      }
    } catch (error) {
      console.error('Failed to detect new session file:', error);
    }
    return null;
  }
}