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
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
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
          <Icon :name="getModuleIcon(moduleId)" size="16" />
          <span>{{ getModuleLabel(moduleId) }}</span>
        </button>
      </div>
    </div>
    
    <div class="sidebar-content">
      <!-- Single View Mode -->
      <div 
        v-if="!layoutStore.rightSidebarSplitView" 
        class="single-view"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <component 
          :is="getModuleComponent(activeRightModule)" 
          v-if="activeRightModule"
          :key="`single-${activeRightModule}`"
        />
      </div>
      
      <!-- Split View Mode -->
      <div 
        v-else 
        class="split-view"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <Splitpanes horizontal class="default-theme">
          <Pane :size="50" :min-size="30" :max-size="70">
            <div 
              class="split-panel"
              :class="{
                'drop-target': dragDropState.isDragging && canDropInSplitTop(),
                'drop-active': splitDropTarget === 'top'
              }"
              @dragover="handleSplitDragOver($event, 'top')"
              @dragleave="handleSplitDragLeave"
              @drop="handleSplitDrop($event, 'top')"
            >
              <component 
                :is="getModuleComponent(activeRightModule)" 
                v-if="activeRightModule"
                :instance-group="activeRightModule === 'claude' ? 'primary' : undefined"
                :key="`split-primary-${activeRightModule}`"
              />
            </div>
          </Pane>
          <Pane :size="50" :min-size="30" :max-size="70">
            <div 
              class="split-panel"
              :class="{
                'drop-target': dragDropState.isDragging && canDropInSplitBottom(),
                'drop-active': splitDropTarget === 'bottom'
              }"
              @dragover="handleSplitDragOver($event, 'bottom')"
              @dragleave="handleSplitDragLeave"
              @drop="handleSplitDrop($event, 'bottom')"
            >
              <component 
                :is="getModuleComponent(secondaryModule)" 
                v-if="secondaryModule"
                :instance-group="secondaryModule === 'claude' ? 'secondary' : undefined"
                :key="`split-secondary-${secondaryModule}`"
              />
            </div>
          </Pane>
        </Splitpanes>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget, startDrag, endDrag } = useModuleDragDrop();

// Split panel drag and drop state
const splitDropTarget = ref<'top' | 'bottom' | null>(null);

// Module components mapping
const moduleComponents = {
  claude: defineAsyncComponent(() => import('~/components/Terminal/ClaudeTerminalTabs.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  checkpoints: defineAsyncComponent(() => import('~/components/Checkpoint/CheckpointPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  terminal: defineAsyncComponent(() => import('~/components/Terminal/Terminal.vue')),
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/FileTree.vue')),
  'explorer-editor': defineAsyncComponent(() => import('~/components/Modules/ExplorerEditor.vue'))
};

// Module configuration for labels and icons
const moduleConfig: Record<ModuleId, { label: string; icon: string }> = {
  explorer: { label: 'Explorer', icon: 'mdi:folder-outline' },
  'explorer-editor': { label: 'Explorer + Editor', icon: 'mdi:file-code-outline' },
  terminal: { label: 'Terminal', icon: 'mdi:console' },
  tasks: { label: 'Tasks', icon: 'mdi:checkbox-marked-outline' },
  'source-control': { label: 'Source Control', icon: 'mdi:source-branch' },
  checkpoints: { label: 'Checkpoints', icon: 'mdi:history' },
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

// Secondary module for split view
const secondaryModule = computed(() => {
  // If we have an explicitly set secondary module, use it
  if (layoutStore.secondaryRightModule && rightDockModules.value.includes(layoutStore.secondaryRightModule)) {
    return layoutStore.secondaryRightModule;
  }
  
  // For Claude terminals, we can show two instances
  if (activeRightModule.value === 'claude') {
    return 'claude'; // This will create a second instance
  }
  
  // For other modules, show the next available module
  return rightDockModules.value.find(m => m !== activeRightModule.value);
});

// Can split if we have Claude or multiple modules
const canSplit = computed(() => {
  return activeRightModule.value === 'claude' || rightDockModules.value.length > 1;
});

// Module helpers
const getModuleLabel = (moduleId: ModuleId) => moduleConfig[moduleId]?.label || moduleId;
const getModuleIcon = (moduleId: ModuleId) => moduleConfig[moduleId]?.icon || 'mdi:help';

const getModuleComponent = (moduleId: ModuleId | undefined) => {
  if (!moduleId) return null;
  return moduleComponents[moduleId];
};

const toggleSplitView = async () => {
  layoutStore.toggleRightSidebarSplit();
  // Force re-render after toggling to ensure proper splitpanes initialization
  await nextTick();
};

const toggleSidebar = () => {
  layoutStore.toggleRightSidebar();
};

const setActiveRightModule = (moduleId: ModuleId) => {
  layoutStore.setActiveRightModule(moduleId);
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
  
  // Create context menu
  const menu = document.createElement('div');
  menu.className = 'module-context-menu';
  menu.innerHTML = `
    <div class="menu-item" data-action="remove">
      <span class="menu-icon">✕</span>
      Remove from dock
    </div>
  `;
  
  // Position menu
  menu.style.position = 'fixed';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  
  // Add click handler
  menu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const menuItem = target.closest('.menu-item');
    if (menuItem?.getAttribute('data-action') === 'remove') {
      layoutStore.removeModuleFromDock(moduleId);
    }
    menu.remove();
  });
  
  // Add to body
  document.body.appendChild(menu);
  
  // Remove on click outside
  setTimeout(() => {
    const removeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      }
    };
    document.addEventListener('click', removeMenu);
  }, 0);
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
  
  // If we're in split mode and dropping from outside right dock, add to primary
  if (layoutStore.rightSidebarSplitView && dragDropState.value.draggedFromDock !== 'rightDock') {
    const { draggedModule } = dragDropState.value;
    if (draggedModule) {
      // First add to the right dock
      handleDropModule('rightDock');
      // Then set as active (primary) module
      layoutStore.setActiveRightModule(draggedModule);
    }
  } else {
    handleDropModule('rightDock');
  }
};

// Split panel drag and drop methods
const canDropInSplitTop = (): boolean => {
  const { draggedModule, draggedFromDock } = dragDropState.value;
  if (!draggedModule || !draggedFromDock) return false;
  
  // Allow dragging from within right dock OR from external sources when in split view
  return layoutStore.rightSidebarSplitView && (
    draggedFromDock === 'rightDock' || 
    canDropInDock('rightDock')
  );
};

const canDropInSplitBottom = (): boolean => {
  const { draggedModule, draggedFromDock } = dragDropState.value;
  if (!draggedModule || !draggedFromDock) return false;
  
  // Allow dragging from within right dock OR from external sources when in split view
  return layoutStore.rightSidebarSplitView && (
    draggedFromDock === 'rightDock' || 
    canDropInDock('rightDock')
  );
};

const handleSplitDragOver = (event: DragEvent, target: 'top' | 'bottom') => {
  const canDrop = target === 'top' ? canDropInSplitTop() : canDropInSplitBottom();
  if (!canDrop) return;
  
  event.preventDefault();
  event.stopPropagation(); // Prevent parent from handling this
  event.dataTransfer!.dropEffect = 'move';
  splitDropTarget.value = target;
};

const handleSplitDragLeave = (event: DragEvent) => {
  const relatedTarget = event.relatedTarget as HTMLElement;
  if (!relatedTarget || !event.currentTarget!.contains(relatedTarget)) {
    splitDropTarget.value = null;
  }
};

const handleSplitDrop = (event: DragEvent, target: 'top' | 'bottom') => {
  event.preventDefault();
  event.stopPropagation();
  const { draggedModule, draggedFromDock } = dragDropState.value;
  
  if (!draggedModule) {
    splitDropTarget.value = null;
    return;
  }
  
  // If dragging from outside right dock, first add it to the right dock
  if (draggedFromDock !== 'rightDock') {
    handleDropModule('rightDock');
  }
  
  // Set the dropped module for the appropriate split
  if (target === 'top') {
    // Make the dragged module the primary (top) module
    layoutStore.setActiveRightModule(draggedModule);
    // Keep the current active as secondary if it's different
    if (activeRightModule.value !== draggedModule) {
      layoutStore.setSecondaryRightModule(activeRightModule.value);
    }
  } else {
    // Make the dragged module the secondary (bottom) module
    layoutStore.setSecondaryRightModule(draggedModule);
    // If the dragged module is the same as current active, find another module for top
    if (draggedModule === activeRightModule.value) {
      const otherModule = rightDockModules.value.find(m => m !== draggedModule);
      if (otherModule) {
        layoutStore.setActiveRightModule(otherModule);
      }
    }
  }
  
  splitDropTarget.value = null;
  endDrag();
};
</script>

<style scoped>
.right-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  border-left: 1px solid #1e1e1e;
  transition: transform 0.2s ease;
}

.right-sidebar.collapsed {
  transform: translateX(100%);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  background: #2d2d30;
  border-bottom: 1px solid #1e1e1e;
  min-height: 33px;
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

.dock-tabs::-webkit-scrollbar-track {
  background: transparent;
}

.dock-tabs::-webkit-scrollbar-thumb {
  background: #505050;
  border-radius: 3px;
}

.dock-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: all 0.2s;
}

.dock-tab:hover {
  background: #3e3e42;
  color: #ffffff;
}

.dock-tab.active {
  color: #ffffff;
  border-bottom-color: #007acc;
}

.dock-tab[draggable="true"] {
  cursor: grab;
}

.dock-tab[draggable="true"]:active {
  cursor: grabbing;
}

.dock-tab.dragging {
  opacity: 0.5;
}

.sidebar-controls {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 0 8px;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: 3px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background: #3e3e42;
  color: #ffffff;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.single-view {
  flex: 1;
  overflow: hidden;
}

.split-view {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.split-panel {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Special handling for Claude terminals in split view */
.split-panel :deep(.claude-terminal-tabs) {
  height: 100%;
}

/* Splitpanes theme */
.default-theme {
  height: 100%;
}

.default-theme :deep(.splitpanes__splitter) {
  background-color: #1e1e1e;
  position: relative;
}

.default-theme :deep(.splitpanes__splitter:before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transition: background-color 0.2s;
  z-index: 1;
}

.default-theme :deep(.splitpanes__splitter:hover:before) {
  background-color: #007acc;
  opacity: 0.3;
}

.default-theme.splitpanes--horizontal > :deep(.splitpanes__splitter) {
  height: 4px;
}

/* Drag and drop styles */
.right-sidebar.drop-target {
  position: relative;
}

.right-sidebar.drop-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed #007acc;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0.5;
  z-index: 10;
}

.right-sidebar.drop-active::after {
  opacity: 1;
  background: rgba(0, 122, 204, 0.1);
}

/* Split panel drop styles */
.split-panel.drop-target {
  position: relative;
}

.split-panel.drop-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed #007acc;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0.5;
  z-index: 10;
}

.split-panel.drop-active::after {
  opacity: 1;
  background: rgba(0, 122, 204, 0.1);
}
</style>