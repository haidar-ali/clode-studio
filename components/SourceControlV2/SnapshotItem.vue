<template>
  <div class="snapshot-item">
    <div class="snapshot-info">
      <Icon 
        :name="snapshotIcon" 
        class="snapshot-icon"
        :class="snapshot.type"
      />
      <div class="snapshot-details">
        <div class="snapshot-message">{{ snapshot.message }}</div>
        <div class="snapshot-meta">
          {{ formatTime(snapshot.timestamp) }} · {{ snapshot.filesCount }} files
        </div>
      </div>
    </div>
    <div class="snapshot-actions">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  snapshot: {
    id: string;
    message: string;
    timestamp: string | Date;
    type: 'manual' | 'auto-save' | 'auto-branch' | 'auto-event';
    filesCount: number;
  };
}>();

const emit = defineEmits<{
  restore: [snapshot: any];
  delete: [snapshot: any];
}>();

const snapshotIcon = computed(() => {
  const icons = {
    'manual': 'mdi:camera',
    'auto-save': 'mdi:content-save',
    'auto-branch': 'mdi:source-branch',
    'auto-event': 'mdi:lightning-bolt'
  };
  return icons[props.snapshot.type] || 'mdi:camera';
});

function formatTime(timestamp: string | Date): string {
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
</script>

<style scoped>
.snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  transition: background 0.2s;
}

.snapshot-item:hover {
  background: #2a2d2e;
}

.snapshot-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.snapshot-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.8;
}

.snapshot-icon.manual {
  color: #569cd6;
}

.snapshot-icon.auto-save {
  color: #73c991;
}

.snapshot-icon.auto-branch {
  color: #e2c08d;
}

.snapshot-icon.auto-event {
  color: #c586c0;
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
}

.snapshot-meta {
  font-size: 11px;
  color: #8b8b8b;
  margin-top: 2px;
}

.snapshot-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
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
</style>