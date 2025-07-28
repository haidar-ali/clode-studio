<template>
  <div class="left-dock" v-if="leftDockModules.length > 0">
    <div class="dock-header" v-if="leftDockModules.length > 1">
      <div class="dock-tabs">
        <button
          v-for="moduleId in leftDockModules"
          :key="moduleId"
          :class="['dock-tab', { active: activeLeftModule === moduleId }]"
          @click="setActiveLeftModule(moduleId)"
        >
          <Icon :name="getModuleIcon(moduleId)" size="16" />
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
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();

const projectPath = computed(() => tasksStore.projectPath);

// Module configuration
const moduleConfig: Record<ModuleId, { label: string; icon: string }> = {
  explorer: { label: 'Explorer', icon: 'mdi:folder-outline' },
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

// Module components mapping
const moduleComponents = {
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/FileTree.vue')),
  terminal: defineAsyncComponent(() => import('~/components/Terminal/Terminal.vue')),
  tasks: defineAsyncComponent(() => import('~/components/Kanban/KanbanBoard.vue')),
  'source-control': defineAsyncComponent(() => import('~/components/SourceControlV2/SourceControlV2.vue')),
  checkpoints: defineAsyncComponent(() => import('~/components/Checkpoint/CheckpointPanel.vue')),
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

const setActiveLeftModule = (moduleId: ModuleId) => {
  layoutStore.setActiveLeftModule(moduleId);
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

/* Show header when only one module */
.left-dock:not(:has(.dock-header)) .dock-content :deep(.panel-header) {
  display: block;
}
</style>