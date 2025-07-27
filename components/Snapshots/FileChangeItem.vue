<template>
  <div class="file-change-item" :class="[`status-${file.status}`, { 'is-binary': !file.isTextFile }]">
    <div class="file-info" @click="$emit('view-content', file)">
      <div class="file-icon-wrapper">
        <Icon :name="getFileIcon()" class="file-icon" />
        <Icon :name="getStatusIcon()" class="status-icon" />
      </div>
      
      <div class="file-details">
        <div class="file-path">{{ file.path }}</div>
        <div class="file-metadata">
          <span class="file-size">{{ formatBytes(file.size) }}</span>
          <span class="file-type">{{ getFileTypeLabel() }}</span>
          <span v-if="file.diffHash && file.isTextFile" class="diff-stats">
            <!-- Diff stats will be loaded dynamically -->
          </span>
        </div>
      </div>

      <div class="file-actions">
        <button 
          v-if="file.diffHash && file.isTextFile && file.status === 'modified'"
          class="action-btn"
          @click.stop="$emit('view-diff', file)"
          title="View Diff"
        >
          <Icon name="mdi:compare" />
        </button>
        
        <button 
          class="action-btn"
          @click.stop="$emit('view-content', file)"
          title="View Content"
        >
          <Icon name="mdi:file-document" />
        </button>
      </div>
    </div>

    <!-- Inline diff preview for text files (optional) -->
    <div 
      v-if="showInlineDiff && file.diffHash && file.isTextFile" 
      class="inline-diff-preview"
    >
      <div class="diff-loading">
        <Icon name="mdi:loading" class="animate-spin" />
        <span>Loading diff...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FileChange } from '~/types/snapshot';

interface Props {
  file: FileChange;
  showInlineDiff?: boolean;
}

interface Emits {
  (e: 'view-diff', file: FileChange): void;
  (e: 'view-content', file: FileChange): void;
}

const props = defineProps<Props>();
defineEmits<Emits>();

// Computed
const isTextFile = computed(() => props.file.isTextFile);
const fileExtension = computed(() => {
  const parts = props.file.path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
});

// Methods
function getFileIcon(): string {
  const ext = fileExtension.value;
  
  // Language-specific icons
  const iconMap: Record<string, string> = {
    js: 'mdi:language-javascript',
    ts: 'mdi:language-typescript',
    vue: 'mdi:vuejs',
    py: 'mdi:language-python',
    java: 'mdi:language-java',
    cpp: 'mdi:language-cpp',
    c: 'mdi:language-c',
    cs: 'mdi:language-csharp',
    php: 'mdi:language-php',
    rb: 'mdi:language-ruby',
    go: 'mdi:language-go',
    rs: 'mdi:language-rust',
    swift: 'mdi:language-swift',
    kt: 'mdi:language-kotlin',
    html: 'mdi:language-html5',
    css: 'mdi:language-css3',
    scss: 'mdi:sass',
    less: 'mdi:less',
    json: 'mdi:code-json',
    xml: 'mdi:xml',
    yml: 'mdi:file-document',
    yaml: 'mdi:file-document',
    md: 'mdi:language-markdown',
    txt: 'mdi:file-document-outline',
    pdf: 'mdi:file-pdf-box',
    png: 'mdi:file-image',
    jpg: 'mdi:file-image',
    jpeg: 'mdi:file-image',
    gif: 'mdi:file-image',
    svg: 'mdi:svg',
    mp4: 'mdi:file-video',
    mp3: 'mdi:file-music',
    zip: 'mdi:folder-zip',
    tar: 'mdi:folder-zip',
    gz: 'mdi:folder-zip'
  };

  return iconMap[ext] || 'mdi:file-document-outline';
}

function getStatusIcon(): string {
  switch (props.file.status) {
    case 'added':
      return 'mdi:plus-circle';
    case 'modified':
      return 'mdi:circle-medium';
    case 'removed':
      return 'mdi:minus-circle';
    default:
      return 'mdi:circle';
  }
}

function getFileTypeLabel(): string {
  if (!props.file.isTextFile) {
    return 'binary';
  }
  
  const ext = fileExtension.value;
  if (ext) {
    return ext.toUpperCase();
  }
  
  // Detect by MIME type
  if (props.file.mimeType.startsWith('text/')) {
    return 'text';
  }
  
  return 'file';
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
.file-change-item {
  border-bottom: 1px solid #2d2d30;
}

.file-info {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.file-info:hover {
  background: #2a2d2e;
}

.file-icon-wrapper {
  position: relative;
  margin-right: 12px;
  flex-shrink: 0;
}

.file-icon {
  width: 20px;
  height: 20px;
  color: #cccccc;
}

.status-icon {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  background: #1e1e1e;
  border-radius: 50%;
}

.status-added .status-icon {
  color: #28a745;
}

.status-modified .status-icon {
  color: #ffc107;
}

.status-removed .status-icon {
  color: #dc3545;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-path {
  font-size: 13px;
  color: #cccccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.status-removed .file-path {
  text-decoration: line-through;
  opacity: 0.7;
}

.file-metadata {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #8b8b8b;
}

.file-metadata > span {
  flex-shrink: 0;
}

.file-type {
  background: #3e3e42;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 500;
}

.is-binary .file-type {
  background: #6f42c1;
  color: white;
}

.diff-stats {
  color: #569cd6;
}

.file-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.file-info:hover .file-actions {
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
  color: #8b8b8b;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #3e3e42;
  color: #cccccc;
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

/* Inline diff preview */
.inline-diff-preview {
  background: #252526;
  border-top: 1px solid #3e3e42;
  padding: 12px;
  margin: 0 12px;
  border-radius: 0 0 4px 4px;
}

.diff-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8b8b8b;
  font-size: 12px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* File status styling */
.status-added {
  border-left: 3px solid #28a745;
}

.status-modified {
  border-left: 3px solid #ffc107;
}

.status-removed {
  border-left: 3px solid #dc3545;
  opacity: 0.8;
}
</style>