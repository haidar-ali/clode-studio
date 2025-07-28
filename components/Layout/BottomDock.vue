<template>
  <div class="bottom-dock" :class="{ minimized: layoutStore.bottomPanelMinimized }">
    <div class="dock-header">
      <div class="dock-tabs">
        <button
          v-for="moduleId in bottomDockModules"
          :key="moduleId"
          :class="['dock-tab', { active: activeBottomModule === moduleId }]"
          @click="setActiveBottomModule(moduleId)"
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
      <component 
        :is="getModuleComponent(activeBottomModule)" 
        v-if="activeBottomModule"
        :project-path="activeBottomModule === 'terminal' ? projectPath : undefined"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onMounted } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import { useTasksStore } from '~/stores/tasks';
import { useSourceControlStore } from '~/stores/source-control';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();
const sourceControlStore = useSourceControlStore();

const projectPath = computed(() => tasksStore.projectPath);

// Module configuration
const moduleConfig: Record<ModuleId, { label: string; icon: string }> = {
  terminal: { label: 'Terminal', icon: 'mdi:console' },
  tasks: { label: 'Tasks', icon: 'mdi:checkbox-marked-outline' },
  'source-control': { label: 'Source Control', icon: 'mdi:source-branch' },
  checkpoints: { label: 'Checkpoints', icon: 'mdi:history' },
  worktrees: { label: 'Worktrees', icon: 'mdi:file-tree' },
  context: { label: 'Context', icon: 'mdi:brain' },
  knowledge: { label: 'Knowledge', icon: 'mdi:book-open-page-variant' },
  prompts: { label: 'Prompts', icon: 'mdi:lightning-bolt' },
  claude: { label: 'Claude AI', icon: 'simple-icons:anthropic' },
  explorer: { label: 'Explorer', icon: 'mdi:folder-outline' }
};

// Module components mapping
const moduleComponents = {
  terminal: defineAsyncComponent(() => import('~/components/Terminal/Terminal.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  checkpoints: defineAsyncComponent(() => import('~/components/Checkpoint/CheckpointPanel.vue')),
  worktrees: defineAsyncComponent(() => import('~/components/Worktree/WorktreePanel.vue')),
  context: defineAsyncComponent(() => import('~/components/Context/ContextPanel.vue')),
  knowledge: defineAsyncComponent(() => import('~/components/Knowledge/KnowledgePanel.vue')),
  prompts: defineAsyncComponent(() => import('~/components/Prompts/PromptStudio.vue')),
  claude: defineAsyncComponent(() => import('~/components/Terminal/ClaudeTerminalTabs.vue')),
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/FileTree.vue'))
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
</style>