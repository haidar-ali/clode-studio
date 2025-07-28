<template>
  <div class="right-sidebar" :class="{ collapsed: !layoutStore.rightSidebarVisible }">
    <div class="sidebar-header">
      <div class="sidebar-controls">
        <button
          v-if="canSplit"
          @click="toggleSplitView"
          class="control-btn"
          :title="layoutStore.rightSidebarSplitView ? 'Single view' : 'Split view'"
        >
          <Icon :name="layoutStore.rightSidebarSplitView ? 'mdi:view-sequential' : 'mdi:view-split-vertical'" size="16" />
        </button>
        <button
          @click.stop="toggleSidebar"
          class="control-btn"
          title="Toggle sidebar"
        >
          <Icon :name="layoutStore.rightSidebarVisible ? 'mdi:dock-right' : 'mdi:dock-left'" size="16" />
        </button>
      </div>
    </div>
    
    <div class="sidebar-content">
      <!-- Single View Mode -->
      <div v-if="!layoutStore.rightSidebarSplitView" class="single-view">
        <component 
          :is="getModuleComponent(primaryModule)" 
          v-if="primaryModule"
          :key="`single-${primaryModule}`"
        />
      </div>
      
      <!-- Split View Mode -->
      <div v-else class="split-view">
        <Splitpanes horizontal class="default-theme">
          <Pane :size="50" :min-size="30" :max-size="70">
            <div class="split-panel">
              <component 
                :is="getModuleComponent(primaryModule)" 
                v-if="primaryModule"
                :instance-group="primaryModule === 'claude' ? 'primary' : undefined"
                :key="`split-primary-${primaryModule}`"
              />
            </div>
          </Pane>
          <Pane :size="50" :min-size="30" :max-size="70">
            <div class="split-panel">
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
import { computed, defineAsyncComponent, nextTick } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import { useLayoutStore, type ModuleId } from '~/stores/layout';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();

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
  explorer: defineAsyncComponent(() => import('~/components/FileExplorer/FileTree.vue'))
};

// Get modules in right dock
const rightDockModules = computed(() => layoutStore.dockConfig.rightDock);

// Primary module (first in dock or active module if in right dock)
const primaryModule = computed(() => {
  if (layoutStore.dockConfig.rightDock.includes(layoutStore.activeModule)) {
    return layoutStore.activeModule;
  }
  return rightDockModules.value[0];
});

// Secondary module for split view (first module that's not primary)
const secondaryModule = computed(() => {
  // For Claude terminals, we can show two instances
  if (primaryModule.value === 'claude') {
    return 'claude'; // This will create a second instance
  }
  // For other modules, show the next available module
  return rightDockModules.value.find(m => m !== primaryModule.value);
});

// Can split if we have Claude or multiple modules
const canSplit = computed(() => {
  return primaryModule.value === 'claude' || rightDockModules.value.length > 1;
});

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
  justify-content: flex-end;
  padding: 4px 8px;
  background: #2d2d30;
  border-bottom: 1px solid #1e1e1e;
  min-height: 33px;
}

.sidebar-controls {
  display: flex;
  gap: 4px;
  align-items: center;
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
</style>