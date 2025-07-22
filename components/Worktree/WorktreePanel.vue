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
    <div v-if="!isGitRepository && initialized" class="no-repo-message">
      <Icon name="mdi:git" class="no-repo-icon" />
      <p>This folder is not a Git repository</p>
      <p class="hint">Git worktrees require an initialized Git repository</p>
    </div>

    <!-- Loading state -->
    <div v-else-if="!initialized" class="loading-state">
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
import { ref, onMounted, computed } from 'vue';
import { useWorkspaceStore } from '~/stores/workspace';
import { useSourceControlStore } from '~/stores/source-control';
import WorktreeCard from './WorktreeCard.vue';
import WorktreeSessionCard from './WorktreeSessionCard.vue';
import WorktreeCreateDialog from './WorktreeCreateDialog.vue';
import WorktreeCompareDialog from './WorktreeCompareDialog.vue';
import SessionComparison from './SessionComparison.vue';
import Icon from '~/components/UI/Icon.vue';

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
const sourceControlStore = useSourceControlStore();

// State
const initialized = ref(false);
const isLoading = ref(false);
const worktrees = ref<Worktree[]>([]);
const sessions = ref<WorktreeSession[]>([]);
const showCreateDialog = ref(false);
const compareData = ref<{ worktree1: Worktree; worktree2: Worktree } | null>(null);
const showSessionComparison = ref(false);

// Computed
const isGitRepository = computed(() => sourceControlStore.isGitRepository);

// Initialize
onMounted(async () => {
  await loadWorktrees();
  initialized.value = true;
});

// Load worktrees and sessions
async function loadWorktrees() {
  if (!workspaceStore.currentPath) return;
  
  isLoading.value = true;
  try {
    // Load worktrees
    const worktreeResult = await window.electronAPI.worktree.list();
    if (worktreeResult.success && worktreeResult.worktrees) {
      worktrees.value = worktreeResult.worktrees;
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
  await loadWorktrees();
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
    // Update workspace path
    await workspaceStore.setCurrentPath(worktreePath);
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
  const sessionName = prompt('Session name:');
  if (!sessionName) return;
  
  const result = await window.electronAPI.worktree.createSession({
    name: sessionName,
    worktreePath: worktree.path,
    branchName: worktree.branch,
    metadata: {}
  });
  
  if (result.success) {
    await loadWorktrees();
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
  background: var(--color-background);
  color: var(--color-text);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 20px;
  color: var(--color-primary);
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
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: var(--color-background-mute);
  color: var(--color-text);
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
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.no-repo-message p {
  margin: 0;
  color: var(--color-text-secondary);
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
  color: var(--color-text-secondary);
}

.count {
  background: var(--color-background-mute);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.session-list,
.worktree-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary-button {
  background: var(--color-primary);
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
  background: var(--color-primary-hover);
}

/* Session comparison panel */
.session-comparison-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-background);
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.session-comparison-panel .panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
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
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.close-button:hover {
  background: var(--color-background-mute);
  color: var(--color-text);
}

/* Dark theme adjustments */
:root {
  --color-primary-hover: #4a9eff;
}
</style>