<template>
  <div class="mode-selector">
    <div class="title-area">
      <Icon name="mdi:view-dashboard" class="logo-icon" />
      <span class="app-title">Clode Studio</span>
    </div>
    
    <div class="controls">
      <!-- Split View Toggle -->
      <button
        v-if="canSplit"
        class="control-btn"
        @click="toggleSplitView"
        :title="layoutStore.rightSidebarSplitView ? 'Single view' : 'Split view'"
      >
        <Icon :name="layoutStore.rightSidebarSplitView ? 'mdi:view-sequential' : 'mdi:view-split-vertical'" size="16" />
      </button>
      
      <!-- Right Sidebar Toggle -->
      <button
        class="control-btn"
        @click="toggleRightSidebar"
        :title="layoutStore.rightSidebarVisible ? 'Hide right panel' : 'Show right panel'"
      >
        <Icon :name="layoutStore.rightSidebarVisible ? 'mdi:dock-right' : 'mdi:dock-left'" size="16" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLayoutStore } from '~/stores/layout';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();

// Can split if we have Claude in right dock or multiple modules
const canSplit = computed(() => {
  return layoutStore.activeRightModule === 'claude' || layoutStore.dockConfig.rightDock.length > 1;
});

const toggleSplitView = () => {
  layoutStore.toggleRightSidebarSplit();
};

const toggleRightSidebar = () => {
  layoutStore.toggleRightSidebar();
};
</script>

<style scoped>
.mode-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  -webkit-app-region: drag; /* Allow dragging the window */
}

.controls {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag; /* Make buttons clickable */
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

.title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 80px; /* Give space for macOS window controls */
}

.logo-icon {
  color: #007acc;
  font-size: 18px;
}

.app-title {
  font-size: 13px;
  font-weight: 600;
  color: #cccccc;
  letter-spacing: 0.5px;
}
</style>