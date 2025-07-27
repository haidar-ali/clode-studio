<template>
  <div class="cherry-pick-file-item" :class="{ selected, 'has-conflict': conflictStatus !== 'none' }" @click="$emit('toggle')">
    <div class="file-selection">
      <input 
        type="checkbox" 
        :checked="selected"
        @click.stop
        @change="$emit('toggle')"
        class="file-checkbox"
      />
    </div>
    
    <div class="file-info">
      <div class="file-header">
        <Icon :name="getFileIcon()" class="file-icon" />
        <span class="file-path">{{ file.path }}</span>
        <div class="file-status">
          <span class="status-badge" :class="file.status">
            {{ getStatusLabel() }}
          </span>
          <span v-if="file.size" class="file-size">{{ formatBytes(file.size) }}</span>
          <div v-if="conflictStatus !== 'none'" class="conflict-indicator" :class="conflictStatus">
            <Icon :name="getConflictIcon()" />
            <span class="conflict-text">{{ getConflictText() }}</span>
          </div>
        </div>
      </div>
      
      <div class="file-actions">
        <button 
          v-if="file.status === 'modified' && file.diffHash"
          class="action-btn"
          @click.stop="$emit('view-diff', file)"
          title="View Changes"
        >
          <Icon name="mdi:compare" />
          <span>Changes</span>
        </button>
        <button 
          class="action-btn"
          @click.stop="$emit('view-content', file)"
          title="View Content"
        >
          <Icon name="mdi:file-eye" />
          <span>Content</span>
        </button>
      </div>
    </div>
    
    <!-- Cherry-pick preview -->
    <div class="cherry-pick-preview" v-if="selected">
      <div class="preview-item">
        <Icon name="mdi:arrow-right" />
        <span class="preview-text">{{ getPreviewText() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FileChange } from '~/types/snapshot';

interface Props {
  file: FileChange;
  selected: boolean;
  conflictStatus: 'none' | 'potential' | 'conflict';
}

interface Emits {
  (e: 'toggle'): void;
  (e: 'view-diff', file: FileChange): void;
  (e: 'view-content', file: FileChange): void;
}

const props = defineProps<Props>();
defineEmits<Emits>();

// Computed
const fileExtension = computed(() => {
  const parts = props.file.path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
});

// Methods
function getFileIcon(): string {
  const ext = fileExtension.value;
  
  const iconMap: Record<string, string> = {
    js: 'mdi:language-javascript',
    ts: 'mdi:language-typescript',
    vue: 'mdi:vuejs',
    py: 'mdi:language-python',
    html: 'mdi:language-html5',
    css: 'mdi:language-css3',
    scss: 'mdi:sass',
    less: 'mdi:language-css3',
    json: 'mdi:code-json',
    xml: 'mdi:xml',
    yaml: 'mdi:code-json',
    yml: 'mdi:code-json',
    md: 'mdi:language-markdown',
    txt: 'mdi:file-document-outline',
    jpg: 'mdi:file-image',
    jpeg: 'mdi:file-image',
    png: 'mdi:file-image',
    gif: 'mdi:file-image',
    svg: 'mdi:file-image',
    pdf: 'mdi:file-pdf-box',
    zip: 'mdi:file-archive',
    tar: 'mdi:file-archive',
    gz: 'mdi:file-archive'
  };

  return iconMap[ext] || 'mdi:file-document-outline';
}

function getStatusLabel(): string {
  switch (props.file.status) {
    case 'added': return 'A';
    case 'modified': return 'M';
    default: return '?';
  }
}

function getConflictIcon(): string {
  switch (props.conflictStatus) {
    case 'conflict': return 'mdi:alert-circle';
    case 'potential': return 'mdi:alert-triangle';
    default: return 'mdi:information';
  }
}

function getConflictText(): string {
  switch (props.conflictStatus) {
    case 'conflict': return 'File exists';
    case 'potential': return 'May conflict';
    default: return '';
  }
}

function getPreviewText(): string {
  switch (props.file.status) {
    case 'added': 
      return props.conflictStatus === 'conflict' 
        ? 'Will overwrite existing file'
        : 'Will create new file';
    case 'modified': 
      return 'Will apply changes to existing file';
    default: 
      return 'Will apply changes';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
</script>

<style scoped>
.cherry-pick-file-item {
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cherry-pick-file-item:hover {
  background: #2a2d2e;
  border-color: #3e3e42;
}

.cherry-pick-file-item.selected {
  background: rgba(255, 107, 157, 0.15);
  border-color: #ff6b9d;
}

.cherry-pick-file-item.has-conflict {
  border-left: 3px solid #ffc107;
}

.cherry-pick-file-item.has-conflict.selected {
  border-left: 3px solid #ffc107;
  border-color: #ff6b9d;
}

.file-selection {
  display: flex;
  align-items: center;
  padding-top: 2px;
  flex-shrink: 0;
}

.file-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #ff6b9d;
  cursor: pointer;
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  width: 16px;
  height: 16px;
  color: #569cd6;
  flex-shrink: 0;
}

.file-path {
  flex: 1;
  font-size: 13px;
  color: #cccccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Monaco', 'Menlo', monospace;
}

.file-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 4px;
  border-radius: 3px;
  text-align: center;
  min-width: 16px;
}

.status-badge.added {
  background: rgba(40, 167, 69, 0.2);
  color: #28a745;
}

.status-badge.modified {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.file-size {
  font-size: 11px;
  color: #8b8b8b;
}

.conflict-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
}

.conflict-indicator.conflict {
  background: rgba(220, 53, 69, 0.2);
  color: #dc3545;
}

.conflict-indicator.potential {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.conflict-indicator svg {
  width: 12px;
  height: 12px;
}

.conflict-text {
  font-weight: 500;
}

.file-actions {
  display: flex;
  gap: 4px;
  margin-left: 24px; /* Align with file path */
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: none;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  color: #cccccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #3e3e42;
  border-color: #ff6b9d;
}

.action-btn svg {
  width: 12px;
  height: 12px;
}

.cherry-pick-preview {
  margin-left: 24px;
  padding: 6px 8px;
  background: rgba(255, 107, 157, 0.1);
  border-radius: 3px;
  border-left: 2px solid #ff6b9d;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #ff6b9d;
}

.preview-item svg {
  width: 12px;
  height: 12px;
}

.preview-text {
  font-weight: 500;
}
</style>