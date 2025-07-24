<template>
  <div class="worktree-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-title">
        <Icon name="mdi:source-branch-fork" class="header-icon" />
        <h3>Git Worktrees</h3>
      </div>
      <div class="header-actions">
        <button 
          @click="handleRefresh" 
          :disabled="isLoading"
          class="icon-button"
          title="Refresh"
        >
          <Icon name="mdi:refresh" :class="{ 'animate-spin': isLoading }" />
        </button>
        <button 
          @click="showCreateDialog = true" 
          class="icon-button"
          title="Create worktree"
          :disabled="!isGitRepository"
        >
          <Icon name="mdi:plus" />
        </button>
        <button 
          @click="showSessionComparison = true" 
          class="icon-button"
          title="Compare sessions"
        >
          <Icon name="mdi:compare" />
        </button>
      </div>
    </div>

    <!-- Not a git repository message -->
    <div v-if="(!isGitRepository || worktrees.length === 0) && initialized && !isLoading" class="no-repo-message">
      <Icon name="mdi:git" class="no-repo-icon" />
      <p>{{ !isGitRepository ? 'This folder is not a Git repository' : 'No worktrees found' }}</p>
      <p class="hint">{{ !isGitRepository ? 'Git worktrees require an initialized Git repository' : 'Create a worktree to get started' }}</p>
    </div>

    <!-- Loading state -->
    <div v-else-if="isLoading || !initialized" class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading worktrees...</p>
    </div>

    <!-- Worktree content -->
    <div v-else class="worktree-content">
      <!-- Active sessions -->
      <div v-if="sessions.length > 0" class="section">
        <div class="section-header">
          <h4>Active Sessions</h4>
          <span class="count">{{ sessions.length }}</span>
        </div>
        <div class="session-list">
          <WorktreeSessionCard
            v-for="session in sessions"
            :key="session.id"
            :session="session"
            :current-path="workspaceStore.currentPath"
            @switch="handleSwitch"
            @delete="handleDeleteSession"
            @compare="handleCompare"
          />
        </div>
      </div>

      <!-- Worktrees -->
      <div class="section">
        <div class="section-header">
          <h4>Worktrees</h4>
          <span class="count">{{ worktrees.length }}</span>
        </div>
        <div class="worktree-list">
          <WorktreeCard
            v-for="worktree in worktrees"
            :key="worktree.path"
            :worktree="worktree"
            :session="findSessionForWorktree(worktree.path)"
            @switch="handleSwitch"
            @remove="handleRemove"
            @lock="handleLock"
            @create-session="handleCreateSession"
          />
        </div>
      </div>

      <!-- No worktrees message -->
      <div v-if="worktrees.length === 0 && sessions.length === 0" class="empty-state">
        <Icon name="mdi:source-branch-fork" />
        <p>No worktrees created yet</p>
        <button @click="showCreateDialog = true" class="primary-button">
          <Icon name="mdi:plus" />
          Create Worktree
        </button>
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
        <button @click="showSessionComparison = false" class="close-button">
          <Icon name="mdi:close" />
        </button>
      </div>
      <SessionComparison />
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

// Load worktrees and sessions
async function loadWorktrees() {
  if (!workspaceStore.currentPath) return;
  
  console.log('[WorktreePanel] Loading worktrees for path:', workspaceStore.currentPath);
  
  isLoading.value = true;
  try {
    // Set workspace path first to ensure backend is initialized
    await window.electronAPI.workspace.setPath(workspaceStore.currentPath);
    
    // Load worktrees
    const worktreeResult = await window.electronAPI.worktree.list();
    console.log('[WorktreePanel] Worktree list result:', worktreeResult);
    if (worktreeResult.success && worktreeResult.worktrees) {
      worktrees.value = worktreeResult.worktrees;
    } else if (worktreeResult.error && worktreeResult.error.includes('not a git repository')) {
      // Clear worktrees if not a git repository
      worktrees.value = [];
      sessions.value = [];
      console.log('[WorktreePanel] Not a git repository, clearing worktrees');
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

async function handleCreate(branchName: string, sessionName?: string) {
  isLoading.value = true;
  try {
    const result = await window.electronAPI.worktree.create(branchName, sessionName);
    if (result.success) {
      await loadWorktrees();
      showCreateDialog.value = false;
    } else {
      console.error('Failed to create worktree:', result.error);
    }
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
  }
}

async function handleRemove(worktree: Worktree, force: boolean = false) {
  if (!force && !confirm(`Remove worktree for branch "${worktree.branch}"?`)) {
    return;
  }
  
  const result = await window.electronAPI.worktree.remove(worktree.path, force);
  if (result.success) {
    await loadWorktrees();
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

function handleCompare(worktree1: Worktree, worktree2: Worktree) {
  compareData.value = { worktree1, worktree2 };
}
</script>

<style scoped>
.worktree-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  color: #cccccc;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #454545;
  background: #2d2d30;
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

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
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
  color: #858585;
  transition: all 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: #3e3e42;
  color: #cccccc;
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

.no-repo-message,
.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
  gap: 16px;
}

.no-repo-icon {
  font-size: 48px;
  color: #858585;
  opacity: 0.5;
}

.no-repo-message p {
  margin: 0;
  color: #858585;
}

.hint {
  font-size: 13px;
  opacity: 0.7;
}

.worktree-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  color: #858585;
}

.count {
  background: #3e3e42;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  color: #858585;
}

.session-list,
.worktree-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary-button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.primary-button:hover {
  background: #1a8cff;
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