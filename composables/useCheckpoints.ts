import { ref, computed, readonly } from 'vue';

interface Checkpoint {
  id: string;
  message: string;
  timestamp: Date;
  hash: string;
  instanceId: string;
}

export function useCheckpoints() {
  const lastCheckpoint = ref<Checkpoint | null>(null);
  const isCreatingCheckpoint = ref(false);
  const isUndoing = ref(false);
  
  /**
   * Create a git checkpoint before Claude executes a command
   */
  async function createCheckpoint(instanceId: string, userMessage: string): Promise<boolean> {
    if (isCreatingCheckpoint.value) return false;
    
    try {
      isCreatingCheckpoint.value = true;
      
      // First, add all current changes to staging
      const addResult = await window.electronAPI.git.add(['--all']);
      if (!addResult.success) {
        console.warn('Failed to stage changes for checkpoint:', addResult.error);
      }
      
      // Create a checkpoint commit
      const timestamp = new Date();
      const commitMessage = `🔍 Checkpoint before Claude: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}" - ${timestamp.toLocaleTimeString()}`;
      
      const commitResult = await window.electronAPI.git.commit(commitMessage);
      if (!commitResult.success) {
        console.error('Failed to create checkpoint:', commitResult.error);
        return false;
      }
      
      // Get the commit hash
      const logResult = await window.electronAPI.git.getLog(1);
      if (logResult.success && logResult.commits && logResult.commits.length > 0) {
        const commitHash = logResult.commits[0].hash;
        
        // Store the checkpoint
        lastCheckpoint.value = {
          id: `checkpoint-${Date.now()}`,
          message: userMessage,
          timestamp,
          hash: commitHash,
          instanceId
        };
        
        console.log('[Checkpoint] ✅ Created checkpoint:', commitHash.substring(0, 8), 'for message:', userMessage.substring(0, 30));
        console.log('[Checkpoint] Commit message:', commitMessage);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return false;
    } finally {
      isCreatingCheckpoint.value = false;
    }
  }
  
  /**
   * Undo the last checkpoint (revert to the state before Claude's last action)
   */
  async function undoLastCheckpoint(): Promise<boolean> {
    if (!lastCheckpoint.value || isUndoing.value) return false;
    
    try {
      isUndoing.value = true;
      
      // Reset to the checkpoint (hard reset to discard all changes after checkpoint)
      const result = await window.electronAPI.git.resetHard(lastCheckpoint.value.hash);
      
      if (result.success) {
        console.log('[Checkpoint] Successfully undone to checkpoint:', lastCheckpoint.value.hash.substring(0, 8));
        
        // Clear the checkpoint since we've used it
        lastCheckpoint.value = null;
        
        // Optionally show notification
        if (window.electronAPI?.showNotification) {
          await window.electronAPI.showNotification({
            title: 'Checkpoint Restored',
            body: 'Successfully reverted to state before Claude\'s last action'
          });
        }
        
        return true;
      } else {
        console.error('Failed to undo checkpoint:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Failed to undo checkpoint:', error);
      return false;
    } finally {
      isUndoing.value = false;
    }
  }
  
  /**
   * Check if there's an undo available
   */
  const hasUndo = computed(() => !!lastCheckpoint.value);
  
  /**
   * Get info about the last checkpoint
   */
  const checkpointInfo = computed(() => {
    if (!lastCheckpoint.value) return null;
    return {
      message: lastCheckpoint.value.message,
      time: lastCheckpoint.value.timestamp.toLocaleTimeString(),
      hash: lastCheckpoint.value.hash.substring(0, 8)
    };
  });
  
  return {
    lastCheckpoint: readonly(lastCheckpoint),
    isCreatingCheckpoint: readonly(isCreatingCheckpoint),
    isUndoing: readonly(isUndoing),
    hasUndo,
    checkpointInfo,
    createCheckpoint,
    undoLastCheckpoint
  };
}