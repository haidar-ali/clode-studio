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
                  <h2>Clode Studio</h2>
                  <p>Open a file to start editing</p>
                </div>
              </div>
            </Pane>

            <!-- Right Panel: Claude Terminal -->
            <Pane :size="30" :min-size="20" :max-size="40">
              <div class="panel terminal-panel" id="claude-terminal-full-ide">
                <!-- Claude terminals will be teleported here -->
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
              <button
                :class="{ active: bottomTab === 'context' }"
                @click="bottomTab = 'context'"
              >
                Context
                <span v-if="contextFilesCount > 0" class="context-badge">{{ contextFilesCount }}</span>
              </button>
              <button
                :class="{ active: bottomTab === 'knowledge' }"
                @click="bottomTab = 'knowledge'"
              >
                Knowledge
              </button>
              <button
                :class="{ active: bottomTab === 'commands' }"
                @click="bottomTab = 'commands'"
              >
                <Icon name="mdi:slash-forward" size="16" />
                Commands
              </button>
              <button
                :class="{ active: bottomTab === 'prompts' }"
                @click="bottomTab = 'prompts'"
              >
                <Icon name="heroicons:sparkles" size="16" />
                Prompts
              </button>
              <button
                :class="{ active: bottomTab === 'source-control' }"
                @click="bottomTab = 'source-control'"
              >
                <Icon name="mdi:source-branch" size="16" />
                Source Control
              </button>
              <button
                :class="{ active: bottomTab === 'checkpoints' }"
                @click="bottomTab = 'checkpoints'"
              >
                <Icon name="mdi:history" size="16" />
                Checkpoints
              </button>
              <button
                :class="{ active: bottomTab === 'worktrees' }"
                @click="bottomTab = 'worktrees'"
              >
                <Icon name="mdi:source-branch-fork" size="16" />
                Worktrees
              </button>
            </div>
            <div class="tab-content">
              <KanbanBoard v-if="bottomTab === 'tasks'" />
              <Terminal v-else-if="bottomTab === 'terminal'" :project-path="projectPath" />
              <MCPManager v-else-if="bottomTab === 'mcp'" />
              <ContextPanel v-else-if="bottomTab === 'context'" />
              <KnowledgePanel v-else-if="bottomTab === 'knowledge'" />
              <CommandStudio v-else-if="bottomTab === 'commands'" />
              <PromptStudio v-else-if="bottomTab === 'prompts'" />
              <SourceControlPanel v-else-if="bottomTab === 'source-control'" />
              <CheckpointPanel v-else-if="bottomTab === 'checkpoints'" />
              <WorktreePanel v-else />
            </div>
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <!-- Kanban + Claude Mode -->
    <div v-else-if="layoutStore.isKanbanClaudeMode" class="layout-kanban-claude">
      <Splitpanes horizontal class="default-theme">
        <!-- Top Section: Kanban and Claude -->
        <Pane :size="60" :min-size="40" :max-size="80">
          <Splitpanes>
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
              <div class="panel terminal-panel" id="claude-terminal-kanban-claude">
                <!-- Claude terminals will be teleported here -->
              </div>
            </Pane>
          </Splitpanes>
        </Pane>
        
        <!-- Bottom Section: Full-width Tasks/Terminal -->
        <Pane :size="40" :min-size="20" :max-size="60">
          <div class="panel bottom-panel">
            <div class="tabs">
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
              <button
                :class="{ active: bottomTab === 'context' }"
                @click="bottomTab = 'context'"
              >
                Context
                <span v-if="contextFilesCount > 0" class="context-badge">{{ contextFilesCount }}</span>
              </button>
              <button
                :class="{ active: bottomTab === 'knowledge' }"
                @click="bottomTab = 'knowledge'"
              >
                Knowledge
              </button>
              <button
                :class="{ active: bottomTab === 'commands' }"
                @click="bottomTab = 'commands'"
              >
                <Icon name="mdi:slash-forward" size="16" />
                Commands
              </button>
              <button
                :class="{ active: bottomTab === 'prompts' }"
                @click="bottomTab = 'prompts'"
              >
                <Icon name="heroicons:sparkles" size="16" />
                Prompts
              </button>
              <button
                :class="{ active: bottomTab === 'source-control' }"
                @click="bottomTab = 'source-control'"
              >
                <Icon name="mdi:source-branch" size="16" />
                Source Control
              </button>
              <button
                :class="{ active: bottomTab === 'checkpoints' }"
                @click="bottomTab = 'checkpoints'"
              >
                <Icon name="mdi:history" size="16" />
                Checkpoints
              </button>
              <button
                :class="{ active: bottomTab === 'worktrees' }"
                @click="bottomTab = 'worktrees'"
              >
                <Icon name="mdi:source-branch-fork" size="16" />
                Worktrees
              </button>
            </div>
            <div class="tab-content">
              <KanbanBoard v-if="bottomTab === 'tasks'" />
              <Terminal v-else-if="bottomTab === 'terminal'" :project-path="projectPath" />
              <MCPManager v-else-if="bottomTab === 'mcp'" />
              <ContextPanel v-else-if="bottomTab === 'context'" />
              <KnowledgePanel v-else-if="bottomTab === 'knowledge'" />
              <CommandStudio v-else-if="bottomTab === 'commands'" />
              <PromptStudio v-else-if="bottomTab === 'prompts'" />
              <SourceControlPanel v-else-if="bottomTab === 'source-control'" />
              <CheckpointPanel v-else-if="bottomTab === 'checkpoints'" />
              <WorktreePanel v-else />
            </div>
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <!-- Kanban Only Mode -->
    <div v-else-if="layoutStore.isKanbanOnlyMode" class="layout-kanban-only">
      <Splitpanes horizontal class="default-theme">
        <!-- Top Section: Kanban Board -->
        <Pane :size="60" :min-size="40" :max-size="80">
          <div class="panel kanban-panel">
            <div class="panel-header">
              <h3>Task Management</h3>
            </div>
            <KanbanBoard />
          </div>
        </Pane>
        
        <!-- Bottom Section: Full-width Tasks/Terminal -->
        <Pane :size="40" :min-size="20" :max-size="60">
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
              <button
                :class="{ active: bottomTab === 'context' }"
                @click="bottomTab = 'context'"
              >
                Context
                <span v-if="contextFilesCount > 0" class="context-badge">{{ contextFilesCount }}</span>
              </button>
              <button
                :class="{ active: bottomTab === 'knowledge' }"
                @click="bottomTab = 'knowledge'"
              >
                Knowledge
              </button>
              <button
                :class="{ active: bottomTab === 'commands' }"
                @click="bottomTab = 'commands'"
              >
                <Icon name="mdi:slash-forward" size="16" />
                Commands
              </button>
              <button
                :class="{ active: bottomTab === 'prompts' }"
                @click="bottomTab = 'prompts'"
              >
                <Icon name="heroicons:sparkles" size="16" />
                Prompts
              </button>
              <button
                :class="{ active: bottomTab === 'source-control' }"
                @click="bottomTab = 'source-control'"
              >
                <Icon name="mdi:source-branch" size="16" />
                Source Control
              </button>
              <button
                :class="{ active: bottomTab === 'checkpoints' }"
                @click="bottomTab = 'checkpoints'"
              >
                <Icon name="mdi:history" size="16" />
                Checkpoints
              </button>
              <button
                :class="{ active: bottomTab === 'worktrees' }"
                @click="bottomTab = 'worktrees'"
              >
                <Icon name="mdi:source-branch-fork" size="16" />
                Worktrees
              </button>
            </div>
            <div class="tab-content">
              <KanbanBoard v-if="bottomTab === 'tasks'" />
              <Terminal v-else-if="bottomTab === 'terminal'" :project-path="projectPath" />
              <MCPManager v-else-if="bottomTab === 'mcp'" />
              <ContextPanel v-else-if="bottomTab === 'context'" />
              <KnowledgePanel v-else-if="bottomTab === 'knowledge'" />
              <CommandStudio v-else-if="bottomTab === 'commands'" />
              <PromptStudio v-else-if="bottomTab === 'prompts'" />
              <SourceControlPanel v-else-if="bottomTab === 'source-control'" />
              <CheckpointPanel v-else-if="bottomTab === 'checkpoints'" />
              <WorktreePanel v-else />
            </div>
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <StatusBar />
    
    <!-- Global Search Modal (only in Full IDE mode) -->
    <GlobalSearch 
      v-if="layoutStore.isFullIdeMode" 
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
    
    <!-- Persistent Claude Terminals (rendered once, teleported to appropriate location) -->
    <ClientOnly>
      <Teleport :to="claudeTerminalTarget" :disabled="!claudeTerminalTarget">
        <ClaudeTerminalTabs v-if="shouldShowClaude" />
      </Teleport>
    </ClientOnly>
    
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';
import { useLayoutStore } from '~/stores/layout';
import { useMCPStore } from '~/stores/mcp';
import { useFileWatcher } from '~/composables/useFileWatcher';
import { useTasksFileWatcher } from '~/composables/useTasksFileWatcher';
import { useContextManager } from '~/composables/useContextManager';
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
import SourceControlPanel from '~/components/SourceControl/SourceControlPanel.vue';
import CheckpointPanel from '~/components/Checkpoint/CheckpointPanel.vue';
import WorktreePanel from '~/components/Worktree/WorktreePanel.vue';

const editorStore = useEditorStore();
const tasksStore = useTasksStore();
const layoutStore = useLayoutStore();
const mcpStore = useMCPStore();
const contextManager = useContextManager();
const commandsStore = useCommandsStore();
const bottomTab = ref<'tasks' | 'terminal' | 'mcp' | 'context' | 'knowledge' | 'prompts' | 'commands' | 'source-control' | 'checkpoints' | 'worktrees'>('tasks');
const showGlobalSearch = ref(false);

const activeTab = computed(() => editorStore.activeTab);
const taskCount = computed(() => tasksStore.taskCount);
const projectPath = computed(() => tasksStore.projectPath);
const contextFilesCount = computed(() => contextManager.statistics.value?.totalFiles || 0);

// Computed properties for Claude Terminal persistence
const shouldShowClaude = computed(() => {
  return layoutStore.isFullIdeMode || layoutStore.isKanbanClaudeMode;
});

const claudeTerminalTarget = computed(() => {
  if (layoutStore.isFullIdeMode) {
    return '#claude-terminal-full-ide';
  } else if (layoutStore.isKanbanClaudeMode) {
    return '#claude-terminal-kanban-claude';
  }
  return null;
});

// Set up file watching
useFileWatcher();
// Set up TASKS.md watching
useTasksFileWatcher();
// Set up auto-checkpoint
const { useAutoCheckpoint } = await import('~/composables/useAutoCheckpoint');
useAutoCheckpoint();

const handleResize = (event: any) => {
  // Handle resize events if needed
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
      console.log('Context initialized for workspace:', newPath);
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

// Watch for layout mode changes to adjust bottomTab
watch(() => layoutStore.isKanbanClaudeMode, (isKanbanClaude) => {
  if (isKanbanClaude && bottomTab.value === 'tasks') {
    // In Kanban + Claude mode, Tasks tab is not available
    // Switch to terminal tab instead
    bottomTab.value = 'context';
  }
});

onMounted(async () => {
  // Initialize command store
  await commandsStore.initialize();
  
  // Load saved layout mode
  layoutStore.loadSavedMode();
  
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('open-global-search', handleOpenGlobalSearch);
  window.addEventListener('switch-bottom-tab', handleSwitchBottomTab as EventListener);
  
  // Listen for command-triggered events
  window.addEventListener('show-tasks-panel', () => {
    bottomTab.value = 'tasks';
  });
  
  window.addEventListener('show-mcp-panel', () => {
    bottomTab.value = 'mcp';
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
</style>