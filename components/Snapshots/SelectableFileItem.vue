<template>
  <div class="selectable-file-item" :class="{ selected }" @click="$emit('toggle')">
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
        </div>
      </div>
      
      <div class="file-actions">
        <button 
          v-if="file.status !== 'removed' && file.diffHash"
          class="action-btn"
          @click.stop="$emit('view-diff', file)"
          title="View Diff"
        >
          <Icon name="mdi:compare" />
          <span>Diff</span>
        </button>
        <button 
          class="action-btn"
          @click.stop="$emit('view-content', file)"
          :title="file.status === 'removed' ? 'View Original Content' : 'View Content'"
        >
          <Icon name="mdi:file-eye" />
          <span>{{ file.status === 'removed' ? 'Original' : 'Content' }}</span>
        </button>
      </div>
    </div>
    
    <!-- File metadata -->
    <div class="file-metadata" v-if="showMetadata">
      <div class="metadata-item" v-if="file.mimeType">
        <span class="metadata-label">Type:</span>
        <span class="metadata-value">{{ file.mimeType }}</span>
      </div>
      <div class="metadata-item" v-if="file.encoding">
        <span class="metadata-label">Encoding:</span>
        <span class="metadata-value">{{ file.encoding }}</span>
      </div>
      <div class="metadata-item" v-if="file.contentHash">
        <span class="metadata-label">Hash:</span>
        <span class="metadata-value">{{ file.contentHash.substring(0, 12) }}...</span>
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
  showMetadata?: boolean;
}

interface Emits {
  (e: 'toggle'): void;
  (e: 'view-diff', file: FileChange): void;
  (e: 'view-content', file: FileChange): void;
}

const props = withDefaults(defineProps<Props>(), {
  showMetadata: false
});

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
    case 'removed': return 'D';
    default: return '?';
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
.selectable-file-item {
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.selectable-file-item:hover {
  background: #2a2d2e;
  border-color: #3e3e42;
}

.selectable-file-item.selected {
  background: rgba(14, 99, 156, 0.15);
  border-color: #0e639c;
}

.file-selection {
  display: flex;
  align-items: center;
  padding-top: 2px;
}

.file-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #0e639c;
  cursor: pointer;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
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

.status-badge.removed {
  background: rgba(220, 53, 69, 0.2);
  color: #dc3545;
}

.file-size {
  font-size: 11px;
  color: #8b8b8b;
}

.file-actions {
  display: flex;
  gap: 4px;
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
  border-color: #569cd6;
}

.action-btn svg {
  width: 12px;
  height: 12px;
}

.file-metadata {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #3e3e42;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.metadata-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.metadata-label {
  color: #8b8b8b;
  font-weight: 500;
}

.metadata-value {
  color: #cccccc;
  font-family: 'Monaco', 'Menlo', monospace;
}
</style>