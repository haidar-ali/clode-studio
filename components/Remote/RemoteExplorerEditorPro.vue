<template>
  <div class="explorer-editor-pro" :class="{ 'mobile-mode': isMobile }">
    <!-- Mobile Mode: Single panel view -->
    <div v-if="isMobile" class="mobile-container">
      <!-- Mobile Header with toggle -->
      <div class="mobile-header">
        <button @click="showExplorer = !showExplorer" class="toggle-btn">
          <Icon :name="showExplorer ? 'mdi:file-code' : 'mdi:folder-open'" size="20" />
          <span>{{ showExplorer ? 'Editor' : 'Files' }}</span>
        </button>
        <div class="current-file" v-if="!showExplorer && activeTab">
          <span>{{ activeTab.name }}</span>
        </div>
      </div>
      
      <!-- Explorer or Editor -->
      <div class="mobile-content">
        <SimpleFileExplorer v-if="showExplorer" @file-open="handleMobileFileOpen" />
        <div v-else class="editor-container">
          <!-- Reuse EditorTabs from desktop -->
          <EditorTabs />
          
          <!-- Reuse CodeMirrorWrapper from desktop -->
          <ClientOnly>
            <CodeMirrorWrapper v-if="activeTab" />
            <template #fallback>
              <div class="loading-editor">
                <Icon name="mdi:loading" class="animate-spin" />
                <p>Loading editor...</p>
              </div>
            </template>
          </ClientOnly>
          
          <!-- Welcome Screen when no tabs -->
          <div v-if="!activeTab" class="welcome-screen">
            <Icon name="mdi:file-code-outline" size="48" />
            <h2>Remote Code Editor</h2>
            <p>Select a file from the explorer to start editing</p>
            <div class="features-list">
              <div class="feature">
                <Icon name="mdi:palette" /> Syntax Highlighting
              </div>
              <div class="feature">
                <Icon name="mdi:code-tags" /> IntelliSense
              </div>
              <div class="feature">
                <Icon name="mdi:magnify" /> Find & Replace
              </div>
              <div class="feature">
                <Icon name="mdi:robot" /> AI Assistance
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Desktop Mode: Split view -->
    <Splitpanes v-else class="default-theme" @ready="onSplitpanesReady">
      <!-- Explorer Pane -->
      <Pane :size="explorerSize" :min-size="15" :max-size="50">
        <SimpleFileExplorer @file-open="handleFileOpen" />
      </Pane>
      
      <!-- Editor Pane -->
      <Pane :size="100 - explorerSize">
        <div class="editor-container">
          <!-- Reuse EditorTabs from desktop -->
          <EditorTabs />
          
          <!-- Reuse CodeMirrorWrapper from desktop -->
          <ClientOnly>
            <CodeMirrorWrapper v-if="activeTab" />
            <template #fallback>
              <div class="loading-editor">
                <Icon name="mdi:loading" class="animate-spin" />
                <p>Loading editor...</p>
              </div>
            </template>
          </ClientOnly>
          
          <!-- Welcome Screen when no tabs -->
          <div v-if="!activeTab" class="welcome-screen">
            <Icon name="mdi:file-code-outline" size="48" />
            <h2>Remote Code Editor</h2>
            <p>Select a file from the explorer to start editing</p>
            <div class="features-list">
              <div class="feature">
                <Icon name="mdi:palette" /> Syntax Highlighting
              </div>
              <div class="feature">
                <Icon name="mdi:code-tags" /> IntelliSense
              </div>
              <div class="feature">
                <Icon name="mdi:magnify" /> Find & Replace
              </div>
              <div class="feature">
                <Icon name="mdi:robot" /> AI Assistance
              </div>
            </div>
          </div>
        </div>
      </Pane>
    </Splitpanes>
    
    <!-- Code Generation Modal (reuse from desktop) -->
    <CodeGenerationModal 
      ref="codeGenerationModal"
      @accept="handleAcceptGeneratedCode"
    />
    
    <!-- Ghost Text Indicator (reuse from desktop) -->
    <GhostTextFloatingIndicator />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import SimpleFileExplorer from '~/components/FileExplorer/SimpleFileExplorer.vue';
import EditorTabs from '~/components/Editor/EditorTabs.vue';
import CodeMirrorWrapper from '~/components/Editor/CodeMirrorWrapper.vue';
import CodeGenerationModal from '~/components/Editor/CodeGenerationModal.vue';
import GhostTextFloatingIndicator from '~/components/Editor/GhostTextFloatingIndicator.vue';
import { useEditorStore } from '~/stores/editor';
import { useAdaptiveUI } from '~/composables/useAdaptiveUI';

const editorStore = useEditorStore();
const { isMobile } = useAdaptiveUI();
const explorerSize = ref(25); // 25% for explorer by default
const activeTab = computed(() => editorStore.activeTab);
const codeGenerationModal = ref();
const showExplorer = ref(true); // On mobile, start with explorer visible

const onSplitpanesReady = () => {
  // Splitpanes ready callback
};

const handleMobileFileOpen = async (file: { name: string; path: string; isDirectory: boolean }) => {
  if (file.isDirectory) return;
  
  await handleFileOpen(file);
  // On mobile, switch to editor view after opening a file
  showExplorer.value = false;
};

const handleFileOpen = async (file: { name: string; path: string; isDirectory: boolean }) => {
  if (file.isDirectory) return;
  
  // In remote mode, we need to load the file content first, then open it
  // The desktop openFile method expects to read from filesystem, but we need to provide content
  
  try {
    // Check if file is already open
    const existingTab = editorStore.tabs.find(tab => tab.path === file.path);
    if (existingTab) {
      editorStore.setActiveTab(existingTab.id);
      return;
    }
    
    // Load file content from server
    const response = await $fetch('/api/files/read', {
      query: { path: file.path }
    });
    
    const content = response.content || '';
    
    // Manually create a tab since we're in remote mode
    const tabId = `tab-${Date.now()}`;
    const newTab = {
      id: tabId,
      path: file.path,
      name: file.name,
      content: content,
      language: getLanguageFromFile(file.name),
      isDirty: false,
      isTemporary: false
    };
    
    // Add tab directly to the store's state
    editorStore.tabs.push(newTab);
    editorStore.setActiveTab(tabId);
    
  } catch (error) {
    console.error('Failed to load file:', error);
    // Could show a toast notification here
  }
};

const handleAcceptGeneratedCode = (generatedCode: string) => {
  if (!activeTab.value) return;
  
  // Update the active tab's content
  editorStore.updateTabContent(activeTab.value.id, generatedCode);
};

const getLanguageFromFile = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    vue: 'vue',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    html: 'html',
    xml: 'xml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    cmake: 'cmake'
  };
  
  return languageMap[ext || ''] || 'text';
};

// Set up keyboard shortcuts
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (activeTab.value?.isDirty) {
        saveCurrentFile();
      }
    }
    
    // Cmd/Ctrl + P for code generation
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      if (activeTab.value) {
        codeGenerationModal.value?.open(activeTab.value.content || '');
      }
    }
  };
  
  window.addEventListener('keydown', handleKeydown);
  
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
});

// Save file function
const saveCurrentFile = async () => {
  if (!activeTab.value) return;
  
  try {
    await $fetch('/api/files/write', {
      method: 'POST',
      body: {
        path: activeTab.value.path,
        content: activeTab.value.content
      }
    });
    
    // Mark tab as clean by setting isDirty to false
    activeTab.value.isDirty = false;
    
    
  } catch (error) {
    console.error('Failed to save file:', error);
  }
};

// The editor will handle save through keyboard shortcuts (Cmd/Ctrl+S)
</script>

<style scoped>
.explorer-editor-pro {
  height: 100%;
  display: flex;
  overflow: hidden;
  background: #1e1e1e;
}

/* Mobile specific styles */
.mobile-mode {
  flex-direction: column;
}

.mobile-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  padding: 8px 12px;
  min-height: 40px;
  flex-shrink: 0;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.toggle-btn:active {
  transform: scale(0.95);
}

.toggle-btn:hover {
  background: #2a2d2e;
  border-color: #007acc;
}

.current-file {
  display: flex;
  align-items: center;
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
  padding-right: 8px;
}

.current-file span {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mobile-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mobile-content .editor-container {
  height: 100%;
}

.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

/* Welcome Screen */
.welcome-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #858585;
  gap: 16px;
  padding: 32px;
}

.welcome-screen h2 {
  margin: 0;
  font-size: 24px;
  color: #cccccc;
}

.welcome-screen p {
  margin: 0;
  font-size: 14px;
  color: #858585;
}

.features-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 24px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #252526;
  border-radius: 6px;
  font-size: 13px;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  transition: all 0.2s;
}

.feature:hover {
  background: #2d2d30;
  border-color: #007acc;
  transform: translateY(-2px);
}

.loading-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #858585;
  gap: 16px;
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