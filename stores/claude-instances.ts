import { defineStore } from 'pinia';

export interface ClaudePersonality {
  id: string;
  name: string;
  description: string;
  instructions: string;
  icon?: string;
}

export interface ClaudeInstance {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  personalityId?: string;
  workingDirectory: string;
  pid?: number;
  createdAt: string; // ISO string for IPC serialization
  lastActiveAt: string; // ISO string for IPC serialization
}


export const useClaudeInstancesStore = defineStore('claudeInstances', {
  state: () => ({
    instances: new Map<string, ClaudeInstance>(),
    activeInstanceId: null as string | null,
    personalities: new Map<string, ClaudePersonality>(),
    defaultPersonalities: [
      {
        id: 'architect',
        name: 'Architect',
        description: 'System design and architecture focused',
        instructions: 'You are a system architect. Focus on design patterns, scalability, maintainability, and best practices. Consider long-term implications and system evolution.',
        icon: 'mdi:city-variant-outline'
      },
      {
        id: 'developer',
        name: 'Developer',
        description: 'Implementation and coding focused',
        instructions: 'You are a senior developer. Focus on clean code, performance, and practical implementation. Write efficient, readable, and well-tested code.',
        icon: 'mdi:code-braces'
      },
      {
        id: 'qa',
        name: 'QA Engineer',
        description: 'Testing and quality assurance focused',
        instructions: 'You are a QA engineer. Focus on edge cases, testing strategies, error handling, and quality metrics. Think about what could go wrong and how to prevent it.',
        icon: 'mdi:bug-check-outline'
      },
      {
        id: 'security',
        name: 'Security Engineer',
        description: 'Security and vulnerability focused',
        instructions: 'You are a security engineer. Focus on security vulnerabilities, best practices, threat modeling, and secure coding. Always consider potential attack vectors.',
        icon: 'mdi:shield-lock-outline'
      },
      {
        id: 'devops',
        name: 'DevOps Engineer',
        description: 'Infrastructure and deployment focused',
        instructions: 'You are a DevOps engineer. Focus on automation, CI/CD, monitoring, scalability, and infrastructure as code. Think about deployment and operational concerns.',
        icon: 'mdi:infinity'
      },
      {
        id: 'product',
        name: 'Product Manager',
        description: 'Product and user experience focused',
        instructions: 'You are a product manager. Focus on user needs, feature prioritization, MVP approach, and business value. Consider user experience and market fit.',
        icon: 'mdi:account-group-outline'
      },
      {
        id: 'marketing',
        name: 'Marketing',
        description: 'Marketing and growth focused',
        instructions: 'You are a marketing specialist. Focus on user acquisition, messaging, branding, and growth strategies. Think about how to communicate value effectively.',
        icon: 'mdi:bullhorn-outline'
      },
      {
        id: 'mentor',
        name: 'Mentor',
        description: 'Teaching and learning focused',
        instructions: 'You are a mentor. Focus on explaining concepts clearly, providing learning resources, and guiding through best practices. Be patient and educational.',
        icon: 'mdi:school-outline'
      }
    ] as ClaudePersonality[]
  }),

  getters: {
    instancesList: (state) => Array.from(state.instances.values()),
    activeInstance: (state) => state.activeInstanceId ? state.instances.get(state.activeInstanceId) : null,
    personalitiesList: (state) => Array.from(state.personalities.values()),
    getPersonalityById: (state) => (id: string) => state.personalities.get(id),
    getInstancePersonality: (state) => (instanceId: string) => {
      const instance = state.instances.get(instanceId);
      if (!instance?.personalityId) return null;
      return state.personalities.get(instance.personalityId);
    },
    getFormattedDate: () => (isoString: string) => {
      return new Date(isoString).toLocaleString();
    }
  },

  actions: {
    async init() {
      // Load default personalities
      this.$state.defaultPersonalities.forEach(personality => {
        this.personalities.set(personality.id, personality);
      });

      // Only proceed with storage operations if in Electron context
      if (typeof window !== 'undefined' && window.electronAPI?.store) {
        try {
          // Load custom personalities from storage
          const customPersonalities = await window.electronAPI.store.get('customPersonalities');
          if (customPersonalities && Array.isArray(customPersonalities)) {
            customPersonalities.forEach((personality: ClaudePersonality) => {
              this.personalities.set(personality.id, personality);
            });
          }

          // Load saved instances from storage
          const savedInstances = await window.electronAPI.store.get('claudeInstances');
          if (savedInstances && Array.isArray(savedInstances)) {
            savedInstances.forEach((instance: ClaudeInstance) => {
              // Reset status to disconnected on load
              instance.status = 'disconnected';
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
          console.error('Failed to load saved data:', error);
        }
      }

      // Create default instance if none exist
      if (this.instances.size === 0) {
        await this.createInstance('Claude 1');
      }
    },

    async createInstance(name: string, personalityId?: string, workingDirectory?: string): Promise<string> {
      const id = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Use provided working directory or get from storage
      if (!workingDirectory) {
        workingDirectory = '/';
        if (typeof window !== 'undefined' && window.electronAPI?.store?.get) {
          try {
            const storedWorkspace = await window.electronAPI.store.get('workspacePath');
            if (typeof storedWorkspace === 'string' && storedWorkspace) {
              workingDirectory = storedWorkspace;
            }
          } catch (error) {
            console.error('Failed to get workspace path:', error);
          }
        }
      }
      
      const instance: ClaudeInstance = {
        id,
        name,
        status: 'disconnected',
        personalityId,
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

      // Stop the instance if it's running
      if (instance.status === 'connected' && typeof window !== 'undefined' && window.electronAPI?.claude?.stop) {
        await window.electronAPI.claude.stop(id);
      }

      this.instances.delete(id);

      // If this was the active instance, switch to another one
      if (this.activeInstanceId === id) {
        const remaining = Array.from(this.instances.keys());
        this.activeInstanceId = remaining.length > 0 ? remaining[0] : null;
        
        // Create a new instance if none remain
        if (!this.activeInstanceId) {
          await this.createInstance('Claude 1');
        }
      }

      await this.saveInstances();
    },

    setActiveInstance(id: string) {
      if (this.instances.has(id)) {
        this.activeInstanceId = id;
        const instance = this.instances.get(id)!;
        instance.lastActiveAt = new Date().toISOString();
        this.saveInstances();
      }
    },

    updateInstanceStatus(id: string, status: ClaudeInstance['status'], pid?: number) {
      const instance = this.instances.get(id);
      if (instance) {
        instance.status = status;
        if (pid !== undefined) {
          instance.pid = pid;
        }
        if (status === 'disconnected') {
          delete instance.pid;
        }
        this.saveInstances();
      }
    },

    updateInstancePersonality(id: string, personalityId: string | undefined) {
      const instance = this.instances.get(id);
      if (instance) {
        instance.personalityId = personalityId;
        this.saveInstances();
      }
    },

    updateInstanceName(id: string, name: string) {
      const instance = this.instances.get(id);
      if (instance) {
        instance.name = name;
        this.saveInstances();
      }
    },

    async createCustomPersonality(personality: Omit<ClaudePersonality, 'id'>): Promise<string> {
      const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newPersonality = { ...personality, id };
      
      this.personalities.set(id, newPersonality);
      await this.saveCustomPersonalities();
      
      return id;
    },

    async updatePersonality(id: string, updates: Partial<ClaudePersonality>) {
      const personality = this.personalities.get(id);
      if (personality && !this.defaultPersonalities.find(p => p.id === id)) {
        Object.assign(personality, updates);
        await this.saveCustomPersonalities();
      }
    },

    async deletePersonality(id: string) {
      // Can't delete default personalities
      if (this.defaultPersonalities.find(p => p.id === id)) return;
      
      this.personalities.delete(id);
      
      // Update instances using this personality
      this.instances.forEach(instance => {
        if (instance.personalityId === id) {
          instance.personalityId = undefined;
        }
      });
      
      await this.saveCustomPersonalities();
      await this.saveInstances();
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
        await window.electronAPI.store.set('claudeInstances', serializableInstances);
      } catch (error) {
        console.error('Failed to save instances:', error);
      }
    },

    async saveCustomPersonalities() {
      if (typeof window === 'undefined' || !window.electronAPI?.store?.set) {
        console.warn('Electron API not available, skipping save');
        return;
      }
      
      try {
        const customPersonalities = Array.from(this.personalities.values())
          .filter(p => !this.defaultPersonalities.find(dp => dp.id === p.id));
        await window.electronAPI.store.set('customPersonalities', customPersonalities);
      } catch (error) {
        console.error('Failed to save personalities:', error);
      }
    },

    async updateAllInstancesWorkingDirectory(newPath: string) {
      
      
      // Update all instances with the new working directory
      this.instances.forEach((instance) => {
        instance.workingDirectory = newPath;
      });
      
      // Save the updated instances
      await this.saveInstances();
      
      // Store the new workspace path
      if (typeof window !== 'undefined' && window.electronAPI?.store?.set) {
        try {
          await window.electronAPI.store.set('workspacePath', newPath);
        } catch (error) {
          console.error('Failed to save workspace path:', error);
        }
      }
    },

    async saveWorkspaceConfiguration(workspacePath: string) {
      if (!workspacePath) return;
      
      // Save current instances configuration for this workspace
      const workspaceConfig = {
        instances: Array.from(this.instances.values()).map(instance => ({
          id: instance.id,
          name: instance.name,
          personalityId: instance.personalityId,
          workingDirectory: instance.workingDirectory,
          createdAt: instance.createdAt
        })),
        activeInstanceId: this.activeInstanceId
      };
      
      const key = `workspace-${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      if (typeof window !== 'undefined' && window.electronAPI?.store?.set) {
        try {
          await window.electronAPI.store.set(key, workspaceConfig);
          
        } catch (error) {
          console.error('Failed to save workspace configuration:', error);
        }
      }
    },

    async loadWorkspaceConfiguration(workspacePath: string) {
      if (!workspacePath) return;
      
      const key = `workspace-${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      if (typeof window !== 'undefined' && window.electronAPI?.store?.get) {
        try {
          const config = await window.electronAPI.store.get(key);
          
          if (config && config.instances) {
            
            
            // Clear current instances
            await this.clearAllInstances();
            
            // Restore instances from workspace config
            config.instances.forEach((instanceData: any) => {
              const instance: ClaudeInstance = {
                id: instanceData.id,
                name: instanceData.name,
                status: 'disconnected', // Always start disconnected
                personalityId: instanceData.personalityId,
                workingDirectory: workspacePath, // Use new workspace path
                createdAt: instanceData.createdAt,
                lastActiveAt: new Date().toISOString()
              };
              this.instances.set(instance.id, instance);
            });
            
            // Restore active instance
            if (config.activeInstanceId && this.instances.has(config.activeInstanceId)) {
              this.activeInstanceId = config.activeInstanceId;
            } else if (this.instances.size > 0) {
              this.activeInstanceId = this.instances.keys().next().value;
            }
            
            
          } else {
            
            // Create default instance if none exist
            if (this.instances.size === 0) {
              await this.createInstance('Claude 1', undefined, workspacePath);
            }
          }
        } catch (error) {
          console.error('Failed to load workspace configuration:', error);
        }
      }
    },

    async clearAllInstances() {
      // Stop all running instances
      for (const instance of this.instances.values()) {
        if (instance.status === 'connected') {
          try {
            await window.electronAPI.claude.stop(instance.id);
          } catch (error) {
            console.error('Failed to stop instance:', instance.id, error);
          }
        }
      }
      
      // Clear instances map
      this.instances.clear();
      this.activeInstanceId = null;
    },
    
    // Methods for checkpoint system
    restoreInstances(instances: Array<{ id: string; personality: string; messages: any[] }>) {
      // Clear existing instances
      this.instances.clear();
      
      // Restore instances from checkpoint
      instances.forEach(inst => {
        const personality = this.personalities.get(inst.personality);
        if (personality) {
          const newInstance: ClaudeInstance = {
            id: inst.id,
            name: `${personality.name} Instance`,
            personalityId: inst.personality,
            messages: inst.messages || [],
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
          };
          this.instances.set(inst.id, newInstance);
        }
      });
      
      // Set first instance as active if none selected
      if (!this.activeInstanceId && instances.length > 0) {
        this.activeInstanceId = instances[0].id;
      }
    }
  }
});