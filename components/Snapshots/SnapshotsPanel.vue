<template>
  <div class="snapshots-timeline">
    <!-- Header -->
    <div class="timeline-header">
      <div class="header-title">
        <Icon name="mdi:camera" class="header-icon" />
        <h3>Snapshots Timeline</h3>
      </div>
      <div class="header-actions">
        <button 
          @click="createSnapshot" 
          :disabled="isCreating"
          class="primary-button"
          title="Create snapshot"
        >
          <Icon name="mdi:plus" />
          Create Snapshot
        </button>
        <button 
          @click="showSettings = true"
          class="icon-button"
          title="Snapshot settings"
        >
          <Icon name="mdi:cog" />
        </button>
        <button 
          @click="refresh"
          :disabled="isLoading"
          class="icon-button"
          title="Refresh"
        >
          <Icon name="mdi:refresh" :class="{ 'animate-spin': isLoading }" />
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stat">
        <Icon name="mdi:camera" />
        <span>{{ snapshots.length }} snapshots</span>
      </div>
      <div class="stat" v-if="currentBranch">
        <Icon name="mdi:source-branch" />
        <span>{{ currentBranch }}</span>
      </div>
      <div class="stat">
        <Icon name="mdi:database" />
        <span>{{ formatTotalSize() }}</span>
      </div>
    </div>

    <!-- Timeline container -->
    <div class="timeline-container" v-if="!isLoading">
      <div v-if="snapshots.length === 0" class="empty-state">
        <Icon name="mdi:camera-off" class="empty-icon" />
        <p>No snapshots found</p>
        <span>Snapshots will appear here as you create them</span>
      </div>

      <div v-else class="timeline">
        <div 
          v-for="(snapshot, index) in snapshots" 
          :key="snapshot.id"
          class="timeline-item"
          :class="{ 'is-expanded': expandedSnapshots.has(snapshot.id) }"
        >
          <!-- Timeline line -->
          <div class="timeline-line" v-if="index < snapshots.length - 1"></div>
          
          <!-- Timeline dot -->
          <div class="timeline-dot" :class="`type-${snapshot.type || snapshot.createdBy || 'manual'}`">
            <Icon :name="getSnapshotIcon(snapshot)" />
          </div>

          <!-- Snapshot card -->
          <div class="snapshot-card" @click="toggleExpand(snapshot)">
            <div class="card-header">
              <h4>{{ snapshot.message || snapshot.name }}</h4>
              <span class="time">{{ formatTime(snapshot.timestamp) }}</span>
            </div>

            <div v-if="snapshot.description" class="card-description">
              {{ snapshot.description }}
            </div>

            <div class="card-stats">
              <span class="stat" v-if="snapshot.openFiles?.length">
                <Icon name="mdi:file-document-multiple" />
                {{ snapshot.openFiles.length }} open files
              </span>
              <span class="stat">
                <Icon name="mdi:database" />
                {{ formatSize(snapshot.sizeKb) }}
              </span>
            </div>

            <!-- Change indicators for enhanced snapshots -->
            <div v-if="snapshot.fileChanges" class="card-changes">
              <span v-if="getAddedCount(snapshot) > 0" class="change-badge added">
                +{{ getAddedCount(snapshot) }} added
              </span>
              <span v-if="getModifiedCount(snapshot) > 0" class="change-badge modified">
                ~{{ getModifiedCount(snapshot) }} modified
              </span>
              <span v-if="getRemovedCount(snapshot) > 0" class="change-badge removed">
                -{{ getRemovedCount(snapshot) }} removed
              </span>
            </div>

            <div class="card-actions" @click.stop>
              <button 
                @click="restoreSnapshot(snapshot)"
                class="action-button primary"
                title="Restore this snapshot"
              >
                <Icon name="mdi:restore" />
                Restore
              </button>
              <button 
                v-if="snapshot.fileChanges && hasFileChanges(snapshot)"
                @click="showSelectiveRestore(snapshot)"
                class="action-button"
                title="Selective restore"
              >
                <Icon name="mdi:file-check" />
                Selective
              </button>
              <button 
                v-if="snapshot.fileChanges && hasApplicableChanges(snapshot)"
                @click="showCherryPick(snapshot)"
                class="action-button"
                title="Cherry-pick changes"
              >
                <Icon name="mdi:fruit-cherries" />
              </button>
              <button 
                @click="deleteSnapshot(snapshot)"
                class="action-button danger"
                title="Delete snapshot"
              >
                <Icon name="mdi:delete" />
              </button>
              
              <!-- Expand indicator moved to actions row -->
              <div v-if="snapshot.fileChanges" class="expand-indicator-inline">
                <Icon 
                  :name="expandedSnapshots.has(snapshot.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
                  class="expand-icon"
                />
              </div>
            </div>
          </div>

          <!-- Expanded file changes -->
          <div v-if="expandedSnapshots.has(snapshot.id) && snapshot.fileChanges" class="snapshot-expanded">
            <SnapshotFileChanges :snapshot="snapshot" />
          </div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading snapshots...</p>
    </div>

    <!-- Selective Restore Modal -->
    <SelectiveRestoreModal
      v-model="showSelectiveRestoreModal"
      :snapshot="selectedSnapshotForRestore"
      @restore-complete="handleSelectiveRestoreComplete"
    />

    <!-- Cherry Pick Modal -->
    <CherryPickModal
      v-model="showCherryPickModal"
      :source-snapshot="selectedSnapshotForCherryPick"
      @cherry-pick-complete="handleCherryPickComplete"
    />

    <!-- Settings Modal -->
    <teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Snapshot Settings</h3>
            <button @click="showSettings = false" class="close-button">
              <Icon name="mdi:close" />
            </button>
          </div>
          <div class="modal-content">
            <div class="form-group">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="snapshotsStore.config.enableAutoSnapshots"
                  @change="updateAutoSnapshots"
                />
                Enable automatic snapshots
              </label>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="snapshotsStore.config.enableClaudePromptSnapshots"
                  @change="updateClaudePromptSnapshots"
                />
                Auto-snapshot when sending prompts to Claude
              </label>
            </div>

            <div class="form-group" v-if="snapshotsStore.config.enableAutoSnapshots">
              <label>Auto-snapshot interval</label>
              <select v-model="snapshotsStore.config.autoSnapshotInterval" @change="updateAutoSnapshots" class="form-input">
                <option :value="60000">1 minute</option>
                <option :value="300000">5 minutes</option>
                <option :value="600000">10 minutes</option>
                <option :value="900000">15 minutes</option>
                <option :value="1800000">30 minutes</option>
                <option :value="3600000">1 hour</option>
              </select>
            </div>

            <div class="form-group">
              <label>Maximum snapshots to keep</label>
              <input 
                type="number" 
                v-model.number="snapshotsStore.config.maxSnapshots" 
                min="10" 
                max="1000"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label>Maximum storage size (MB)</label>
              <input 
                type="number" 
                v-model.number="snapshotsStore.config.maxSizeMb" 
                min="50" 
                max="5000"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label>Auto-cleanup after days</label>
              <input 
                type="number" 
                v-model.number="snapshotsStore.config.autoCleanupDays" 
                min="7" 
                max="365"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <button @click="cleanOldSnapshots" class="btn btn-secondary full-width">
                <Icon name="mdi:broom" />
                Clean Old Snapshots
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSnapshotsStore } from '~/stores/snapshots';
import { useSourceControlStore } from '~/stores/source-control';
import { useDialogs } from '~/composables/useDialogs';
import SelectiveRestoreModal from './SelectiveRestoreModal.vue';
import CherryPickModal from './CherryPickModal.vue';
import SnapshotFileChanges from './SnapshotFileChanges.vue';
import Icon from '~/components/Icon.vue';

const snapshotsStore = useSnapshotsStore();
const sourceControl = useSourceControlStore();
const dialogs = useDialogs();

// State
const isCreating = ref(false);
const showSelectiveRestoreModal = ref(false);
const selectedSnapshotForRestore = ref(null);
const showCherryPickModal = ref(false);
const selectedSnapshotForCherryPick = ref(null);
const expandedSnapshots = ref(new Set<string>());
const showSettings = ref(false);

// Computed
const snapshots = computed(() => snapshotsStore.recentSnapshots);
const isLoading = computed(() => snapshotsStore.isLoading);
const currentBranch = computed(() => sourceControl.currentBranch);

// Methods
function getSnapshotIcon(snapshot: any): string {
  const type = snapshot.type || snapshot.createdBy || 'manual';
  const icons = {
    'manual': 'mdi:hand-pointing-up',
    'auto-timer': 'mdi:timer',
    'auto-branch': 'mdi:source-branch',
    'auto-event': 'mdi:lightning-bolt',
    'auto-checkpoint': 'mdi:flag-checkered'
  };
  return icons[type] || 'mdi:camera';
}

function toggleExpand(snapshot: any) {
  if (!snapshot.fileChanges) return;
  
  if (expandedSnapshots.value.has(snapshot.id)) {
    expandedSnapshots.value.delete(snapshot.id);
  } else {
    expandedSnapshots.value.add(snapshot.id);
  }
  // Force reactivity
  expandedSnapshots.value = new Set(expandedSnapshots.value);
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function formatSize(sizeKb: number): string {
  if (sizeKb < 1024) return `${sizeKb.toFixed(1)} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

function formatTotalSize(): string {
  const totalKb = snapshots.value.reduce((sum, s) => sum + (s.sizeKb || 0), 0);
  return formatSize(totalKb);
}

function getAddedCount(snapshot: any): number {
  return snapshot.fileChanges?.added?.length || 0;
}

function getModifiedCount(snapshot: any): number {
  if (!snapshot.fileChanges?.modified) return 0;
  // Filter out unchanged files
  return snapshot.fileChanges.modified.filter((f: any) => f.status !== 'unchanged').length;
}

function getRemovedCount(snapshot: any): number {
  return snapshot.fileChanges?.removed?.length || 0;
}

function hasFileChanges(snapshot: any): boolean {
  return getAddedCount(snapshot) > 0 || getModifiedCount(snapshot) > 0 || getRemovedCount(snapshot) > 0;
}

function hasApplicableChanges(snapshot: any): boolean {
  // Cherry-pick only works with added and modified files
  return getAddedCount(snapshot) > 0 || getModifiedCount(snapshot) > 0;
}

async function createSnapshot() {
  const message = await dialogs.prompt({
    title: 'Create Snapshot',
    message: 'Enter a description for this snapshot:',
    placeholder: 'Snapshot description'
  });
  if (message) {
    isCreating.value = true;
    try {
      await snapshotsStore.captureSnapshot(message, 'manual');
    } finally {
      isCreating.value = false;
    }
  }
}

async function refresh() {
  await snapshotsStore.loadSnapshots(false);
}

async function restoreSnapshot(snapshot: any) {
  const confirmed = await dialogs.confirm(`Restore snapshot "${snapshot.message || snapshot.name}"?`, 'Restore Snapshot');
  if (confirmed) {
    await snapshotsStore.restoreSnapshot(snapshot.id);
  }
}

async function deleteSnapshot(snapshot: any) {
  const confirmed = await dialogs.confirm(`Delete snapshot "${snapshot.message || snapshot.name}"?`, 'Delete Snapshot');
  if (confirmed) {
    await snapshotsStore.deleteSnapshot(snapshot.id);
  }
}


function showSelectiveRestore(snapshot: any) {
  selectedSnapshotForRestore.value = snapshot;
  showSelectiveRestoreModal.value = true;
}

async function handleSelectiveRestoreComplete() {
  await refresh();
}

function showCherryPick(snapshot: any) {
  selectedSnapshotForCherryPick.value = snapshot;
  showCherryPickModal.value = true;
}

async function handleCherryPickComplete() {
  await refresh();
}

function updateAutoSnapshots() {
  if (snapshotsStore.config.enableAutoSnapshots) {
    snapshotsStore.startAutoSnapshots();
  } else {
    snapshotsStore.stopAutoSnapshots();
  }
}

function updateClaudePromptSnapshots() {
  if (snapshotsStore.config.enableClaudePromptSnapshots) {
    snapshotsStore.startClaudePromptTracking();
  } else {
    snapshotsStore.stopClaudePromptTracking();
  }
}

async function cleanOldSnapshots() {
  const confirmed = await dialogs.confirm(
    `This will remove snapshots older than ${snapshotsStore.config.autoCleanupDays} days. Continue?`,
    'Clean Old Snapshots'
  );
  
  if (confirmed) {
    await snapshotsStore.cleanupSnapshots();
    await refresh();
  }
}

// Watch for branch changes
watch(() => sourceControl.currentBranch, async (newBranch, oldBranch) => {
  if (newBranch && newBranch !== oldBranch) {
    await snapshotsStore.loadSnapshots(false);
  }
});

// Initialize
onMounted(async () => {
  // Load saved config first
  await snapshotsStore.loadConfig();
  
  await refresh();
  
  // Start auto-snapshots if enabled
  if (snapshotsStore.config.enableAutoSnapshots) {
    snapshotsStore.startAutoSnapshots();
  }
  
  // Start Claude prompt tracking if enabled
  if (snapshotsStore.config.enableClaudePromptSnapshots) {
    snapshotsStore.startClaudePromptTracking();
  }
});
</script>

<style scoped>
.snapshots-timeline {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #3e3e42;
  background: #252526;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 20px;
  color: #42b883;
}

.header-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #cccccc;
}

.header-actions {
  display: flex;
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
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.primary-button:hover:not(:disabled) {
  background: #1a8cff;
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
  color: #8b8b8b;
  transition: all 0.2s;
}

.icon-button:hover {
  background: #2a2d2e;
  color: #cccccc;
}

.stats-bar {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: #2a2d2e;
  border-bottom: 1px solid #3e3e42;
  font-size: 13px;
}

.stats-bar .stat {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8b8b8b;
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #1e1e1e;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: #8b8b8b;
}

.empty-icon {
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

.timeline-item.is-expanded {
  margin-bottom: 16px;
}

.timeline-line {
  position: absolute;
  left: -25px;
  top: 30px;
  width: 2px;
  height: calc(100% + 24px);
  background: #3e3e42;
}

.timeline-dot {
  position: absolute;
  left: -32px;
  top: 8px;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: #1e1e1e;
  border: 2px solid #3e3e42;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-dot svg {
  font-size: 10px;
  color: #cccccc;
}

.timeline-dot.type-manual {
  border-color: #569cd6;
}

.timeline-dot.type-auto-timer {
  border-color: #3794ff;
}

.timeline-dot.type-auto-branch {
  border-color: #73c991;
}

.timeline-dot.type-auto-event {
  border-color: #e2c08d;
}

.timeline-dot.type-auto-checkpoint {
  border-color: #f14c4c;
}

.snapshot-card {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
  cursor: pointer;
  position: relative;
}

.snapshot-card:hover {
  border-color: #484848;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.timeline-item.is-expanded .snapshot-card {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom: none;
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
  color: #cccccc;
}

.card-header .time {
  font-size: 12px;
  color: #8b8b8b;
}

.card-description {
  font-size: 13px;
  color: #8b8b8b;
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
  color: #8b8b8b;
}

.card-changes {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.change-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.change-badge.added {
  background: rgba(46, 160, 67, 0.2);
  color: #7ee787;
}

.change-badge.modified {
  background: rgba(255, 193, 7, 0.2);
  color: #f0d852;
}

.change-badge.removed {
  background: rgba(248, 81, 73, 0.2);
  color: #ffa198;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #3e3e42;
}

.action-button {
  background: #2a2d2e;
  color: #8b8b8b;
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
  background: #3e3e42;
  color: #cccccc;
}

.action-button.primary {
  background: #007acc;
  color: white;
}

.action-button.primary:hover {
  background: #1a8cff;
}

.action-button.danger:hover {
  background: #f14c4c;
  color: white;
}

.expand-indicator-inline {
  margin-left: auto;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.expand-icon {
  width: 16px;
  height: 16px;
  color: #8b8b8b;
  transition: transform 0.2s;
  cursor: pointer;
}

.expand-icon:hover {
  color: #cccccc;
}

.snapshot-expanded {
  border: 1px solid #3e3e42;
  border-top: none;
  border-radius: 0 0 8px 8px;
  background: #252526;
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 8px;
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: #8b8b8b;
}

.loading-state svg {
  width: 32px;
  height: 32px;
}

/* Animations */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Scrollbar styling */
.timeline-container::-webkit-scrollbar {
  width: 8px;
}

.timeline-container::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.timeline-container::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

.timeline-container::-webkit-scrollbar-thumb:hover {
  background: #4e4e4e;
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

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin: 0;
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

.btn-primary:hover {
  background: #1a8cff;
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
</style>