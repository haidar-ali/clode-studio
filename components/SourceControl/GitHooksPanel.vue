<template>
  <div class="git-hooks-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-title">
        <Icon name="mdi:hook" class="header-icon" />
        <h3>Git Hooks</h3>
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
          v-if="!hooksInstalled"
          @click="installHooks" 
          class="primary-button"
          :disabled="isLoading"
        >
          <Icon name="mdi:download" />
          Install Hooks
        </button>
        <button 
          v-else
          @click="uninstallHooks" 
          class="secondary-button"
          :disabled="isLoading"
        >
          <Icon name="mdi:delete" />
          Uninstall
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && !initialized" class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading hooks status...</p>
    </div>

    <!-- Content -->
    <div v-else class="hooks-content">
      <!-- Hooks list -->
      <div class="hooks-list">
        <div v-for="hook in hooks" :key="hook.name" class="hook-card">
          <div class="hook-header">
            <div class="hook-info">
              <Icon :name="getHookIcon(hook.name)" class="hook-icon" />
              <div class="hook-details">
                <h4>{{ formatHookName(hook.name) }}</h4>
                <p>{{ hook.description }}</p>
              </div>
            </div>
            <div class="hook-status">
              <span v-if="hook.enabled" class="status-badge enabled">
                <Icon name="mdi:check-circle" />
                Enabled
              </span>
              <span v-else class="status-badge disabled">
                <Icon name="mdi:close-circle" />
                Disabled
              </span>
            </div>
          </div>
          
          <!-- Hook options -->
          <div v-if="hook.enabled" class="hook-options">
            <div v-if="hook.name === 'pre-commit'" class="options-grid">
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.preCommit.lintCheck"
                  @change="updateHook('pre-commit')"
                />
                <span>Lint Check</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.preCommit.typeCheck"
                  @change="updateHook('pre-commit')"
                />
                <span>Type Check</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.preCommit.testCheck"
                  @change="updateHook('pre-commit')"
                />
                <span>Run Tests</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.preCommit.formatCheck"
                  @change="updateHook('pre-commit')"
                />
                <span>Format Check</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.preCommit.preventFixup"
                  @change="updateHook('pre-commit')"
                />
                <span>Prevent Fixup Commits</span>
              </label>
              <div class="option-item">
                <label>Max File Size (MB):</label>
                <input 
                  type="number" 
                  v-model.number="hookOptions.preCommit.maxFileSize"
                  @change="updateHook('pre-commit')"
                  min="1"
                  max="100"
                  class="number-input"
                />
              </div>
            </div>
            
            <div v-else-if="hook.name === 'post-commit'" class="options-grid">
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.postCommit.autoCheckpoint"
                  @change="updateHook('post-commit')"
                />
                <span>Auto Checkpoint</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.postCommit.notifySuccess"
                  @change="updateHook('post-commit')"
                />
                <span>Notify Success</span>
              </label>
            </div>
            
            <div v-else-if="hook.name === 'pre-push'" class="options-grid">
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.prePush.runTests"
                  @change="updateHook('pre-push')"
                />
                <span>Run Tests</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.prePush.checkBranch"
                  @change="updateHook('pre-push')"
                />
                <span>Check Protected Branches</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.prePush.preventForcePush"
                  @change="updateHook('pre-push')"
                />
                <span>Prevent Force Push</span>
              </label>
            </div>
            
            <div v-else-if="hook.name === 'commit-msg'" class="options-grid">
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.commitMsg.enforceConventional"
                  @change="updateHook('commit-msg')"
                />
                <span>Enforce Conventional Commits</span>
              </label>
              <label class="option-item">
                <input 
                  type="checkbox" 
                  v-model="hookOptions.commitMsg.requireTicketNumber"
                  @change="updateHook('commit-msg')"
                />
                <span>Require Ticket Number</span>
              </label>
              <div class="option-item">
                <label>Max Length:</label>
                <input 
                  type="number" 
                  v-model.number="hookOptions.commitMsg.maxLength"
                  @change="updateHook('commit-msg')"
                  min="50"
                  max="100"
                  class="number-input"
                />
              </div>
            </div>
          </div>
          
          <!-- Hook actions -->
          <div v-if="hook.enabled" class="hook-actions">
            <button 
              @click="testHook(hook.name)" 
              class="text-button"
              :disabled="isLoading"
            >
              <Icon name="mdi:test-tube" />
              Test Hook
            </button>
            <button 
              @click="showHookScript(hook)" 
              class="text-button"
            >
              <Icon name="mdi:code-tags" />
              View Script
            </button>
          </div>
        </div>
      </div>
      
      <!-- Installation info -->
      <div v-if="!hooksInstalled" class="installation-info">
        <Icon name="mdi:information" />
        <div>
          <p>Git hooks help maintain code quality and consistency.</p>
          <p>Install hooks to enable automatic checks before commits and pushes.</p>
        </div>
      </div>
    </div>

    <!-- Script viewer modal -->
    <teleport to="body" v-if="selectedHook">
      <div class="modal-overlay" @click="selectedHook = null">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <h3>{{ formatHookName(selectedHook.name) }} Script</h3>
            <button @click="selectedHook = null" class="close-button">
              <Icon name="mdi:close" />
            </button>
          </div>
          <div class="modal-content">
            <pre class="script-content">{{ selectedHook.script }}</pre>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useSourceControlStore } from '~/stores/source-control';
import Icon from '~/components/UI/Icon.vue';

interface GitHook {
  name: string;
  enabled: boolean;
  script: string;
  description: string;
}

interface HookOptions {
  preCommit: {
    enabled: boolean;
    lintCheck: boolean;
    typeCheck: boolean;
    testCheck: boolean;
    formatCheck: boolean;
    preventFixup: boolean;
    maxFileSize: number;
  };
  postCommit: {
    enabled: boolean;
    autoCheckpoint: boolean;
    notifySuccess: boolean;
  };
  prePush: {
    enabled: boolean;
    runTests: boolean;
    checkBranch: boolean;
    preventForcePush: boolean;
  };
  commitMsg: {
    enabled: boolean;
    enforceConventional: boolean;
    maxLength: number;
    requireTicketNumber: boolean;
  };
}

const sourceControlStore = useSourceControlStore();

// State
const initialized = ref(false);
const isLoading = ref(false);
const hooks = ref<GitHook[]>([]);
const hooksInstalled = ref(false);
const selectedHook = ref<GitHook | null>(null);

// Hook options
const hookOptions = reactive<HookOptions>({
  preCommit: {
    enabled: true,
    lintCheck: true,
    typeCheck: true,
    testCheck: false,
    formatCheck: true,
    preventFixup: true,
    maxFileSize: 50
  },
  postCommit: {
    enabled: true,
    autoCheckpoint: true,
    notifySuccess: true
  },
  prePush: {
    enabled: true,
    runTests: false,
    checkBranch: true,
    preventForcePush: true
  },
  commitMsg: {
    enabled: true,
    enforceConventional: true,
    maxLength: 72,
    requireTicketNumber: false
  }
});

// Initialize
onMounted(async () => {
  await loadHooksStatus();
  initialized.value = true;
});

// Load hooks status
async function loadHooksStatus() {
  isLoading.value = true;
  try {
    const result = await window.electronAPI.gitHooks.status();
    if (result.success && result.hooks) {
      hooks.value = result.hooks;
      hooksInstalled.value = result.hooks.some(h => h.enabled);
    }
  } catch (error) {
    console.error('Failed to load hooks status:', error);
  } finally {
    isLoading.value = false;
  }
}

// Refresh hooks status
async function handleRefresh() {
  await loadHooksStatus();
}

// Install hooks
async function installHooks() {
  isLoading.value = true;
  try {
    const result = await window.electronAPI.gitHooks.install(hookOptions);
    if (result.success) {
      await loadHooksStatus();
    } else {
      console.error('Failed to install hooks:', result.error);
    }
  } finally {
    isLoading.value = false;
  }
}

// Uninstall hooks
async function uninstallHooks() {
  if (!confirm('Are you sure you want to uninstall all git hooks?')) {
    return;
  }
  
  isLoading.value = true;
  try {
    const result = await window.electronAPI.gitHooks.uninstall();
    if (result.success) {
      await loadHooksStatus();
    } else {
      console.error('Failed to uninstall hooks:', result.error);
    }
  } finally {
    isLoading.value = false;
  }
}

// Update individual hook
async function updateHook(hookName: string) {
  const options = hookOptions[hookName as keyof HookOptions];
  const result = await window.electronAPI.gitHooks.update(hookName, options);
  if (!result.success) {
    console.error(`Failed to update ${hookName} hook:`, result.error);
  }
}

// Test hook
async function testHook(hookName: string) {
  isLoading.value = true;
  try {
    const result = await window.electronAPI.gitHooks.test(hookName);
    if (result.success) {
      alert(`Hook test result:\n\n${result.output}`);
    } else {
      alert(`Hook test failed:\n\n${result.error}`);
    }
  } finally {
    isLoading.value = false;
  }
}

// Show hook script
function showHookScript(hook: GitHook) {
  selectedHook.value = hook;
}

// Get hook icon
function getHookIcon(hookName: string): string {
  const icons: Record<string, string> = {
    'pre-commit': 'mdi:shield-check',
    'post-commit': 'mdi:checkbox-marked-circle',
    'pre-push': 'mdi:upload',
    'commit-msg': 'mdi:message-text'
  };
  return icons[hookName] || 'mdi:hook';
}

// Format hook name
function formatHookName(hookName: string): string {
  return hookName.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}
</script>

<style scoped>
.git-hooks-panel {
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

.primary-button {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 6px 12px;
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
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
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
  display: flex;
  align-items: center;
  gap: 4px;
}

.text-button:hover:not(:disabled) {
  background: var(--color-background-mute);
}

.text-button:disabled {
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

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--color-text-secondary);
}

.loading-state .icon {
  font-size: 32px;
}

.hooks-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.hooks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hook-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.hook-card:hover {
  border-color: var(--color-border-hover);
}

.hook-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.hook-info {
  display: flex;
  gap: 12px;
  flex: 1;
}

.hook-icon {
  font-size: 24px;
  color: var(--color-primary);
  margin-top: 2px;
}

.hook-details h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
}

.hook-details p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.enabled {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status-badge.disabled {
  background: var(--color-error-soft);
  color: var(--color-error);
}

.hook-options {
  margin: 12px 0;
  padding: 12px;
  background: var(--color-background);
  border-radius: 4px;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.option-item input[type="checkbox"] {
  cursor: pointer;
}

.option-item label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-right: 4px;
}

.number-input {
  width: 60px;
  padding: 4px 8px;
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
}

.hook-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.installation-info {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--color-info-soft);
  border-radius: 8px;
  margin-top: 16px;
}

.installation-info .icon {
  font-size: 24px;
  color: var(--color-info);
  flex-shrink: 0;
}

.installation-info p {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: var(--color-text);
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
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

.modal-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.script-content {
  margin: 0;
  font-family: monospace;
  font-size: 12px;
  white-space: pre;
  line-height: 1.5;
  background: var(--color-background-soft);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

/* Dark theme adjustments */
:root {
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
  --color-success-soft: rgba(67, 176, 42, 0.1);
  --color-success: #43b02a;
  --color-error-soft: rgba(244, 67, 54, 0.1);
  --color-error: #f44336;
  --color-info-soft: rgba(33, 150, 243, 0.1);
  --color-info: #2196f3;
}
</style>