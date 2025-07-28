<template>
  <div class="activity-bar" :class="{ collapsed: isCollapsed }">
    <div class="activity-items">
      <button
        v-for="item in activityItems"
        :key="item.id"
        :class="['activity-item', { 
          active: activeModule === item.id,
          'has-badge': item.badge && item.badge > 0,
          'dragging': dragDropState.isDragging && dragDropState.draggedModule === item.id,
          'in-hidden-dock': isInHiddenRightDock(item.id)
        }]"
        @click="setActiveModule(item.id)"
        :title="isInHiddenRightDock(item.id) ? `${item.label} (in hidden right sidebar)` : item.label"
        :draggable="item.id !== 'explorer-editor' && item.id !== 'claude'"
        @dragstart="(item.id !== 'explorer-editor' && item.id !== 'claude') && handleDragStart($event, item.id)"
        @dragend="handleDragEnd"
        @contextmenu.prevent="showModuleMenu($event, item.id)"
      >
        <Icon :name="item.icon" size="24" />
        <span v-if="item.badge" class="activity-badge">{{ formatBadge(item.badge) }}</span>
        <span v-if="isInHiddenRightDock(item.id)" class="hidden-dock-indicator">
          <Icon name="mdi:dock-right" size="12" />
        </span>
      </button>
    </div>
    
    <div class="activity-actions">
      <button
        class="activity-item"
        @click="toggleActivityBar"
        title="Toggle Activity Bar"
      >
        <Icon :name="isCollapsed ? 'mdi:menu' : 'mdi:menu-open'" size="20" />
      </button>
      
      <button
        class="activity-item"
        @click="openLayoutSettings"
        title="Layout Settings"
      >
        <Icon name="mdi:view-dashboard-outline" size="20" />
      </button>
      
      <button
        class="activity-item settings"
        @click="openSettings"
        title="Settings"
      >
        <Icon name="mdi:cog" size="20" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useLayoutStore } from '~/stores/layout';
import { useTasksStore } from '~/stores/tasks';
import { useSourceControlStore } from '~/stores/source-control';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useContextStore } from '~/stores/context';
import { useCheckpointV2Store } from '~/stores/checkpoint-v2';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import Icon from '~/components/Icon.vue';

interface ActivityItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();
const sourceControlStore = useSourceControlStore();
const knowledgeStore = useKnowledgeStore();
const contextStore = useContextStore();
const checkpointStore = useCheckpointV2Store();
const { activeWorktrees } = useWorkspaceManager();
const { dragDropState, startDrag, endDrag } = useModuleDragDrop();

const isCollapsed = computed({
  get: () => layoutStore.activityBarCollapsed,
  set: (value) => layoutStore.setActivityBarCollapsed(value)
});
const activeModule = computed(() => layoutStore.activeModule);

// Check if a module is in right dock with sidebar hidden
const isInHiddenRightDock = (moduleId: string) => {
  return layoutStore.dockConfig.rightDock.includes(moduleId) && !layoutStore.rightSidebarVisible;
};

// Activity items with dynamic badges
const activityItems = computed<ActivityItem[]>(() => {
  const items: ActivityItem[] = [
    {
      id: 'explorer-editor',
      label: 'Explorer + Editor',
      icon: 'mdi:file-code-outline'
    },
    {
      id: 'claude',
      label: 'Claude AI',
      icon: 'simple-icons:anthropic'
    },
    {
      id: 'explorer',
      label: 'Explorer',
      icon: 'mdi:folder-outline'
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: 'mdi:checkbox-marked-outline',
      badge: tasksStore.taskCount.todo
    },
    {
      id: 'knowledge',
      label: 'Knowledge Base',
      icon: 'mdi:book-open-page-variant',
      badge: knowledgeStore.entries.length
    },
    {
      id: 'context',
      label: 'Context Manager',
      icon: 'mdi:brain',
      badge: contextStore.checkpoints.length
    },
    {
      id: 'source-control',
      label: 'Source Control',
      icon: 'mdi:source-branch',
      badge: sourceControlStore.totalChanges
    },
    {
      id: 'checkpoints',
      label: 'Checkpoints',
      icon: 'mdi:history',
      badge: checkpointStore.checkpoints.length
    },
    {
      id: 'worktrees',
      label: 'Worktrees',
      icon: 'mdi:file-tree',
      badge: activeWorktrees.value.size
    },
    {
      id: 'prompts',
      label: 'Prompt Studio',
      icon: 'mdi:lightning-bolt'
    },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: 'mdi:console'
    }
  ];
  
  return items;
});

const setActiveModule = (moduleId: string) => {
  // For explorer-editor, just activate it in left dock
  if (moduleId === 'explorer-editor') {
    layoutStore.setActiveLeftModule('explorer-editor');
    return;
  }
  
  // Check if module is already in a dock
  const inLeftDock = layoutStore.dockConfig.leftDock.includes(moduleId);
  const inRightDock = layoutStore.dockConfig.rightDock.includes(moduleId);
  const inBottomDock = layoutStore.dockConfig.bottomDock.includes(moduleId);
  
  if (!inLeftDock && !inRightDock && !inBottomDock) {
    // Module not in any dock, add to default dock
    const defaultDock = moduleId === 'claude' ? 'rightDock' : 'leftDock';
    layoutStore.moveModuleToDock(moduleId, defaultDock);
  }
  
  layoutStore.setActiveModule(moduleId);
  
  // Emit event for IDE layout to handle module switching
  window.dispatchEvent(new CustomEvent('module-switch', { 
    detail: { moduleId } 
  }));
};

const formatBadge = (count: number): string => {
  if (count > 99) return '99+';
  return count.toString();
};

const toggleActivityBar = () => {
  isCollapsed.value = !isCollapsed.value;
};

const openLayoutSettings = () => {
  window.dispatchEvent(new Event('open-layout-settings'));
};

const openSettings = () => {
  window.dispatchEvent(new Event('open-settings'));
};

const handleDragStart = (event: DragEvent, moduleId: string) => {
  if (!event.dataTransfer || moduleId === 'explorer-editor') return;
  
  // Check if module is in a dock
  let fromDock: 'leftDock' | 'rightDock' | 'bottomDock' | 'activityBar' = 'activityBar';
  
  if (layoutStore.dockConfig.leftDock.includes(moduleId)) {
    fromDock = 'leftDock';
  } else if (layoutStore.dockConfig.rightDock.includes(moduleId)) {
    fromDock = 'rightDock';
  } else if (layoutStore.dockConfig.bottomDock.includes(moduleId)) {
    fromDock = 'bottomDock';
  }
  
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', moduleId);
  
  startDrag(moduleId, fromDock);
};

const handleDragEnd = () => {
  endDrag();
};

const showModuleMenu = (event: MouseEvent, moduleId: string) => {
  // Don't show menu for explorer-editor or claude
  if (moduleId === 'explorer-editor' || moduleId === 'claude') return;
  
  // Check if module is in a dock
  const isInDock = layoutStore.dockConfig.leftDock.includes(moduleId) ||
                   layoutStore.dockConfig.rightDock.includes(moduleId) ||
                   layoutStore.dockConfig.bottomDock.includes(moduleId);
  
  if (isInDock) {
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
  }
};

// Load collapsed state on mount
// Keyboard shortcut to toggle activity bar
const handleKeydown = (e: KeyboardEvent) => {
  // Cmd/Ctrl + B to toggle activity bar
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    toggleActivityBar();
  }
};

onMounted(() => {
  // Add keyboard listener
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.activity-bar {
  width: 48px;
  background: #333333;
  border-right: 1px solid #2d2d30;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: width 0.2s ease;
  position: relative;
  z-index: 100;
}

.activity-bar.collapsed {
  width: 0;
  overflow: hidden;
  border-right: none;
}

.activity-items {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.activity-item {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 2px solid transparent;
}

.activity-item:hover {
  color: #ffffff;
}

.activity-item.active {
  color: #ffffff;
  border-left-color: #ffffff;
}

.activity-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #007acc;
}

.activity-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #007acc;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
  line-height: 14px;
}

.activity-item.has-badge:hover .activity-badge {
  background: #1a8cff;
}

.activity-actions {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border-top: 1px solid #2d2d30;
}

.activity-actions .activity-item {
  height: 40px;
}

.activity-item.settings {
  margin-top: auto;
}

/* Icon adjustments for specific icons */
.activity-item :deep(.icon) {
  opacity: 0.85;
}

.activity-item:hover :deep(.icon),
.activity-item.active :deep(.icon) {
  opacity: 1;
}

/* Animation for badge changes */
.activity-badge {
  animation: badge-pulse 0.3s ease-out;
}

@keyframes badge-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* Drag and drop styles */
.activity-item.dragging {
  opacity: 0.5;
  cursor: grabbing !important;
}

.activity-item[draggable="true"] {
  cursor: grab;
}

.activity-item[draggable="true"]:active {
  cursor: grabbing;
}

/* Dragging state for the whole app */
:global(body.module-dragging) {
  user-select: none;
}

/* Hidden dock indicator */
.activity-item.in-hidden-dock {
  position: relative;
}

.hidden-dock-indicator {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: #007acc;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hidden-dock-indicator :deep(.icon) {
  opacity: 1;
}

/* Context menu styles */
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

:global(.module-context-menu .menu-item.disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

:global(.module-context-menu .menu-item.disabled:hover) {
  background: transparent;
  color: #cccccc;
}

/* Dark theme adjustments */
@media (prefers-color-scheme: dark) {
  .activity-bar {
    background: #252526;
    border-right-color: #1e1e1e;
  }
  
  .activity-actions {
    border-top-color: #1e1e1e;
  }
}
</style>