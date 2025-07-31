<template>
  <div class="explorer-editor-module" :class="{ 'explorer-hidden': !showExplorer }">
    <div class="module-container">
      <!-- Explorer Panel -->
      <div v-show="showExplorer" class="explorer-panel" :style="{ width: explorerWidth + '%' }">
        <div class="explorer-content">
          <FileTree />
        </div>
        <button 
          class="toggle-explorer-btn right" 
          @click="toggleExplorer"
          title="Hide Explorer"
        >
          <Icon name="mdi:chevron-left" />
        </button>
      </div>
      
      <!-- Splitter (only when explorer is shown) -->
      <div 
        v-show="showExplorer"
        class="splitter"
        @mousedown="startResize"
      ></div>
      
      <!-- Editor Panel -->
      <div class="editor-panel" :style="editorPanelStyle">
        <button 
          v-show="!showExplorer"
          class="toggle-explorer-btn show" 
          @click="toggleExplorer"
          title="Show Explorer"
        >
          <Icon name="mdi:chevron-right" />
        </button>
        <EditorTabs />
        <ClientOnly>
          <CodeMirrorWrapper v-if="activeTab" />
          <template #fallback>
            <div class="loading-editor">
              Loading editor...
            </div>
          </template>
        </ClientOnly>
        <div v-if="!activeTab" class="welcome-screen">
          <h2>Claude Code IDE</h2>
          <p>Open a file to start editing</p>
        </div>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEditorStore } from '~/stores/editor';
import FileTree from '~/components/FileExplorer/FileTree.vue';
import EditorTabs from '~/components/Editor/EditorTabs.vue';
import CodeMirrorWrapper from '~/components/Editor/CodeMirrorWrapper.vue';
import CodeGenerationModal from '~/components/Editor/CodeGenerationModal.vue';
import Icon from '~/components/Icon.vue';

const editorStore = useEditorStore();
const activeTab = computed(() => editorStore.activeTab);

// Explorer visibility and width state
const showExplorer = ref(true);
const explorerWidth = ref(25); // percentage
const isResizing = ref(false);

// Code generation modal ref
const codeGenerationModal = ref();

const toggleExplorer = () => {
  showExplorer.value = !showExplorer.value;
};

// Computed style for editor panel
const editorPanelStyle = computed(() => {
  if (!showExplorer.value) {
    return { width: '100%' };
  }
  return { width: `calc(100% - ${explorerWidth.value}% - 2px)` };
});

// Resize functionality
const startResize = (event: MouseEvent) => {
  isResizing.value = true;
  const startX = event.clientX;
  const startWidth = explorerWidth.value;
  const containerWidth = (event.target as HTMLElement).parentElement!.offsetWidth;
  
  const handleMouseMove = (e: MouseEvent) => {
    const diff = e.clientX - startX;
    const newWidth = startWidth + (diff / containerWidth) * 100;
    explorerWidth.value = Math.max(15, Math.min(40, newWidth));
  };
  
  const handleMouseUp = () => {
    isResizing.value = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

// Handle generated code acceptance
const handleAcceptGeneratedCode = (generatedCode: string) => {
  if (!activeTab.value) return;
  
  // Replace the entire content of the active tab
  editorStore.updateTabContent(activeTab.value.id, generatedCode);
};

// Event handler for opening code generation
const handleOpenCodeGeneration = () => {
  if (!activeTab.value) return;
  
  const content = activeTab.value.content || '';
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
.explorer-editor-module {
  height: 100%;
  background: #1e1e1e;
}

.module-container {
  height: 100%;
  display: flex;
  position: relative;
}

.explorer-panel {
  height: 100%;
  background: #252526;
  position: relative;
  overflow: hidden;
  min-width: 200px;
  flex-shrink: 0;
}

.explorer-content {
  height: 100%;
  overflow: hidden;
}

.splitter {
  width: 2px;
  background: #3c3c3c;
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
}

.splitter:hover {
  background: #007acc;
}

.editor-panel {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  position: relative;
  overflow: hidden;
}

.toggle-explorer-btn {
  position: absolute;
  bottom: 8px;
  width: 24px;
  height: 24px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  color: #858585;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 10;
  transition: all 0.2s;
  border-radius: 4px;
}

.toggle-explorer-btn.right {
  right: 8px;
}

.toggle-explorer-btn.show {
  left: 8px;
}

.toggle-explorer-btn:hover {
  background: #3e3e42;
  color: #cccccc;
}

.loading-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  font-style: italic;
}

.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
}

.welcome-screen h2 {
  font-size: 24px;
  margin-bottom: 8px;
}

/* When explorer is hidden */
.explorer-editor-module.explorer-hidden .module-container {
  display: block;
}

.explorer-editor-module.explorer-hidden .editor-panel {
  width: 100%;
}

/* Prevent selection while resizing */
body.resizing {
  user-select: none;
  cursor: col-resize !important;
}
</style>