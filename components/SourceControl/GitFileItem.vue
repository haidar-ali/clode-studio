<template>
  <div 
    class="git-file-item"
    :class="{ 
      'selected': selected,
      'staged': file.staged 
    }"
    @click="$emit('click', file)"
  >
    <div class="file-info">
      <Icon :name="statusIcon" :class="statusClass" class="status-icon" />
      <span class="file-path">{{ displayPath }}</span>
      <span v-if="file.oldPath" class="old-path">← {{ file.oldPath }}</span>
    </div>
    <div class="file-actions">
      <button
        v-if="!file.staged && file.status !== 'deleted'"
        @click.stop="$emit('action', 'stage', file)"
        class="action-button"
        title="Stage file"
      >
        <Icon name="mdi:plus" />
      </button>
      <button
        v-if="file.staged"
        @click.stop="$emit('action', 'unstage', file)"
        class="action-button"
        title="Unstage file"
      >
        <Icon name="mdi:minus" />
      </button>
      <button
        @click.stop="$emit('action', 'diff', file)"
        class="action-button"
        title="View diff"
      >
        <Icon name="mdi:file-compare" />
      </button>
      <button
        v-if="!file.staged && file.status !== 'untracked'"
        @click.stop="$emit('action', 'discard', file)"
        class="action-button danger"
        title="Discard changes"
      >
        <Icon name="mdi:undo" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '~/components/UI/Icon.vue';

interface GitFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
  oldPath?: string;
}

const props = defineProps<{
  file: GitFile;
  selected: boolean;
}>();

defineEmits<{
  click: [file: GitFile];
  action: [action: string, file: GitFile];
}>();

const statusIcon = computed(() => {
  switch (props.file.status) {
    case 'modified':
      return 'mdi:pencil';
    case 'added':
      return 'mdi:plus-circle';
    case 'deleted':
      return 'mdi:minus-circle';
    case 'renamed':
      return 'mdi:file-move';
    case 'untracked':
      return 'mdi:help-circle';
    default:
      return 'mdi:file';
  }
});

const statusClass = computed(() => {
  return `status-${props.file.status}`;
});

const displayPath = computed(() => {
  // Show relative path, truncate if too long
  const path = props.file.path;
  if (path.length > 50) {
    const parts = path.split('/');
    if (parts.length > 3) {
      return `.../${parts.slice(-3).join('/')}`;
    }
  }
  return path;
});
</script>

<style scoped>
.git-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  user-select: none;
}

.git-file-item:hover {
  background: var(--color-background-mute);
}

.git-file-item.selected {
  background: var(--color-primary-soft);
}

.git-file-item.staged {
  opacity: 0.9;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.status-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.status-modified {
  color: var(--color-warning);
}

.status-added {
  color: var(--color-success);
}

.status-deleted {
  color: var(--color-error);
}

.status-renamed {
  color: var(--color-info);
}

.status-untracked {
  color: var(--color-text-secondary);
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.old-path {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.file-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.git-file-item:hover .file-actions {
  opacity: 1;
}

.action-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-button:hover {
  background: var(--color-background-soft);
  color: var(--color-text);
}

.action-button.danger:hover {
  background: rgba(255, 0, 0, 0.1);
  color: var(--color-error);
}

/* Dark theme color definitions */
:root {
  --color-primary-soft: rgba(66, 184, 221, 0.1);
  --color-warning: #e2c08d;
  --color-success: #73c991;
  --color-error: #f14c4c;
  --color-info: #3794ff;
}
</style>