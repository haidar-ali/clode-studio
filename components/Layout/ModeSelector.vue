<template>
  <div class="mode-selector">
    <div class="title-area">
      <Icon name="mdi:view-dashboard" class="logo-icon" />
      <span class="app-title">Clode IDE + KANBAN</span>
    </div>
    
    <div class="mode-group">
      <button
        v-for="mode in modes"
        :key="mode.value"
        :class="['mode-button', { active: currentMode === mode.value }]"
        @click="setMode(mode.value)"
        :title="mode.description"
      >
        <Icon :name="mode.icon" />
        <span>{{ mode.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLayoutStore, type LayoutMode } from '~/stores/layout';

const layoutStore = useLayoutStore();

const currentMode = computed(() => layoutStore.currentMode);

const modes = [
  {
    value: 'full-ide' as LayoutMode,
    label: 'Full IDE',
    icon: 'mdi:view-dashboard',
    description: 'Complete IDE with file tree, editor, kanban, and Claude'
  },
  {
    value: 'kanban-claude' as LayoutMode,
    label: 'Kanban + Claude',
    icon: 'mdi:view-column',
    description: 'Kanban board with Claude assistant (75/25 split)'
  },
  {
    value: 'kanban-only' as LayoutMode,
    label: 'Kanban Only',
    icon: 'mdi:view-agenda',
    description: 'Full screen kanban board for task management'
  }
];

const setMode = (mode: LayoutMode) => {
  layoutStore.setMode(mode);
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
  -webkit-app-region: no-drag; /* Prevent dragging on macOS */
}

.mode-group {
  display: flex;
  background: #2d2d30;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.mode-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.mode-button:hover {
  background: #37373d;
  color: #ffffff;
}

.mode-button.active {
  background: #007acc;
  color: #ffffff;
}

.mode-button.active:hover {
  background: #005a9e;
}

.mode-button span {
  font-size: 11px;
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