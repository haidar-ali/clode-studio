/**
 * Sync types used by remote handlers
 * Duplicated here to avoid importing from outside electron directory
 */

export interface SyncPatch {
  id: string;
  timestamp: number;
  userId: string;
  entityType?: string;
  operations: SyncOperation[];
}

export interface SyncOperation {
  type: 'create' | 'update' | 'delete';
  path: string;
  data?: any;
  oldData?: any;
}

export interface SyncState {
  lastSyncTime: number;
  pendingPatches: SyncPatch[];
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  path: string;
  localValue: any;
  remoteValue: any;
  timestamp: number;
}