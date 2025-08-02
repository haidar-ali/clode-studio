/**
 * Claude instance management service interface
 * Abstracts Claude CLI operations and instance lifecycle
 */
export interface IClaudeService {
  // Instance lifecycle
  spawn(options: ClaudeSpawnOptions): Promise<ClaudeSpawnResult>;
  stop(instanceId: string): Promise<void>;
  stopAll(): Promise<void>;
  
  // Instance interaction
  send(instanceId: string, data: string): Promise<void>;
  resize(instanceId: string, cols: number, rows: number): Promise<void>;
  
  // Instance queries
  getActiveInstances(): Promise<ClaudeInstanceInfo[]>;
  getInstanceStatus(instanceId: string): Promise<ClaudeInstanceStatus>;
  isInstanceActive(instanceId: string): Promise<boolean>;
  
  // Event handlers
  onOutput(instanceId: string, callback: (data: string) => void): () => void;
  onError(instanceId: string, callback: (error: string) => void): () => void;
  onExit(instanceId: string, callback: (code: number | null) => void): () => void;
  
  // Cleanup
  removeAllListeners(instanceId: string): void;
  
  // Session management (for remote)
  saveSession(instanceId: string, userId: string): Promise<string>;
  resumeSession(sessionId: string, userId: string): Promise<string>;
}

export interface ClaudeSpawnOptions {
  instanceId: string;
  workingDirectory: string;
  instanceName: string;
  userId?: string;
  config?: {
    command: string;
    args: string[];
  };
  resumeSessionId?: string;
  mcpServers?: string[];
  model?: string;
  personalityId?: string;
}

export interface ClaudeSpawnResult {
  success: boolean;
  pid?: number;
  sessionId?: string;
  claudeInfo?: {
    path: string;
    version: string;
    source: string;
  };
  error?: string;
}

export interface ClaudeInstanceInfo {
  instanceId: string;
  pid: number;
  status: ClaudeInstanceStatus;
  workingDirectory: string;
  startedAt: Date;
  userId?: string;
  sessionId?: string;
}

export type ClaudeInstanceStatus = 'connected' | 'connecting' | 'disconnected' | 'error';