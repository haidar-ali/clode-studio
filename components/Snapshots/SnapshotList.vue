<template>
  <div class="snapshot-list">
    <div class="list-header">
      <h3>Snapshots</h3>
      <div class="header-actions">
        <span class="storage-info">
          {{ snapshots.length }} snapshots ({{ totalSizeMb.toFixed(1) }}MB)
        </span>
        <button @click="$emit('close')" class="close-btn">
          <Icon name="x" />
        </button>
      </div>
    </div>
    
    <div class="list-filters">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search snapshots..."
        class="search-input"
      />
      <select v-model="filterBy" class="filter-select">
        <option value="all">All Snapshots</option>
        <option value="manual">Manual</option>
        <option value="auto-branch">Auto (Branch)</option>
        <option value="auto-timer">Auto (Timer)</option>
        <option value="auto-event">Auto (Event)</option>
      </select>
    </div>
    
    <div class="snapshots-container">
      <TransitionGroup name="list" tag="div" class="snapshot-grid">
        <div
          v-for="snapshot in filteredSnapshots"
          :key="snapshot.id"
          class="snapshot-card"
          :class="{ selected: selectedSnapshotId === snapshot.id }"
          @click="selectSnapshot(snapshot.id)"
        >
          <div class="card-header">
            <h4>{{ snapshot.name }}</h4>
            <div class="card-actions">
              <button
                @click.stop="restoreSnapshot(snapshot.id)"
                class="action-btn restore"
                title="Restore this snapshot"
              >
                <Icon name="refresh-cw" />
              </button>
              <button
                @click.stop="deleteSnapshot(snapshot.id)"
                class="action-btn delete"
                title="Delete snapshot"
              >
                <Icon name="trash-2" />
              </button>
            </div>
          </div>
          
          <div class="card-meta">
            <span class="timestamp">
              <Icon name="clock" />
              {{ formatDate(snapshot.timestamp) }}
            </span>
            <span class="trigger" :class="`trigger-${snapshot.createdBy}`">
              {{ formatTrigger(snapshot.createdBy) }}
            </span>
          </div>
          
          <div class="card-stats">
            <div class="stat">
              <Icon name="file" />
              <span>{{ snapshot.openFiles.length }} files</span>
            </div>
            <div class="stat">
              <Icon name="git-branch" />
              <span>{{ snapshot.gitBranch }}</span>
            </div>
            <div class="stat">
              <Icon name="check-square" />
              <span>{{ snapshot.taskCounts.inProgress }} tasks</span>
            </div>
          </div>
          
          <div class="card-tags" v-if="snapshot.tags && snapshot.tags.length">
            <span
              v-for="tag in snapshot.tags"
              :key="tag"
              class="tag"
            >
              {{ tag }}
            </span>
          </div>
          
          <div class="card-preview" v-if="selectedSnapshotId === snapshot.id">
            <h5>Open Files:</h5>
            <ul class="file-list">
              <li v-for="file in snapshot.openFiles.slice(0, 5)" :key="file">
                {{ formatFilePath(file) }}
              </li>
              <li v-if="snapshot.openFiles.length > 5" class="more">
                ... and {{ snapshot.openFiles.length - 5 }} more
              </li>
            </ul>
            
            <div class="snapshot-actions">
              <button @click="compareWithCurrent(snapshot.id)" class="compare-btn">
                <Icon name="git-compare" />
                Compare with Current
              </button>
              <button @click="exportSnapshot(snapshot.id)" class="export-btn">
                <Icon name="download" />
                Export
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>
      
      <div v-if="filteredSnapshots.length === 0" class="empty-state">
        <Icon name="camera-off" />
        <p>No snapshots found</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSnapshotsStore } from '~/stores/snapshots';
import { format, formatDistanceToNow } from 'date-fns';
import type { ClaudeSnapshot } from '~/types/snapshot';

const emit = defineEmits<{
  close: [];
}>();

const snapshotsStore = useSnapshotsStore();

const searchQuery = ref('');
const filterBy = ref<'all' | ClaudeSnapshot['createdBy']>('all');
const selectedSnapshotId = computed({
  get: () => snapshotsStore.selectedSnapshotId,
  set: (value) => snapshotsStore.selectedSnapshotId = value
});

const snapshots = computed(() => snapshotsStore.sortedSnapshots);
const totalSizeMb = computed(() => snapshotsStore.totalSizeMb);

const filteredSnapshots = computed(() => {
  let filtered = snapshots.value;
  
  // Filter by trigger type
  if (filterBy.value !== 'all') {
    filtered = filtered.filter(s => s.createdBy === filterBy.value);
  }
  
  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.gitBranch.toLowerCase().includes(query) ||
      s.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  }
  
  return filtered;
});

function selectSnapshot(id: string) {
  selectedSnapshotId.value = selectedSnapshotId.value === id ? null : id;
}

async function restoreSnapshot(id: string) {
  if (confirm('Restore this snapshot? This will close all current files and open the snapshot state.')) {
    await snapshotsStore.restoreSnapshot(id);
    emit('close');
  }
}

async function deleteSnapshot(id: string) {
  if (confirm('Delete this snapshot? This cannot be undone.')) {
    await snapshotsStore.deleteSnapshot(id);
  }
}

function compareWithCurrent(id: string) {
  // TODO: Implement comparison view
  console.log('Compare with current:', id);
}

function exportSnapshot(id: string) {
  // TODO: Implement export
  console.log('Export snapshot:', id);
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffHours < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return format(date, 'MMM d, yyyy h:mm a');
}

function formatTrigger(trigger: ClaudeSnapshot['createdBy']) {
  const labels = {
    'manual': 'Manual',
    'auto-branch': 'Branch Change',
    'auto-timer': 'Auto Save',
    'auto-event': 'Event'
  };
  return labels[trigger] || trigger;
}

function formatFilePath(path: string) {
  const parts = path.split('/');
  return parts.slice(-2).join('/');
}
</script>

<style scoped>
.snapshot-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.list-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.storage-info {
  font-size: 13px;
  color: #666;
}

.close-btn {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #999;
}

.list-filters {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.snapshots-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.snapshot-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.snapshot-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
}

.snapshot-card.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.snapshot-card:hover .card-actions {
  opacity: 1;
}

.action-btn {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.action-btn.restore:hover {
  color: #3b82f6;
}

.action-btn.delete:hover {
  color: #ef4444;
}

.card-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #666;
}

.timestamp {
  display: flex;
  align-items: center;
  gap: 4px;
}

.trigger {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  font-size: 11px;
}

.trigger-manual {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.trigger-auto-branch {
  background: rgba(168, 85, 247, 0.1);
  color: #a855f7;
}

.trigger-auto-timer {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.trigger-auto-event {
  background: rgba(251, 146, 60, 0.1);
  color: #fb923c;
}

.card-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #999;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.tag {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  font-size: 11px;
  color: #999;
}

.card-preview {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.card-preview h5 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 500;
  color: #999;
}

.file-list {
  list-style: none;
  margin: 0 0 16px 0;
  padding: 0;
}

.file-list li {
  padding: 4px 0;
  font-size: 12px;
  color: #666;
  font-family: monospace;
}

.file-list li.more {
  font-style: italic;
}

.snapshot-actions {
  display: flex;
  gap: 8px;
}

.compare-btn,
.export-btn {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #999;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.compare-btn:hover,
.export-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #666;
}

.empty-state svg {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>