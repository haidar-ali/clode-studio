/**
 * Desktop storage service implementation
 * Wraps the local SQLite database through Electron IPC
 */
import type {
  IStorageService,
  ClaudeSessionData,
  SyncAction,
  SyncQueueItem,
  SyncStatus,
  StorageStats
} from '../../interfaces';

export class DesktopStorageService implements IStorageService {
  // Claude session storage
  async saveClaudeSession(sessionData: ClaudeSessionData): Promise<void> {
    const result = await window.electronAPI.database.saveClaudeSession(sessionData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save Claude session');
    }
  }
  
  async getClaudeSession(sessionId: string): Promise<ClaudeSessionData | null> {
    const result = await window.electronAPI.database.getClaudeSession(sessionId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get Claude session');
    }
    return result.session;
  }
  
  async getClaudeSessionsByUser(userId: string): Promise<ClaudeSessionData[]> {
    const result = await window.electronAPI.database.getClaudeSessionsByUser(userId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get Claude sessions');
    }
    return result.sessions || [];
  }
  
  // Workspace state storage
  async saveWorkspaceState(workspacePath: string, stateType: string, stateData: any): Promise<void> {
    const result = await window.electronAPI.database.saveWorkspaceState(workspacePath, stateType, stateData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save workspace state');
    }
  }
  
  async getWorkspaceState(workspacePath: string, stateType?: string): Promise<any> {
    const result = await window.electronAPI.database.getWorkspaceState(workspacePath, stateType);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get workspace state');
    }
    return result.state;
  }
  
  // Settings storage
  async setSetting(key: string, value: any): Promise<void> {
    const result = await window.electronAPI.database.setSetting(key, value);
    if (!result.success) {
      throw new Error(result.error || 'Failed to set setting');
    }
  }
  
  async getSetting(key: string): Promise<any> {
    const result = await window.electronAPI.database.getSetting(key);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get setting');
    }
    return result.value;
  }
  
  async getAllSettings(): Promise<Record<string, any>> {
    const result = await window.electronAPI.database.getAllSettings();
    if (!result.success) {
      throw new Error(result.error || 'Failed to get all settings');
    }
    return result.settings || {};
  }
  
  // Sync queue (for remote mode)
  async addToSyncQueue(action: SyncAction): Promise<void> {
    const result = await window.electronAPI.database.addToSyncQueue(
      action.type,
      action.data,
      action.priority
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to add to sync queue');
    }
  }
  
  async getNextSyncItem(): Promise<SyncQueueItem | null> {
    const result = await window.electronAPI.database.getNextSyncItem();
    if (!result.success) {
      throw new Error(result.error || 'Failed to get next sync item');
    }
    return result.item;
  }
  
  async updateSyncItemStatus(id: number, status: SyncStatus): Promise<void> {
    const result = await window.electronAPI.database.updateSyncItemStatus(id, status);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update sync item status');
    }
  }
  
  async getPendingSyncCount(): Promise<number> {
    const result = await window.electronAPI.database.getPendingSyncCount();
    if (!result.success) {
      throw new Error(result.error || 'Failed to get pending sync count');
    }
    return result.count || 0;
  }
  
  // Storage stats
  async getStorageStats(): Promise<StorageStats> {
    const result = await window.electronAPI.database.getStats();
    if (!result.success) {
      throw new Error(result.error || 'Failed to get storage stats');
    }
    return result.stats;
  }
}