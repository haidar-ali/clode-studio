/**
 * Task Sync Adapter
 * Synchronizes task/kanban board state
 */
import type { SyncableState } from '../sync-engine.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  tags: string[];
  subtasks?: Task[];
}

export interface TaskBoardState {
  boardId: string;
  tasks: Task[];
  columns: {
    id: string;
    title: string;
    taskIds: string[];
    limit?: number;
  }[];
  metadata: {
    lastModified: Date;
    version: number;
  };
}

export class TaskSyncAdapter {
  private versionMap: Map<string, number> = new Map();
  
  /**
   * Convert task board to syncable format
   */
  toSyncable(board: TaskBoardState): SyncableState {
    const currentVersion = (this.versionMap.get(board.boardId) || 0) + 1;
    this.versionMap.set(board.boardId, currentVersion);
    
    return {
      id: board.boardId,
      type: 'tasks.board',
      version: currentVersion,
      lastModified: new Date(),
      data: board
    };
  }
  
  /**
   * Convert individual task update to syncable format
   */
  taskToSyncable(task: Task, boardId: string): SyncableState {
    return {
      id: `${boardId}:${task.id}`,
      type: 'tasks.update',
      version: Date.now(), // Use timestamp as version for individual updates
      lastModified: new Date(),
      data: {
        boardId,
        task
      }
    };
  }
  
  /**
   * Convert from syncable format
   */
  fromSyncable(syncable: SyncableState): TaskBoardState | { boardId: string; task: Task } {
    if (syncable.type === 'tasks.board') {
      const board = syncable.data as TaskBoardState;
      this.versionMap.set(board.boardId, syncable.version);
      return board;
    } else {
      return syncable.data as { boardId: string; task: Task };
    }
  }
  
  /**
   * Merge task boards (for conflict resolution)
   */
  merge(local: TaskBoardState, remote: TaskBoardState): TaskBoardState {
    // Create task maps for easier merging
    const localTaskMap = new Map(local.tasks.map(t => [t.id, t]));
    const remoteTaskMap = new Map(remote.tasks.map(t => [t.id, t]));
    
    // Merge tasks
    const mergedTasks: Task[] = [];
    const allTaskIds = new Set([...localTaskMap.keys(), ...remoteTaskMap.keys()]);
    
    for (const taskId of allTaskIds) {
      const localTask = localTaskMap.get(taskId);
      const remoteTask = remoteTaskMap.get(taskId);
      
      if (localTask && remoteTask) {
        // Both have the task - merge based on last update
        const localTime = new Date(localTask.updatedAt).getTime();
        const remoteTime = new Date(remoteTask.updatedAt).getTime();
        mergedTasks.push(localTime > remoteTime ? localTask : remoteTask);
      } else if (localTask) {
        mergedTasks.push(localTask);
      } else if (remoteTask) {
        mergedTasks.push(remoteTask);
      }
    }
    
    // Merge columns - prefer remote structure but validate task IDs
    const mergedColumns = remote.columns.map(col => ({
      ...col,
      taskIds: col.taskIds.filter(id => mergedTasks.some(t => t.id === id))
    }));
    
    // Add any tasks not in columns to backlog
    const tasksInColumns = new Set(mergedColumns.flatMap(col => col.taskIds));
    const orphanedTasks = mergedTasks.filter(t => !tasksInColumns.has(t.id));
    
    if (orphanedTasks.length > 0) {
      const backlogColumn = mergedColumns.find(col => col.id === 'backlog');
      if (backlogColumn) {
        backlogColumn.taskIds.push(...orphanedTasks.map(t => t.id));
      }
    }
    
    return {
      boardId: local.boardId,
      tasks: mergedTasks,
      columns: mergedColumns,
      metadata: {
        lastModified: new Date(),
        version: Math.max(local.metadata.version, remote.metadata.version) + 1
      }
    };
  }
  
  /**
   * Get task statistics for sync optimization
   */
  getStats(board: TaskBoardState): {
    totalTasks: number;
    tasksByStatus: Record<string, number>;
    lastUpdate: Date;
  } {
    const tasksByStatus: Record<string, number> = {};
    
    board.tasks.forEach(task => {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    });
    
    const lastUpdate = board.tasks.reduce((latest, task) => {
      const taskUpdate = new Date(task.updatedAt);
      return taskUpdate > latest ? taskUpdate : latest;
    }, new Date(0));
    
    return {
      totalTasks: board.tasks.length,
      tasksByStatus,
      lastUpdate
    };
  }
}