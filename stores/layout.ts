import { defineStore } from 'pinia';

export type LayoutMode = 'full-ide' | 'kanban-claude' | 'kanban-only';

export type ModuleId = 'explorer' | 'claude' | 'tasks' | 'knowledge' | 'context' | 
  'source-control' | 'checkpoints' | 'worktrees' | 'prompts' | 'terminal';

export interface DockConfiguration {
  leftDock: ModuleId[];
  rightDock: ModuleId[];
  bottomDock: ModuleId[];
}

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    currentMode: 'full-ide' as LayoutMode,
    kanbanClaudeSplit: 75, // Kanban takes 75%, Claude takes 25%
    
    // Activity bar state
    activeModule: 'explorer' as ModuleId,
    activityBarCollapsed: false,
    
    // Dock configuration
    dockConfig: {
      leftDock: ['explorer'],
      rightDock: ['claude'],
      bottomDock: ['terminal']
    } as DockConfiguration,
    
    // Active modules per dock
    activeLeftModule: 'explorer' as ModuleId,
    activeRightModule: 'claude' as ModuleId,
    activeBottomModule: 'terminal' as ModuleId,
    
    // Right sidebar state
    rightSidebarVisible: true,
    rightSidebarSplitView: false,
    rightSidebarWidth: 30,
    
    // Bottom panel state
    bottomPanelHeight: 30,
    bottomPanelMinimized: false,
  }),

  getters: {
    isFullIdeMode: (state) => state.currentMode === 'full-ide',
    isKanbanClaudeMode: (state) => state.currentMode === 'kanban-claude',
    isKanbanOnlyMode: (state) => state.currentMode === 'kanban-only',
    
    showFileTree: (state) => state.currentMode === 'full-ide',
    showEditor: (state) => state.currentMode === 'full-ide',
    showKanban: (state) => true, // Kanban is always visible
    showClaude: (state) => state.currentMode === 'full-ide' || state.currentMode === 'kanban-claude',
    
    layoutClasses: (state) => ({
      'layout-full-ide': state.currentMode === 'full-ide',
      'layout-kanban-claude': state.currentMode === 'kanban-claude',
      'layout-kanban-only': state.currentMode === 'kanban-only',
    }),
  },

  actions: {
    setMode(mode: LayoutMode) {
      this.currentMode = mode;
      // Save to localStorage for persistence
      localStorage.setItem('layoutMode', mode);
    },

    setSplit(kanbanPercentage: number) {
      this.kanbanClaudeSplit = Math.max(20, Math.min(80, kanbanPercentage));
    },

    loadSavedMode() {
      const saved = localStorage.getItem('layoutMode') as LayoutMode;
      if (saved && ['full-ide', 'kanban-claude', 'kanban-only'].includes(saved)) {
        this.currentMode = saved;
      }
    },
    
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
    
    setActivityBarCollapsed(collapsed: boolean) {
      this.activityBarCollapsed = collapsed;
    },
    
    // Dock management
    moveModuleToDock(moduleId: ModuleId, targetDock: 'leftDock' | 'rightDock' | 'bottomDock') {
      // Remove from all docks
      this.dockConfig.leftDock = this.dockConfig.leftDock.filter(id => id !== moduleId);
      this.dockConfig.rightDock = this.dockConfig.rightDock.filter(id => id !== moduleId);
      this.dockConfig.bottomDock = this.dockConfig.bottomDock.filter(id => id !== moduleId);
      
      // Add to target dock
      this.dockConfig[targetDock].push(moduleId);
      
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
          this.dockConfig = JSON.parse(savedDockConfig);
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