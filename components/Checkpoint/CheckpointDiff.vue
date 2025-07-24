<template>
  <teleport to="body">
    <div class="diff-overlay" @click.self="$emit('close')">
      <div class="diff-container">
        <!-- Header -->
        <div class="diff-header">
          <div class="header-title">
            <Icon name="mdi:compare" class="header-icon" />
            <h3>Compare with Current State</h3>
          </div>
          <button @click="$emit('close')" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>

        <!-- Loading state -->
        <div v-if="loading" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <p>Analyzing differences...</p>
        </div>

        <!-- Diff content -->
        <div v-else-if="diff" class="diff-content">
          <!-- Summary stats -->
          <div class="diff-summary">
            <div class="summary-stat added">
              <Icon name="mdi:plus-circle" />
              <span>{{ diff.added?.length || 0 }} files added</span>
            </div>
            <div class="summary-stat removed">
              <Icon name="mdi:minus-circle" />
              <span>{{ diff.removed?.length || 0 }} files removed</span>
            </div>
            <div class="summary-stat modified">
              <Icon name="mdi:pencil-circle" />
              <span>{{ diff.modified?.length || 0 }} files modified</span>
            </div>
            <div class="summary-stat unchanged">
              <Icon name="mdi:check-circle" />
              <span>{{ diff.unchanged?.length || 0 }} files unchanged</span>
            </div>
          </div>

          <!-- Git changes -->
          <div class="git-changes" v-if="diff.gitChanges">
            <h4>Git Status Changes</h4>
            <div class="git-change-list">
              <div v-if="diff.gitChanges.branchChanged" class="git-change">
                <Icon name="mdi:source-branch" />
                <span>Branch changed</span>
              </div>
              <div v-if="diff.gitChanges.commitChanged" class="git-change">
                <Icon name="mdi:source-commit" />
                <span>New commits</span>
              </div>
              <div v-if="diff.gitChanges.uncommittedChanges !== 0" class="git-change">
                <Icon name="mdi:file-edit" />
                <span>{{ Math.abs(diff.gitChanges.uncommittedChanges) }} uncommitted changes {{ diff.gitChanges.uncommittedChanges > 0 ? 'added' : 'removed' }}</span>
              </div>
            </div>
          </div>

          <!-- File changes tabs -->
          <div class="file-tabs">
            <button
              v-for="tab in fileTabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="{ active: activeTab === tab.id }"
              class="file-tab"
            >
              <Icon :name="tab.icon" />
              {{ tab.label }}
              <span class="count" v-if="getFileCount(tab.id) > 0">
                {{ getFileCount(tab.id) }}
              </span>
            </button>
          </div>

          <!-- File list -->
          <div class="file-list">
            <div v-if="filteredFiles.length === 0" class="empty-files">
              <p>No files in this category</p>
            </div>
            <div
              v-for="file in filteredFiles"
              :key="file"
              class="file-item"
              :class="getFileClass(file)"
            >
              <Icon :name="getFileIcon(file)" />
              <span class="file-path">{{ file }}</span>
              <button
                v-if="activeTab === 'modified'"
                @click="viewFileDiff(file)"
                class="view-diff-button"
              >
                <Icon name="mdi:file-compare" />
                View Diff
              </button>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="diff-actions">
            <button @click="selectiveRestore" class="secondary-button">
              <Icon name="mdi:playlist-check" />
              Selective Restore
            </button>
            <button @click="exportDiff" class="secondary-button">
              <Icon name="mdi:export" />
              Export Diff
            </button>
            <button @click="$emit('close')" class="primary-button">
              Close
            </button>
          </div>
        </div>

        <!-- Error state -->
        <div v-else class="error-state">
          <Icon name="mdi:alert-circle" />
          <p>Failed to generate diff</p>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { CheckpointV2, CheckpointDiff } from '~/stores/checkpoint-v2';
import { useCheckpointV2Store } from '~/stores/checkpoint-v2';
import Icon from '~/components/Icon.vue';

const props = defineProps<{
  checkpoint: CheckpointV2;
}>();

const emit = defineEmits<{
  close: [];
}>();

const store = useCheckpointV2Store();

// State
const loading = ref(true);
const diff = ref<CheckpointDiff | null>(null);
const activeTab = ref<'added' | 'removed' | 'modified' | 'unchanged'>('modified');

// File tabs
const fileTabs = [
  { id: 'modified', label: 'Modified', icon: 'mdi:pencil' },
  { id: 'added', label: 'Added', icon: 'mdi:plus' },
  { id: 'removed', label: 'Removed', icon: 'mdi:minus' },
  { id: 'unchanged', label: 'Unchanged', icon: 'mdi:check' }
];

// Computed
const filteredFiles = computed(() => {
  if (!diff.value) return [];
  return diff.value[activeTab.value] || [];
});

// Methods
function getFileCount(tab: string): number {
  if (!diff.value) return 0;
  return diff.value[tab as keyof CheckpointDiff]?.length || 0;
}

function getFileClass(file: string): string {
  return `file-${activeTab.value}`;
}

function getFileIcon(file: string): string {
  const icons: Record<string, string> = {
    added: 'mdi:plus-circle',
    removed: 'mdi:minus-circle',
    modified: 'mdi:pencil-circle',
    unchanged: 'mdi:check-circle'
  };
  return icons[activeTab.value] || 'mdi:file';
}

async function generateDiff() {
  loading.value = true;
  try {
    // Create a temporary checkpoint for current state
    const currentCheckpoint = await store.createCheckpoint(
      'Temporary comparison checkpoint',
      'manual',
      'Auto-generated for comparison',
      ['temp', 'comparison']
    );
    
    if (currentCheckpoint) {
      // Compare with the selected checkpoint
      diff.value = await store.compareCheckpoints(props.checkpoint.id, currentCheckpoint.id);
      
      // Clean up temporary checkpoint
      await store.deleteCheckpoint(currentCheckpoint.id);
    }
  } catch (error) {
    console.error('Failed to generate diff:', error);
  } finally {
    loading.value = false;
  }
}

function viewFileDiff(file: string) {
  // This would open a detailed file diff viewer
  console.log('View diff for file:', file);
  // TODO: Implement file diff viewer
}

async function selectiveRestore() {
  // This would open a dialog to select specific files to restore
  console.log('Selective restore');
  // TODO: Implement selective restore dialog
}

async function exportDiff() {
  if (!diff.value) return;
  
  // Export diff as JSON
  const diffData = {
    checkpoint: {
      id: props.checkpoint.id,
      name: props.checkpoint.name,
      timestamp: props.checkpoint.timestamp
    },
    diff: diff.value,
    generatedAt: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(diffData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `checkpoint-diff-${props.checkpoint.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Generate diff on mount
onMounted(() => {
  generateDiff();
});
</script>

<style scoped>
.diff-overlay {
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

.diff-container {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 800px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
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

.header-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.close-button:hover {
  background: var(--color-background-mute);
  color: var(--color-text);
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  gap: 12px;
  color: var(--color-text-secondary);
}

.loading-state .icon,
.error-state .icon {
  font-size: 32px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.diff-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diff-summary {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  background: var(--color-background-mute);
  border-bottom: 1px solid var(--color-border);
}

.summary-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.summary-stat.added {
  color: var(--color-success);
}

.summary-stat.removed {
  color: var(--color-error);
}

.summary-stat.modified {
  color: var(--color-warning);
}

.summary-stat.unchanged {
  color: var(--color-text-secondary);
}

.git-changes {
  padding: 16px 20px;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}

.git-changes h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.git-change-list {
  display: flex;
  gap: 16px;
}

.git-change {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.file-tabs {
  display: flex;
  padding: 0 20px;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}

.file-tab {
  background: none;
  border: none;
  padding: 12px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.file-tab:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}

.file-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.file-tab .count {
  background: var(--color-background-mute);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  min-width: 20px;
  text-align: center;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.empty-files {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  transition: all 0.2s;
}

.file-item:hover {
  background: var(--color-background-mute);
}

.file-item .icon {
  font-size: 16px;
  flex-shrink: 0;
}

.file-item.file-added .icon {
  color: var(--color-success);
}

.file-item.file-removed .icon {
  color: var(--color-error);
}

.file-item.file-modified .icon {
  color: var(--color-warning);
}

.file-item.file-unchanged .icon {
  color: var(--color-text-secondary);
}

.file-path {
  flex: 1;
  font-family: monospace;
  font-size: 12px;
}

.view-diff-button {
  background: var(--color-background-soft);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.view-diff-button:hover {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.diff-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background-soft);
  justify-content: flex-end;
}

.primary-button {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.primary-button:hover {
  background: var(--color-primary-hover);
}

.secondary-button {
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.secondary-button:hover {
  background: var(--color-background-soft);
  border-color: var(--color-border-hover);
}

/* Dark theme color variables */
:root {
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
  --color-success: #73c991;
  --color-warning: #e2c08d;
  --color-error: #f14c4c;
}
</style>