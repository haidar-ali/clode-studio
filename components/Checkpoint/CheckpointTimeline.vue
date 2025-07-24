<template>
  <div class="checkpoint-timeline">
    <!-- Header -->
    <div class="timeline-header">
      <div class="header-title">
        <Icon name="mdi:history" class="header-icon" />
        <h3>Checkpoint Timeline</h3>
      </div>
      <div class="header-actions">
        <button 
          @click="createManualCheckpoint" 
          :disabled="store.isCreating"
          class="primary-button"
          title="Create checkpoint"
        >
          <Icon name="mdi:plus" />
          Create Checkpoint
        </button>
        <button 
          @click="showSettings = true"
          class="icon-button"
          title="Settings"
        >
          <Icon name="mdi:cog" />
        </button>
        <button 
          @click="cleanupCorrupted"
          class="icon-button"
          title="Clean up corrupted checkpoints"
        >
          <Icon name="mdi:broom" />
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stat">
        <Icon name="mdi:database" />
        <span>{{ formatBytes(store.totalCheckpointSize) }}</span>
      </div>
      <div class="stat">
        <Icon name="mdi:file-document-multiple" />
        <span>{{ store.checkpoints.length }} checkpoints</span>
      </div>
      <div class="stat" v-if="store.autoCheckpointEnabled">
        <Icon name="mdi:timer" />
        <span>Auto: {{ formatInterval(store.autoCheckpointInterval) }}</span>
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="filter-tabs">
      <button 
        v-for="trigger in triggerTypes" 
        :key="trigger.id"
        @click="selectedTrigger = trigger.id"
        :class="{ active: selectedTrigger === trigger.id }"
        class="filter-tab"
      >
        <Icon :name="trigger.icon" />
        {{ trigger.label }}
        <span class="count" v-if="getCountByTrigger(trigger.id) > 0">
          {{ getCountByTrigger(trigger.id) }}
        </span>
      </button>
    </div>

    <!-- Timeline -->
    <div class="timeline-container" ref="timelineContainer">
      <div v-if="filteredCheckpoints.length === 0" class="empty-state">
        <Icon name="mdi:clock-outline" />
        <p>No checkpoints found</p>
        <span>Checkpoints will appear here as you work</span>
      </div>

      <div v-else class="timeline">
        <div 
          v-for="(checkpoint, index) in filteredCheckpoints" 
          :key="checkpoint.id"
          class="timeline-item"
          :class="{ 'selected': selectedCheckpoint?.id === checkpoint.id }"
        >
          <!-- Timeline line -->
          <div class="timeline-line" v-if="index < filteredCheckpoints.length - 1"></div>
          
          <!-- Timeline dot -->
          <div class="timeline-dot" :class="`trigger-${checkpoint.trigger}`">
            <Icon :name="getTriggerIcon(checkpoint.trigger)" />
          </div>

          <!-- Checkpoint card -->
          <div class="checkpoint-card" @click="selectCheckpoint(checkpoint)">
            <div class="card-header">
              <h4>{{ checkpoint.name }}</h4>
              <span class="time">{{ formatTime(checkpoint.timestamp) }}</span>
            </div>

            <div v-if="checkpoint.description" class="card-description">
              {{ checkpoint.description }}
            </div>

            <div class="card-stats">
              <span class="stat">
                <Icon name="mdi:file-multiple" />
                {{ checkpoint.stats.fileCount }} files
              </span>
              <span class="stat">
                <Icon name="mdi:source-branch" />
                {{ checkpoint.git?.branch || 'No branch' }}
              </span>
              <span class="stat">
                <Icon name="mdi:database" />
                {{ formatBytes(checkpoint.stats.totalSize) }}
              </span>
            </div>

            <div class="card-tags" v-if="checkpoint.tags.length > 0">
              <span v-for="tag in checkpoint.tags" :key="tag" class="tag">
                {{ tag }}
              </span>
            </div>

            <div class="card-actions">
              <button 
                @click.stop="restoreCheckpoint(checkpoint)"
                class="action-button primary"
                title="Restore this checkpoint"
              >
                <Icon name="mdi:restore" />
                Restore
              </button>
              <button 
                @click.stop="showDiff(checkpoint)"
                class="action-button"
                title="Compare with current"
              >
                <Icon name="mdi:compare" />
                Diff
              </button>
              <button 
                @click.stop="exportCheckpoint(checkpoint)"
                class="action-button"
                title="Export checkpoint"
              >
                <Icon name="mdi:export" />
              </button>
              <button 
                @click.stop="deleteCheckpoint(checkpoint)"
                class="action-button danger"
                title="Delete checkpoint"
              >
                <Icon name="mdi:delete" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create checkpoint dialog -->
    <teleport to="body">
      <div v-if="showCreateDialog" class="modal-overlay" @click.self="closeCreateDialog">
        <div class="modal">
          <div class="modal-header">
            <h3>Create Checkpoint</h3>
            <button @click="closeCreateDialog" class="close-button">
              <Icon name="mdi:close" />
            </button>
          </div>
          <div class="modal-content">
            <div class="form-group">
              <label>Checkpoint name</label>
              <input
                v-model="newCheckpoint.name"
                placeholder="Enter checkpoint name..."
                class="form-input"
                ref="nameInput"
                @keyup.enter="confirmCreateCheckpoint"
              />
            </div>
            <div class="form-group">
              <label>Description (optional)</label>
              <textarea
                v-model="newCheckpoint.description"
                placeholder="Enter description..."
                class="form-input"
                rows="3"
              />
            </div>
            <div class="form-group">
              <label>Tags (optional)</label>
              <input
                v-model="newTagInput"
                @keyup.enter="addTag"
                placeholder="Press enter to add tags..."
                class="form-input"
              />
              <div class="tags" v-if="newCheckpoint.tags.length > 0">
                <span v-for="(tag, index) in newCheckpoint.tags" :key="index" class="tag">
                  {{ tag }}
                  <Icon name="mdi:close" @click="removeTag(index)" />
                </span>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button @click="closeCreateDialog" class="btn btn-secondary">
              Cancel
            </button>
            <button 
              @click="confirmCreateCheckpoint" 
              class="btn btn-primary"
              :disabled="!newCheckpoint.name.trim() || store.isCreating"
            >
              {{ store.isCreating ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Settings dialog -->
    <teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Checkpoint Settings</h3>
            <button @click="showSettings = false" class="close-button">
              <Icon name="mdi:close" />
            </button>
          </div>
          <div class="modal-content">
            <div class="form-group">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="store.autoCheckpointEnabled"
                  @change="updateAutoCheckpoint"
                />
                Enable automatic checkpoints
              </label>
            </div>

            <div class="form-group" v-if="store.autoCheckpointEnabled">
              <label>Auto-checkpoint interval</label>
              <select v-model="store.autoCheckpointInterval" @change="updateAutoCheckpoint" class="form-input">
                <option :value="60000">1 minute</option>
                <option :value="300000">5 minutes</option>
                <option :value="600000">10 minutes</option>
                <option :value="1800000">30 minutes</option>
                <option :value="3600000">1 hour</option>
              </select>
            </div>

            <div class="form-group">
              <label>Maximum checkpoints</label>
              <input 
                type="number" 
                v-model.number="store.maxCheckpoints" 
                min="10" 
                max="100"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <button @click="cleanOldCheckpoints" class="btn btn-secondary full-width">
                <Icon name="mdi:broom" />
                Clean Old Checkpoints
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <button @click="showSettings = false" class="btn btn-primary">
              Done
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Diff viewer -->
    <CheckpointDiff 
      v-if="diffCheckpoint"
      :checkpoint="diffCheckpoint"
      @close="diffCheckpoint = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { useCheckpointV2Store } from '~/stores/checkpoint-v2';
import type { CheckpointV2 } from '~/stores/checkpoint-v2';
import CheckpointDiff from './CheckpointDiff.vue';
import Icon from '~/components/Icon.vue';

const store = useCheckpointV2Store();

// State
const selectedCheckpoint = ref<CheckpointV2 | null>(null);
const selectedTrigger = ref<string>('all');
const showCreateDialog = ref(false);
const showSettings = ref(false);
const diffCheckpoint = ref<CheckpointV2 | null>(null);
const nameInput = ref<HTMLInputElement>();
const timelineContainer = ref<HTMLElement>();

const newCheckpoint = ref({
  name: '',
  description: '',
  tags: [] as string[]
});
const newTagInput = ref('');

// Trigger types
const triggerTypes = [
  { id: 'all', label: 'All', icon: 'mdi:all-inclusive' },
  { id: 'manual', label: 'Manual', icon: 'mdi:hand-pointing-up' },
  { id: 'auto-time', label: 'Timer', icon: 'mdi:timer' },
  { id: 'auto-git', label: 'Git', icon: 'mdi:git' },
  { id: 'auto-risky', label: 'Risky', icon: 'mdi:alert' },
  { id: 'auto-error', label: 'Error', icon: 'mdi:bug' }
];

// Computed
const filteredCheckpoints = computed(() => {
  if (selectedTrigger.value === 'all') {
    return store.sortedCheckpoints;
  }
  return store.sortedCheckpoints.filter(cp => cp.trigger === selectedTrigger.value);
});

// Methods
function getCountByTrigger(trigger: string): number {
  if (trigger === 'all') return store.checkpoints.length;
  return store.checkpointsByTrigger[trigger]?.length || 0;
}

function getTriggerIcon(trigger: string): string {
  const type = triggerTypes.find(t => t.id === trigger);
  return type?.icon || 'mdi:help-circle';
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatInterval(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function selectCheckpoint(checkpoint: CheckpointV2) {
  selectedCheckpoint.value = checkpoint;
}

function createManualCheckpoint() {
  showCreateDialog.value = true;
  newCheckpoint.value = {
    name: `Manual checkpoint ${new Date().toLocaleTimeString()}`,
    description: '',
    tags: []
  };
  nextTick(() => {
    nameInput.value?.focus();
    nameInput.value?.select();
  });
}

async function cleanupCorrupted() {
  if (!confirm('This will remove any corrupted checkpoints. Continue?')) {
    return;
  }
  
  const cleanedCount = await store.cleanupCorruptedCheckpoints();
  
  if (cleanedCount > 0) {
    alert(`Removed ${cleanedCount} corrupted checkpoint(s).`);
  } else {
    alert('No corrupted checkpoints found.');
  }
}

function closeCreateDialog() {
  showCreateDialog.value = false;
  newCheckpoint.value = {
    name: '',
    description: '',
    tags: []
  };
  newTagInput.value = '';
}

async function confirmCreateCheckpoint() {
  if (!newCheckpoint.value.name.trim() || store.isCreating) return;
  
  await store.createCheckpoint(
    newCheckpoint.value.name,
    'manual',
    newCheckpoint.value.description,
    newCheckpoint.value.tags
  );
  
  closeCreateDialog();
}

function addTag() {
  const tag = newTagInput.value.trim();
  if (tag && !newCheckpoint.value.tags.includes(tag)) {
    newCheckpoint.value.tags.push(tag);
    newTagInput.value = '';
  }
}

function removeTag(index: number) {
  newCheckpoint.value.tags.splice(index, 1);
}

async function restoreCheckpoint(checkpoint: CheckpointV2) {
  if (confirm(`Restore checkpoint "${checkpoint.name}"?\n\nThis will create a backup of the current state first.`)) {
    const success = await store.restoreCheckpoint(checkpoint.id);
    if (success) {
      // Show success message
      
    }
  }
}

function showDiff(checkpoint: CheckpointV2) {
  diffCheckpoint.value = checkpoint;
}

async function exportCheckpoint(checkpoint: CheckpointV2) {
  // Use electron dialog to select save location
  const result = await window.electronAPI.dialog.showSaveDialog({
    title: 'Export Checkpoint',
    defaultPath: `checkpoint-${checkpoint.id}.tar.gz`,
    filters: [
      { name: 'Checkpoint Archive', extensions: ['tar.gz'] }
    ]
  });
  
  if (!result.canceled && result.filePath) {
    await window.electronAPI.checkpoint.export(checkpoint.id, result.filePath);
  }
}

async function deleteCheckpoint(checkpoint: CheckpointV2) {
  if (confirm(`Delete checkpoint "${checkpoint.name}"?\n\nThis action cannot be undone.`)) {
    await store.deleteCheckpoint(checkpoint.id);
  }
}

function updateAutoCheckpoint() {
  if (store.autoCheckpointEnabled) {
    store.startAutoCheckpoint();
  } else {
    store.stopAutoCheckpoint();
  }
}

async function cleanOldCheckpoints() {
  const options = {
    maxAge: 30, // days
    maxCount: store.maxCheckpoints
  };
  
  if (confirm(`Clean checkpoints older than ${options.maxAge} days and keep only the latest ${options.maxCount}?`)) {
    const result = await window.electronAPI.checkpoint.clean(options);
    if (result.success) {
      
    }
  }
}
</script>

<style scoped>
.checkpoint-timeline {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  color: var(--color-text);
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
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

.header-actions {
  display: flex;
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
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.primary-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-button {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.icon-button:hover {
  background: var(--color-background-mute);
  color: var(--color-text);
}

.stats-bar {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: var(--color-background-mute);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
}

.stats-bar .stat {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
}

.filter-tabs {
  display: flex;
  padding: 0 16px;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.filter-tab {
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
  white-space: nowrap;
}

.filter-tab:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}

.filter-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.filter-tab .count {
  background: var(--color-background-mute);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  min-width: 20px;
  text-align: center;
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--color-text-secondary);
}

.empty-state .icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state span {
  font-size: 13px;
  opacity: 0.7;
}

.timeline {
  position: relative;
  padding-left: 40px;
}

.timeline-item {
  position: relative;
  margin-bottom: 24px;
}

.timeline-line {
  position: absolute;
  left: -25px;
  top: 30px;
  width: 2px;
  height: calc(100% + 24px);
  background: var(--color-border);
}

.timeline-dot {
  position: absolute;
  left: -32px;
  top: 8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-dot .icon {
  font-size: 10px;
}

.timeline-dot.trigger-manual {
  border-color: var(--color-primary);
}

.timeline-dot.trigger-auto-time {
  border-color: var(--color-info);
}

.timeline-dot.trigger-auto-git {
  border-color: var(--color-success);
}

.timeline-dot.trigger-auto-risky {
  border-color: var(--color-warning);
}

.timeline-dot.trigger-auto-error {
  border-color: var(--color-error);
}

.checkpoint-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.checkpoint-card:hover {
  border-color: var(--color-border-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.timeline-item.selected .checkpoint-card {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.card-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.card-header .time {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.card-description {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  line-height: 1.5;
}

.card-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
}

.card-stats .stat {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.tag {
  background: var(--color-background-mute);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag .icon {
  font-size: 12px;
  cursor: pointer;
}

.tag .icon:hover {
  color: var(--color-text);
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.action-button {
  background: var(--color-background-mute);
  color: var(--color-text-secondary);
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.action-button:hover {
  background: var(--color-background-soft);
  color: var(--color-text);
}

.action-button.primary {
  background: var(--color-primary);
  color: white;
}

.action-button.primary:hover {
  background: var(--color-primary-hover);
}

.action-button.danger:hover {
  background: var(--color-error);
  color: white;
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
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  width: 500px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #cccccc;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
}

.modal-content {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #cccccc;
  font-size: 14px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #3e3e42;
  color: #cccccc;
  border: 1px solid #454545;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
  font-family: inherit;
}

.form-input:focus {
  outline: none;
  border-color: #007acc;
  background: #1e1e1e;
}

textarea.form-input {
  resize: vertical;
  min-height: 60px;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin: 0;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #3e3e42;
}

.btn {
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1a8cff;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #3e3e42;
  color: #cccccc;
}

.btn-secondary:hover {
  background: #4e4e52;
}

.btn.full-width {
  width: 100%;
  justify-content: center;
}


/* Dark theme color variables */
:root {
  --color-primary-rgb: 66, 184, 221;
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
  --color-info: #3794ff;
  --color-success: #73c991;
  --color-warning: #e2c08d;
  --color-error: #f14c4c;
}
</style>