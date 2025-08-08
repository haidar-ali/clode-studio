/**
 * Queue manager interface for offline operation handling
 * Manages queuing and syncing of operations when offline
 */

export interface IQueueManager {
  // Queue operations
  enqueue(operation: QueuedOperation): Promise<void>;
  dequeue(): Promise<QueuedOperation | null>;
  peek(): Promise<QueuedOperation | null>;
  
  // Queue status
  getQueueSize(): Promise<number>;
  getFailedOperations(): Promise<QueuedOperation[]>;
  
  // Processing
  processQueue(): Promise<void>;
  retryOperation(operationId: number): Promise<void>;
  clearOperation(operationId: number): Promise<void>;
  
  // Connection status
  isOnline(): boolean;
  setOnlineStatus(online: boolean): void;
  onStatusChange(callback: (online: boolean) => void): void;
  
  // Cleanup
  dispose(): void;
}

export interface QueuedOperation {
  id?: number;
  type: OperationType;
  payload: any;
  priority: QueuePriority;
  retryCount?: number;
  maxRetries?: number;
  createdAt?: Date;
  lastAttempt?: Date;
  error?: string;
}

export enum OperationType {
  FILE_UPLOAD = 'file_upload',
  FILE_DELETE = 'file_delete',
  CLAUDE_MESSAGE = 'claude_message',
  WORKSPACE_SYNC = 'workspace_sync',
  KNOWLEDGE_SYNC = 'knowledge_sync',
  SETTINGS_SYNC = 'settings_sync'
}

export enum QueuePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

export interface QueueConfig {
  maxRetries?: number;
  retryDelay?: number;
  batchSize?: number;
  processInterval?: number;
}