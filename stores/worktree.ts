import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
  created?: Date;
  description?: string;
  linkedCheckpoint?: string;
}

export interface WorktreeSession {
  id: string;
  name: string;
  worktree: Worktree;
  created: Date;
  lastAccessed: Date;
  metadata: {
    task?: string;
    experiment?: boolean;
    tags?: string[];
    isClaudeSession?: boolean;
    claudeSessionId?: string;
  };
}

export const useWorktreeStore = defineStore('worktree', () => {
  // State
  const worktrees = ref<Worktree[]>([]);
  const sessions = ref<WorktreeSession[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const activeWorktree = computed(() => 
    worktrees.value.find(w => w.isActive)
  );

  const claudeSessions = computed(() =>
    sessions.value.filter(s => s.metadata?.isClaudeSession === true)
  );

  const worktreesByDate = computed(() => {
    const sorted = [...worktrees.value].sort((a, b) => {
      const dateA = a.created?.getTime() || 0;
      const dateB = b.created?.getTime() || 0;
      return dateB - dateA;
    });
    return sorted;
  });

  // Actions
  async function refreshWorktrees() {
    isLoading.value = true;
    error.value = null;

    try {
      // Get worktrees
      const worktreeResult = await window.electronAPI.worktree.list();
    
      if (worktreeResult.success && worktreeResult.worktrees) {
        worktrees.value = worktreeResult.worktrees.map(w => ({
          ...w,
          created: w.created ? new Date(w.created) : undefined
        }));
      }

      // Get sessions
      const sessionResult = await window.electronAPI.worktree.sessions();
    
      if (sessionResult.success && sessionResult.sessions) {
        sessions.value = sessionResult.sessions.map(s => ({
          ...s,
          created: new Date(s.created),
          lastAccessed: new Date(s.lastAccessed),
          metadata: s.metadata || {}
        }));
      
        console.log('[WorktreeStore] Session metadata:', sessions.value.map(s => ({ 
          name: s.name, 
          metadata: s.metadata 
        })));
      
      }
    } catch (err) {
      console.error('Failed to refresh worktrees:', err);
      error.value = err instanceof Error ? err.message : 'Failed to refresh worktrees';
    } finally {
      isLoading.value = false;
    }
  }

  async function createWorktree(
    branchName: string,
    sessionName: string,
    sessionDescription?: string,
    metadata?: any
  ) {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.worktree.create(
        branchName,
        sessionName,
        sessionDescription,
        metadata
      );

      if (result.success) {
        await refreshWorktrees();
        return result.worktree;
      } else {
        throw new Error(result.error || 'Failed to create worktree');
      }
    } catch (err) {
      console.error('Failed to create worktree:', err);
      error.value = err instanceof Error ? err.message : 'Failed to create worktree';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function createClaudeWorktree(
    sessionName: string,
    claudeSessionId: string
  ) {
    // Generate time-based branch name
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '-')
      .substring(0, 19);
    
    const safeName = sessionName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    const branchName = `claude/${timestamp}-${safeName}`;
    
    // Create worktree with Claude session metadata
    const worktree = await createWorktree(
      branchName,
      sessionName,
      `Claude session: ${sessionName}`,
      {
        isClaudeSession: true,
        claudeSessionId: claudeSessionId
      }
    );

    // Refresh sessions to get the newly created session
    await refreshWorktrees();

    return worktree;
  }

  async function switchToWorktree(worktreePath: string) {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.worktree.switch(worktreePath);
      
      if (result.success) {
        await refreshWorktrees();
        return true;
      } else {
        throw new Error(result.error || 'Failed to switch worktree');
      }
    } catch (err) {
      console.error('Failed to switch worktree:', err);
      error.value = err instanceof Error ? err.message : 'Failed to switch worktree';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function removeWorktree(worktreePath: string, force: boolean = false) {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.worktree.remove(worktreePath, force);
      
      if (result.success) {
        await refreshWorktrees();
        return true;
      } else {
        throw new Error(result.error || 'Failed to remove worktree');
      }
    } catch (err) {
      console.error('Failed to remove worktree:', err);
      error.value = err instanceof Error ? err.message : 'Failed to remove worktree';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function lockWorktree(worktreePath: string, lock: boolean) {
    try {
      const result = await window.electronAPI.worktree.lock(worktreePath, lock);
      
      if (result.success) {
        await refreshWorktrees();
        return true;
      } else {
        throw new Error(result.error || 'Failed to lock/unlock worktree');
      }
    } catch (err) {
      console.error('Failed to lock/unlock worktree:', err);
      error.value = err instanceof Error ? err.message : 'Failed to lock/unlock worktree';
      throw err;
    }
  }

  async function pruneWorktrees() {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.worktree.prune();
      
      if (result.success) {
        await refreshWorktrees();
        return result.pruned || 0;
      } else {
        throw new Error(result.error || 'Failed to prune worktrees');
      }
    } catch (err) {
      console.error('Failed to prune worktrees:', err);
      error.value = err instanceof Error ? err.message : 'Failed to prune worktrees';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    // State
    worktrees,
    sessions,
    isLoading,
    error,

    // Computed
    activeWorktree,
    claudeSessions,
    worktreesByDate,

    // Actions
    refreshWorktrees,
    createWorktree,
    createClaudeWorktree,
    switchToWorktree,
    removeWorktree,
    lockWorktree,
    pruneWorktrees
  };
});