<template>
  <div class="ide-container" :class="layoutStore.layoutClasses">
    <!-- Mode Selector -->
    <ModeSelector />

    <!-- Full IDE Mode -->
    <div v-if="layoutStore.isFullIdeMode" class="layout-full-ide">
      <Splitpanes horizontal class="default-theme">
        <!-- Top Section: Editor and Panels -->
        <Pane :size="50" :min-size="30" :max-size="70">
          <Splitpanes @resize="handleResize">
            <!-- Left Panel: File Explorer -->
            <Pane :size="20" :min-size="15" :max-size="30">
              <div class="panel file-explorer-panel">
                <div class="panel-header">
                  <h3>Explorer</h3>
                </div>
                <FileTree />
              </div>
            </Pane>

            <!-- Center Panel: Editor -->
            <Pane :size="50" :min-size="30">
              <div class="panel editor-panel">
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
            </Pane>

            <!-- Right Panel: Claude Terminal -->
            <Pane :size="30" :min-size="20" :max-size="40">
              <div class="panel terminal-panel">
                <ClaudeTerminal />
              </div>
            </Pane>
          </Splitpanes>
        </Pane>

        <!-- Bottom Section: Full-width Tasks/Terminal -->
        <Pane :size="50" :min-size="30" :max-size="70">
          <div class="panel bottom-panel">
            <div class="tabs">
              <button
                :class="{ active: bottomTab === 'tasks' }"
                @click="bottomTab = 'tasks'"
              >
                Tasks
                <span v-if="taskCount.todo > 0" class="task-badge">{{ taskCount.todo }}</span>
              </button>
              <button
                :class="{ active: bottomTab === 'terminal' }"
                @click="bottomTab = 'terminal'"
              >
                Terminal
              </button>
              <button
                :class="{ active: bottomTab === 'mcp' }"
                @click="bottomTab = 'mcp'"
              >
                MCP
                <span v-if="mcpStore.connectedCount > 0" class="mcp-badge">{{ mcpStore.connectedCount }}</span>
              </button>
            </div>
            <div class="tab-content">
              <KanbanBoard v-if="bottomTab === 'tasks'" />
              <Terminal v-else-if="bottomTab === 'terminal'" :project-path="projectPath" />
              <MCPManager v-else />
            </div>
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <!-- Kanban + Claude Mode -->
    <div v-else-if="layoutStore.isKanbanClaudeMode" class="layout-kanban-claude">
      <Splitpanes class="default-theme">
        <!-- Left Panel: Kanban Board -->
        <Pane :size="layoutStore.kanbanClaudeSplit" :min-size="60" :max-size="85">
          <div class="panel kanban-panel">
            <div class="panel-header">
              <h3>Task Management</h3>
            </div>
            <KanbanBoard />
          </div>
        </Pane>

        <!-- Right Panel: Claude Terminal -->
        <Pane :size="100 - layoutStore.kanbanClaudeSplit" :min-size="15" :max-size="40">
          <div class="panel terminal-panel">
            <ClaudeTerminal />
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <!-- Kanban Only Mode -->
    <div v-else-if="layoutStore.isKanbanOnlyMode" class="layout-kanban-only">
      <div class="panel kanban-panel">
        <div class="panel-header">
          <h3>Task Management</h3>
        </div>
        <KanbanBoard />
      </div>
    </div>

    <StatusBar />
    
    <!-- Global Search Modal (only in Full IDE mode) -->
    <GlobalSearch 
      v-if="layoutStore.isFullIdeMode" 
      :is-open="showGlobalSearch" 
      @close="showGlobalSearch = false" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';
import { useLayoutStore } from '~/stores/layout';
import { useMCPStore } from '~/stores/mcp';
import { useFileWatcher } from '~/composables/useFileWatcher';
import { useTasksFileWatcher } from '~/composables/useTasksFileWatcher';

const editorStore = useEditorStore();
const tasksStore = useTasksStore();
const layoutStore = useLayoutStore();
const mcpStore = useMCPStore();
const bottomTab = ref<'tasks' | 'terminal' | 'mcp'>('tasks');
const showGlobalSearch = ref(false);

const activeTab = computed(() => editorStore.activeTab);
const taskCount = computed(() => tasksStore.taskCount);
const projectPath = computed(() => tasksStore.projectPath);

// Set up file watching
useFileWatcher();
// Set up TASKS.md watching
useTasksFileWatcher();

const handleResize = (event: any) => {
  // Handle resize events if needed
};

// Global keyboard shortcuts
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + Shift + F for global search
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
    event.preventDefault();
    event.stopPropagation();
    console.log('Opening global search...');
    showGlobalSearch.value = true;
  }
};

// Handle custom event from FileTree
const handleOpenGlobalSearch = () => {
  showGlobalSearch.value = true;
};

onMounted(() => {
  // Load saved layout mode
  layoutStore.loadSavedMode();
  
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('open-global-search', handleOpenGlobalSearch);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('open-global-search', handleOpenGlobalSearch);
});
</script>

<style scoped>
.ide-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  border: 1px solid #181818;
}

.panel-header {
  padding: 8px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
}

.panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: normal;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

.tabs {
  display: flex;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
}

.tabs button {
  padding: 8px 16px;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 2px solid transparent;
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tabs button:hover {
  background: #3e3e42;
}

.tabs button.active {
  color: #ffffff;
  border-bottom-color: #007acc;
}

.task-badge {
  background: #007acc;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  font-weight: 600;
}

.mcp-badge {
  background: #4ec9b0;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  font-weight: 600;
}

.tab-content {
  flex: 1;
  overflow: hidden;
}

.terminal-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
}

.editor-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-panel .monaco-wrapper {
  flex: 1;
  min-height: 0;
}

.loading-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  font-style: italic;
}

.bottom-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.bottom-panel .tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Layout Mode Specific Styles */
.layout-full-ide {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 1px); /* Prevent growing beyond viewport */
  overflow: hidden;
}

.layout-kanban-claude {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 1px);
  overflow: hidden;
}

.layout-kanban-only {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 1px);
  overflow: hidden;
}

.layout-kanban-only .kanban-panel {
  height: 100%;
}

.kanban-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  border: 1px solid #181818;
}

.kanban-panel .panel-header {
  padding: 8px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  flex-shrink: 0;
}

.kanban-panel .panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: normal;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #cccccc;
}
</style>