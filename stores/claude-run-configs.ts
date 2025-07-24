import { defineStore } from 'pinia';
import { v4 as uuidv4 } from 'uuid';

export interface ClaudeRunConfig {
  id: string;
  name: string;
  command: string;  // e.g., 'claude', 'claude update', etc.
  args: string[];   // Additional arguments like '--dangerously-skip-permissions'
  env?: Record<string, string>; // Environment variables
  isDefault: boolean;
  isHardcoded?: boolean; // Flag to indicate built-in configs that cannot be edited/deleted
  createdAt: Date;
  updatedAt: Date;
}

export const useClaudeRunConfigsStore = defineStore('claudeRunConfigs', {
  state: () => ({
    configs: [] as ClaudeRunConfig[],
    activeConfigId: null as string | null,
    projectPath: null as string | null,
  }),

  getters: {
    allConfigs: (state) => state.configs,
    defaultConfig: (state) => state.configs.find(c => c.isDefault) || null,
    activeConfig: (state) => state.configs.find(c => c.id === state.activeConfigId) || null,
    getConfigById: (state) => (id: string) => state.configs.find(c => c.id === id),
  },

  actions: {
    async initialize(projectPath?: string) {
      try {
        // Use provided project path or get from workspace store
        if (projectPath) {
          this.projectPath = projectPath;
        } else {
          const workspacePath = await window.electronAPI.store.get('workspacePath');
          if (workspacePath) {
            this.projectPath = workspacePath;
          }
        }
        
        if (!this.projectPath) {
          console.warn('No project path available, using defaults only');
          await this.createDefaultConfigs();
          return;
        }
        
        // Clear existing configs
        this.configs = [];
        
        // First, create default hardcoded configs
        await this.createDefaultConfigs();
        
        // Then load custom configs from project directory
        const configsPath = `${this.projectPath}/.claude/run-configs`;
        
        // Ensure directory exists
        await window.electronAPI.fs.ensureDir(configsPath);
        
        // Read all JSON files from the directory
        const dirResult = await window.electronAPI.fs.readDir(configsPath);
        
        if (dirResult.success && dirResult.files) {
          const jsonFiles = dirResult.files.filter((f: any) => f.name.endsWith('.json'));
          
          for (const file of jsonFiles) {
            const filePath = `${configsPath}/${file.name}`;
            const content = await window.electronAPI.fs.readFile(filePath);
            
            if (content.success && content.content) {
              try {
                const config = JSON.parse(content.content);
                // Don't load hardcoded configs from files
                if (!config.isHardcoded) {
                  this.configs.push({
                    ...config,
                    createdAt: new Date(config.createdAt),
                    updatedAt: new Date(config.updatedAt)
                  });
                }
              } catch (parseError) {
                console.error(`Failed to parse config file ${file.name}:`, parseError);
              }
            }
          }
        }
        
        // Load saved default config preference
        const defaultConfigPath = `${configsPath}/.default`;
        const defaultResult = await window.electronAPI.fs.readFile(defaultConfigPath);
        
        if (defaultResult.success && defaultResult.content) {
          const defaultId = defaultResult.content.trim();
          // Check if the saved default config still exists
          if (this.configs.find(c => c.id === defaultId)) {
            // Apply the saved default to the configs
            this.configs.forEach(c => c.isDefault = c.id === defaultId);
          } else {
            // Saved default config no longer exists, fall back to "Default"
            const defaultConfig = this.configs.find(c => c.id === 'default-config');
            if (defaultConfig) {
              defaultConfig.isDefault = true;
              await this.saveDefaultConfig();
            }
          }
        } else {
          // First run - no saved default preference
          // Set "Default" config as default
          const defaultConfig = this.configs.find(c => c.id === 'default-config');
          if (defaultConfig) {
            defaultConfig.isDefault = true;
            await this.saveDefaultConfig();
          }
        }
        
        // Use the default config as the active config
        const defaultConfig = this.defaultConfig;
        if (defaultConfig) {
          this.activeConfigId = defaultConfig.id;
        }
        
        // Validate active config and set default if needed
        if (this.activeConfigId && !this.configs.find(c => c.id === this.activeConfigId)) {
          // Active config no longer exists, clear it
          this.activeConfigId = null;
        }
        
        // If no active config, use the default
        if (!this.activeConfigId && this.configs.length > 0) {
          const defaultConfig = this.defaultConfig || this.configs[0];
          this.activeConfigId = defaultConfig.id;
          await this.saveActiveConfig();
        }
      } catch (error) {
        console.error('Failed to initialize Claude run configs:', error);
        // Ensure we have at least the default configs
        if (this.configs.length === 0) {
          await this.createDefaultConfigs();
        }
      }
    },

    async createDefaultConfigs() {
      const now = new Date();
      // Create hardcoded configs with stable IDs
      const defaultConfigs = [
        {
          id: 'default-config',
          name: 'Default',
          command: 'claude',
          args: [],
          isHardcoded: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'skip-permissions-config',
          name: 'Skip Permissions',
          command: 'claude',
          args: ['--dangerously-skip-permissions'],
          isHardcoded: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'update-claude-config',
          name: 'Update Claude',
          command: 'claude',
          args: ['update'],
          isHardcoded: true,
          createdAt: now,
          updatedAt: now
        }
      ];
      
      // Add hardcoded configs if they don't exist
      defaultConfigs.forEach(defaultConfig => {
        if (!this.configs.find(c => c.id === defaultConfig.id)) {
          this.configs.push({
            ...defaultConfig,
            isDefault: false // Will be set from saved preference if exists
          });
        }
      });
      
      // Default preference is handled in initialize() method
    },

    async addConfig(config: Omit<ClaudeRunConfig, 'id' | 'createdAt' | 'updatedAt'>) {
      const now = new Date();
      const newConfig: ClaudeRunConfig = {
        ...config,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now
      };

      // If this is set as default, unset other defaults
      if (newConfig.isDefault) {
        this.configs.forEach(c => c.isDefault = false);
      }

      this.configs.push(newConfig);
      await this.saveConfig(newConfig);
      
      // Save default preference if changed
      if (newConfig.isDefault) {
        await this.saveDefaultConfig();
      }
      
      return newConfig;
    },

    async updateConfig(id: string, updates: Partial<Omit<ClaudeRunConfig, 'id' | 'createdAt'>>) {
      const configIndex = this.configs.findIndex(c => c.id === id);
      if (configIndex === -1) return;
      
      // For hardcoded configs, only allow updating isDefault
      if (this.configs[configIndex].isHardcoded) {
        if ('isDefault' in updates) {
          // If setting as default, unset other defaults
          if (updates.isDefault) {
            this.configs.forEach(c => c.isDefault = false);
          }
          this.configs[configIndex].isDefault = updates.isDefault;
          this.configs[configIndex].updatedAt = new Date();
          await this.saveDefaultConfig();
        } else {
          console.warn('Cannot edit hardcoded configuration properties');
        }
        return;
      }

      // If setting as default, unset other defaults
      if (updates.isDefault) {
        this.configs.forEach(c => c.isDefault = false);
      }

      this.configs[configIndex] = {
        ...this.configs[configIndex],
        ...updates,
        updatedAt: new Date()
      };

      await this.saveConfig(this.configs[configIndex]);
      
      // Save default preference if it changed
      if ('isDefault' in updates) {
        await this.saveDefaultConfig();
      }
    },

    async deleteConfig(id: string) {
      const configIndex = this.configs.findIndex(c => c.id === id);
      if (configIndex === -1) return;
      
      // Prevent deleting hardcoded configs
      if (this.configs[configIndex].isHardcoded) {
        console.warn('Cannot delete hardcoded configuration');
        return;
      }

      const wasActive = this.activeConfigId === id;
      const wasDefault = this.configs[configIndex].isDefault;

      this.configs.splice(configIndex, 1);

      // If we deleted the active config, switch to default or first available
      if (wasActive && this.configs.length > 0) {
        const newActive = this.defaultConfig || this.configs[0];
        this.activeConfigId = newActive.id;
      }

      // If we deleted the default, make the first one default
      if (wasDefault && this.configs.length > 0) {
        this.configs[0].isDefault = true;
        await this.saveDefaultConfig();
      }

      // Delete the config file
      await this.deleteConfigFile(id);
    },

    async setActiveConfig(id: string) {
      if (this.configs.find(c => c.id === id)) {
        this.activeConfigId = id;
      }
    },

    
    async saveConfig(config: ClaudeRunConfig) {
      if (!this.projectPath) {
        console.warn('No project path available, cannot save config');
        return;
      }
      
      // Don't save hardcoded configs
      if (config.isHardcoded) {
        return;
      }
      
      try {
        const configsPath = `${this.projectPath}/.claude/run-configs`;
        await window.electronAPI.fs.ensureDir(configsPath);
        
        const filePath = `${configsPath}/${config.id}.json`;
        const serializedConfig = {
          ...config,
          createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
          updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt
        };
        
        await window.electronAPI.fs.writeFile(filePath, JSON.stringify(serializedConfig, null, 2));
      } catch (error) {
        console.error('Failed to save config:', error);
        throw error;
      }
    },
    
    
    async saveDefaultConfig() {
      if (!this.projectPath) {
        return;
      }
      
      try {
        const configsPath = `${this.projectPath}/.claude/run-configs`;
        await window.electronAPI.fs.ensureDir(configsPath);
        
        const defaultConfig = this.defaultConfig;
        const defaultConfigPath = `${configsPath}/.default`;
        
        if (defaultConfig) {
          await window.electronAPI.fs.writeFile(defaultConfigPath, defaultConfig.id);
        } else {
          // No default set, delete the file if it exists
          await window.electronAPI.fs.deleteFile(defaultConfigPath).catch(() => {});
        }
      } catch (error) {
        console.error('Failed to save default config:', error);
      }
    },
    
    async deleteConfigFile(configId: string) {
      if (!this.projectPath) {
        return;
      }
      
      try {
        const configPath = `${this.projectPath}/.claude/run-configs/${configId}.json`;
        await window.electronAPI.fs.deleteFile(configPath);
      } catch (error) {
        console.error('Failed to delete config file:', error);
      }
    },

    getCommandString(config: ClaudeRunConfig): string {
      const parts = [config.command, ...config.args];
      return parts.join(' ');
    }
  }
});