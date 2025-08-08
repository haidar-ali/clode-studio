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
          <Icon :name="getModuleIcon(moduleId)" size="16" :style="{ color: getModuleColor(moduleId) }" />
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
          :project-path="activeBottomModule === 'terminal' ? projectPath : undefined"
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
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();
const sourceControlStore = useSourceControlStore();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget, startDrag, endDrag } = useModuleDragDrop();

const projectPath = computed(() => tasksStore.projectPath);

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

// Module components mapping
const moduleComponents = {
  terminal: defineAsyncComponent(() => import('~/components/Terminal/TerminalWithSidebar.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  snapshots: defineAsyncComponent(() => import('~/components/Snapshots/SnapshotsPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  claude: defineAsyncComponent(() => import('~/components/Terminal/ClaudeTerminalTabs.vue')),
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/FileTree.vue')),
  'explorer-editor': defineAsyncComponent(() => import('~/components/Modules/ExplorerEditor.vue'))
};

// Get modules in bottom dock
const bottomDockModules = computed(() => layoutStore.dockConfig.bottomDock);

// Active module from store
const activeBottomModule = computed(() => layoutStore.activeBottomModule);

// Module helpers
const getModuleLabel = (moduleId: ModuleId) => moduleConfig[moduleId]?.label || moduleId;
const getModuleIcon = (moduleId: ModuleId) => moduleConfig[moduleId]?.icon || 'mdi:help';
const getModuleComponent = (moduleId: ModuleId) => moduleComponents[moduleId];

// Get module color based on type
const getModuleColor = (moduleId: ModuleId): string => {
  // Return white for active module for better visibility
  if (activeBottomModule.value === moduleId) {
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
  if (!event.dataTransfer || moduleId === 'terminal') return;
  
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', moduleId);
  
  startDrag(moduleId, 'bottomDock');
};

const handleTabDragEnd = () => {
  endDrag();
};

const showTabMenu = (event: MouseEvent, moduleId: ModuleId) => {
  // Don't show menu for terminal
  if (moduleId === 'terminal') return;
  
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
</script>

<style scoped>
.bottom-dock {
  display: flex;
  flex-direction: column;
  background: #252526;
  border-top: 1px solid #1e1e1e;
  height: 100%;
  transition: all 0.2s ease;
}

.bottom-dock.minimized {
  height: 33px;
}

.dock-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.tab-badge {
  background: #007acc;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  font-weight: 600;
}

.dock-controls {
  display: flex;
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

.dock-content {
  flex: 1;
  overflow: hidden;
}

/* Ensure contained components fill the space */
.dock-content > * {
  height: 100%;
}

/* Drag and drop styles */
.bottom-dock.drop-target {
  position: relative;
}

.bottom-dock.drop-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed #007acc;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0.5;
  z-index: 10;
}

.bottom-dock.drop-active::after {
  opacity: 1;
  background: rgba(0, 122, 204, 0.1);
}

/* Draggable tab styles */
.dock-tab[draggable="true"] {
  cursor: grab;
}

.dock-tab[draggable="true"]:active {
  cursor: grabbing;
}

.dock-tab.dragging {
  opacity: 0.5;
}

/* Context menu styles - matching other docks */
:global(.module-context-menu) {
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  padding: 4px;
  z-index: 10000;
}

:global(.module-context-menu .menu-item) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 3px;
  color: #cccccc;
  font-size: 13px;
  white-space: nowrap;
}

:global(.module-context-menu .menu-item:hover) {
  background: #3e3e42;
  color: #ffffff;
}

:global(.module-context-menu .menu-icon) {
  font-size: 14px;
  opacity: 0.8;
}
</style>