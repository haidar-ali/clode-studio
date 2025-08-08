<template>
  <div 
    class="right-sidebar" 
    :class="{ 
      collapsed: !layoutStore.rightSidebarVisible,
      'drop-target': dragDropState.isDragging && canDropInDock('rightDock'),
      'drop-active': dragDropState.dropTarget === 'rightDock'
    }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div 
      class="sidebar-header"
      v-if="rightDockModules.length > 1"
    >
      <div class="dock-tabs">
        <button
          v-for="moduleId in rightDockModules"
          :key="moduleId"
          :class="['dock-tab', { 
            active: activeRightModule === moduleId,
            'dragging': dragDropState.isDragging && dragDropState.draggedModule === moduleId
          }]"
          @click="setActiveRightModule(moduleId)"
          :draggable="moduleId !== 'claude'"
          @dragstart="moduleId !== 'claude' && handleTabDragStart($event, moduleId)"
          @dragend="handleTabDragEnd"
          @contextmenu.prevent="showTabMenu($event, moduleId)"
        >
          <Icon :name="getModuleIcon(moduleId)" size="16" :style="{ color: getModuleColor(moduleId) }" />
          <span>{{ getModuleLabel(moduleId) }}</span>
        </button>
      </div>
    </div>
    
    <div class="sidebar-content">
      <component 
        :is="getModuleComponent(activeRightModule)" 
        v-if="activeRightModule"
        @file-opened="handleFileOpened"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onMounted, nextTick } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import { useEditorStore } from '~/stores/editor';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const editorStore = useEditorStore();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget, startDrag, endDrag } = useModuleDragDrop();

// Module components mapping - Using remote-compatible components
const moduleComponents = {
  claude: defineAsyncComponent(() => import('~/components/Remote/MobileClaudeXterm.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  snapshots: defineAsyncComponent(() => import('~/components/Snapshots/SnapshotsPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  terminal: defineAsyncComponent(() => import('~/components/Remote/MobileTerminalXterm.vue')),
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/SimpleFileExplorer.vue')),
  'explorer-editor': defineAsyncComponent(() => import('~/components/Remote/RemoteExplorerEditorPro.vue'))
};

// Module configuration for labels and icons
const moduleConfig: Record<ModuleId, { label: string; icon: string }> = {
  explorer: { label: 'Explorer', icon: 'mdi:folder-outline' },
  'explorer-editor': { label: 'Explorer + Editor', icon: 'mdi:file-code-outline' },
  terminal: { label: 'Terminal', icon: 'mdi:console' },
  tasks: { label: 'Tasks', icon: 'mdi:checkbox-marked-outline' },
  'source-control': { label: 'Source Control', icon: 'mdi:source-branch' },
  snapshots: { label: 'Snapshots', icon: 'mdi:camera' },
  worktrees: { label: 'Worktrees', icon: 'mdi:file-tree' },
  context: { label: 'Context', icon: 'mdi:brain' },
  knowledge: { label: 'Knowledge', icon: 'mdi:book-open-page-variant' },
  prompts: { label: 'Prompts', icon: 'mdi:lightning-bolt' },
  claude: { label: 'Claude AI', icon: 'simple-icons:anthropic' }
};

// Get modules in right dock
const rightDockModules = computed(() => layoutStore.dockConfig.rightDock);

// Active module from store
const activeRightModule = computed(() => layoutStore.activeRightModule);

// Module helpers
const getModuleLabel = (moduleId: ModuleId) => moduleConfig[moduleId]?.label || moduleId;
const getModuleIcon = (moduleId: ModuleId) => moduleConfig[moduleId]?.icon || 'mdi:help';
const getModuleComponent = (moduleId: ModuleId | undefined) => {
  if (!moduleId) return null;
  return moduleComponents[moduleId];
};

// Get module color based on type
const getModuleColor = (moduleId: ModuleId): string => {
  // Return white for active module for better visibility
  if (activeRightModule.value === moduleId) {
    return '#ffffff';
  }
  
  switch (moduleId) {
    case 'claude':
      return '#ff8c42'; // Orange for Anthropic/Claude
    case 'context':
      return '#ff69b4'; // Pink for brain/context
    case 'explorer':
    case 'explorer-editor':
      return '#42a5f5'; // Blue for file explorer
    case 'tasks':
      return '#66bb6a'; // Green for tasks
    case 'knowledge':
      return '#ab47bc'; // Purple for knowledge
    case 'source-control':
      return '#4caf50'; // Git green
    case 'snapshots':
      return '#ffca28'; // Yellow for camera/snapshots
    case 'worktrees':
      return '#26a69a'; // Teal for worktrees
    case 'prompts':
      return '#ef5350'; // Red for prompts
    case 'terminal':
      return '#78909c'; // Blue-grey for terminal
    default:
      return '#858585'; // Default grey
  }
};

const setActiveRightModule = (moduleId: ModuleId) => {
  layoutStore.setActiveRightModule(moduleId);
};

const handleDragOver = (event: DragEvent) => {
  if (!canDropInDock('rightDock')) return;
  
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  setDropTarget('rightDock');
};

const handleDragLeave = (event: DragEvent) => {
  // Only clear if we're leaving the dock entirely
  const relatedTarget = event.relatedTarget as HTMLElement;
  if (!relatedTarget || !event.currentTarget!.contains(relatedTarget)) {
    setDropTarget(null);
  }
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  handleDropModule('rightDock');
};

const handleTabDragStart = (event: DragEvent, moduleId: ModuleId) => {
  if (!event.dataTransfer) return;
  
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', moduleId);
  
  startDrag(moduleId, 'rightDock');
};

const handleTabDragEnd = () => {
  endDrag();
};

const showTabMenu = (event: MouseEvent, moduleId: ModuleId) => {
  // Don't show menu for claude
  if (moduleId === 'claude') return;
 
};

// Handle file opened from explorer
const handleFileOpened = async (fileData: { path: string; content: string; name: string }) => {
  // Open the file in the editor
  await editorStore.openFileWithContent(fileData.path, fileData.content, fileData.name);
  // Switch to editor view
  layoutStore.setActiveLeftModule('editor');
};

// Set default active module if none
onMounted(() => {
  if (!activeRightModule.value && rightDockModules.value.length > 0) {
    setActiveRightModule(rightDockModules.value[0]);
  }
});
</script>

<style scoped>
.right-sidebar {
  width: 100%;
  height: 100%;
  background: #252526;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
  position: relative;
}

.right-sidebar.collapsed {
  width: 0;
  overflow: hidden;
}

.right-sidebar.drop-target {
  outline: 2px dashed #007acc;
  outline-offset: -2px;
}

.right-sidebar.drop-active {
  outline-color: #40a9ff;
  background: rgba(0, 122, 204, 0.05);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  min-height: 35px;
  user-select: none;
}

.dock-tabs {
  display: flex;
  align-items: center;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: thin;
}

.dock-tabs::-webkit-scrollbar {
  height: 3px;
}

.dock-tabs::-webkit-scrollbar-thumb {
  background: #464647;
}

.dock-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: #969696;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  border-bottom: 2px solid transparent;
  position: relative;
}

.dock-tab.dragging {
  opacity: 0.5;
  cursor: move;
}

.dock-tab:hover:not(.active) {
  background: rgba(255, 255, 255, 0.05);
  color: #cccccc;
}

.dock-tab.active {
  background: #252526;
  color: #ffffff;
  border-bottom-color: #007acc;
}

.dock-tab span {
  font-size: 12px;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Remote-specific adjustments */
@media (max-width: 1024px) {
  .dock-tab {
    padding: 8px 12px;
  }
  
  .sidebar-header {
    min-height: 40px;
  }
}
</style>