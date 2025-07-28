<template>
  <div class="activity-bar" :class="{ collapsed: isCollapsed }">
    <div class="activity-items">
      <button
        v-for="item in activityItems"
        :key="item.id"
        :class="['activity-item', { 
          active: activeModule === item.id,
          'has-badge': item.badge && item.badge > 0
        }]"
        @click="setActiveModule(item.id)"
        :title="item.label"
      >
        <Icon :name="item.icon" size="24" />
        <span v-if="item.badge" class="activity-badge">{{ formatBadge(item.badge) }}</span>
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

const isCollapsed = computed({
  get: () => layoutStore.activityBarCollapsed,
  set: (value) => layoutStore.setActivityBarCollapsed(value)
});
const activeModule = computed(() => layoutStore.activeModule);

// Activity items with dynamic badges
const activityItems = computed<ActivityItem[]>(() => [
  {
    id: 'explorer',
    label: 'Explorer',
    icon: 'mdi:folder-outline'
  },
  {
    id: 'claude',
    label: 'Claude AI',
    icon: 'simple-icons:anthropic'
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
]);

const setActiveModule = (moduleId: string) => {
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