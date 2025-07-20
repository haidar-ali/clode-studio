import { defineStore } from 'pinia';

export interface Hook {
  id: string;
  event: string;
  matcher: string;
  command: string;
  disabled?: boolean;
  description?: string;
}

export const useHooksStore = defineStore('hooks', {
  state: () => ({
    hooks: [] as Hook[],
    isLoading: false,
    error: null as string | null
  }),

  getters: {
    activeHooks(): Hook[] {
      return this.hooks.filter(hook => !hook.disabled);
    },

    hooksByEvent(): Record<string, Hook[]> {
      const grouped: Record<string, Hook[]> = {};
      
      for (const hook of this.hooks) {
        if (!grouped[hook.event]) {
          grouped[hook.event] = [];
        }
        grouped[hook.event].push(hook);
      }
      
      return grouped;
    }
  },

  actions: {
    async loadHooks() {
      this.isLoading = true;
      this.error = null;
      
      try {
        const result = await window.electronAPI.claude.getHooks();
        console.log('Loaded hooks from API:', result);
        
        // Handle both direct array response and wrapped response
        if (Array.isArray(result)) {
          this.hooks = result;
        } else if (result && result.success && Array.isArray(result.hooks)) {
          this.hooks = result.hooks;
        } else {
          this.hooks = [];
        }
      } catch (error) {
        console.error('Failed to load hooks:', error);
        this.error = 'Failed to load hooks';
        this.hooks = [];
      } finally {
        this.isLoading = false;
      }
    },

    async addHook(hook: Omit<Hook, 'id'>) {
      try {
        const result = await window.electronAPI.claude.addHook(hook);
        await this.loadHooks(); // Reload to get the new hook with ID
        return result;
      } catch (error) {
        console.error('Failed to add hook:', error);
        throw error;
      }
    },

    async updateHook(id: string, updates: Partial<Hook>) {
      try {
        await window.electronAPI.claude.updateHook(id, updates);
        await this.loadHooks();
      } catch (error) {
        console.error('Failed to update hook:', error);
        throw error;
      }
    },

    async removeHook(id: string) {
      try {
        await window.electronAPI.claude.removeHook(id);
        await this.loadHooks();
      } catch (error) {
        console.error('Failed to remove hook:', error);
        throw error;
      }
    },

    async testHook(hook: Hook) {
      try {
        return await window.electronAPI.claude.testHook(hook);
      } catch (error) {
        console.error('Failed to test hook:', error);
        throw error;
      }
    }
  }
});