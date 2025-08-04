import { defineStore } from 'pinia';

export interface TerminalInstance {
  id: string;
  name: string;
  workingDirectory: string;
  ptyProcessId?: string;
  createdAt: string;
  lastActiveAt: string;
  savedBuffer?: string; // Add saved terminal buffer
}

export const useTerminalInstancesStore = defineStore('terminalInstances', {
  state: () => ({
    instances: new Map<string, TerminalInstance>(),
    activeInstanceId: null as string | null,
    activeInstanceByWorktree: new Map<string, string>(), // worktree path -> instance id
  }),

  getters: {
    instancesList: (state) => Array.from(state.instances.values()),
    activeInstance: (state) => state.activeInstanceId ? state.instances.get(state.activeInstanceId) : null,
    getActiveInstanceForWorktree: (state) => (worktreePath: string) => {
      const instanceId = state.activeInstanceByWorktree.get(worktreePath);
      return instanceId ? state.instances.get(instanceId) : null;
    },
    getInstancesForWorktree: (state) => (worktreePath: string) => {
      return Array.from(state.instances.values()).filter(instance => instance.workingDirectory === worktreePath);
    }
  },

  actions: {
    async init() {
      
      // Only proceed with storage operations if in Electron context
      if (typeof window !== 'undefined' && window.electronAPI?.store) {
        try {
          // Clear PTY process IDs on startup since they don't persist
          const savedInstances = await window.electronAPI.store.get('terminalInstances');
          
          if (savedInstances && Array.isArray(savedInstances)) {
            savedInstances.forEach((instance: TerminalInstance) => {
              
              // Clear PTY process ID on app startup since processes don't persist
              delete instance.ptyProcessId;
              
              // Ensure dates are strings
              if (instance.createdAt && typeof instance.createdAt !== 'string') {
                instance.createdAt = new Date(instance.createdAt).toISOString();
              }
              if (instance.lastActiveAt && typeof instance.lastActiveAt !== 'string') {
                instance.lastActiveAt = new Date(instance.lastActiveAt).toISOString();
              }
              this.instances.set(instance.id, instance);
            });
          }
          
        } catch (error) {
          console.error('Failed to load saved terminal instances:', error);
        }
      }
    },

    async createInstance(name: string, workingDirectory: string): Promise<string> {
      const id = `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const instance: TerminalInstance = {
        id,
        name,
        workingDirectory,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      };

      this.instances.set(id, instance);
      this.activeInstanceId = id;
      
      // Track active instance per worktree
      this.activeInstanceByWorktree.set(workingDirectory, id);
      
      await this.saveInstances();
      await this.saveWorkspaceConfiguration(workingDirectory);
      
      return id;
    },

    async removeInstance(id: string) {
      const instance = this.instances.get(id);
      if (!instance) return;

      // Destroy the PTY process if it exists
      if (instance.ptyProcessId && typeof window !== 'undefined' && window.electronAPI?.terminal?.destroy) {
        try {
          await window.electronAPI.terminal.destroy(instance.ptyProcessId);
        } catch (error) {
          console.error('Failed to destroy terminal:', error);
        }
      }

      this.instances.delete(id);

      // If this was the active instance, switch to another one
      if (this.activeInstanceId === id) {
        const remaining = Array.from(this.instances.keys());
        this.activeInstanceId = remaining.length > 0 ? remaining[0] : null;
      }

      await this.saveInstances();
      await this.saveWorkspaceConfiguration(instance.workingDirectory);
    },

    setActiveInstance(id: string) {
      if (this.instances.has(id)) {
        this.activeInstanceId = id;
        const instance = this.instances.get(id)!;
        instance.lastActiveAt = new Date().toISOString();
        
        // Track active instance per worktree
        if (instance.workingDirectory) {
          this.activeInstanceByWorktree.set(instance.workingDirectory, id);
        }
        
        this.saveInstances();
      }
    },

    updateInstanceName(id: string, name: string) {
      const instance = this.instances.get(id);
      if (instance) {
        instance.name = name;
        this.saveInstances();
        this.saveWorkspaceConfiguration(instance.workingDirectory);
      }
    },

    updateInstancePtyProcess(id: string, ptyProcessId: string | undefined) {
      const instance = this.instances.get(id);
      if (instance) {
        instance.ptyProcessId = ptyProcessId;
        this.saveInstances();
        // Also save workspace configuration so PTY IDs are persisted per worktree
        if (instance.workingDirectory) {
          this.saveWorkspaceConfiguration(instance.workingDirectory);
        }
      } else {
      }
    },

    saveTerminalBuffer(id: string, buffer: string) {
      const instance = this.instances.get(id);
      if (instance) {
        instance.savedBuffer = buffer;
        // Don't persist to storage here, just keep in memory
      }
    },

    getTerminalBuffer(id: string): string | undefined {
      const instance = this.instances.get(id);
      const buffer = instance?.savedBuffer;
      if (buffer) {
        // Clear after retrieval to free memory
        instance.savedBuffer = undefined;
      }
      return buffer;
    },

    async saveInstances() {
      if (typeof window === 'undefined' || !window.electronAPI?.store?.set) {
        console.warn('Electron API not available, skipping save');
        return;
      }
      
      try {
        const instancesArray = Array.from(this.instances.values());
        // Ensure all data is serializable
        const serializableInstances = instancesArray.map(inst => ({
          ...inst,
          // Ensure dates are strings
          createdAt: typeof inst.createdAt === 'string' ? inst.createdAt : new Date(inst.createdAt).toISOString(),
          lastActiveAt: typeof inst.lastActiveAt === 'string' ? inst.lastActiveAt : new Date(inst.lastActiveAt).toISOString()
        }));
        await window.electronAPI.store.set('terminalInstances', serializableInstances);
      } catch (error) {
        console.error('Failed to save terminal instances:', error);
      }
    },

    async saveWorkspaceConfiguration(workspacePath: string) {
      if (!workspacePath) return;
      
      
      // Group instances by their working directory (worktree)
      const instancesByWorktree = new Map<string, any[]>();
      
      Array.from(this.instances.values()).forEach(instance => {
        const worktreePath = instance.workingDirectory;
        if (!instancesByWorktree.has(worktreePath)) {
          instancesByWorktree.set(worktreePath, []);
        }
        instancesByWorktree.get(worktreePath)!.push({
          id: instance.id,
          name: instance.name,
          workingDirectory: instance.workingDirectory,
          ptyProcessId: instance.ptyProcessId,
          createdAt: instance.createdAt
        });
      });
      
      // Save configuration for each worktree
      for (const [worktreePath, instances] of instancesByWorktree) {
        const key = `terminal-worktree-${worktreePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const worktreeConfig = {
          instances,
          activeInstanceId: this.activeInstanceByWorktree.get(worktreePath) || 
                          (instances.find(inst => inst.id === this.activeInstanceId) ? this.activeInstanceId : null)
        };
        
        if (typeof window !== 'undefined' && window.electronAPI?.store?.set) {
          try {
            await window.electronAPI.store.set(key, worktreeConfig);
          } catch (error) {
            console.error('Failed to save worktree terminal configuration:', error);
          }
        }
      }
    },

    async loadWorkspaceConfiguration(workspacePath: string) {
      if (!workspacePath) return;
      
      
      // Load configurations for this specific worktree
      const key = `terminal-worktree-${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      if (typeof window !== 'undefined' && window.electronAPI?.store?.get) {
        try {
          const config = await window.electronAPI.store.get(key);
          
          if (config && config.instances) {
            // Restore instances from worktree config
            for (const instanceData of config.instances) {
              // Check if instance already exists (preserve savedBuffer)
              const existingInstance = this.instances.get(instanceData.id);
              
              // Check if PTY is still alive before restoring
              let ptyProcessId = instanceData.ptyProcessId;
              if (ptyProcessId) {
                const isAlive = await this.isPtyAlive(ptyProcessId);
                if (!isAlive) {
                  ptyProcessId = undefined;
                }
              }
              
              const instance: TerminalInstance = {
                id: instanceData.id,
                name: instanceData.name,
                workingDirectory: instanceData.workingDirectory,
                ptyProcessId,
                createdAt: instanceData.createdAt,
                lastActiveAt: new Date().toISOString(),
                savedBuffer: existingInstance?.savedBuffer // Preserve saved buffer
              };
              this.instances.set(instance.id, instance);
            }
            
            
            // Set active instance for this worktree if it exists
            if (config.activeInstanceId && this.instances.has(config.activeInstanceId)) {
              this.activeInstanceByWorktree.set(workspacePath, config.activeInstanceId);
              // Only set global active instance if we're loading the current worktree
              const { useWorkspaceManager } = await import('~/composables/useWorkspaceManager');
              const workspaceManager = useWorkspaceManager();
              if (workspaceManager.activeWorktreePath.value === workspacePath) {
                this.activeInstanceId = config.activeInstanceId;
              }
            }
            
          } else {
            // No configuration found for this worktree, create default instance
            await this.createInstance('Terminal 1', workspacePath);
          }
        } catch (error) {
          console.error('Failed to load workspace terminal configuration:', error);
        }
      }
    },

    async clearAllInstances() {
      // Destroy all PTY processes
      for (const instance of this.instances.values()) {
        if (instance.ptyProcessId) {
          try {
            await window.electronAPI.terminal.destroy(instance.ptyProcessId);
          } catch (error) {
            console.error('Failed to destroy terminal:', instance.id, error);
          }
        }
      }
      
      // Clear instances map
      this.instances.clear();
      this.activeInstanceId = null;
      this.activeInstanceByWorktree.clear();
    },

    // Check if a PTY process is still alive
    async isPtyAlive(ptyProcessId: string): Promise<boolean> {
      if (!ptyProcessId || typeof window === 'undefined' || !window.electronAPI?.terminal) {
        return false;
      }
      
      try {
        // Try to write an empty string to check if PTY is alive
        const result = await window.electronAPI.terminal.write(ptyProcessId, '');
        return result && result.success === true;
      } catch (error) {
        return false;
      }
    }
  }
});

// Export a global function for accessing terminal instances from Electron
if (typeof window !== 'undefined') {
  (window as any).__getTerminalInstances = () => {
    const store = useTerminalInstancesStore();
    // Return only serializable properties
    return Array.from(store.instances.values()).map(instance => ({
      id: instance.id,
      name: instance.name,
      workingDirectory: instance.workingDirectory,
      ptyProcessId: instance.ptyProcessId,
      createdAt: instance.createdAt,
      lastActiveAt: instance.lastActiveAt
    }));
  };
}