/**
 * Storage service interface
 * Abstracts local state storage and sync operations
 */
export interface IStorageService {
  // Claude session storage
  saveClaudeSession(sessionData: ClaudeSessionData): Promise<void>;
  getClaudeSession(sessionId: string): Promise<ClaudeSessionData | null>;
  getClaudeSessionsByUser(userId: string): Promise<ClaudeSessionData[]>;
  
  // Workspace state storage
  saveWorkspaceState(workspacePath: string, stateType: string, stateData: any): Promise<void>;
  getWorkspaceState(workspacePath: string, stateType?: string): Promise<any>;
  
  // Settings storage
  setSetting(key: string, value: any): Promise<void>;
  getSetting(key: string): Promise<any>;
  getAllSettings(): Promise<Record<string, any>>;
  
  // Sync queue (for remote mode)
  addToSyncQueue(action: SyncAction): Promise<void>;
  getNextSyncItem(): Promise<SyncQueueItem | null>;
  updateSyncItemStatus(id: number, status: SyncStatus): Promise<void>;
  getPendingSyncCount(): Promise<number>;
  
  // Storage stats
  getStorageStats(): Promise<StorageStats>;
}

export interface ClaudeSessionData {
  id: string;
  instanceId: string;
  userId?: string;
  conversationData: any;
  personalityId?: string;
  workingDirectory: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SyncAction {
  type: string;
  data: any;
  priority?: number;
}

export interface SyncQueueItem {
  id: number;
  actionType: string;
  actionData: any;
  priority: number;
  status: SyncStatus;
  retryCount: number;
  createdAt: Date;
  processedAt?: Date;
}

export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface StorageStats {
  claudeSessions: number;
  cachedFiles: number;
  knowledgeEntries: number;
  pendingSyncs: number;
  dbSizeMB: string;
}