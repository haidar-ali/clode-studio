<template>
  <div class="ide-container">
    <!-- Mode Selector -->
    <ModeSelector />
    
    <!-- Worktree Tab Bar -->
    <WorktreeTabBar />
    
    <!-- New Three-Dock Layout System -->
    <div class="ide-with-activity-bar">
      <ActivityBar />
      
      <div class="ide-main-content">
        <!-- Simplified Three-Dock System -->
        <div class="layout-three-dock">
          <!-- Layout without bottom panel when minimized -->
          <div v-if="layoutStore.bottomPanelMinimized" class="main-content-full" key="minimized-layout">
            <Splitpanes 
              class="default-theme" 
              @ready="onSplitpanesReady"
            >
              <!-- Left Dock - Always visible, expands when right is hidden -->
              <Pane 
                :size="layoutStore.rightSidebarVisible ? 70 : 100" 
                :min-size="50"
              >
                <LeftDock />
              </Pane>

              <!-- Right Dock - Can be hidden -->
              <Pane 
                v-if="layoutStore.rightSidebarVisible || dragDropState?.isDragging"
                :size="30" 
                :min-size="20" 
                :max-size="50"
              >
                <RightSidebar v-if="layoutStore.rightSidebarVisible && layoutStore.dockConfig.rightDock.length > 0" />
                <RightDockShadow v-else />
              </Pane>
            </Splitpanes>
            
            <!-- Minimized Bottom Dock -->
            <div class="bottom-dock-minimized" :style="{ left: layoutStore.activityBarCollapsed ? '0' : '48px' }">
              <BottomDock />
            </div>
          </div>
          
          <!-- Layout with bottom panel when expanded -->
          <Splitpanes v-else horizontal class="default-theme" key="expanded-layout" @ready="onSplitpanesReady">
            <!-- Main Content Area -->
            <Pane 
              :size="100 - layoutStore.bottomPanelHeight" 
              :min-size="50" 
              :max-size="85"
            >
              <Splitpanes 
                class="default-theme" 
                @ready="onSplitpanesReady"
              >
                <!-- Left Dock - Always visible, expands when right is hidden -->
                <Pane 
                  :size="layoutStore.rightSidebarVisible ? 70 : 100" 
                  :min-size="50"
                >
                  <LeftDock />
                </Pane>

                <!-- Right Dock - Can be hidden -->
                <Pane 
                  v-if="layoutStore.rightSidebarVisible || dragDropState?.isDragging"
                  :size="30" 
                  :min-size="20" 
                  :max-size="50"
                >
                  <RightSidebar v-if="layoutStore.rightSidebarVisible && layoutStore.dockConfig.rightDock.length > 0" />
                  <RightDockShadow v-else />
                </Pane>
              </Splitpanes>
            </Pane>

            <!-- Bottom Dock -->
            <Pane 
              v-if="layoutStore.dockConfig.bottomDock.length > 0"
              :size="layoutStore.bottomPanelHeight" 
              :min-size="15" 
              :max-size="50"
            >
              <BottomDock />
            </Pane>
          </Splitpanes>
        </div>

    <StatusBar />
    
    <!-- Global Search Modal -->
    <GlobalSearch 
      :is-open="showGlobalSearch" 
      @close="showGlobalSearch = false" 
    />
    
    
    <!-- Command Palette -->
    <CommandPalette 
      :is-open="commandsStore.isCommandPaletteOpen"
      @close="commandsStore.closeCommandPalette()"
    />
    
    <!-- Memory Editor Modal -->
    <MemoryEditorModal />
    
    <!-- Context Status Modal -->
    <ContextStatusModal />
    
    <!-- Session Browser Modal -->
    <SessionBrowserModal />
    
    <!-- Hook Manager Modal -->
    <HookManagerModal />
    
    <!-- Settings Modal -->
    <SettingsModal />
    
    <!-- MCP Manager Modal -->
    <MCPManagerModal v-model="showMCPModal" />
    
    <!-- Command Studio Modal -->
    <CommandStudioModal v-model="showCommandsModal" />
    
    <!-- Claude terminals are now handled by the dock system, no teleport needed -->
    
    <!-- Global Input Modal -->
    <InputModal />
    
    <!-- Drag Indicator -->
    <DragIndicator />
    
      </div> <!-- ide-main-content -->
    </div> <!-- ide-with-activity-bar -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';
import { useLayoutStore } from '~/stores/layout';
import { useMCPStore } from '~/stores/mcp';
import { useFileWatcher } from '~/composables/useFileWatcher';
import { useTasksFileWatcher } from '~/composables/useTasksFileWatcher';
import { useContextManager } from '~/composables/useContextManager';
import { useSnapshotTriggers } from '~/composables/useSnapshotTriggers';
import { useCommandsStore } from '~/stores/commands';
import CommandPalette from '~/components/Commands/CommandPalette.vue';
import MemoryEditorModal from '~/components/Memory/MemoryEditorModal.vue';
import ContextStatusModal from '~/components/Context/ContextStatusModal.vue';
import SessionBrowserModal from '~/components/Sessions/SessionBrowserModal.vue';
import HookManagerModal from '~/components/Hooks/HookManagerModal.vue';
import SettingsModal from '~/components/Settings/SettingsModal.vue';
import KnowledgePanel from '~/components/Knowledge/KnowledgePanel.vue';
import CommandStudio from '~/components/Commands/CommandStudio.vue';
import PromptStudio from '~/components/Prompts/PromptStudio.vue';
import InputModal from '~/components/Common/InputModal.vue';
import WorktreePanel from '~/components/Worktree/WorktreePanel.vue';
import WorktreeTabBar from '~/components/Layout/WorktreeTabBar.vue';
import SourceControlV2 from '~/components/SourceControlV2/SourceControlV2.vue';
import MCPManagerModal from '~/components/MCP/MCPManagerModal.vue';
import CommandStudioModal from '~/components/Commands/CommandStudioModal.vue';
import ActivityBar from '~/components/Layout/ActivityBar.vue';
import LeftDock from '~/components/Layout/LeftDock.vue';
import RightSidebar from '~/components/Layout/RightSidebar.vue';
import RightDockShadow from '~/components/Layout/RightDockShadow.vue';
import BottomDock from '~/components/Layout/BottomDock.vue';
import DragIndicator from '~/components/Layout/DragIndicator.vue';
import GlobalSearch from '~/components/Search/GlobalSearch.vue';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';

const editorStore = useEditorStore();
const tasksStore = useTasksStore();
const layoutStore = useLayoutStore();
const mcpStore = useMCPStore();
const contextManager = useContextManager();
const commandsStore = useCommandsStore();
const snapshotTriggers = useSnapshotTriggers();
const { dragDropState } = useModuleDragDrop();
const bottomTab = ref<'tasks' | 'terminal' | 'context' | 'knowledge' | 'prompts' | 'source-control' | 'worktrees'>('tasks');
const showGlobalSearch = ref(false);
const showMCPModal = ref(false);
const showCommandsModal = ref(false);

const taskCount = computed(() => tasksStore.taskCount);
const projectPath = computed(() => tasksStore.projectPath);
const contextFilesCount = computed(() => contextManager.statistics.value?.totalFiles || 0);

// Set up file watching
useFileWatcher();
// Set up TASKS.md watching
useTasksFileWatcher();


const handleResize = (event: any) => {
  // Handle resize events if needed
};

// Prevent splitpanes errors on ready
const onSplitpanesReady = () => {
  // Do nothing - just prevent errors
};



// Global keyboard shortcuts
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + Shift + F for global search
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
    event.preventDefault();
    event.stopPropagation();
    showGlobalSearch.value = true;
  }
  
  // Ctrl/Cmd + K for command palette (handle here as backup)
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    event.stopPropagation();
    commandsStore.openCommandPalette();
  }
};

// Handle custom event from FileTree
const handleOpenGlobalSearch = () => {
  showGlobalSearch.value = true;
};

// Handle bottom tab switching
const handleSwitchBottomTab = (event: CustomEvent) => {
  if (event.detail?.tab) {
    bottomTab.value = event.detail.tab;
  }
};

// Initialize context when workspace changes
let contextInitialized = false;
watch(projectPath, async (newPath) => {
  if (newPath && !contextInitialized) {
    try {
      await contextManager.initialize(newPath);
      contextInitialized = true;
      
    } catch (error) {
      console.error('Failed to initialize context:', error);
    }
  }
}, { immediate: true });

// Reset flag when project path changes to a different value
watch(projectPath, (newPath, oldPath) => {
  if (newPath !== oldPath && oldPath) {
    contextInitialized = false;
  }
});


onMounted(async () => {
  // Initialize command store
  await commandsStore.initialize();
  
  // Load saved layout configuration
  layoutStore.loadLayoutConfig();
  
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('open-global-search', handleOpenGlobalSearch);
  window.addEventListener('switch-bottom-tab', handleSwitchBottomTab as EventListener);
  
  // Handle module switching from activity bar
  window.addEventListener('module-switch', (event: Event) => {
    const customEvent = event as CustomEvent;
    const moduleId = customEvent.detail?.moduleId;
    if (moduleId) {
      // For now, just log it - we'll implement the logic to show/focus the module
    
    }
  });
  
  // Listen for command-triggered events
  window.addEventListener('show-tasks-panel', () => {
    bottomTab.value = 'tasks';
  });
  
  
  window.addEventListener('show-knowledge-panel', () => {
    bottomTab.value = 'knowledge';
  });
  
  window.addEventListener('show-prompts-panel', () => {
    bottomTab.value = 'prompts';
  });
  
  window.addEventListener('show-context-modal', () => {
    const contextModal = document.querySelector('.context-status-modal');
    if (contextModal) {
      contextModal.dispatchEvent(new Event('open'));
    }
  });
  
  // Modal event listeners
  window.addEventListener('open-mcp-manager', () => {
    showMCPModal.value = true;
  });
  
  window.addEventListener('open-slash-commands', () => {
    showCommandsModal.value = true;
  });
  
  // Save workspace configuration before app closes
  window.addEventListener('beforeunload', async () => {
    const { useWorkspaceManager } = await import('~/composables/useWorkspaceManager');
    const { currentWorkspacePath } = useWorkspaceManager();
    const { useClaudeInstancesStore } = await import('~/stores/claude-instances');
    const claudeInstancesStore = useClaudeInstancesStore();
    
    if (currentWorkspacePath.value) {
      await claudeInstancesStore.saveWorkspaceConfiguration(currentWorkspacePath.value);
    }
  });
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('open-global-search', handleOpenGlobalSearch);
  window.removeEventListener('switch-bottom-tab', handleSwitchBottomTab as EventListener);
  window.removeEventListener('open-mcp-manager', () => {
    showMCPModal.value = true;
  });
  window.removeEventListener('open-slash-commands', () => {
    showCommandsModal.value = true;
  });
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

.context-badge {
  background: #d4af37;
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

/* Terminal panel styling */
.terminal-panel {
  position: relative;
}



.loading-terminal {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  font-style: italic;
}

/* Claude Terminal Container */
#claude-terminal-full-ide,
#claude-terminal-kanban-claude {
  height: 100%;
  overflow: hidden;
}

/* Activity Bar Layout */
.ide-with-activity-bar {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.ide-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Three-Dock Layout */
.layout-three-dock {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.editor-container .monaco-wrapper {
  flex: 1;
  min-height: 0;
}


/* Main content full height when bottom minimized */
.main-content-full {
  height: 100%;
  position: relative;
}

/* Fix splitpanes for new layout */
.layout-three-dock :deep(.splitpanes__pane) {
  overflow: hidden;
}

.layout-three-dock :deep(.splitpanes--vertical > .splitpanes__splitter) {
  width: 4px;
  background-color: #1e1e1e;
}

.layout-three-dock :deep(.splitpanes--horizontal > .splitpanes__splitter) {
  height: 4px;
  background-color: #1e1e1e;
}

/* Minimized bottom dock */
.bottom-dock-minimized {
  position: fixed;
  bottom: 22px; /* Above status bar */
  left: 0;
  right: 0;
  z-index: 100;
  pointer-events: none; /* Prevent interaction with underlying elements */
}

/* Allow interaction with the dock itself */
.bottom-dock-minimized :deep(.bottom-dock) {
  pointer-events: all;
}

</style>