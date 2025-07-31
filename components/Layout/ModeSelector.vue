<template>
  <div class="mode-selector">
    <div class="title-area">
      <Icon name="mdi:view-dashboard" class="logo-icon" />
      <span class="app-title">Clode Studio</span>
    </div>
    
    <div class="controls">
      <!-- Worktree Bar Toggle (only show if git repository) -->
      <button
        v-if="sourceControlStore.isGitRepository"
        class="control-btn"
        @click="toggleWorktreeBar"
        :title="layoutStore.worktreeBarVisible ? 'Hide worktree bar' : 'Show worktree bar'"
      >
        <Icon :name="layoutStore.worktreeBarVisible ? 'mdi:source-branch-remove' : 'mdi:source-branch-plus'" size="16" />
      </button>
      
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
      
      <!-- Keyboard Shortcuts Help -->
      <div class="shortcuts-help">
        <button
          class="control-btn help-btn"
          @mouseenter="showShortcuts = true"
          @mouseleave="showShortcuts = false"
        >
          <Icon name="mdi:help-circle-outline" size="16" />
        </button>
        
        <!-- Shortcuts Tooltip -->
        <Transition name="tooltip">
          <div v-if="showShortcuts" class="shortcuts-tooltip">
            <div class="shortcuts-header">
              <Icon name="mdi:keyboard" size="16" />
              <span>Keyboard Shortcuts</span>
            </div>
            <div class="shortcuts-list">
              <div class="shortcut-section">
                <h4>General</h4>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Command Palette</span>
                  <span class="shortcut-keys">⌘K</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Save File</span>
                  <span class="shortcut-keys">⌘S</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Open File</span>
                  <span class="shortcut-keys">⌘O</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Global Search</span>
                  <span class="shortcut-keys">⌘⇧F</span>
                </div>
              </div>
              
              <div class="shortcut-section">
                <h4>AI Features</h4>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Generate Code</span>
                  <span class="shortcut-keys">⌘P</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Ghost Text (Manual)</span>
                  <span class="shortcut-keys">⌘G</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Memory Editor</span>
                  <span class="shortcut-keys">⌘M</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Autocomplete</span>
                  <span class="shortcut-keys">Ctrl+.</span>
                </div>
              </div>
              
              <div class="shortcut-section">
                <h4>Source Control</h4>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Commit</span>
                  <span class="shortcut-keys">⌘↵</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Capture Snapshot</span>
                  <span class="shortcut-keys">⌘⇧S</span>
                </div>
              </div>
              
              <div class="shortcut-section">
                <h4>Terminal</h4>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Clear Line</span>
                  <span class="shortcut-keys">⌘U</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Clear Terminal</span>
                  <span class="shortcut-keys">⌘L</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Next Tab</span>
                  <span class="shortcut-keys">Ctrl+Tab</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Previous Tab</span>
                  <span class="shortcut-keys">Ctrl+⇧Tab</span>
                </div>
              </div>
              
              <div class="shortcut-section">
                <h4>Instances</h4>
                <div class="shortcut-item">
                  <span class="shortcut-desc">New Claude Instance</span>
                  <span class="shortcut-keys">⌘T</span>
                </div>
              </div>
              
              <div class="shortcut-section">
                <h4>Debug</h4>
                <div class="shortcut-item">
                  <span class="shortcut-desc">Toggle Debug Panel</span>
                  <span class="shortcut-keys">Ctrl+⇧D</span>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLayoutStore } from '~/stores/layout';
import { useSourceControlStore } from '~/stores/source-control';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const sourceControlStore = useSourceControlStore();

// Shortcuts tooltip state
const showShortcuts = ref(false);

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

const toggleWorktreeBar = () => {
  layoutStore.toggleWorktreeBar();
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

/* Shortcuts Help */
.shortcuts-help {
  position: relative;
}

.help-btn {
  opacity: 0.7;
}

.help-btn:hover {
  opacity: 1;
}

.shortcuts-tooltip {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  width: 380px;
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  max-height: 70vh;
  overflow-y: auto;
}

.shortcuts-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #3e3e42;
  font-weight: 600;
  color: #cccccc;
  position: sticky;
  top: 0;
  background: #1e1e1e;
}

.shortcuts-list {
  padding: 8px 0 16px 0;
}

.shortcut-section {
  padding: 8px 16px;
}

.shortcut-section h4 {
  margin: 0 0 8px 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #858585;
  letter-spacing: 0.5px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}

.shortcut-desc {
  color: #cccccc;
}

.shortcut-keys {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 11px;
  color: #858585;
  background: #2d2d30;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid #3e3e42;
  white-space: nowrap;
}

/* Tooltip scrollbar */
.shortcuts-tooltip::-webkit-scrollbar {
  width: 8px;
}

.shortcuts-tooltip::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.shortcuts-tooltip::-webkit-scrollbar-thumb {
  background: #3e3e42;
  border-radius: 4px;
}

.shortcuts-tooltip::-webkit-scrollbar-thumb:hover {
  background: #545454;
}

/* Tooltip transition */
.tooltip-enter-active,
.tooltip-leave-active {
  transition: all 0.2s ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>