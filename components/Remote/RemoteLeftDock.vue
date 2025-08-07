<template>
  <div 
    class="left-dock" 
    v-if="leftDockModules.length > 0"
    :class="{ 
      'drop-target': dragDropState.isDragging && canDropInDock('leftDock'),
      'drop-active': dragDropState.dropTarget === 'leftDock'
    }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="dock-header" v-if="leftDockModules.length > 1 && !isMobile">
      <div class="dock-tabs">
        <button
          v-for="moduleId in leftDockModules"
          :key="moduleId"
          :class="['dock-tab', { 
            active: activeLeftModule === moduleId,
            'dragging': dragDropState.isDragging && dragDropState.draggedModule === moduleId
          }]"
          @click="setActiveLeftModule(moduleId)"
          :draggable="moduleId !== 'explorer-editor'"
          @dragstart="moduleId !== 'explorer-editor' && handleTabDragStart($event, moduleId)"
          @dragend="handleTabDragEnd"
          @contextmenu.prevent="showTabMenu($event, moduleId)"
        >
          <Icon :name="getModuleIcon(moduleId)" size="16" :style="{ color: getModuleColor(moduleId) }" />
          <span>{{ getModuleLabel(moduleId) }}</span>
        </button>
      </div>
    </div>
    
    <div class="dock-content">
      <component 
        :is="getModuleComponent(activeLeftModule)" 
        v-if="activeLeftModule"
        @file-opened="handleFileOpened"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onMounted } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import { useTasksStore } from '~/stores/tasks';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import { useEditorStore } from '~/stores/editor';
import { useAdaptiveUI } from '~/composables/useAdaptiveUI';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();
const editorStore = useEditorStore();

// Adaptive UI
const { isMobile } = useAdaptiveUI();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget, startDrag, endDrag } = useModuleDragDrop();

// Module configuration
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

// Module components mapping - Using remote-compatible components
const moduleComponents = {
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/SimpleFileExplorer.vue')),
  'explorer-editor': defineAsyncComponent(() => import('~/components/Remote/RemoteExplorerEditorPro.vue')),
  terminal: defineAsyncComponent(() => import('~/components/Remote/MobileTerminalXterm.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  snapshots: defineAsyncComponent(() => import('~/components/Snapshots/SnapshotsPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  claude: defineAsyncComponent(() => import('~/components/Remote/MobileClaudeXterm.vue'))
};

// Get modules in left dock
const leftDockModules = computed(() => {
  // On mobile, show the currently active dock
  if (isMobile.value) {
    return layoutStore.activeDock ? [layoutStore.activeDock] : ['explorer-editor'];
  }
  return layoutStore.dockConfig.leftDock;
});

// Active module from store
const activeLeftModule = computed(() => {
  // On mobile, always show the active dock
  if (isMobile.value) {
    return layoutStore.activeDock || 'explorer-editor';
  }
  return layoutStore.activeLeftModule;
});

// Module helpers
const getModuleLabel = (moduleId: ModuleId) => moduleConfig[moduleId]?.label || moduleId;
const getModuleIcon = (moduleId: ModuleId) => moduleConfig[moduleId]?.icon || 'mdi:help';
const getModuleComponent = (moduleId: ModuleId) => moduleComponents[moduleId];

// Get module color based on type
const getModuleColor = (moduleId: ModuleId): string => {
  // Return white for active module for better visibility
  if (activeLeftModule.value === moduleId) {
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

const setActiveLeftModule = (moduleId: ModuleId) => {
  layoutStore.setActiveLeftModule(moduleId);
};

const handleDragOver = (event: DragEvent) => {
  if (!canDropInDock('leftDock')) return;
  
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  setDropTarget('leftDock');
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
  handleDropModule('leftDock');
};

const handleTabDragStart = (event: DragEvent, moduleId: ModuleId) => {
  startDrag(moduleId, 'leftDock');
  event.dataTransfer!.effectAllowed = 'move';
  event.dataTransfer!.setData('text/plain', moduleId);
};

const handleTabDragEnd = () => {
  endDrag();
};

const showTabMenu = (event: MouseEvent, moduleId: ModuleId) => {
  // TODO: Implement context menu for tabs
 
};

// Handle file opened from explorer
const handleFileOpened = async (fileData: { path: string; content: string; name: string }) => {
  // Open the file in the editor
  await editorStore.openFileWithContent(fileData.path, fileData.content, fileData.name);
  // If we're in explorer-editor mode, the editor is already visible
  // Otherwise switch to editor view
  if (activeLeftModule.value !== 'explorer-editor') {
    layoutStore.setActiveLeftModule('editor');
  }
};

// Set default active module if none
onMounted(() => {
  if (!activeLeftModule.value && leftDockModules.value.length > 0) {
    setActiveLeftModule(leftDockModules.value[0]);
  }
});
</script>

<style scoped>
.left-dock {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252526;
  transition: all 0.2s ease;
  position: relative;
}

.left-dock.drop-target {
  outline: 2px dashed #007acc;
  outline-offset: -2px;
}

.left-dock.drop-active {
  outline-color: #40a9ff;
  background: rgba(0, 122, 204, 0.05);
}

.dock-header {
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

.dock-content {
  flex: 1;
  overflow: hidden;
}

/* Remote-specific adjustments */
@media (max-width: 1024px) {
  .dock-tab {
    padding: 8px 12px;
  }
  
  .dock-header {
    min-height: 40px;
  }
}
</style>