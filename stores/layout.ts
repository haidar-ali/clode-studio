import { defineStore } from 'pinia';

// Layout mode removed - always using full IDE mode with modular docks

export type ModuleId = 'explorer' | 'explorer-editor' | 'claude' | 'tasks' | 'knowledge' | 'context' | 
  'source-control' | 'checkpoints' | 'worktrees' | 'prompts' | 'terminal';

export interface DockConfiguration {
  leftDock: ModuleId[];
  rightDock: ModuleId[];
  bottomDock: ModuleId[];
}

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    // Activity bar state
    activeModule: 'explorer' as ModuleId,
    activityBarCollapsed: false,
    
    // Dock configuration - start with explorer-editor in left dock by default
    dockConfig: {
      leftDock: ['explorer-editor'],
      rightDock: ['claude'],
      bottomDock: ['terminal']
    } as DockConfiguration,
    
    // Active modules per dock
    activeLeftModule: 'explorer-editor' as ModuleId,
    activeRightModule: 'claude' as ModuleId,
    activeBottomModule: 'terminal' as ModuleId,
    secondaryRightModule: null as ModuleId | null,
    
    // Right sidebar state
    rightSidebarVisible: true,
    rightSidebarSplitView: false,
    rightSidebarWidth: 30,
    
    // Bottom panel state
    bottomPanelHeight: 30,
    bottomPanelMinimized: false,
  }),

  getters: {
    // Always in full IDE mode now
    isFullIdeMode: () => true,
    isKanbanClaudeMode: () => false,
    isKanbanOnlyMode: () => false,
  },

  actions: {
    // Layout mode methods removed - always using full IDE mode
    
    // Activity bar actions
    setActiveModule(moduleId: ModuleId) {
      this.activeModule = moduleId;
      localStorage.setItem('activeModule', moduleId);
      
      // Find which dock contains this module
      if (this.dockConfig.leftDock.includes(moduleId)) {
        this.activeLeftModule = moduleId;
      } else if (this.dockConfig.rightDock.includes(moduleId)) {
        this.activeRightModule = moduleId;
        this.rightSidebarVisible = true;
      } else if (this.dockConfig.bottomDock.includes(moduleId)) {
        this.activeBottomModule = moduleId;
      } else {
        // Module not in any dock, add to right dock
        this.moveModuleToDock(moduleId, 'rightDock');
        this.activeRightModule = moduleId;
        this.rightSidebarVisible = true;
      }
    },
    
    setActiveLeftModule(moduleId: ModuleId) {
      if (this.dockConfig.leftDock.includes(moduleId)) {
        this.activeLeftModule = moduleId;
      }
    },
    
    setActiveRightModule(moduleId: ModuleId) {
      if (this.dockConfig.rightDock.includes(moduleId)) {
        this.activeRightModule = moduleId;
      }
    },
    
    setActiveBottomModule(moduleId: ModuleId) {
      if (this.dockConfig.bottomDock.includes(moduleId)) {
        this.activeBottomModule = moduleId;
      }
    },
    
    setSecondaryRightModule(moduleId: ModuleId | null) {
      if (moduleId === null || this.dockConfig.rightDock.includes(moduleId)) {
        this.secondaryRightModule = moduleId;
      }
    },
    
    setActivityBarCollapsed(collapsed: boolean) {
      this.activityBarCollapsed = collapsed;
    },
    
    // Dock management
    moveModuleToDock(moduleId: ModuleId, targetDock: 'leftDock' | 'rightDock' | 'bottomDock') {
      // Don't allow moving explorer-editor
      if (moduleId === 'explorer-editor') {
        console.warn('Cannot move explorer-editor module');
        return;
      }
      
      // Don't allow moving claude from right dock
      if (moduleId === 'claude' && targetDock !== 'rightDock') {
        console.warn('Cannot move Claude AI from right dock');
        return;
      }
      
      // Remove from all docks
      this.dockConfig.leftDock = this.dockConfig.leftDock.filter(id => id !== moduleId);
      this.dockConfig.rightDock = this.dockConfig.rightDock.filter(id => id !== moduleId);
      this.dockConfig.bottomDock = this.dockConfig.bottomDock.filter(id => id !== moduleId);
      
      // Add to target dock
      this.dockConfig[targetDock].push(moduleId);
      
      // Save dock configuration
      this.saveDockConfig();
    },
    
    removeModuleFromDock(moduleId: ModuleId) {
      // Don't allow removing explorer-editor
      if (moduleId === 'explorer-editor') {
        console.warn('Cannot remove explorer-editor module');
        return;
      }
      
      // Don't allow removing claude
      if (moduleId === 'claude') {
        console.warn('Cannot remove Claude AI module');
        return;
      }
      
      // Remove from all docks
      this.dockConfig.leftDock = this.dockConfig.leftDock.filter(id => id !== moduleId);
      this.dockConfig.rightDock = this.dockConfig.rightDock.filter(id => id !== moduleId);
      this.dockConfig.bottomDock = this.dockConfig.bottomDock.filter(id => id !== moduleId);
      
      // If it was the active module in a dock, clear it
      if (this.activeLeftModule === moduleId) {
        this.activeLeftModule = this.dockConfig.leftDock[0] || 'explorer-editor';
      }
      if (this.activeRightModule === moduleId) {
        this.activeRightModule = this.dockConfig.rightDock[0] || 'claude';
      }
      if (this.activeBottomModule === moduleId) {
        this.activeBottomModule = this.dockConfig.bottomDock[0] || 'terminal';
      }
      
      // Save dock configuration
      this.saveDockConfig();
    },
    
    // Right sidebar actions
    toggleRightSidebar() {
      this.rightSidebarVisible = !this.rightSidebarVisible;
      // Emit event to force splitpanes recalculation
      window.dispatchEvent(new Event('resize'));
    },
    
    toggleRightSidebarSplit() {
      this.rightSidebarSplitView = !this.rightSidebarSplitView;
      localStorage.setItem('rightSidebarSplit', this.rightSidebarSplitView.toString());
    },
    
    setRightSidebarWidth(width: number) {
      this.rightSidebarWidth = Math.max(20, Math.min(50, width));
    },
    
    // Bottom panel actions
    setBottomPanelHeight(height: number) {
      this.bottomPanelHeight = Math.max(15, Math.min(50, height));
    },
    
    toggleBottomPanel() {
      this.bottomPanelMinimized = !this.bottomPanelMinimized;
    },
    
    // Persistence
    saveDockConfig() {
      localStorage.setItem('dockConfig', JSON.stringify(this.dockConfig));
    },
    
    loadLayoutConfig() {
      // Load active module
      const savedModule = localStorage.getItem('activeModule') as ModuleId;
      if (savedModule) {
        this.activeModule = savedModule;
      }
      
      // Load dock config
      const savedDockConfig = localStorage.getItem('dockConfig');
      if (savedDockConfig) {
        try {
          const parsed = JSON.parse(savedDockConfig);
          // Ensure we have at least empty arrays for each dock
          this.dockConfig = {
            leftDock: parsed.leftDock || [],
            rightDock: parsed.rightDock || [],
            bottomDock: parsed.bottomDock || []
          };
          
          // Ensure explorer-editor is always in left dock
          if (!this.dockConfig.leftDock.includes('explorer-editor')) {
            this.dockConfig.leftDock.unshift('explorer-editor');
          }
          
          // Ensure claude is always in right dock
          if (!this.dockConfig.rightDock.includes('claude')) {
            this.dockConfig.rightDock.unshift('claude');
          }
          
          // If docks are missing, add defaults
          if (this.dockConfig.rightDock.length === 0) {
            this.dockConfig.rightDock = ['claude'];
          }
          if (this.dockConfig.bottomDock.length === 0) {
            this.dockConfig.bottomDock = ['terminal'];
          }
        } catch (e) {
          console.error('Failed to load dock config:', e);
        }
      }
      
      // Load right sidebar split
      const savedSplit = localStorage.getItem('rightSidebarSplit');
      if (savedSplit !== null) {
        this.rightSidebarSplitView = savedSplit === 'true';
      }
    },
  },
});