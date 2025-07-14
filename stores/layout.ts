import { defineStore } from 'pinia';

export type LayoutMode = 'full-ide' | 'kanban-claude' | 'kanban-only';

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    currentMode: 'full-ide' as LayoutMode,
    kanbanClaudeSplit: 75, // Kanban takes 75%, Claude takes 25%
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
  },
});