<template>
  <div class="worktree-panel">
    <!-- Header -->
    <div class="timeline-header">
      <div class="header-title">
        <Icon name="mdi:source-branch-fork" class="header-icon" />
        <h3>Git Worktrees</h3>
      </div>
      <div class="header-actions">
        <button 
          @click="showCreateDialog = true" 
          class="primary-button"
          title="Create worktree"
          :disabled="!isGitRepository"
        >
          <Icon name="mdi:plus" />
          Create Worktree
        </button>
        <button 
          @click="showSessionComparison = true" 
          class="icon-button"
          title="Compare sessions"
        >
          <Icon name="mdi:compare" />
        </button>
        <button 
          @click="handleRefresh" 
          :disabled="isLoading"
          class="icon-button"
          title="Refresh"
        >
          <Icon name="mdi:refresh" :class="{ 'animate-spin': isLoading }" />
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar" v-if="initialized && isGitRepository">
      <div class="stat">
        <Icon name="mdi:source-branch-fork" />
        <span>{{ worktrees.length }} worktree{{ worktrees.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="stat" v-if="sessions.length > 0">
        <Icon name="mdi:bookmark" />
        <span>{{ sessions.length }} session{{ sessions.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="stat" v-if="activeWorktreeBranch">
        <Icon name="mdi:source-branch" />
        <span>{{ activeWorktreeBranch }}</span>
      </div>
    </div>

    <!-- Not a git repository message -->
    <div v-if="!isGitRepository && initialized && !isLoading" class="empty-state">
      <Icon name="mdi:git" class="empty-icon" />
      <p>This folder is not a Git repository</p>
      <span>Git worktrees require an initialized Git repository</span>
    </div>

    <!-- Loading state -->
    <div v-else-if="isLoading || !initialized" class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading worktrees...</p>
    </div>

    <!-- Worktree content -->
    <div v-else class="timeline-container">
      <!-- Worktrees with sessions -->
      <div v-if="worktrees.length > 0" class="worktree-list">
        <WorktreeCard
          v-for="worktree in worktrees"
          :key="worktree.path"
          :worktree="worktree"
          :session="findSessionForWorktree(worktree.path)"
          :active-worktree-path="activeWorktreePath"
          @switch="handleSwitch"
          @remove="handleRemove"
          @lock="handleLock"
          @create-session="handleCreateSession"
          @delete-session="handleDeleteSession"
          @compare="handleCompare"
        />
      </div>

      <!-- No worktrees message -->
      <div v-else class="empty-state">
        <Icon name="mdi:source-branch-fork" class="empty-icon" />
        <p>No worktrees created yet</p>
        <span>Create a worktree to work on multiple branches simultaneously</span>
      </div>
    </div>

    <!-- Create worktree dialog -->
    <WorktreeCreateDialog
      v-if="showCreateDialog"
      @close="showCreateDialog = false"
      @create="handleCreate"
    />
    
    <!-- Create session dialog -->
    <WorktreeSessionDialog
      v-if="showSessionDialog && sessionDialogWorktree"
      :worktree="sessionDialogWorktree"
      @close="showSessionDialog = false; sessionDialogWorktree = null"
      @create="handleSessionCreate"
    />

    <!-- Compare dialog -->
    <WorktreeCompareDialog
      v-if="compareData"
      :worktree1="compareData.worktree1"
      :worktree2="compareData.worktree2"
      @close="compareData = null"
    />
    
    <!-- Session comparison panel -->
    <div v-if="showSessionComparison" class="session-comparison-panel">
      <div class="panel-header">
        <h3>Session Comparison</h3>
        <button @click="showSessionComparison = false" class="close-button" title="Close">
          <Icon name="mdi:close" />
        </button>
      </div>
      <SessionComparison @close="showSessionComparison = false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useWorkspaceStore } from '~/stores/workspace';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import { useSourceControlStore } from '~/stores/source-control';
import WorktreeCard from './WorktreeCard.vue';
import WorktreeSessionCard from './WorktreeSessionCard.vue';
import WorktreeCreateDialog from './WorktreeCreateDialog.vue';
import WorktreeCompareDialog from './WorktreeCompareDialog.vue';
import WorktreeSessionDialog from './WorktreeSessionDialog.vue';
import SessionComparison from './SessionComparison.vue';
import Icon from '~/components/Icon.vue';

interface Worktree {
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

interface WorktreeSession {
  id: string;
  name: string;
  worktree: Worktree;
  created: Date;
  lastAccessed: Date;
  metadata: {
    task?: string;
    experiment?: boolean;
    tags?: string[];
  };
}

const workspaceStore = useWorkspaceStore();
const workspaceManager = useWorkspaceManager();
const { changeWorkspace } = workspaceManager;
const sourceControlStore = useSourceControlStore();

// State
const initialized = ref(false);
const isLoading = ref(false);
const worktrees = ref<Worktree[]>([]);
const sessions = ref<WorktreeSession[]>([]);
const showCreateDialog = ref(false);
const showSessionDialog = ref(false);
const sessionDialogWorktree = ref<Worktree | null>(null);
const compareData = ref<{ worktree1: Worktree; worktree2: Worktree } | null>(null);
const showSessionComparison = ref(false);

// Computed
const isGitRepository = computed(() => sourceControlStore.isGitRepository);
const activeWorktreePath = computed(() => workspaceManager.activeWorktreePath.value || '');
const activeWorktreeBranch = computed(() => {
  if (!activeWorktreePath.value) return null;
  const activeWorktree = Array.from(workspaceManager.activeWorktrees.value.values())
    .find(w => w.path === activeWorktreePath.value);
  return activeWorktree?.branch || null;
});

// Helper function to find session for a worktree
function findSessionForWorktree(worktreePath: string): WorktreeSession | undefined {
  return sessions.value.find(session => session.worktree.path === worktreePath);
}

// Initialize
onMounted(async () => {
  // First ensure source control is properly initialized
  if (!sourceControlStore.initialized && workspaceStore.currentPath) {
    await sourceControlStore.initialize(workspaceStore.currentPath);
  }
  
  // Now load worktrees if it's a git repository
  if (sourceControlStore.isGitRepository) {
    await loadWorktrees();
  }
  
  initialized.value = true;
});

// Watch for workspace changes
watch(() => workspaceStore.currentPath, async (newPath) => {
  if (newPath && !sourceControlStore.initialized) {
    await sourceControlStore.initialize(newPath);
    
    if (sourceControlStore.isGitRepository) {
      await loadWorktrees();
    }
  }
});

// Watch for active worktree changes from the workspace manager
watch(() => workspaceManager.activeWorktreePath.value, async (newPath, oldPath) => {
  if (newPath !== oldPath && sourceControlStore.isGitRepository) {
    
    await loadWorktrees();
  }
});

// Load worktrees and sessions
async function loadWorktrees() {
  if (!workspaceStore.currentPath) return;
  
  
  
  isLoading.value = true;
  try {
    // Don't set workspace path here as it might trigger reloads
    // The workspace should already be set
    
    // Load worktrees
    const worktreeResult = await window.electronAPI.worktree.list();
    
    if (worktreeResult.success && worktreeResult.worktrees) {
      worktrees.value = worktreeResult.worktrees;
    } else if (worktreeResult.error && worktreeResult.error.includes('not a git repository')) {
      // Clear worktrees if not a git repository
      worktrees.value = [];
      sessions.value = [];
      
      return;
    }
    
    // Load sessions
    const sessionResult = await window.electronAPI.worktree.sessions();
    if (sessionResult.success && sessionResult.sessions) {
      sessions.value = sessionResult.sessions;
    }
  } catch (error) {
    console.error('Failed to load worktrees:', error);
  } finally {
    isLoading.value = false;
  }
}

// Handlers
async function handleRefresh() {
  // Ensure git is initialized before refreshing
  if (!sourceControlStore.initialized && workspaceStore.currentPath) {
    await sourceControlStore.initialize(workspaceStore.currentPath);
  }
  
  if (sourceControlStore.isGitRepository) {
    await loadWorktrees();
  }
}

async function handleCreate(branchName: string, sessionName?: string, description?: string) {
  isLoading.value = true;
  try {
    // Use workspace manager to create worktree to ensure proper handling
    const newWorktree = await workspaceManager.createWorktree(branchName, sessionName, description);
    await loadWorktrees();
    showCreateDialog.value = false;
  } catch (error) {
    console.error('Failed to create worktree:', error);
    alert(`Failed to create worktree: ${error}`);
  } finally {
    isLoading.value = false;
  }
}

async function handleSwitch(worktreePath: string) {
  const result = await window.electronAPI.worktree.switch(worktreePath);
  if (result.success) {
    // Use the new worktree switching logic that preserves workspace state
    await workspaceManager.switchWorktreeWithinWorkspace(worktreePath);
    // Reload worktrees to update UI
    await loadWorktrees();
    // Refresh workspace manager's worktree list
    await workspaceManager.refreshWorktreeStatus();
  }
}

async function handleRemove(worktree: Worktree, force: boolean = false) {
  if (!force && !confirm(`Remove worktree for branch "${worktree.branch}"?`)) {
    return;
  }
  
  const result = await window.electronAPI.worktree.remove(worktree.path, force);
  if (result.success) {
    await loadWorktrees();
    // Remove the worktree from the active list without reinitializing everything
    await workspaceManager.removeWorktreeFromList(worktree.path);
  } else if (!force && result.error?.includes('locked')) {
    if (confirm('Worktree is locked. Force remove?')) {
      await handleRemove(worktree, true);
    }
  }
}

async function handleLock(worktree: Worktree, lock: boolean) {
  const result = await window.electronAPI.worktree.lock(worktree.path, lock);
  if (result.success) {
    await loadWorktrees();
  }
}

async function handleCreateSession(worktree: Worktree) {
  sessionDialogWorktree.value = worktree;
  showSessionDialog.value = true;
}

async function handleSessionCreate(data: { name: string; description?: string }) {
  if (!sessionDialogWorktree.value) return;
  
  const result = await window.electronAPI.worktree.createSession({
    name: data.name,
    worktreePath: sessionDialogWorktree.value.path,
    branchName: sessionDialogWorktree.value.branch,
    metadata: {
      description: data.description
    }
  });
  
  if (result.success) {
    await loadWorktrees();
    showSessionDialog.value = false;
    sessionDialogWorktree.value = null;
  } else {
    console.error('Failed to create session:', result.error);
    // Show user-friendly error message
    alert(result.error || 'Failed to create session');
  }
}

async function handleDeleteSession(sessionId: string) {
  if (!confirm('Delete this session?')) return;
  
  const result = await window.electronAPI.worktree.deleteSession(sessionId);
  if (result.success) {
    await loadWorktrees();
  }
}

function handleCompare(worktree: Worktree, activeWorktreeData: { path: string }) {
  // Find the actual active worktree object
  const activeWorktree = worktrees.value.find(w => w.path === activeWorktreeData.path);
  if (activeWorktree) {
    compareData.value = { worktree1: activeWorktree, worktree2: worktree };
  }
}
</script>

<style scoped>
.worktree-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 20px;
  color: #007acc;
}

.timeline-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e1e1e1;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-button {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  border-radius: 4px;
  color: #cccccc;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button:hover:not(:disabled) {
  background: #3e3e42;
  color: #ffffff;
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  font-size: 13px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #858585;
}

.stat Icon {
  font-size: 16px;
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  text-align: center;
  gap: 12px;
}

.empty-icon {
  font-size: 64px;
  color: #525252;
  margin-bottom: 8px;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  color: #cccccc;
  font-weight: 500;
}

.empty-state span {
  font-size: 13px;
  color: #858585;
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #1e1e1e;
}

.worktree-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 900px;
  margin: 0 auto;
}

.primary-button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.primary-button:hover:not(:disabled) {
  background: #1a8cff;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Session comparison panel */
.session-comparison-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #252526;
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.session-comparison-panel .panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #454545;
  background: #2d2d30;
}

.session-comparison-panel .panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
  color: #858585;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
  color: #cccccc;
}


</style>