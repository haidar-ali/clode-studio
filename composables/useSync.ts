/**
 * Composable for state synchronization
 * Provides easy access to sync functionality
 */
import { ref, computed } from 'vue';
import { useServiceProvider } from './useServices';
import type { SyncConflict } from '../services/sync/sync-engine.js';
import { WorkspaceSyncAdapter } from '../services/sync/adapters/workspace-sync-adapter.js';
import { ClaudeSyncAdapter } from '../services/sync/adapters/claude-sync-adapter.js';
import { TaskSyncAdapter } from '../services/sync/adapters/task-sync-adapter.js';

export function useSync() {
  const services = useServiceProvider();
  const syncing = ref(false);
  const conflicts = ref<SyncConflict[]>([]);
  const lastSyncTime = ref<Date | null>(null);
  
  // Check if sync is available (remote mode only)
  const syncAvailable = computed(() => {
    return services.value?.mode === 'remote' && 'getSyncService' in services.value;
  });
  
  // Get sync service if available
  const syncService = computed(() => {
    if (syncAvailable.value && services.value) {
      return (services.value as any).getSyncService();
    }
    return null;
  });
  
  // Sync adapters
  const workspaceAdapter = new WorkspaceSyncAdapter('default-workspace');
  const claudeAdapter = new ClaudeSyncAdapter();
  const taskAdapter = new TaskSyncAdapter();
  
  /**
   * Track workspace state changes
   */
  async function trackWorkspaceState(state: any) {
    if (!syncService.value) return;
    
    const syncable = workspaceAdapter.toSyncable(state);
    syncService.value.trackState(syncable);
  }
  
  /**
   * Track Claude conversation changes
   */
  async function trackClaudeConversation(conversation: any) {
    if (!syncService.value) return;
    
    const syncable = claudeAdapter.toSyncable(conversation);
    syncService.value.trackState(syncable);
  }
  
  /**
   * Track task board changes
   */
  async function trackTaskBoard(board: any) {
    if (!syncService.value) return;
    
    const syncable = taskAdapter.toSyncable(board);
    syncService.value.trackState(syncable);
  }
  
  /**
   * Perform manual sync
   */
  async function sync() {
    if (!syncService.value || syncing.value) return;
    
    syncing.value = true;
    try {
      await syncService.value.sync();
      lastSyncTime.value = new Date();
      
      // Get any pending conflicts
      conflicts.value = syncService.value.getPendingConflicts();
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      syncing.value = false;
    }
  }
  
  /**
   * Resolve a conflict
   */
  async function resolveConflict(
    entityId: string,
    entityType: string,
    resolution: 'local' | 'remote' | 'merge'
  ) {
    if (!syncService.value) return;
    
    syncService.value.resolveConflict(entityId, entityType, resolution);
    
    // Remove from conflicts list
    conflicts.value = conflicts.value.filter(
      c => c.entityId !== entityId || c.entityType !== entityType
    );
  }
  
  /**
   * Get sync metrics
   */
  function getMetrics() {
    if (!syncService.value) return null;
    return syncService.value.getMetrics();
  }
  
  // Listen for conflicts
  if (syncService.value) {
    syncService.value.on('conflicts:pending', (newConflicts: SyncConflict[]) => {
      conflicts.value = newConflicts;
    });
  }
  
  return {
    // State
    syncing: readonly(syncing),
    conflicts: readonly(conflicts),
    lastSyncTime: readonly(lastSyncTime),
    syncAvailable: readonly(syncAvailable),
    
    // Methods
    trackWorkspaceState,
    trackClaudeConversation,
    trackTaskBoard,
    sync,
    resolveConflict,
    getMetrics
  };
}