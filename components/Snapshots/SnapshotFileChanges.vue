<template>
  <div class="snapshot-file-changes">
    <div class="changes-summary" v-if="fileChanges">
      <div class="summary-stats">
        <div class="stat-item">
          <Icon name="mdi:file-plus" class="stat-icon added" />
          <span class="stat-count">{{ addedCount }}</span>
          <span class="stat-label">added</span>
        </div>
        <div class="stat-item">
          <Icon name="mdi:file-edit" class="stat-icon modified" />
          <span class="stat-count">{{ modifiedCount }}</span>
          <span class="stat-label">modified</span>
        </div>
        <div class="stat-item">
          <Icon name="mdi:file-minus" class="stat-icon removed" />
          <span class="stat-count">{{ removedCount }}</span>
          <span class="stat-label">removed</span>
        </div>
      </div>
      
      <div class="summary-details" v-if="fileChanges.summary">
        <div class="detail-item">
          <span class="detail-value">+{{ fileChanges.summary.linesAdded }}</span>
          <span class="detail-label">lines</span>
        </div>
        <div class="detail-item">
          <span class="detail-value">-{{ fileChanges.summary.linesRemoved }}</span>
          <span class="detail-label">lines</span>
        </div>
        <div class="detail-item">
          <span class="detail-value">{{ formatBytes(fileChanges.summary.bytesChanged) }}</span>
          <span class="detail-label">changed</span>
        </div>
      </div>
    </div>

    <!-- File change sections -->
    <div class="file-change-sections" v-if="fileChanges">
      <!-- Added files -->
      <div class="change-section" v-if="fileChanges.added.length > 0">
        <div class="section-header" @click="toggleSection('added')">
          <Icon 
            :name="expandedSections.added ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
            class="expand-icon"
          />
          <Icon name="mdi:file-plus" class="section-icon added" />
          <span class="section-title">Added Files</span>
          <span class="file-count">{{ fileChanges.added.length }}</span>
        </div>
        <div v-show="expandedSections.added" class="file-list">
          <FileChangeItem
            v-for="file in fileChanges.added"
            :key="file.path"
            :file="file"
            @view-diff="showFileDiff"
            @view-content="showFileContent"
          />
        </div>
      </div>

      <!-- Modified files -->
      <div class="change-section" v-if="actuallyModifiedFiles.length > 0">
        <div class="section-header" @click="toggleSection('modified')">
          <Icon 
            :name="expandedSections.modified ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
            class="expand-icon"
          />
          <Icon name="mdi:file-edit" class="section-icon modified" />
          <span class="section-title">Modified Files</span>
          <span class="file-count">{{ actuallyModifiedFiles.length }}</span>
        </div>
        <div v-show="expandedSections.modified" class="file-list">
          <FileChangeItem
            v-for="file in actuallyModifiedFiles"
            :key="file.path"
            :file="file"
            @view-diff="showFileDiff"
            @view-content="showFileContent"
          />
        </div>
      </div>

      <!-- Removed files -->
      <div class="change-section" v-if="fileChanges.removed.length > 0">
        <div class="section-header" @click="toggleSection('removed')">
          <Icon 
            :name="expandedSections.removed ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
            class="expand-icon"
          />
          <Icon name="mdi:file-minus" class="section-icon removed" />
          <span class="section-title">Removed Files</span>
          <span class="file-count">{{ fileChanges.removed.length }}</span>
        </div>
        <div v-show="expandedSections.removed" class="file-list">
          <FileChangeItem
            v-for="file in fileChanges.removed"
            :key="file.path"
            :file="file"
            @view-content="showFileContent"
          />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="no-changes">
      <Icon name="mdi:file-check" class="no-changes-icon" />
      <p>No file changes in this snapshot</p>
      <p class="no-changes-subtitle">This snapshot only contains IDE state</p>
    </div>

    <!-- File diff viewer modal -->
    <SnapshotFileDiffViewer
      v-model="showDiffViewer"
      :file="selectedFile"
      :snapshot="snapshot"
    />

    <!-- File content viewer modal -->
    <SnapshotFileContentViewer
      v-model="showContentViewer"
      :file="selectedFile"
      :snapshot="snapshot"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ClaudeSnapshot, FileChange } from '~/types/snapshot';
import FileChangeItem from './FileChangeItem.vue';
import SnapshotFileDiffViewer from './SnapshotFileDiffViewer.vue';
import SnapshotFileContentViewer from './SnapshotFileContentViewer.vue';

interface Props {
  snapshot: ClaudeSnapshot;
}

const props = defineProps<Props>();

// State
const expandedSections = ref({
  added: true,
  modified: true,
  removed: false
});

const showDiffViewer = ref(false);
const showContentViewer = ref(false);
const selectedFile = ref<FileChange | null>(null);

// Computed
const fileChanges = computed(() => props.snapshot.fileChanges);

const actuallyModifiedFiles = computed(() => {
  if (!fileChanges.value) return [];
  return fileChanges.value.modified.filter(f => f.status !== 'unchanged');
});

const addedCount = computed(() => fileChanges.value?.added.length || 0);
const modifiedCount = computed(() => actuallyModifiedFiles.value.length);
const removedCount = computed(() => fileChanges.value?.removed.length || 0);

// Methods
function toggleSection(section: string) {
  expandedSections.value[section] = !expandedSections.value[section];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showFileDiff(file: FileChange) {
  selectedFile.value = file;
  showDiffViewer.value = true;
}

function showFileContent(file: FileChange) {
  selectedFile.value = file;
  showContentViewer.value = true;
}
</script>

<style scoped>
.snapshot-file-changes {
  padding: 16px;
  background: #1e1e1e;
  color: #cccccc;
  font-size: 13px;
}

/* Summary */
.changes-summary {
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  margin-bottom: 16px;
  border: 1px solid #3e3e42;
}

.summary-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  width: 16px;
  height: 16px;
}

.stat-icon.added {
  color: #28a745;
}

.stat-icon.modified {
  color: #ffc107;
}

.stat-icon.removed {
  color: #dc3545;
}

.stat-count {
  font-weight: 600;
  color: white;
}

.stat-label {
  font-size: 12px;
  color: #8b8b8b;
}

.summary-details {
  display: flex;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid #3e3e42;
  font-size: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.detail-value {
  font-weight: 600;
  color: white;
}

.detail-label {
  color: #8b8b8b;
}

/* Change sections */
.change-section {
  border-bottom: 1px solid #2d2d30;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.section-header:hover {
  background: #2a2d2e;
}

.expand-icon {
  width: 16px;
  height: 16px;
  margin-right: 4px;
}

.section-icon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.section-icon.added {
  color: #28a745;
}

.section-icon.modified {
  color: #ffc107;
}

.section-icon.removed {
  color: #dc3545;
}

.section-title {
  flex: 1;
  font-weight: 500;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.file-count {
  font-size: 11px;
  color: #8b8b8b;
  background: #3e3e42;
  padding: 2px 6px;
  border-radius: 10px;
}

.file-list {
  padding: 0;
}

/* Empty state */
.no-changes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: #8b8b8b;
}

.no-changes-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}

.no-changes-subtitle {
  font-size: 12px;
  margin-top: 4px;
  color: #6b6b6b;
}
</style>