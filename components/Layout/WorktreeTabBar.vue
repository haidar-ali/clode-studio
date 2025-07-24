<template>
  <div class="worktree-tab-bar" v-if="hasWorkspace && sourceControlStore.isGitRepository && hasWorktrees">
    <div class="workspace-info">
      <Icon name="mdi:folder-outline" class="workspace-icon" />
      <span class="workspace-name">{{ workspaceName }}:</span>
    </div>
    
    <div class="worktree-tabs">
      <div
        v-for="[path, worktree] in activeWorktrees"
        :key="path"
        :class="['worktree-tab', { 
          active: path === activeWorktreePath,
          modified: worktree.hasChanges,
          'is-main': worktree.isMainWorktree
        }]"
        @click="handleSwitchWorktree(path)"
        :title="`${worktree.branch}${worktree.hasChanges ? ' (modified)' : ''}${worktree.ahead > 0 ? ` - ${worktree.ahead} ahead` : ''}${worktree.behind > 0 ? ` - ${worktree.behind} behind` : ''}`"
      >
        <Icon 
          v-if="worktree.isMainWorktree" 
          name="mdi:home" 
          class="worktree-icon" 
        />
        <Icon 
          v-else 
          name="mdi:source-branch" 
          class="worktree-icon" 
        />
        <span class="branch-name">{{ worktree.branch }}</span>
        <span v-if="worktree.hasChanges" class="status-indicator modified">●</span>
        <span v-else-if="worktree.ahead > 0" class="status-indicator ahead">↑{{ worktree.ahead }}</span>
        <span v-else-if="worktree.behind > 0" class="status-indicator behind">↓{{ worktree.behind }}</span>
      </div>
      
      <button 
        class="add-worktree-btn" 
        @click="showCreateWorktreeDialog"
        title="Create new worktree"
      >
        <Icon name="mdi:plus" />
      </button>
    </div>
    
    <div class="worktree-actions">
      <button 
        @click="refreshWorktrees" 
        title="Refresh worktrees"
        class="action-btn"
      >
        <Icon name="mdi:refresh" />
      </button>
    </div>
  </div>
  
  <!-- Create Worktree Dialog -->
  <WorktreeCreateDialog
    v-if="showCreateDialog"
    @close="showCreateDialog = false"
    @create="handleCreateWorktree"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import { useSourceControlStore } from '~/stores/source-control';
import Icon from '~/components/Icon.vue';
import WorktreeCreateDialog from '~/components/Worktree/WorktreeCreateDialog.vue';

const workspaceManager = useWorkspaceManager();
const sourceControlStore = useSourceControlStore();

// State
const showCreateDialog = ref(false);

// Computed properties
const workspaceName = computed(() => workspaceManager.workspaceName.value);
const activeWorktrees = computed(() => workspaceManager.activeWorktrees.value);
const activeWorktreePath = computed(() => workspaceManager.activeWorktreePath.value);
const hasMultipleWorktrees = computed(() => workspaceManager.hasMultipleWorktrees.value);
const hasWorkspace = computed(() => workspaceManager.hasWorkspace.value);
const hasWorktrees = computed(() => activeWorktrees.value.size > 0);
const isGitRepository = computed(() => sourceControlStore.isGitRepository);

// Methods
const handleSwitchWorktree = async (worktreePath: string) => {
  if (worktreePath === activeWorktreePath.value) return;
  
  try {
    await workspaceManager.switchWorktreeWithinWorkspace(worktreePath);
  } catch (error) {
    console.error('Failed to switch worktree:', error);
  }
};

const showCreateWorktreeDialog = () => {
  showCreateDialog.value = true;
};

const handleCreateWorktree = async (branchName: string, sessionName?: string, description?: string) => {
  try {
    await workspaceManager.createWorktree(branchName, sessionName, description);
    // Close dialog
    showCreateDialog.value = false;
    // Refresh worktrees to show the new one
    await workspaceManager.initializeWorktrees();
  } catch (error) {
    console.error('Failed to create worktree:', error);
    alert(`Failed to create worktree: ${error}`);
  }
};

const refreshWorktrees = async () => {
  try {
    await workspaceManager.refreshWorktreeStatus();
  } catch (error) {
    console.error('Failed to refresh worktrees:', error);
  }
};

// Refresh worktrees periodically to update git status
let refreshInterval: NodeJS.Timeout;

// Watch for git repository status changes
watch(() => sourceControlStore.isGitRepository, async (isGit) => {
  if (isGit && hasWorkspace.value) {
    // Git repository was just initialized, load worktrees
    console.log('[WorktreeTabBar] Git repository detected, initializing worktrees');
    setTimeout(async () => {
      await workspaceManager.initializeWorktrees();
    }, 500); // Give git some time to fully initialize
  }
});

// Watch for workspace changes
watch(hasWorkspace, async (hasWs) => {
  if (hasWs && sourceControlStore.isGitRepository) {
    console.log('[WorktreeTabBar] Workspace changed and is git repo, initializing worktrees');
    setTimeout(async () => {
      await workspaceManager.initializeWorktrees();
    }, 500);
  }
});

onMounted(async () => {
  console.log('[WorktreeTabBar] onMounted - hasWorkspace:', hasWorkspace.value, 'isGitRepository:', sourceControlStore.isGitRepository);
  
  // Initial load of worktrees with a small delay to ensure backend is ready
  if (hasWorkspace.value && sourceControlStore.isGitRepository) {
    console.log('[WorktreeTabBar] Conditions met, initializing worktrees');
    // Wait a bit for the backend to be fully initialized
    setTimeout(async () => {
      await workspaceManager.initializeWorktrees();
    }, 100);
  } else {
    console.log('[WorktreeTabBar] Conditions not met, waiting for git status');
  }
  
  // Refresh every 30 seconds
  refreshInterval = setInterval(refreshWorktrees, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.worktree-tab-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  font-size: 12px;
  min-height: 32px;
}

.workspace-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #858585;
  flex-shrink: 0;
}

.workspace-icon {
  font-size: 16px;
}

.workspace-name {
  font-weight: 500;
}

.worktree-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow-x: auto;
}

.worktree-tabs::-webkit-scrollbar {
  height: 4px;
}

.worktree-tabs::-webkit-scrollbar-track {
  background: #252526;
}

.worktree-tabs::-webkit-scrollbar-thumb {
  background: #505050;
  border-radius: 2px;
}

.worktree-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #37373d;
  border: 1px solid #464647;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.worktree-tab:hover {
  background: #3e3e42;
  border-color: #505050;
}

.worktree-tab.active {
  background: #1e1e1e;
  border-color: #007acc;
  color: #ffffff;
}

.worktree-tab.is-main {
  font-weight: 500;
}

.worktree-icon {
  font-size: 14px;
  color: #858585;
}

.worktree-tab.active .worktree-icon {
  color: #007acc;
}

.branch-name {
  color: #cccccc;
}

.worktree-tab.active .branch-name {
  color: #ffffff;
}

.status-indicator {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.status-indicator.modified {
  color: #f48771;
}

.status-indicator.ahead {
  color: #4ec9b0;
  background: rgba(78, 201, 176, 0.2);
}

.status-indicator.behind {
  color: #f48771;
  background: rgba(244, 135, 113, 0.2);
}

.add-worktree-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid #464647;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.add-worktree-btn:hover {
  background: #37373d;
  border-color: #505050;
}

.worktree-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: #858585;
}

.action-btn:hover {
  background: #37373d;
  color: #cccccc;
}
</style>