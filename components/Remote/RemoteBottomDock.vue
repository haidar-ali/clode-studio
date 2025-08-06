<template>
  <div 
    class="bottom-dock" 
    :class="{ 
      minimized: layoutStore.bottomPanelMinimized,
      'drop-target': dragDropState.isDragging && canDropInDock('bottomDock'),
      'drop-active': dragDropState.dropTarget === 'bottomDock'
    }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="dock-header">
      <div class="dock-tabs">
        <button
          v-for="moduleId in bottomDockModules"
          :key="moduleId"
          :class="['dock-tab', { 
            active: activeBottomModule === moduleId,
            'dragging': dragDropState.isDragging && dragDropState.draggedModule === moduleId
          }]"
          @click="setActiveBottomModule(moduleId)"
          :draggable="moduleId !== 'terminal'"
          @dragstart="handleTabDragStart($event, moduleId)"
          @dragend="handleTabDragEnd"
          @contextmenu.prevent="showTabMenu($event, moduleId)"
        >
          <Icon :name="getModuleIcon(moduleId)" size="16" />
          <span>{{ getModuleLabel(moduleId) }}</span>
          <span v-if="getModuleBadge(moduleId)" class="tab-badge">
            {{ getModuleBadge(moduleId) }}
          </span>
        </button>
      </div>
      
      <div class="dock-controls">
        <button
          @click.stop="toggleMinimize"
          class="control-btn"
          :title="layoutStore.bottomPanelMinimized ? 'Maximize' : 'Minimize'"
        >
          <Icon :name="layoutStore.bottomPanelMinimized ? 'mdi:chevron-up' : 'mdi:chevron-down'" size="16" />
        </button>
      </div>
    </div>
    
    <div v-if="!layoutStore.bottomPanelMinimized" class="dock-content">
      <KeepAlive>
        <component 
          :is="getModuleComponent(activeBottomModule)" 
          v-if="activeBottomModule"
          :key="activeBottomModule"
          @file-opened="handleFileOpened"
        />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onMounted } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import { useTasksStore } from '~/stores/tasks';
import { useSourceControlStore } from '~/stores/source-control';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import { useEditorStore } from '~/stores/editor';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();
const sourceControlStore = useSourceControlStore();
const editorStore = useEditorStore();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget, startDrag, endDrag } = useModuleDragDrop();

// Module configuration
const moduleConfig: Record<ModuleId, { label: string; icon: string }> = {
  terminal: { label: 'Terminal', icon: 'mdi:console' },
  tasks: { label: 'Tasks', icon: 'mdi:checkbox-marked-outline' },
  'source-control': { label: 'Source Control', icon: 'mdi:source-branch' },
  snapshots: { label: 'Snapshots', icon: 'mdi:camera' },
  worktrees: { label: 'Worktrees', icon: 'mdi:file-tree' },
  context: { label: 'Context', icon: 'mdi:brain' },
  knowledge: { label: 'Knowledge', icon: 'mdi:book-open-page-variant' },
  prompts: { label: 'Prompts', icon: 'mdi:lightning-bolt' },
  claude: { label: 'Claude AI', icon: 'simple-icons:anthropic' },
  explorer: { label: 'Explorer', icon: 'mdi:folder-outline' },
  'explorer-editor': { label: 'Explorer + Editor', icon: 'mdi:file-code-outline' }
};

// Module components mapping - Using remote-compatible components
const moduleComponents = {
  terminal: defineAsyncComponent(() => import('~/components/Remote/MobileTerminalXterm.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  snapshots: defineAsyncComponent(() => import('~/components/Snapshots/SnapshotsPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  claude: defineAsyncComponent(() => import('~/components/Remote/MobileClaudeXterm.vue')),
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/SimpleFileExplorer.vue')),
  'explorer-editor': defineAsyncComponent(() => import('~/components/Remote/RemoteExplorerEditorPro.vue'))
};

// Get modules in bottom dock
const bottomDockModules = computed(() => layoutStore.dockConfig.bottomDock);

// Active module from store
const activeBottomModule = computed(() => layoutStore.activeBottomModule);

// Module helpers
const getModuleLabel = (moduleId: ModuleId) => moduleConfig[moduleId]?.label || moduleId;
const getModuleIcon = (moduleId: ModuleId) => moduleConfig[moduleId]?.icon || 'mdi:help';
const getModuleComponent = (moduleId: ModuleId) => moduleComponents[moduleId];

// Get badge count for modules
const getModuleBadge = (moduleId: ModuleId): number | null => {
  switch (moduleId) {
    case 'tasks':
      return tasksStore.taskCount.todo || null;
    case 'source-control':
      return sourceControlStore.totalChanges || null;
    default:
      return null;
  }
};

const setActiveBottomModule = (moduleId: ModuleId) => {
  layoutStore.setActiveBottomModule(moduleId);
};

const toggleMinimize = () => {
  layoutStore.toggleBottomPanel();
};

const handleDragOver = (event: DragEvent) => {
  if (!canDropInDock('bottomDock')) return;
  
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  setDropTarget('bottomDock');
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
  handleDropModule('bottomDock');
};

const handleTabDragStart = (event: DragEvent, moduleId: ModuleId) => {
  startDrag(moduleId, 'bottomDock');
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
  // Switch to editor view if needed
  layoutStore.setActiveLeftModule('editor');
};

// Set default active module if none
onMounted(() => {
  if (!activeBottomModule.value && bottomDockModules.value.length > 0) {
    setActiveBottomModule(bottomDockModules.value[0]);
  }
});
</script>

<style scoped>
.bottom-dock {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252526;
  border-top: 1px solid #3e3e42;
  transition: all 0.2s ease;
  position: relative;
}

.bottom-dock.minimized {
  height: 48px;
}

.bottom-dock.drop-target {
  outline: 2px dashed #007acc;
  outline-offset: -2px;
}

.bottom-dock.drop-active {
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

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: #007acc;
  color: #ffffff;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
}

.dock-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: #969696;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #cccccc;
}

.dock-content {
  flex: 1;
  overflow: hidden;
  background: #252526;
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