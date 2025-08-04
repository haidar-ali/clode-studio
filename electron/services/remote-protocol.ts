/**
 * Remote access protocol definitions
 * Defines message formats and types for Socket.IO communication
 */

// Request/Response wrapper for all operations
export interface RemoteRequest<T = any> {
  id: string;          // Unique request ID for tracking
  userId?: string;     // User making the request
  sessionId?: string;  // Session ID for stateful operations
  payload: T;          // Request-specific data
}

export interface RemoteResponse<T = any> {
  id: string;          // Matching request ID
  success: boolean;
  data?: T;
  error?: RemoteError;
}

export interface RemoteError {
  code: string;
  message: string;
  details?: any;
}

// File operation protocols
export namespace FileProtocol {
  export interface ReadRequest {
    path: string;
    encoding?: BufferEncoding;
  }
  
  export interface WriteRequest {
    path: string;
    content: string;
    encoding?: BufferEncoding;
  }
  
  export interface ListRequest {
    path: string;
    recursive?: boolean;
  }
  
  export interface DeleteRequest {
    path: string;
  }
  
  export interface StatRequest {
    path: string;
  }
  
  export interface WatchRequest {
    path: string;
    recursive?: boolean;
  }
}

// Terminal operation protocols
export namespace TerminalProtocol {
  export interface CreateRequest {
    cols: number;
    rows: number;
    cwd?: string;
    env?: Record<string, string>;
    name?: string;
  }
  
  export interface CreateResponse {
    terminalId: string;
  }
  
  export interface WriteRequest {
    terminalId: string;
    data: string;
  }
  
  export interface ResizeRequest {
    terminalId: string;
    cols: number;
    rows: number;
  }
  
  export interface DestroyRequest {
    terminalId: string;
  }
  
  // Binary data for terminal output
  export interface DataEvent {
    terminalId: string;
    data: Buffer;
  }
}

// Claude operation protocols
export namespace ClaudeProtocol {
  export interface SpawnRequest {
    instanceId: string;
    workingDirectory: string;
    instanceName?: string;
    config?: {
      command?: string;
      args?: string[];
      personalityId?: string;
      personality?: {
        name: string;
        instructions: string;
      };
    };
  }
  
  export interface SpawnResponse {
    success: boolean;
    pid?: number;
    error?: string;
  }
  
  export interface SendRequest {
    instanceId: string;
    data: string;
  }
  
  export interface StopRequest {
    instanceId: string;
  }
  
  export interface ResizeRequest {
    instanceId: string;
    cols: number;
    rows: number;
  }
  
  // Events
  export interface OutputEvent {
    instanceId: string;
    data: string;
  }
  
  export interface ErrorEvent {
    instanceId: string;
    error: string;
  }
  
  export interface ExitEvent {
    instanceId: string;
    code: number | null;
  }
}

// Authentication protocols
export namespace AuthProtocol {
  export interface LoginRequest {
    username?: string;
    token?: string;
    apiKey?: string;
  }
  
  export interface LoginResponse {
    userId: string;
    sessionToken: string;
    permissions: string[];
  }
  
  export interface ValidateRequest {
    sessionToken: string;
  }
}

// Workspace protocols
export namespace WorkspaceProtocol {
  export interface ListRequest {
    userId: string;
  }
  
  export interface CreateRequest {
    name: string;
    path?: string;
  }
  
  export interface SwitchRequest {
    workspaceId: string;
  }
}

// Event types for server->client communication
export enum RemoteEvent {
  // Terminal events
  TERMINAL_DATA = 'terminal:data',
  TERMINAL_EXIT = 'terminal:exit',
  
  // Claude events
  CLAUDE_OUTPUT = 'claude:output',
  CLAUDE_ERROR = 'claude:error',
  CLAUDE_EXIT = 'claude:exit',
  
  // File events
  FILE_CHANGED = 'file:changed',
  FILE_DELETED = 'file:deleted',
  
  // System events
  CONNECTION_ERROR = 'connection:error',
  SESSION_EXPIRED = 'session:expired',
  SERVER_SHUTDOWN = 'server:shutdown'
}

// Permission levels
export enum Permission {
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  TERMINAL_CREATE = 'terminal:create',
  TERMINAL_WRITE = 'terminal:write',
  CLAUDE_SPAWN = 'claude:spawn',
  CLAUDE_CONTROL = 'claude:control',
  WORKSPACE_MANAGE = 'workspace:manage',
  ADMIN = 'admin'
}