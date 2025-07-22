<template>
  <div class="source-control-panel">
    <!-- Tab navigation -->
    <div class="source-control-tabs">
      <button 
        :class="{ active: activeTab === 'changes' }"
        @click="activeTab = 'changes'"
      >
        <Icon name="mdi:file-document-multiple" />
        Changes
      </button>
      <button 
        :class="{ active: activeTab === 'hooks' }"
        @click="activeTab = 'hooks'"
      >
        <Icon name="mdi:hook" />
        Git Hooks
      </button>
    </div>
    
    <!-- Changes tab content -->
    <div v-if="activeTab === 'changes'" class="tab-content">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-title">
          <Icon name="mdi:source-branch" class="header-icon" />
          <h3>Source Control</h3>
        </div>
        <div class="header-actions">
        <button 
          v-if="store.isGitRepository"
          @click="handleRefresh" 
          :disabled="store.isLoading"
          class="icon-button"
          title="Refresh"
        >
          <Icon name="mdi:refresh" :class="{ 'animate-spin': store.isLoading }" />
        </button>
      </div>
    </div>

    <!-- Not a git repository message -->
    <div v-if="!store.isGitRepository && store.initialized" class="no-repo-message">
      <Icon name="mdi:git" class="no-repo-icon" />
      <p>This folder is not a Git repository</p>
      <button @click="initializeRepository" class="primary-button">
        Initialize Repository
      </button>
    </div>

    <!-- Git repository content -->
    <div v-else-if="store.isGitRepository" class="source-control-content">
      <!-- Branch info -->
      <div class="branch-section">
        <BranchSelector 
          :current-branch="store.currentBranch"
          :branches="store.branches"
          :ahead="store.ahead"
          :behind="store.behind"
          :tracking="store.tracking"
          @switch="handleBranchSwitch"
          @create="handleBranchCreate"
        />
      </div>

      <!-- Commit section -->
      <div class="commit-section">
        <div class="commit-input-wrapper">
          <textarea
            v-model="store.commitMessage"
            placeholder="Commit message (Ctrl+Enter to commit)"
            @keydown.ctrl.enter="handleCommit"
            @keydown.meta.enter="handleCommit"
            class="commit-textarea"
            :disabled="store.isLoading"
          />
        </div>
        <div class="commit-actions">
          <button 
            @click="generateCommitMessage" 
            class="secondary-button ai-button"
            :disabled="store.isLoading || store.stagedFiles.length === 0"
            title="Generate commit message with AI"
          >
            <Icon name="mdi:robot" />
            Generate
          </button>
          <div class="commit-main-actions">
            <button 
              @click="handleCommit" 
              :disabled="!store.canCommit || store.isLoading"
              class="primary-button commit-button"
            >
              <Icon name="mdi:check" />
              Commit
            </button>
            <button 
              @click="handlePush" 
              :disabled="store.isLoading || store.ahead === 0"
              class="primary-button push-button"
              title="Push changes"
            >
              <Icon name="mdi:arrow-up" />
              Push
            </button>
          </div>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="store.lastError" class="error-message">
        <Icon name="mdi:alert-circle" />
        {{ store.lastError }}
        <button @click="store.lastError = null" class="close-button">
          <Icon name="mdi:close" />
        </button>
      </div>

      <!-- File changes -->
      <div class="changes-container">
        <!-- Staged changes -->
        <div v-if="store.stagedFiles.length > 0" class="change-group">
          <div class="group-header">
            <div class="group-title">
              <Icon name="mdi:check-circle" class="staged-icon" />
              <span>Staged Changes ({{ store.stagedFiles.length }})</span>
            </div>
            <button 
              @click="store.unstageAll" 
              class="text-button"
              :disabled="store.isLoading"
            >
              Unstage All
            </button>
          </div>
          <div class="file-list">
            <GitFileItem
              v-for="file in store.stagedFiles"
              :key="file.path"
              :file="file"
              :selected="store.selectedFiles.includes(file.path)"
              @click="handleFileClick(file)"
              @action="handleFileAction"
            />
          </div>
        </div>

        <!-- Changes -->
        <div v-if="store.totalChanges > 0" class="change-group">
          <div class="group-header">
            <div class="group-title">
              <Icon name="mdi:pencil" class="changes-icon" />
              <span>Changes ({{ store.totalChanges }})</span>
            </div>
            <button 
              @click="store.stageAll" 
              class="text-button"
              :disabled="store.isLoading"
            >
              Stage All
            </button>
          </div>
          <div class="file-list">
            <!-- Modified files -->
            <GitFileItem
              v-for="file in store.modifiedFiles"
              :key="file.path"
              :file="file"
              :selected="store.selectedFiles.includes(file.path)"
              @click="handleFileClick(file)"
              @action="handleFileAction"
            />
            <!-- Deleted files -->
            <GitFileItem
              v-for="file in store.deletedFiles"
              :key="file.path"
              :file="file"
              :selected="store.selectedFiles.includes(file.path)"
              @click="handleFileClick(file)"
              @action="handleFileAction"
            />
            <!-- Renamed files -->
            <GitFileItem
              v-for="file in store.renamedFiles"
              :key="file.path"
              :file="file"
              :selected="store.selectedFiles.includes(file.path)"
              @click="handleFileClick(file)"
              @action="handleFileAction"
            />
            <!-- Untracked files -->
            <GitFileItem
              v-for="file in store.untrackedFiles"
              :key="file.path"
              :file="file"
              :selected="store.selectedFiles.includes(file.path)"
              @click="handleFileClick(file)"
              @action="handleFileAction"
            />
          </div>
        </div>

        <!-- No changes message -->
        <div v-if="!store.hasChanges" class="no-changes">
          <Icon name="mdi:check-all" />
          <p>No changes detected</p>
        </div>
      </div>
    </div>

      <!-- Loading state -->
      <div v-else class="loading-state">
        <Icon name="mdi:loading" class="animate-spin" />
        <p>Initializing...</p>
      </div>
    </div>
    
    <!-- Git Hooks tab content -->
    <div v-if="activeTab === 'hooks'" class="tab-content">
      <GitHooksPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSourceControlStore } from '~/stores/source-control';
import { useWorkspaceStore } from '~/stores/workspace';
import BranchSelector from './BranchSelector.vue';
import GitFileItem from './GitFileItem.vue';
import GitHooksPanel from './GitHooksPanel.vue';
import Icon from '~/components/UI/Icon.vue';

const store = useSourceControlStore();
const workspaceStore = useWorkspaceStore();

// State
const activeTab = ref<'changes' | 'hooks'>('changes');

// Initialize when component mounts
onMounted(async () => {
  if (workspaceStore.currentPath) {
    await store.initialize(workspaceStore.currentPath);
    
    // Set up auto-refresh
    startAutoRefresh();
  }
});

// Clean up on unmount
onUnmounted(() => {
  stopAutoRefresh();
});

// Auto-refresh interval
let refreshInterval: NodeJS.Timeout | null = null;

function startAutoRefresh() {
  // Refresh every 5 seconds if not loading
  refreshInterval = setInterval(() => {
    if (!store.isLoading && store.isGitRepository) {
      store.refreshStatus();
    }
  }, 5000);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Handlers
async function handleRefresh() {
  await store.refreshStatus();
  await store.refreshBranches();
  await store.refreshHistory();
}

async function initializeRepository() {
  const result = await window.electronAPI.git.init();
  if (result.success) {
    await store.initialize(workspaceStore.currentPath);
  }
}

async function handleCommit() {
  if (store.canCommit) {
    await store.commit();
  }
}

async function handlePush() {
  await store.push();
}

async function generateCommitMessage() {
  if (store.stagedFiles.length === 0) {
    store.lastError = 'No staged files to generate commit message from';
    return;
  }
  
  try {
    const { useAIGit } = await import('~/composables/useAIGit');
    const aiGit = useAIGit();
    
    store.commitMessage = 'Generating commit message...';
    const message = await aiGit.generateCommitMessage({
      style: 'conventional',
      includeScope: true,
      includeBreakingChanges: true
    });
    
    if (message) {
      store.commitMessage = message;
    } else {
      // Use fallback suggestions
      const suggestions = aiGit.getCommitSuggestions();
      if (suggestions.length > 0) {
        store.commitMessage = suggestions[0];
      }
    }
  } catch (error) {
    console.error('Failed to generate commit message:', error);
    store.lastError = 'Failed to generate commit message';
  }
}

async function handleBranchSwitch(branchName: string) {
  await store.switchBranch(branchName);
}

async function handleBranchCreate(branchName: string) {
  await store.createBranch(branchName);
}

function handleFileClick(file: any) {
  if (store.selectedFiles.includes(file.path)) {
    // If already selected, show diff
    store.showDiffFor = file.path;
  } else {
    // Select the file
    store.selectFile(file.path);
  }
}

async function handleFileAction(action: string, file: any) {
  switch (action) {
    case 'stage':
      await store.stageFiles([file.path]);
      break;
    case 'unstage':
      await store.unstageFiles([file.path]);
      break;
    case 'discard':
      if (confirm(`Discard changes to ${file.path}?`)) {
        await store.discardChanges([file.path]);
      }
      break;
    case 'diff':
      store.showDiffFor = file.path;
      break;
  }
}
</script>

<style scoped>
.source-control-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  color: var(--color-text);
}

.source-control-tabs {
  display: flex;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}

.source-control-tabs button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.source-control-tabs button:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}

.source-control-tabs button.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.no-repo-message {
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

.primary-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-button {
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
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

.secondary-button:hover:not(:disabled) {
  background: var(--color-background-soft);
  border-color: var(--color-border-hover);
}

.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.text-button {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.text-button:hover:not(:disabled) {
  background: var(--color-background-mute);
}

.text-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.source-control-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.branch-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.commit-section {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.commit-input-wrapper {
  margin-bottom: 12px;
}

.commit-textarea {
  width: 100%;
  min-height: 60px;
  max-height: 120px;
  padding: 10px;
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.2s;
}

.commit-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.commit-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.commit-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.commit-main-actions {
  display: flex;
  gap: 8px;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-error-background);
  color: var(--color-error);
  border-bottom: 1px solid var(--color-error-border);
}

.error-message .close-button {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--color-error);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: background 0.2s;
}

.error-message .close-button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.changes-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.change-group {
  margin-bottom: 24px;
}

.change-group:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 4px 0;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.staged-icon {
  color: var(--color-success);
}

.changes-icon {
  color: var(--color-warning);
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.no-changes {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.no-changes .icon {
  font-size: 48px;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);
}

.loading-state .icon {
  font-size: 32px;
}

/* Dark theme adjustments */
:root {
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
  --color-error-background: rgba(255, 0, 0, 0.1);
  --color-error-border: rgba(255, 0, 0, 0.3);
}
</style>