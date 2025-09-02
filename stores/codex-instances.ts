import { defineStore } from 'pinia';

export interface CodexInstance {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  workingDirectory: string;
  pid?: number;
  createdAt: string;
  lastActiveAt: string;
  color?: string;
}

export const useCodexInstancesStore = defineStore('codexInstances', {
  state: () => ({
    instances: new Map<string, CodexInstance>(),
    activeInstanceId: null as string | null,
    activeInstanceByWorktree: new Map<string, string>(),
    reloadTimeout: null as NodeJS.Timeout | null
  }),

  getters: {
    instancesList: (state) => Array.from(state.instances.values()),
    activeInstance: (state) => state.activeInstanceId ? state.instances.get(state.activeInstanceId) : null,
    getInstanceById: (state) => (id: string) => state.instances.get(id)
  },

  actions: {
    async init() {
      if (typeof window === 'undefined' || !window.electronAPI?.store) return;

      try {
        const saved = await window.electronAPI.store.get('codexInstances');
        if (Array.isArray(saved)) {
          saved.forEach((instance: CodexInstance) => {
            instance.status = 'disconnected';
            delete instance.pid;
            if (instance.createdAt && typeof instance.createdAt !== 'string') {
              instance.createdAt = new Date(instance.createdAt).toISOString();
            }
            if (instance.lastActiveAt && typeof instance.lastActiveAt !== 'string') {
              instance.lastActiveAt = new Date(instance.lastActiveAt).toISOString();
            }
            this.instances.set(instance.id, instance);
          });
        }
      } catch (e) {
        console.error('Failed to load Codex instances:', e);
      }

      if (this.instances.size === 0) {
        await this.createInstance('Codex 1');
      }
    },

    async reloadInstances() {
      if (typeof window === 'undefined' || !window.electronAPI?.store) return;
      
      try {
        const saved = await window.electronAPI.store.get('codexInstances');
        if (Array.isArray(saved)) {
          // Clear existing instances
          this.instances.clear();
          
          // Reload from store
          saved.forEach((instance: CodexInstance) => {
            // Keep status from saved state for remote sync
            if (instance.createdAt && typeof instance.createdAt !== 'string') {
              instance.createdAt = new Date(instance.createdAt).toISOString();
            }
            if (instance.lastActiveAt && typeof instance.lastActiveAt !== 'string') {
              instance.lastActiveAt = new Date(instance.lastActiveAt).toISOString();
            }
            this.instances.set(instance.id, instance);
          });
        }
      } catch (e) {
        console.error('Failed to reload Codex instances:', e);
      }
    },

    async createInstance(name: string, workingDirectory?: string) {
      const id = `codex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      if (!workingDirectory) {
        workingDirectory = '/';
        try {
          const ws = await window.electronAPI.store.get('workspacePath');
          if (typeof ws === 'string' && ws) workingDirectory = ws;
        } catch {}
      }

      const instance: CodexInstance = {
        id,
        name,
        status: 'disconnected',
        workingDirectory,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      };

      this.instances.set(id, instance);
      this.activeInstanceId = id;
      await this.saveInstances();
      return id;
    },

    async removeInstance(id: string) {
      const instance = this.instances.get(id);
      if (!instance) return;

      if (instance.status === 'connected' && window.electronAPI?.codex?.stop) {
        try { await window.electronAPI.codex.stop(id); } catch {}
      }

      this.instances.delete(id);
      if (this.activeInstanceId === id) {
        const remaining = Array.from(this.instances.keys());
        this.activeInstanceId = remaining.length ? remaining[0] : null;
        if (!this.activeInstanceId) {
          await this.createInstance('Codex 1');
        }
      }
      await this.saveInstances();
    },

    setActiveInstance(id: string) {
      if (!this.instances.has(id)) return;
      this.activeInstanceId = id;
      const inst = this.instances.get(id)!;
      const updated = { ...inst, lastActiveAt: new Date().toISOString() };
      this.instances.set(id, updated);
      if (updated.workingDirectory) {
        this.activeInstanceByWorktree.set(updated.workingDirectory, id);
      }
    },

    updateInstanceStatus(id: string, status: CodexInstance['status'], pid?: number) {
      const inst = this.instances.get(id);
      if (!inst) return;
      const updated = { ...inst, status } as CodexInstance;
      if (pid !== undefined) updated.pid = pid; else if (status === 'disconnected') delete updated.pid;
      this.instances.delete(id);
      this.instances.set(id, updated);
    },

    async updateInstanceName(id: string, name: string) {
      const inst = this.instances.get(id);
      if (!inst) return;
      const updated = { ...inst, name } as CodexInstance;
      this.instances.set(id, updated);
      await this.saveInstances();
    },

    updateInstanceColor(id: string, color?: string) {
      const inst = this.instances.get(id);
      if (!inst) return;
      const updated = { ...inst } as CodexInstance;
      if (color) updated.color = color; else delete updated.color;
      this.instances.set(id, updated);
      this.saveInstances();
    },

    async saveInstances() {
      if (typeof window === 'undefined' || !window.electronAPI?.store) return;
      try {
        // Create a clean serializable array with only the necessary properties
        const list = Array.from(this.instances.values()).map(instance => ({
          id: instance.id,
          name: instance.name,
          status: instance.status,
          workingDirectory: instance.workingDirectory,
          createdAt: instance.createdAt,
          lastActiveAt: instance.lastActiveAt,
          ...(instance.color && { color: instance.color })
        }));
        await window.electronAPI.store.set('codexInstances', list);
        // Notify renderers using a codex-specific channel
        window.electronAPI.send('codex-instances-updated', {});
      } catch (e) {
        console.error('Failed to save Codex instances:', e);
      }
    },
  }
});

// Export helpers for Electron side if needed
if (typeof window !== 'undefined') {
  (window as any).__getCodexInstances = () => {
    const store = useCodexInstancesStore();
    return Array.from(store.instances.values()).map(instance => ({
      id: instance.id,
      name: instance.name,
      status: instance.status,
      workingDirectory: instance.workingDirectory,
      createdAt: instance.createdAt,
      lastActiveAt: instance.lastActiveAt,
      color: instance.color,
      pid: instance.pid
    }));
  };

  (window as any).__getCodexStore = () => {
    return useCodexInstancesStore();
  };
}
