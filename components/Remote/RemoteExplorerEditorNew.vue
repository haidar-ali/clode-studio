<template>
  <div class="explorer-editor">
    <Splitpanes class="default-theme" @ready="onSplitpanesReady">
      <!-- Explorer Pane -->
      <Pane :size="explorerSize" :min-size="15" :max-size="50">
        <SimpleFileExplorer @file-open="handleFileOpen" />
      </Pane>
      
      <!-- Editor Pane -->
      <Pane :size="100 - explorerSize">
        <div class="editor-container">
          <!-- Editor Tabs -->
          <div class="editor-tabs" v-if="openFiles.length > 0">
            <div 
              v-for="file in openFiles" 
              :key="file.path"
              class="editor-tab"
              :class="{ active: activeFile?.path === file.path }"
              @click="setActiveFile(file)"
            >
              <Icon :name="getFileIcon(file.name)" class="tab-icon" />
              <span class="tab-name">{{ file.name }}</span>
              <button 
                class="tab-close" 
                @click.stop="closeFile(file)"
                title="Close"
              >
                <Icon name="mdi:close" />
              </button>
            </div>
          </div>
          
          <!-- Editor Content -->
          <div v-if="activeFile" class="editor-content">
            <div v-if="loadingFile" class="loading-editor">
              <Icon name="mdi:loading" class="animate-spin" />
              <p>Loading file...</p>
            </div>
            <div v-else-if="fileError" class="error-editor">
              <Icon name="mdi:alert" />
              <p>{{ fileError }}</p>
            </div>
            <div v-else class="code-editor">
              <textarea 
                v-model="activeFile.content" 
                class="editor-textarea"
                @input="markFileAsModified"
                spellcheck="false"
              />
              <div class="editor-actions">
                <button 
                  v-if="activeFile.modified" 
                  @click="saveFile"
                  class="save-button"
                  :disabled="savingFile"
                >
                  <Icon name="mdi:content-save" />
                  {{ savingFile ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
          
          <!-- Welcome Screen -->
          <div v-else class="welcome-screen">
            <Icon name="mdi:file-code-outline" size="48" />
            <h2>Remote Code Editor</h2>
            <p>Select a file from the explorer to start editing</p>
          </div>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import SimpleFileExplorer from '~/components/FileExplorer/SimpleFileExplorer.vue';
import { useEditorStore } from '~/stores/editor';

interface FileData {
  path: string;
  name: string;
  content: string;
  modified?: boolean;
}

const editorStore = useEditorStore();
const explorerSize = ref(25); // 25% for explorer by default
const openFiles = ref<FileData[]>([]);
const activeFile = ref<FileData | null>(null);
const loadingFile = ref(false);
const savingFile = ref(false);
const fileError = ref<string | null>(null);

const onSplitpanesReady = () => {
  // Splitpanes ready callback
};

const handleFileOpen = async (file: { name: string; path: string; isDirectory: boolean }) => {
  if (file.isDirectory) return;
  
  // Check if file is already open
  const existingFile = openFiles.value.find(f => f.path === file.path);
  if (existingFile) {
    setActiveFile(existingFile);
    return;
  }
  
  // Load file content from server
  loadingFile.value = true;
  fileError.value = null;
  
  try {
    const response = await $fetch('/api/files/read', {
      query: { path: file.path }
    });
    
    const fileData: FileData = {
      path: file.path,
      name: file.name,
      content: response.content || '',
      modified: false
    };
    
    openFiles.value.push(fileData);
    setActiveFile(fileData);
  } catch (error) {
    fileError.value = `Failed to load file: ${error.message}`;
    console.error('Failed to load file:', error);
  } finally {
    loadingFile.value = false;
  }
};

const setActiveFile = (file: FileData) => {
  activeFile.value = file;
};

const closeFile = (file: FileData) => {
  const index = openFiles.value.findIndex(f => f.path === file.path);
  if (index > -1) {
    openFiles.value.splice(index, 1);
    
    // If closing active file, activate another one
    if (activeFile.value?.path === file.path) {
      if (openFiles.value.length > 0) {
        // Activate the file that was next to the closed one
        const newIndex = Math.min(index, openFiles.value.length - 1);
        setActiveFile(openFiles.value[newIndex]);
      } else {
        activeFile.value = null;
      }
    }
  }
};

const markFileAsModified = () => {
  if (activeFile.value) {
    activeFile.value.modified = true;
  }
};

const saveFile = async () => {
  if (!activeFile.value || savingFile.value) return;
  
  savingFile.value = true;
  try {
    await $fetch('/api/files/write', {
      method: 'POST',
      body: {
        path: activeFile.value.path,
        content: activeFile.value.content
      }
    });
    
    activeFile.value.modified = false;
    
    // Show success toast or notification
    console.log('File saved successfully:', activeFile.value.path);
  } catch (error) {
    console.error('Failed to save file:', error);
    fileError.value = `Failed to save: ${error.message}`;
  } finally {
    savingFile.value = false;
  }
};

const getFileIcon = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    ts: 'vscode-icons:file-type-typescript',
    tsx: 'vscode-icons:file-type-typescript',
    js: 'vscode-icons:file-type-js',
    jsx: 'vscode-icons:file-type-js',
    vue: 'vscode-icons:file-type-vue',
    json: 'vscode-icons:file-type-json',
    md: 'vscode-icons:file-type-markdown',
    css: 'vscode-icons:file-type-css',
    scss: 'vscode-icons:file-type-scss',
    html: 'vscode-icons:file-type-html',
    py: 'vscode-icons:file-type-python',
    yaml: 'vscode-icons:file-type-yaml',
    yml: 'vscode-icons:file-type-yaml'
  };
  
  return iconMap[ext || ''] || 'mdi:file';
};

// Keyboard shortcuts
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (activeFile.value?.modified) {
        saveFile();
      }
    }
  };
  
  window.addEventListener('keydown', handleKeydown);
  
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
});
</script>

<style scoped>
.explorer-editor {
  height: 100%;
  display: flex;
  overflow: hidden;
  background: var(--color-background);
}

.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

/* Editor Tabs */
.editor-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #1e1e1e;
  overflow-x: auto;
  flex-shrink: 0;
}

.editor-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: #2d2d30;
  border-right: 1px solid #252526;
  cursor: pointer;
  min-width: 120px;
  max-width: 200px;
  position: relative;
  user-select: none;
}

.editor-tab:hover {
  background: #37373d;
}

.editor-tab.active {
  background: #1e1e1e;
}

.tab-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #cccccc;
}

.tab-close {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: none;
  color: #858585;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s;
}

.editor-tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: #464647;
  color: #cccccc;
}

/* Editor Content */
.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.code-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  padding: 16px;
  background: #1e1e1e;
  color: #cccccc;
  border: none;
  outline: none;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  tab-size: 2;
}

.editor-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
}

.save-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #0e639c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.save-button:hover:not(:disabled) {
  background: #1177bb;
}

.save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Loading and Error States */
.loading-editor,
.error-editor,
.welcome-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #858585;
  gap: 16px;
}

.error-editor {
  color: #f48771;
}

.welcome-screen h2 {
  margin: 0;
  font-size: 20px;
  color: #cccccc;
}

.welcome-screen p {
  margin: 0;
  font-size: 14px;
}

/* Splitpanes overrides */
.splitpanes.default-theme .splitpanes__pane {
  background-color: #252526;
}

.splitpanes.default-theme .splitpanes__splitter {
  background-color: #3e3e42;
  border: none;
  width: 1px;
}

.splitpanes.default-theme .splitpanes__splitter:hover {
  background-color: #007acc;
}

.splitpanes--vertical > .splitpanes__splitter {
  cursor: ew-resize;
}

/* Animation */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>