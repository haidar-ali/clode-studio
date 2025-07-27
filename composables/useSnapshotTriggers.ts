import { watch } from 'vue';
import { useSnapshotsStore } from '~/stores/snapshots';
import { useSourceControlStore } from '~/stores/source-control';
import { useTasksStore } from '~/stores/tasks';

export function useSnapshotTriggers() {
  const snapshotsStore = useSnapshotsStore();
  const gitStore = useSourceControlStore();
  const tasksStore = useTasksStore();
  
  let lastBranch = gitStore.currentBranch;
  let lastTaskCount = tasksStore.tasks?.length || 0;
  
  // Watch for branch changes - DISABLED
  // Auto-snapshot on branch switch is now disabled to avoid creating snapshots
  // every time we switch worktrees. Snapshots are only created when explicitly
  // creating a new worktree.
  /*
  watch(() => gitStore.currentBranch, async (newBranch) => {
    if (newBranch && newBranch !== lastBranch) {
      try {
        // Auto-capture snapshot on branch change
        await snapshotsStore.captureSnapshot(
          `Branch switch: ${lastBranch} → ${newBranch}`,
          'auto-branch'
        );
      } catch (error) {
        console.error('Failed to capture snapshot on branch change:', error);
      }
      lastBranch = newBranch;
    }
  });
  */
  
  // Watch for significant task changes
  watch(() => tasksStore.tasks?.length || 0, async (newCount) => {
    const diff = Math.abs(newCount - lastTaskCount);
    if (diff >= 5) {
      try {
        // Significant task change detected
        await snapshotsStore.captureSnapshot(
          `Task update: ${diff} tasks ${newCount > lastTaskCount ? 'added' : 'removed'}`,
          'auto-event'
        );
      } catch (error) {
        console.error('Failed to capture snapshot on task change:', error);
      }
      lastTaskCount = newCount;
    }
  });
  
  // Manual trigger functions
  function captureBeforeRiskyOperation(operationName: string) {
    return snapshotsStore.captureSnapshot(
      `Before: ${operationName}`,
      'auto-event'
    );
  }
  
  function captureAfterMajorChange(changeName: string) {
    return snapshotsStore.captureSnapshot(
      `After: ${changeName}`,
      'auto-event'
    );
  }
  
  return {
    captureBeforeRiskyOperation,
    captureAfterMajorChange
  };
}