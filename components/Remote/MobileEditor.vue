<template>
  <div class="mobile-editor">
    <!-- Editor tabs with horizontal scroll -->
    <div v-if="openFiles.length > 0" class="editor-tabs">
      <div class="tabs-scroll">
        <div 
          v-for="file in openFiles" 
          :key="file.path"
          :class="{ active: file.path === currentFile?.path }"
          @click="selectFile(file)"
          @click.middle="closeFile(file)"
          class="editor-tab"
        >
          <Icon :name="getFileIcon(file.name)" />
          <span>{{ file.name }}</span>
          <span @click.stop="closeFile(file)" class="close-btn">
            <Icon name="mdi:close" />
          </span>
        </div>
      </div>
    </div>
    
    <!-- Use RemoteCodeEditor for mobile -->
    <div class="editor-container">
      <RemoteCodeEditor
        v-if="currentFile"
        :key="currentFile.path"
        :file-path="currentFile.path"
        :initial-content="currentFile.content"
        @change="handleContentChange"
      />
      <div v-else class="empty-state">
        <Icon name="mdi:code-braces" />
        <p>No file open</p>
        <p class="hint">Select a file from the explorer</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import RemoteCodeEditor from './RemoteCodeEditor.vue';

interface FileData {
  path: string;
  content: string;
  name: string;
}

interface Props {
  fileData?: FileData | null;
}

const props = defineProps<Props>();

// Manage open files locally for remote mode
const openFiles = ref<FileData[]>([]);
const currentFilePath = ref<string | null>(null);

const currentFile = computed(() => 
  openFiles.value.find(f => f.path === currentFilePath.value) || null
);

// Watch for new files from explorer
watch(() => props.fileData, (newFile) => {
  console.log('MobileEditor: fileData changed:', newFile);
  if (newFile) {
    // Check if file is already open
    const existing = openFiles.value.find(f => f.path === newFile.path);
    if (!existing) {
      openFiles.value.push({ ...newFile });
      console.log('MobileEditor: Added new file to openFiles:', newFile.path);
    }
    currentFilePath.value = newFile.path;
    console.log('MobileEditor: Set current file to:', newFile.path);
    console.log('MobileEditor: openFiles now:', openFiles.value.length);
  }
}, { immediate: true });

function selectFile(file: FileData) {
  currentFilePath.value = file.path;
}

function closeFile(file: FileData) {
  const index = openFiles.value.findIndex(f => f.path === file.path);
  if (index > -1) {
    openFiles.value.splice(index, 1);
    // If closing current file, switch to another
    if (currentFilePath.value === file.path) {
      currentFilePath.value = openFiles.value.length > 0 ? openFiles.value[0].path : null;
    }
  }
}

function handleContentChange(content: string) {
  if (currentFile.value) {
    // Update content in local state
    const file = openFiles.value.find(f => f.path === currentFile.value!.path);
    if (file) {
      file.content = content;
    }
  }
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    'js': 'mdi:language-javascript',
    'ts': 'mdi:language-typescript',
    'vue': 'mdi:vuejs',
    'html': 'mdi:language-html5',
    'css': 'mdi:language-css3',
    'json': 'mdi:code-json',
    'md': 'mdi:language-markdown',
    'py': 'mdi:language-python',
    'jsx': 'mdi:react',
    'tsx': 'mdi:react'
  };
  return iconMap[ext || ''] || 'mdi:file-document-outline';
}
</script>

<style scoped>
.mobile-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.editor-tabs {
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
}

.tabs-scroll {
  display: flex;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.editor-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  transition: all 0.2s;
}

.editor-tab.active {
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  border-bottom-color: var(--color-primary);
}

.editor-tab span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}

.editor-tab svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  margin-left: 4px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.7;
  transition: all 0.2s;
}

.close-btn:hover {
  opacity: 1;
  background: var(--color-bg-hover);
}

.editor-container {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  gap: 8px;
  padding: 20px;
  text-align: center;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 14px;
  opacity: 0.7;
}

/* Mobile optimizations */
:deep(.mobile-optimized .cm-editor) {
  font-size: 14px;
}

:deep(.mobile-optimized .cm-content) {
  padding: 12px;
}

:deep(.mobile-optimized .cm-line) {
  padding: 0 4px;
}

/* Ensure proper touch scrolling */
:deep(.mobile-optimized .cm-scroller) {
  -webkit-overflow-scrolling: touch;
}
</style>