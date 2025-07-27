<template>
  <div class="file-item" @click="$emit('click', file)">
    <div class="file-info">
      <Icon :name="fileIcon" class="file-icon" :class="statusClass" />
      <span class="file-path">{{ displayPath }}</span>
      <span class="file-status">{{ statusLabel }}</span>
    </div>
    <div class="file-actions">
      <button 
        v-if="!staged"
        class="action-btn"
        @click.stop="$emit('stage', file)"
        title="Stage File"
      >
        <Icon name="mdi:plus" />
      </button>
      <button 
        v-else
        class="action-btn"
        @click.stop="$emit('unstage', file)"
        title="Unstage File"
      >
        <Icon name="mdi:minus" />
      </button>
      <button 
        v-if="!staged && file.status !== 'untracked'"
        class="action-btn"
        @click.stop="$emit('discard', file)"
        title="Discard Changes"
      >
        <Icon name="mdi:undo" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  file: {
    path: string;
    status: string;
    type?: string;
  };
  staged: boolean;
}>();

const emit = defineEmits<{
  click: [file: any];
  stage: [file: any];
  unstage: [file: any];
  discard: [file: any];
}>();

const displayPath = computed(() => {
  const parts = props.file.path.split('/');
  if (parts.length > 3) {
    return `.../${parts.slice(-3).join('/')}`;
  }
  return props.file.path;
});

const fileIcon = computed(() => {
  const ext = props.file.path.split('.').pop()?.toLowerCase();
  const iconMap = {
    'js': 'mdi:language-javascript',
    'ts': 'mdi:language-typescript',
    'vue': 'mdi:vuejs',
    'html': 'mdi:language-html5',
    'css': 'mdi:language-css3',
    'json': 'mdi:code-json',
    'md': 'mdi:language-markdown',
    'py': 'mdi:language-python',
    'java': 'mdi:language-java',
    'cpp': 'mdi:language-cpp',
    'c': 'mdi:language-c',
    'go': 'mdi:language-go',
    'rs': 'mdi:language-rust',
    'php': 'mdi:language-php',
    'rb': 'mdi:language-ruby',
    'swift': 'mdi:language-swift',
    'kt': 'mdi:language-kotlin',
    'dart': 'mdi:dart',
    'yaml': 'mdi:file-code',
    'yml': 'mdi:file-code',
    'xml': 'mdi:file-xml',
    'svg': 'mdi:svg',
    'png': 'mdi:file-image',
    'jpg': 'mdi:file-image',
    'jpeg': 'mdi:file-image',
    'gif': 'mdi:file-image',
    'pdf': 'mdi:file-pdf',
    'zip': 'mdi:folder-zip',
    'tar': 'mdi:folder-zip',
    'gz': 'mdi:folder-zip',
  };
  
  return iconMap[ext] || 'mdi:file';
});

const statusClass = computed(() => {
  return {
    'modified': props.file.status === 'modified',
    'added': props.file.status === 'added' || props.file.status === 'untracked',
    'deleted': props.file.status === 'deleted',
    'renamed': props.file.status === 'renamed',
    'conflicted': props.file.status === 'conflicted'
  };
});

const statusLabel = computed(() => {
  const labels = {
    'modified': 'M',
    'added': 'A',
    'deleted': 'D',
    'renamed': 'R',
    'untracked': 'U',
    'conflicted': 'C'
  };
  return labels[props.file.status] || props.file.status;
});
</script>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.file-item:hover {
  background: #2a2d2e;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.file-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.file-icon.modified {
  color: #e2c08d;
}

.file-icon.added {
  color: #73c991;
}

.file-icon.deleted {
  color: #f14c4c;
}

.file-icon.renamed {
  color: #73c991;
}

.file-icon.conflicted {
  color: #f14c4c;
}

.file-path {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.file-status {
  font-size: 11px;
  font-weight: 500;
  padding: 0 4px;
  margin-left: 4px;
  border-radius: 2px;
  background: #3e3e42;
  color: #8b8b8b;
}

.file-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.file-item:hover .file-actions {
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