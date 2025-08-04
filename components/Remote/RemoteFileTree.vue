<template>
  <div class="remote-file-tree">
    <div v-if="isLoading" class="loading">
      <Icon name="mdi:loading" class="animate-spin" />
      <span>Loading files...</span>
    </div>
    
    <div v-else-if="error" class="error">
      <Icon name="mdi:alert" />
      <span>{{ error }}</span>
    </div>
    
    <div v-else class="file-list">
      <div
        v-for="file in files"
        :key="file.path"
        class="file-item"
        :class="{ 'is-directory': file.type === 'directory' }"
        @click="handleFileClick(file)"
      >
        <Icon :name="getFileIcon(file)" />
        <span class="file-name">{{ file.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useServices } from '~/composables/useServices';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

interface Props {
  files: FileItem[];
  isLoading?: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  error: null
});

const emit = defineEmits<{
  directoryClick: [path: string];
  fileClick: [path: string];
  fileOpen: [{ path: string; content: string; name: string }];
}>();

function getFileIcon(file: FileItem) {
  if (file.type === 'directory') {
    return 'mdi:folder';
  }
  
  // Get file extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  // Map extensions to icons
  const iconMap: Record<string, string> = {
    ts: 'mdi:language-typescript',
    tsx: 'mdi:language-typescript',
    js: 'mdi:language-javascript',
    jsx: 'mdi:language-javascript',
    vue: 'mdi:vuejs',
    json: 'mdi:code-json',
    md: 'mdi:language-markdown',
    html: 'mdi:language-html5',
    css: 'mdi:language-css3',
    scss: 'mdi:sass',
    sass: 'mdi:sass',
    py: 'mdi:language-python',
    rs: 'mdi:language-rust',
    go: 'mdi:language-go',
    java: 'mdi:language-java',
    cpp: 'mdi:language-cpp',
    c: 'mdi:language-c',
    sh: 'mdi:console',
    yml: 'mdi:file-document',
    yaml: 'mdi:file-document',
    xml: 'mdi:file-xml',
    svg: 'mdi:svg',
    png: 'mdi:file-image',
    jpg: 'mdi:file-image',
    jpeg: 'mdi:file-image',
    gif: 'mdi:file-image',
    ico: 'mdi:file-image',
    pdf: 'mdi:file-pdf',
    txt: 'mdi:file-document-outline',
    lock: 'mdi:lock',
  };
  
  return iconMap[ext || ''] || 'mdi:file';
}

async function handleFileClick(file: FileItem) {
  if (file.type === 'directory') {
    emit('directoryClick', file.path);
  } else {
    // Read file content using services
    try {
      const { services, initialize } = useServices();
      await initialize();
      
      if (services.value) {
        const content = await services.value.file.readFile(file.path);
        emit('fileOpen', {
          path: file.path,
          content: content,
          name: file.name
        });
        emit('fileClick', file.path);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  }
}
</script>

<style scoped>
.remote-file-tree {
  height: 100%;
  overflow: auto;
}

.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--color-text-secondary);
}

.error {
  color: var(--color-error);
}

.file-list {
  display: flex;
  flex-direction: column;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--color-border-light);
  min-height: 44px; /* Touch target size */
}

.file-item:hover {
  background: var(--color-bg-hover);
}

.file-item:active {
  background: var(--color-bg-active);
}

.file-item.is-directory {
  font-weight: 500;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

/* Icon animations */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .file-item {
    padding: 12px 16px;
  }
  
  .file-name {
    font-size: 16px;
  }
}
</style>