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
    <div class="dock-header" v-if="leftDockModules.length > 1">
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
        :project-path="activeLeftModule === 'terminal' ? projectPath : undefined"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onMounted } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import { useTasksStore } from '~/stores/tasks';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget, startDrag, endDrag } = useModuleDragDrop();

const projectPath = computed(() => tasksStore.projectPath);

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

// Module components mapping
const moduleComponents = {
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/FileTree.vue')),
  'explorer-editor': defineAsyncComponent(() => import('~/components/Modules/ExplorerEditor.vue')),
  terminal: defineAsyncComponent(() => import('~/components/Terminal/TerminalWithSidebar.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  snapshots: defineAsyncComponent(() => import('~/components/Snapshots/SnapshotsPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  claude: defineAsyncComponent(() => import('~/components/Terminal/ClaudeTerminalTabs.vue'))
};

// Get modules in left dock
const leftDockModules = computed(() => layoutStore.dockConfig.leftDock);

// Active module from store
const activeLeftModule = computed(() => layoutStore.activeLeftModule);

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
  if (!event.dataTransfer) return;
  
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', moduleId);
  
  startDrag(moduleId, 'leftDock');
};

const handleTabDragEnd = () => {
  endDrag();
};

const showTabMenu = (event: MouseEvent, moduleId: ModuleId) => {
  // Don't show menu for explorer-editor
  if (moduleId === 'explorer-editor') return;
  
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
    if (menuItem?.getAttribute('data-action') === 'remove' && !menuItem.classList.contains('disabled')) {
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
.left-dock {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  border-right: 1px solid #1e1e1e;
}

.dock-header {
  display: flex;
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

.dock-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Special styling for file tree */
.dock-content :deep(.file-tree) {
  padding: 0;
}

/* Panel headers inside dock content */
.dock-content :deep(.panel-header) {
  display: none; /* Hide redundant headers when in tabbed mode */
}

/* Drag and drop styles */
.left-dock.drop-target {
  position: relative;
}

.left-dock.drop-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed #007acc;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0.5;
  z-index: 10;
}

.left-dock.drop-active::after {
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
</style>