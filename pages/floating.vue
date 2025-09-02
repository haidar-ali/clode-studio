<template>
  <div class="floating-window-container">
    <div v-if="!moduleId" class="loading">
      Loading module...
    </div>
    <component 
      v-else
      :is="moduleComponent" 
      v-bind="moduleProps"
      class="floating-module-content"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import type { ModuleId } from '~/stores/layout';

// Get module ID from URL hash
const route = useRoute();
const moduleId = ref<ModuleId | null>(null);

onMounted(async () => {
  // Parse module ID and workspace from hash
  const hash = window.location.hash;
  const moduleMatch = hash.match(/floating-module=([^&]+)/);
  if (moduleMatch) {
    moduleId.value = moduleMatch[1] as ModuleId;
  }
  
  const workspaceMatch = hash.match(/workspace=([^&]+)/);
  if (workspaceMatch) {
    const workspacePath = decodeURIComponent(workspaceMatch[1]);
    
    // Set workspace path in localStorage so components can access it
    localStorage.setItem('workspacePath', workspacePath);
    
    // If we have electronAPI, set the workspace
    if (window.electronAPI?.setWorkspacePath) {
      await window.electronAPI.setWorkspacePath(workspacePath);
    }
    
    // Trigger workspace initialization
    window.dispatchEvent(new CustomEvent('workspace-loaded', { detail: { path: workspacePath } }));
  }
});

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
  claude: defineAsyncComponent(() => import('~/components/Terminal/ClaudeTerminalTabs.vue')),
  codex: defineAsyncComponent(() => import('~/components/Terminal/CodexTerminalTabs.vue')),
  agents: defineAsyncComponent(() => import('~/components/Agents/AgentOrchestrationPanelEnhanced.vue')),
  epics: defineAsyncComponent(() => import('~/components/Agents/EpicManagementPanel.vue')),
  monitoring: defineAsyncComponent(() => import('~/components/Agents/MonitoringDashboard.vue')),
  'knowledge-validation': defineAsyncComponent(() => import('~/components/Knowledge/KnowledgeValidationPanel.vue')),
  'knowledge-graph': defineAsyncComponent(() => import('~/components/Knowledge/KnowledgeGraphViewer.vue')),
  'context-budgeter': defineAsyncComponent(() => import('~/components/Agents/ContextBudgeterPanel.vue'))
};

// Get the component for the current module
const moduleComponent = computed(() => {
  if (!moduleId.value) return null;
  return moduleComponents[moduleId.value];
});

// Props to pass to module components
const moduleProps = computed(() => {
  // Add any module-specific props here
  const props: Record<string, any> = {};
  
  // Some modules might need workspace path
  if (moduleId.value === 'terminal' || moduleId.value === 'claude' || moduleId.value === 'codex') {
    // Get workspace path from store or electron API
    props.projectPath = localStorage.getItem('workspacePath') || '';
    props.worktreePath = props.projectPath;
  }
  
  return props;
});

// Set up communication with main window
onMounted(() => {
  if (window.electronAPI?.floatingWindow) {
    // Listen for workspace updates
    if (window.electronAPI?.ipcRenderer?.on) {
      window.electronAPI.ipcRenderer.on('floating-window:set-workspace', async (event: any, workspacePath: string) => {
        localStorage.setItem('workspacePath', workspacePath);
        
        if (window.electronAPI?.setWorkspacePath) {
          await window.electronAPI.setWorkspacePath(workspacePath);
        }
        
        // Trigger workspace initialization
        window.dispatchEvent(new CustomEvent('workspace-loaded', { detail: { path: workspacePath } }));
      });
    }
    
    // Listen for data updates from main window
    window.electronAPI.floatingWindow.onDataUpdate((data: any) => {
      // Handle data updates from main window
      console.log('Received data update:', data);
    });
    
    // Set up broadcasting
    const originalDispatchEvent = window.dispatchEvent;
    window.dispatchEvent = function(event: Event) {
      // Broadcast certain events to all windows
      if (event.type === 'task-updated' || 
          event.type === 'knowledge-updated' ||
          event.type === 'context-updated') {
        window.electronAPI.floatingWindow.broadcast(event.type, event);
      }
      return originalDispatchEvent.call(window, event);
    };
  }
});
</script>

<style scoped>
.floating-window-container {
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #cccccc;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 14px;
  color: #858585;
}

.floating-module-content {
  flex: 1;
  overflow: hidden;
}

/* Ensure proper styling for floating modules */
:deep(.panel-header) {
  background: #2d2d30;
  border-bottom: 1px solid #1e1e1e;
}

:deep(.panel-content) {
  background: #252526;
}

/* Remove any margins/paddings that might cause issues */
:deep(body) {
  margin: 0;
  padding: 0;
}
</style>