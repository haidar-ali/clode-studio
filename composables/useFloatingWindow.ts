import { ref, onMounted, onUnmounted } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';

interface FloatingWindowConfig {
  moduleId: ModuleId;
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  alwaysOnTop?: boolean;
}

// Module labels for window titles
const moduleLabels: Record<ModuleId, string> = {
  explorer: 'Explorer',
  'explorer-editor': 'Explorer + Editor',
  terminal: 'Terminal',
  tasks: 'Task Management',
  'source-control': 'Source Control',
  snapshots: 'Snapshots',
  worktrees: 'Worktrees',
  context: 'Context Manager',
  knowledge: 'Knowledge Base',
  prompts: 'Prompt Studio',
  claude: 'Claude AI',
  codex: 'Codex AI',
  agents: 'Agent Orchestration',
  epics: 'Epic Management',
  monitoring: 'Agent Monitoring',
  'knowledge-validation': 'Knowledge Validation',
  'knowledge-graph': 'Knowledge Graph',
  'context-budgeter': 'Context Budgeter'
};

export function useFloatingWindow() {
  const layoutStore = useLayoutStore();
  const floatingWindows = ref<Set<ModuleId>>(new Set());
  const isFloatingSupported = ref(false);

  // Check if we're in an Electron environment
  const checkElectronSupport = () => {
    isFloatingSupported.value = typeof window !== 'undefined' && 
                                 window.electronAPI && 
                                 window.electronAPI.floatingWindow;
  };

  // Create a floating window for a module
  const floatModule = async (moduleId: ModuleId) => {
    if (!isFloatingSupported.value) {
      console.warn('Floating windows not supported in this environment');
      return false;
    }

    try {
      // Check if already floating
      const isFloating = await window.electronAPI.floatingWindow.isFloating(moduleId);
      if (isFloating) {
        // Focus existing window
        await window.electronAPI.floatingWindow.focus(moduleId);
        return true;
      }

      // Get current workspace path from localStorage or electron API
      const workspacePath = localStorage.getItem('workspacePath') || 
                           await window.electronAPI?.getWorkspacePath?.() || 
                           '';

      const config: FloatingWindowConfig = {
        moduleId,
        title: `${moduleLabels[moduleId]} - Clode Studio`,
        width: getDefaultWidth(moduleId),
        height: getDefaultHeight(moduleId),
        alwaysOnTop: false,
        workspacePath
      };

      await window.electronAPI.floatingWindow.create(config);
      floatingWindows.value.add(moduleId);
      
      // Remove from dock if it's there (except for essential modules)
      if (!isEssentialModule(moduleId)) {
        layoutStore.removeModuleFromDock(moduleId);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to create floating window:', error);
      return false;
    }
  };

  // Close a floating window
  const closeFloatingWindow = async (moduleId: ModuleId) => {
    if (!isFloatingSupported.value) return false;

    try {
      const result = await window.electronAPI.floatingWindow.close(moduleId);
      if (result) {
        floatingWindows.value.delete(moduleId);
      }
      return result;
    } catch (error) {
      console.error('Failed to close floating window:', error);
      return false;
    }
  };

  // Toggle always on top for a floating window
  const toggleAlwaysOnTop = async (moduleId: ModuleId) => {
    if (!isFloatingSupported.value) return false;

    try {
      return await window.electronAPI.floatingWindow.toggleAlwaysOnTop(moduleId);
    } catch (error) {
      console.error('Failed to toggle always on top:', error);
      return false;
    }
  };

  // Check if a module is floating
  const isModuleFloating = async (moduleId: ModuleId): Promise<boolean> => {
    if (!isFloatingSupported.value) return false;

    try {
      return await window.electronAPI.floatingWindow.isFloating(moduleId);
    } catch (error) {
      console.error('Failed to check floating status:', error);
      return false;
    }
  };

  // Get list of all floating windows
  const getFloatingWindows = async (): Promise<ModuleId[]> => {
    if (!isFloatingSupported.value) return [];

    try {
      return await window.electronAPI.floatingWindow.list();
    } catch (error) {
      console.error('Failed to get floating windows:', error);
      return [];
    }
  };

  // Helper to determine default window dimensions
  const getDefaultWidth = (moduleId: ModuleId): number => {
    switch (moduleId) {
      case 'tasks':
        return 1200; // Kanban board needs more width
      case 'explorer':
      case 'explorer-editor':
        return 1000;
      case 'claude':
      case 'codex':
        return 900;
      case 'terminal':
        return 800;
      default:
        return 800;
    }
  };

  const getDefaultHeight = (moduleId: ModuleId): number => {
    switch (moduleId) {
      case 'tasks':
        return 800; // Kanban board needs more height
      case 'terminal':
        return 600;
      case 'claude':
      case 'codex':
        return 700;
      default:
        return 600;
    }
  };

  // Check if module is essential and shouldn't be removed from dock
  const isEssentialModule = (moduleId: ModuleId): boolean => {
    return moduleId === 'explorer-editor' || 
           moduleId === 'claude' || 
           moduleId === 'codex' ||
           moduleId === 'terminal';
  };

  // Setup event listeners
  onMounted(() => {
    checkElectronSupport();
    
    if (isFloatingSupported.value) {
      // Listen for floating window events
      window.electronAPI.floatingWindow.onOpened((moduleId: string) => {
        floatingWindows.value.add(moduleId as ModuleId);
      });

      window.electronAPI.floatingWindow.onClosed((moduleId: string) => {
        floatingWindows.value.delete(moduleId as ModuleId);
        
        // Optionally re-add to a dock if it was removed
        const module = moduleId as ModuleId;
        if (!layoutStore.dockConfig.leftDock.includes(module) &&
            !layoutStore.dockConfig.rightDock.includes(module) &&
            !layoutStore.dockConfig.bottomDock.includes(module)) {
          // Add back to appropriate default dock
          const defaultDock = getDefaultDock(module);
          if (defaultDock) {
            layoutStore.moveModuleToDock(module, defaultDock);
          }
        }
      });

      // Load initial floating windows
      getFloatingWindows().then(windows => {
        windows.forEach(w => floatingWindows.value.add(w));
      });
    }
  });

  // Helper to get default dock for a module
  const getDefaultDock = (moduleId: ModuleId): 'leftDock' | 'rightDock' | 'bottomDock' | null => {
    switch (moduleId) {
      case 'claude':
      case 'codex':
      case 'context':
      case 'knowledge':
        return 'rightDock';
      case 'terminal':
        return 'bottomDock';
      case 'explorer':
      case 'explorer-editor':
      case 'tasks':
      case 'source-control':
        return 'leftDock';
      default:
        return 'leftDock';
    }
  };

  return {
    floatingWindows,
    isFloatingSupported,
    floatModule,
    closeFloatingWindow,
    toggleAlwaysOnTop,
    isModuleFloating,
    getFloatingWindows
  };
}