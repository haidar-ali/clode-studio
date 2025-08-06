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
    
    <!-- Code Generation Modal -->
    <CodeGenerationModal 
      ref="codeGenerationModal"
      @accept="handleAcceptGeneratedCode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import RemoteCodeEditor from './RemoteCodeEditor.vue';
import CodeGenerationModal from '~/components/Editor/CodeGenerationModal.vue';

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

// Code generation modal ref
const codeGenerationModal = ref();

const currentFile = computed(() => 
  openFiles.value.find(f => f.path === currentFilePath.value) || null
);

// Watch for new files from explorer
watch(() => props.fileData, (newFile) => {
 
  if (newFile) {
    // Check if file is already open
    const existing = openFiles.value.find(f => f.path === newFile.path);
    if (!existing) {
      openFiles.value.push({ ...newFile });
     
    }
    currentFilePath.value = newFile.path;
   
   
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

// Handle generated code acceptance
const handleAcceptGeneratedCode = (generatedCode: string) => {
  if (!currentFile.value) return;
  
  // Update the file content
  handleContentChange(generatedCode);
};

// Event handler for opening code generation
const handleOpenCodeGeneration = () => {
  if (!currentFile.value) return;
  
  const content = currentFile.value.content || '';
  codeGenerationModal.value?.open(content);
};

// Set up event listeners
onMounted(() => {
  window.addEventListener('editor:open-code-generation', handleOpenCodeGeneration);
});

onUnmounted(() => {
  window.removeEventListener('editor:open-code-generation', handleOpenCodeGeneration);
});
</script>

<style scoped>
.mobile-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0b0d;
}

.editor-tabs {
  background: linear-gradient(180deg, #1a1b1f 0%, #141518 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  backdrop-filter: blur(10px);
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
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  transition: all 0.2s;
  position: relative;
}

.editor-tab:hover:not(.active) {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

.editor-tab.active {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  border-bottom-color: #5CA0F2;
}

.editor-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: #5CA0F2;
  box-shadow: 0 0 8px rgba(92, 160, 242, 0.4);
}

.editor-tab span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
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
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.1);
}

.editor-container {
  flex: 1;
  overflow: hidden;
  background: #0a0b0d;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.4);
  gap: 12px;
  padding: 20px;
  text-align: center;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.3;
  color: #5CA0F2;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.empty-state .hint {
  font-size: 14px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
}

/* Mobile optimizations */
:deep(.mobile-optimized .cm-editor) {
  font-size: 14px;
  background: #0a0b0d;
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

/* Scrollbar styling */
.tabs-scroll::-webkit-scrollbar {
  height: 4px;
}

.tabs-scroll::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
}

.tabs-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.tabs-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>