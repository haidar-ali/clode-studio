<template>
  <div class="snapshot-item" :class="{ 'is-enhanced': isEnhancedSnapshot, 'is-expanded': isExpanded }">
    <div class="snapshot-info" @click="toggleExpand">
      <Icon 
        :name="snapshotIcon" 
        class="snapshot-icon"
        :class="snapshotType"
      />
      <div class="snapshot-details">
        <div class="snapshot-message">{{ snapshot.name }}</div>
        <div class="snapshot-meta">
          {{ formatTime(snapshot.timestamp) }}
          <span v-if="isEnhancedSnapshot && fileChangeSummary" class="file-summary">
            · {{ fileChangeSummary }}
          </span>
          <span v-else-if="snapshot.openFiles?.length" class="file-summary">
            · {{ snapshot.openFiles.length }} open files
          </span>
          <span class="size-info">· {{ formatSize(snapshot.sizeKb) }}</span>
        </div>
        
        <!-- Enhanced snapshot indicators -->
        <div v-if="isEnhancedSnapshot && snapshot.fileChanges" class="change-indicators">
          <span v-if="addedCount > 0" class="change-badge added">
            +{{ addedCount }}
          </span>
          <span v-if="actuallyModifiedCount > 0" class="change-badge modified">
            ~{{ actuallyModifiedCount }}
          </span>
          <span v-if="removedCount > 0" class="change-badge removed">
            -{{ removedCount }}
          </span>
        </div>
      </div>

      <div class="snapshot-actions">
        <button 
          v-if="isEnhancedSnapshot"
          class="action-btn"
          @click="$emit('view-changes', snapshot)"
          title="View File Changes"
        >
          <Icon name="mdi:file-compare" />
        </button>
        <button 
          v-if="isEnhancedSnapshot && hasFileChanges"
          class="action-btn"
          @click="$emit('selective-restore', snapshot)"
          title="Selective Restore"
        >
          <Icon name="mdi:file-check" />
        </button>
        <button 
          v-if="isEnhancedSnapshot && hasApplicableChanges"
          class="action-btn"
          @click="$emit('cherry-pick', snapshot)"
          title="Cherry Pick Changes"
        >
          <Icon name="mdi:fruit-cherries" />
        </button>
        <button 
          class="action-btn"
          @click="$emit('restore', snapshot)"
          title="Restore Snapshot"
        >
          <Icon name="mdi:restore" />
        </button>
        <button 
          class="action-btn"
          @click="$emit('delete', snapshot)"
          title="Delete Snapshot"
        >
          <Icon name="mdi:delete" />
        </button>
      </div>

      <div class="snapshot-status">
        <Icon 
          v-if="isEnhancedSnapshot" 
          name="mdi:database" 
          class="enhanced-icon" 
          title="Enhanced snapshot with file content"
        />
        <Icon 
          :name="isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
          class="expand-icon"
          v-if="isEnhancedSnapshot"
        />
      </div>
    </div>

    <!-- File changes preview (when expanded) -->
    <div v-if="isExpanded && isEnhancedSnapshot" class="snapshot-expanded-content">
      <SnapshotFileChanges :snapshot="snapshot" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ClaudeSnapshot } from '~/types/snapshot';
import SnapshotFileChanges from '../Snapshots/SnapshotFileChanges.vue';

interface Props {
  snapshot: ClaudeSnapshot;
}

interface Emits {
  (e: 'restore', snapshot: ClaudeSnapshot): void;
  (e: 'delete', snapshot: ClaudeSnapshot): void;
  (e: 'view-changes', snapshot: ClaudeSnapshot): void;
  (e: 'selective-restore', snapshot: ClaudeSnapshot): void;
  (e: 'cherry-pick', snapshot: ClaudeSnapshot): void;
}

const props = defineProps<Props>();
defineEmits<Emits>();

// State
const isExpanded = ref(false);

// Computed
const isEnhancedSnapshot = computed(() => !!props.snapshot.fileChanges);

const hasFileChanges = computed(() => {
  if (!props.snapshot.fileChanges) return false;
  const { added, modified, removed } = props.snapshot.fileChanges;
  // Filter out unchanged files from modified array
  const actuallyModified = modified.filter(f => f.status !== 'unchanged');
  return added.length > 0 || actuallyModified.length > 0 || removed.length > 0;
});

const hasApplicableChanges = computed(() => {
  if (!props.snapshot.fileChanges) return false;
  const { added, modified } = props.snapshot.fileChanges;
  // Filter out unchanged files from modified array
  const actuallyModified = modified.filter(f => f.status !== 'unchanged');
  // Cherry-pick only works with added and modified files (not removed)
  return added.length > 0 || actuallyModified.length > 0;
});

const snapshotType = computed(() => props.snapshot.createdBy);

const snapshotIcon = computed(() => {
  const icons = {
    'manual': 'mdi:camera',
    'auto-timer': 'mdi:timer',
    'auto-branch': 'mdi:source-branch',
    'auto-event': 'mdi:lightning-bolt',
    'auto-checkpoint': 'mdi:checkpoint'
  };
  return icons[props.snapshot.createdBy] || 'mdi:camera';
});

// Helper computed properties for filtered counts
const actuallyModifiedCount = computed(() => {
  if (!props.snapshot.fileChanges) return 0;
  return props.snapshot.fileChanges.modified.filter(f => f.status !== 'unchanged').length;
});

const addedCount = computed(() => props.snapshot.fileChanges?.added.length || 0);
const removedCount = computed(() => props.snapshot.fileChanges?.removed.length || 0);

const fileChangeSummary = computed(() => {
  if (!props.snapshot.fileChanges) return null;
  
  const total = addedCount.value + actuallyModifiedCount.value + removedCount.value;
  
  if (total === 0) return 'no file changes';
  
  const parts = [];
  if (addedCount.value > 0) parts.push(`${addedCount.value} added`);
  if (actuallyModifiedCount.value > 0) parts.push(`${actuallyModifiedCount.value} modified`);
  if (removedCount.value > 0) parts.push(`${removedCount.value} removed`);
  
  return parts.join(', ');
});

// Methods
function toggleExpand() {
  if (isEnhancedSnapshot.value) {
    isExpanded.value = !isExpanded.value;
  }
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
  if (sizeKb < 1024) return `${sizeKb.toFixed(1)}KB`;
  return `${(sizeKb / 1024).toFixed(1)}MB`;
}
</script>

<style scoped>
.snapshot-item {
  border-bottom: 1px solid #2d2d30;
  transition: all 0.2s;
}

.snapshot-item.is-enhanced {
  border-left: 3px solid #569cd6;
}

.snapshot-item:hover {
  background: #2a2d2e;
}

.snapshot-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.is-enhanced .snapshot-info {
  cursor: pointer;
}

.snapshot-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.8;
  margin-right: 8px;
}

.snapshot-icon.manual {
  color: #569cd6;
}

.snapshot-icon.auto-timer {
  color: #73c991;
}

.snapshot-icon.auto-branch {
  color: #e2c08d;
}

.snapshot-icon.auto-event {
  color: #c586c0;
}

.snapshot-icon.auto-checkpoint {
  color: #f97583;
}

.snapshot-details {
  flex: 1;
  min-width: 0;
}

.snapshot-message {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.snapshot-meta {
  font-size: 11px;
  color: #8b8b8b;
  display: flex;
  gap: 4px;
  align-items: center;
}

.file-summary {
  color: #79c0ff;
}

.size-info {
  color: #8b949e;
}

.change-indicators {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.change-badge {
  font-size: 10px;
  padding: 1px 4px;
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

.snapshot-status {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.enhanced-icon {
  width: 14px;
  height: 14px;
  color: #569cd6;
  opacity: 0.7;
}

.expand-icon {
  width: 14px;
  height: 14px;
  color: #8b8b8b;
  transition: transform 0.2s;
}

.snapshot-expanded-content {
  border-top: 1px solid #3e3e42;
  background: #252526;
  max-height: 400px;
  overflow-y: auto;
}

.snapshot-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  margin-left: 8px;
}

.snapshot-item:hover .snapshot-actions {
  opacity: 1;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #cccccc;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #3e3e42;
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.is-expanded .expand-icon {
  transform: rotate(180deg);
}
</style>