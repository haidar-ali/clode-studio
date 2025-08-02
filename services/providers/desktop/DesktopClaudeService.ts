/**
 * Desktop Claude service implementation
 * Wraps existing Electron Claude IPC APIs
 */
import type {
  IClaudeService,
  ClaudeSpawnOptions,
  ClaudeSpawnResult,
  ClaudeInstanceInfo,
  ClaudeInstanceStatus
} from '../../interfaces';

export class DesktopClaudeService implements IClaudeService {
  // Track active instances locally
  private activeInstances: Map<string, ClaudeInstanceInfo> = new Map();
  
  // Instance lifecycle
  async spawn(options: ClaudeSpawnOptions): Promise<ClaudeSpawnResult> {
    const result = await window.electronAPI.claude.start(
      options.instanceId,
      options.workingDirectory,
      options.instanceName,
      options.config
    );
    
    if (result.success && result.pid) {
      // Track the instance
      this.activeInstances.set(options.instanceId, {
        instanceId: options.instanceId,
        pid: result.pid,
        status: 'connected',
        workingDirectory: options.workingDirectory,
        startedAt: new Date(),
        userId: options.userId
      });
    }
    
    return {
      success: result.success,
      pid: result.pid,
      claudeInfo: result.claudeInfo,
      error: result.error
    };
  }
  
  async stop(instanceId: string): Promise<void> {
    await window.electronAPI.claude.stop(instanceId);
    this.activeInstances.delete(instanceId);
  }
  
  async stopAll(): Promise<void> {
    const instances = Array.from(this.activeInstances.keys());
    await Promise.all(instances.map(id => this.stop(id)));
  }
  
  // Instance interaction
  async send(instanceId: string, data: string): Promise<void> {
    return window.electronAPI.claude.send(instanceId, data);
  }
  
  async resize(instanceId: string, cols: number, rows: number): Promise<void> {
    return window.electronAPI.claude.resize(instanceId, cols, rows);
  }
  
  // Instance queries
  async getActiveInstances(): Promise<ClaudeInstanceInfo[]> {
    return Array.from(this.activeInstances.values());
  }
  
  async getInstanceStatus(instanceId: string): Promise<ClaudeInstanceStatus> {
    const instance = this.activeInstances.get(instanceId);
    return instance?.status || 'disconnected';
  }
  
  async isInstanceActive(instanceId: string): Promise<boolean> {
    return this.activeInstances.has(instanceId);
  }
  
  // Event handlers
  onOutput(instanceId: string, callback: (data: string) => void): () => void {
    return window.electronAPI.claude.onOutput(instanceId, callback);
  }
  
  onError(instanceId: string, callback: (error: string) => void): () => void {
    return window.electronAPI.claude.onError(instanceId, callback);
  }
  
  onExit(instanceId: string, callback: (code: number | null) => void): () => void {
    const cleanup = window.electronAPI.claude.onExit(instanceId, (code) => {
      // Update instance status
      this.activeInstances.delete(instanceId);
      callback(code);
    });
    return cleanup;
  }
  
  // Cleanup
  removeAllListeners(instanceId: string): void {
    window.electronAPI.claude.removeAllListeners(instanceId);
  }
  
  // Session management (desktop mode - local only)
  async saveSession(instanceId: string, userId: string): Promise<string> {
    // In desktop mode, sessions are managed by Claude CLI directly
    // Return a session ID that can be used with --continue flag
    const sessionId = `desktop-${instanceId}-${Date.now()}`;
    
    // Could store session metadata in electron-store if needed
    return sessionId;
  }
  
  async resumeSession(sessionId: string, userId: string): Promise<string> {
    // In desktop mode, use Claude's built-in session resume
    // The sessionId would be passed to spawn with resumeSessionId option
    return sessionId;
  }
}