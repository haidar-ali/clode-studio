<template>
  <div class="ide-container" :class="{ 
    'mobile-layout': isMobile, 
    'tablet-layout': isTablet,
    'desktop-layout': isDesktop 
  }">
    <!-- Mode Selector -->
    <ModeSelector />
    
    <!-- Worktree Tab Bar -->
    <WorktreeTabBar />
    
    <!-- Mobile Layout: Single panel with bottom navigation -->
    <div v-if="isMobile" class="mobile-layout-container">
      <RemoteLeftDock />
      <MobileBottomNav 
        :active-tab="layoutStore.activeDock" 
        @change="handleMobileNavChange"
      />
    </div>
    
    <!-- Tablet/Desktop Layout: Three-Dock System -->
    <div v-else class="ide-with-activity-bar">
      <ActivityBar v-if="!isTablet" />
      
      <div class="ide-main-content">
        <!-- Simplified Three-Dock System -->
        <div class="layout-three-dock">
          <!-- Layout without bottom panel when minimized -->
          <div v-if="layoutStore.bottomPanelMinimized" class="main-content-full" key="minimized-layout">
            <Splitpanes 
              class="default-theme" 
              @ready="onSplitpanesReady"
            >
              <!-- Left Dock - Always visible, expands when right is hidden -->
              <Pane 
                :size="layoutStore.rightSidebarVisible ? 70 : 100" 
                :min-size="50"
              >
                <RemoteLeftDock />
              </Pane>

              <!-- Right Dock - Can be hidden -->
              <Pane 
                v-if="layoutStore.rightSidebarVisible || dragDropState?.isDragging"
                :size="30" 
                :min-size="20" 
                :max-size="50"
              >
                <RemoteRightSidebar v-if="layoutStore.rightSidebarVisible && layoutStore.dockConfig.rightDock.length > 0" />
                <RightDockShadow v-else />
              </Pane>
            </Splitpanes>
            
            <!-- Minimized Bottom Dock -->
            <div class="bottom-dock-minimized" :style="{ left: layoutStore.activityBarCollapsed ? '0' : '48px' }">
              <RemoteBottomDock />
            </div>
          </div>
          
          <!-- Layout with bottom panel when expanded -->
          <Splitpanes v-else horizontal class="default-theme" key="expanded-layout" @ready="onSplitpanesReady">
            <!-- Main Content Area -->
            <Pane 
              :size="layoutStore.bottomPanelSize" 
              :min-size="50"
            >
              <Splitpanes 
                class="default-theme"
                @ready="onSplitpanesReady"
              >
                <!-- Left Dock -->
                <Pane 
                  :size="layoutStore.rightSidebarVisible ? 70 : 100" 
                  :min-size="50"
                >
                  <RemoteLeftDock />
                </Pane>

                <!-- Right Dock -->
                <Pane 
                  v-if="layoutStore.rightSidebarVisible || dragDropState?.isDragging"
                  :size="30" 
                  :min-size="20" 
                  :max-size="50"
                >
                  <RemoteRightSidebar v-if="layoutStore.rightSidebarVisible && layoutStore.dockConfig.rightDock.length > 0" />
                  <RightDockShadow v-else />
                </Pane>
              </Splitpanes>
            </Pane>
            
            <!-- Bottom Dock -->
            <Pane 
              :size="100 - layoutStore.bottomPanelSize" 
              :min-size="20" 
              :max-size="50"
            >
              <RemoteBottomDock />
            </Pane>
          </Splitpanes>
        </div>
      </div>
    </div>

    <!-- Drag Indicator -->
    <DragIndicator />

    <!-- Command Palette - Disabled in remote mode due to Electron dependencies -->
    <!-- <CommandPalette :is-open="showCommandPalette" @close="showCommandPalette = false" /> -->
    
    <!-- Memory Editor Modal -->
    <MemoryEditorModal />
    
    <!-- Context Status Modal -->
    <ContextStatusModal />
    
    <!-- Session Browser Modal -->
    <SessionBrowserModal />
    
    <!-- Hook Manager Modal -->
    <HookManagerModal />
    
    <!-- Settings Modal -->
    <SettingsModal />
    
    <!-- MCP Manager Modal -->
    <MCPManagerModal v-model="showMCPModal" />
    
    <!-- Command Studio Modal -->
    <CommandStudioModal v-model="showCommandsModal" />
    
    <!-- Autocomplete Settings -->
    <AutocompleteSettingsModal :is-open="showAutocompleteSettings" @close="showAutocompleteSettings = false" />
    
    <!-- Global Input Modal -->
    <InputModal />
    
    <!-- Global Search -->
    <GlobalSearch 
      :is-open="showGlobalSearch" 
      @close="showGlobalSearch = false" 
    />
    
    <!-- Autocomplete Debug -->
    <AutocompleteDebug v-if="editorStore.showAutocompleteDebug" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';
import { useLayoutStore } from '~/stores/layout';
import { useMCPStore } from '~/stores/mcp';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import { useAdaptiveUI } from '~/composables/useAdaptiveUI';
// Remote-compatible services
import { useServices } from '~/composables/useServices';
// Import all the UI components
// import CommandPalette from '~/components/Commands/CommandPalette.vue'; // Disabled in remote mode
import MemoryEditorModal from '~/components/Memory/MemoryEditorModal.vue';
import ContextStatusModal from '~/components/Context/ContextStatusModal.vue';
import SessionBrowserModal from '~/components/Sessions/SessionBrowserModal.vue';
import HookManagerModal from '~/components/Hooks/HookManagerModal.vue';
import SettingsModal from '~/components/Settings/SettingsModal.vue';
import KnowledgePanel from '~/components/Knowledge/KnowledgePanel.vue';
import CommandStudio from '~/components/Commands/CommandStudio.vue';
import PromptStudio from '~/components/Prompts/PromptStudio.vue';
import InputModal from '~/components/Common/InputModal.vue';
import WorktreePanel from '~/components/Worktree/WorktreePanel.vue';
import WorktreeTabBar from '~/components/Layout/WorktreeTabBar.vue';
import SourceControlV2 from '~/components/SourceControlV2/SourceControlV2.vue';
import MCPManagerModal from '~/components/MCP/MCPManagerModal.vue';
import CommandStudioModal from '~/components/Commands/CommandStudioModal.vue';
import AutocompleteSettingsModal from '~/components/Editor/AutocompleteSettingsModal.vue';
import AutocompleteDebug from '~/components/Debug/AutocompleteDebug.vue';
import ActivityBar from '~/components/Layout/ActivityBar.vue';
import RemoteLeftDock from '~/components/Remote/RemoteLeftDock.vue';
import RemoteRightSidebar from '~/components/Remote/RemoteRightSidebar.vue';
import RightDockShadow from '~/components/Layout/RightDockShadow.vue';
import RemoteBottomDock from '~/components/Remote/RemoteBottomDock.vue';
import DragIndicator from '~/components/Layout/DragIndicator.vue';
import GlobalSearch from '~/components/Search/GlobalSearch.vue';
import ModeSelector from '~/components/Layout/ModeSelector.vue';
import MobileBottomNav from '~/components/Layout/MobileBottomNav.vue';

const editorStore = useEditorStore();
const tasksStore = useTasksStore();
const layoutStore = useLayoutStore();
const mcpStore = useMCPStore();
const { dragDropState } = useModuleDragDrop();
const { services, initialize } = useServices();

// Adaptive UI
const { isMobile, isTablet, isDesktop, layoutMode, sidebarBehavior } = useAdaptiveUI();

const bottomTab = ref<'tasks' | 'terminal' | 'context' | 'knowledge' | 'prompts' | 'source-control' | 'worktrees'>('tasks');
const showGlobalSearch = ref(false);
const showMCPModal = ref(false);
const showCommandsModal = ref(false);
const showAutocompleteSettings = ref(false);
const showCommandPalette = ref(false);

const taskCount = computed(() => tasksStore.taskCount);
const projectPath = computed(() => tasksStore.projectPath);

// Initialize services on mount
onMounted(async () => {
  await initialize();
  
  // Add keyboard listeners
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('open-global-search', handleOpenGlobalSearch);
  window.addEventListener('switch-bottom-tab', handleSwitchBottomTab as EventListener);
  window.addEventListener('switch-tab', handleSwitchTab as EventListener);
  window.addEventListener('show-mcp-modal', () => showMCPModal.value = true);
  window.addEventListener('show-commands-modal', () => showCommandsModal.value = true);
  window.addEventListener('show-autocomplete-settings', () => showAutocompleteSettings.value = true);
  
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('open-global-search', handleOpenGlobalSearch);
  window.removeEventListener('switch-bottom-tab', handleSwitchBottomTab as EventListener);
  window.removeEventListener('switch-tab', handleSwitchTab as EventListener);
  window.removeEventListener('show-mcp-modal', () => showMCPModal.value = true);
  window.removeEventListener('show-commands-modal', () => showCommandsModal.value = true);
  window.removeEventListener('show-autocomplete-settings', () => showAutocompleteSettings.value = true);
});

const handleResize = (event: any) => {
  // Handle resize events if needed
};

// Prevent splitpanes errors on ready
const onSplitpanesReady = () => {
  // Do nothing - just prevent errors
};

// Global keyboard shortcuts
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + Shift + F for global search
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
    event.preventDefault();
    event.stopPropagation();
    showGlobalSearch.value = true;
  }
  
  // Ctrl/Cmd + K for command palette
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    event.stopPropagation();
    showCommandPalette.value = true;
  }
};

// Handle custom event from FileTree
const handleOpenGlobalSearch = () => {
  showGlobalSearch.value = true;
};

// Handle bottom tab switching
const handleSwitchBottomTab = (event: CustomEvent) => {
  if (event.detail?.tab) {
    bottomTab.value = event.detail.tab;
  }
};

// Handle switching between tabs
const handleSwitchTab = (event: CustomEvent) => {
  if (event.detail) {
    const { tab, index } = event.detail;
    
    if (tab === 'tasks') {
      bottomTab.value = 'tasks';
    } else if (index !== undefined) {
      // Switch to specific tab by index
      editorStore.setActiveTab(index);
    }
  }
};

// Handle mobile navigation changes
const handleMobileNavChange = (tab: string) => {
  layoutStore.setActiveDock(tab);
};

</script>

<style scoped>
.ide-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  overflow: hidden;
}

.ide-with-activity-bar {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.ide-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-three-dock {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content-full {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.bottom-dock-minimized {
  position: absolute;
  bottom: 0;
  right: 0;
  height: 48px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  transition: left 0.2s ease;
  z-index: 10;
}

/* Splitpanes styling */
.splitpanes.default-theme .splitpanes__pane {
  background-color: #1e1e1e;
}

.splitpanes.default-theme .splitpanes__splitter {
  background-color: #3e3e42;
  border: none;
  position: relative;
}

.splitpanes.default-theme .splitpanes__splitter:hover {
  background-color: #007acc;
}

.splitpanes.default-theme .splitpanes__splitter:before,
.splitpanes.default-theme .splitpanes__splitter:after {
  background-color: transparent;
}

.splitpanes--vertical > .splitpanes__splitter {
  width: 1px;
  cursor: ew-resize;
}

.splitpanes--horizontal > .splitpanes__splitter {
  height: 1px;
  cursor: ns-resize;
}

.tab-content {
  flex: 1;
  overflow: hidden;
}

/* Mobile Layout Styles */
.mobile-layout-container {
  width: 100%;
  height: calc(100vh - 56px); /* Account for bottom nav */
  overflow: hidden;
}

.mobile-layout .ide-container {
  padding-bottom: 56px; /* Space for bottom nav */
}

.mobile-layout .splitpanes__splitter {
  display: none !important; /* Hide splitters on mobile */
}

.mobile-layout .activity-bar {
  display: none; /* Hide activity bar on mobile */
}

/* Tablet Layout Styles */
.tablet-layout .splitpanes__splitter {
  width: 3px !important; /* Bigger touch targets */
  height: 3px !important;
}

.tablet-layout .activity-bar {
  width: 56px; /* Wider for touch */
}

/* Responsive pane sizes */
@media (max-width: 768px) {
  .splitpanes__pane {
    min-width: 100% !important;
  }
  
  .bottom-dock-minimized {
    display: none;
  }
}

@media (max-width: 1024px) {
  .worktree-tab-bar {
    display: none; /* Hide on tablet/mobile */
  }
  
  .mode-selector {
    display: none; /* Hide on tablet/mobile */
  }
}
</style>