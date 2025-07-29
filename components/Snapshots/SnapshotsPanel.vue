<template>
  <div class="snapshots-panel">
    <!-- Header -->
    <div class="panel-header">
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
    </div>

    <!-- Snapshots timeline -->
    <div class="timeline-container" v-if="!isLoading">
      <div v-if="snapshots.length === 0" class="empty-state">
        <Icon name="mdi:camera-off" />
        <p>No snapshots found</p>
        <span>Snapshots will appear here as you create them</span>
      </div>

      <div v-else class="timeline">
        <div 
          v-for="(snapshot, index) in snapshots" 
          :key="snapshot.id"
          class="timeline-item"
        >
          <!-- Timeline line -->
          <div class="timeline-line" v-if="index < snapshots.length - 1"></div>
          
          <!-- Timeline dot -->
          <div class="timeline-dot" :class="`trigger-${snapshot.type || 'manual'}`">
            <Icon :name="getSnapshotIcon(snapshot)" />
          </div>

          <!-- Snapshot card -->
          <EnhancedSnapshotItem
            :snapshot="snapshot"
            @restore="restoreSnapshot(snapshot)"
            @delete="deleteSnapshot(snapshot)"
            @view-changes="viewSnapshotChanges(snapshot)"
            @selective-restore="showSelectiveRestore(snapshot)"
            @cherry-pick="showCherryPick(snapshot)"
          />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSnapshotsStore } from '~/stores/snapshots';
import { useSourceControlStore } from '~/stores/source-control';
import { useDialogs } from '~/composables/useDialogs';
import EnhancedSnapshotItem from '../SourceControlV2/EnhancedSnapshotItem.vue';
import SelectiveRestoreModal from './SelectiveRestoreModal.vue';
import CherryPickModal from './CherryPickModal.vue';
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

// Computed
const snapshots = computed(() => snapshotsStore.recentSnapshots);
const isLoading = computed(() => snapshotsStore.isLoading);
const currentBranch = computed(() => sourceControl.currentBranch);

// Methods
function getSnapshotIcon(snapshot: any): string {
  if (snapshot.type === 'auto-branch') return 'mdi:source-branch';
  if (snapshot.type === 'manual') return 'mdi:hand-pointing-up';
  return 'mdi:camera';
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
  const confirmed = await dialogs.confirm(`Restore snapshot "${snapshot.message}"?`, 'Restore Snapshot');
  if (confirmed) {
    await snapshotsStore.restoreSnapshot(snapshot.id);
  }
}

async function deleteSnapshot(snapshot: any) {
  const confirmed = await dialogs.confirm(`Delete snapshot "${snapshot.name}"?`, 'Delete Snapshot');
  if (confirmed) {
    await snapshotsStore.deleteSnapshot(snapshot.id);
  }
}

async function viewSnapshotChanges(snapshot: any) {
  // This is handled by the EnhancedSnapshotItem component
  console.log('View changes for snapshot:', snapshot);
}

function showSelectiveRestore(snapshot: any) {
  selectedSnapshotForRestore.value = snapshot;
  showSelectiveRestoreModal.value = true;
}

async function handleSelectiveRestoreComplete() {
  // Refresh after selective restore
  await refresh();
}

function showCherryPick(snapshot: any) {
  selectedSnapshotForCherryPick.value = snapshot;
  showCherryPickModal.value = true;
}

async function handleCherryPickComplete() {
  // Refresh after cherry-pick
  await refresh();
}

// Watch for branch changes
watch(() => sourceControl.currentBranch, async (newBranch, oldBranch) => {
  if (newBranch && newBranch !== oldBranch) {
    // Reload snapshots for the new branch
    await snapshotsStore.loadSnapshots(false);
  }
});

// Initialize
onMounted(async () => {
  await refresh();
});
</script>

<style scoped>
.snapshots-panel {
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

.empty-state svg {
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

.timeline-dot svg {
  font-size: 10px;
}

.timeline-dot.trigger-manual {
  border-color: var(--color-primary);
}

.timeline-dot.trigger-auto-branch {
  border-color: var(--color-success);
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--color-text-secondary);
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

/* Dark theme color variables */
:root {
  --color-primary-hover: #4a9eff;
  --color-success: #73c991;
}
</style>