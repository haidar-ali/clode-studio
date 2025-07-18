import { defineStore } from 'pinia';
import { useEditorStore } from './editor';
import { useTasksStore } from './tasks';
import { useContextStore } from './context';
import { useClaudeInstancesStore } from './claude-instances';
import { useMCPStore } from './mcp';
import { useProjectContextStore } from './project-context';

export interface SlashCommand {
  name: string;
  description: string;
  category: 'file' | 'task' | 'context' | 'claude' | 'workspace' | 'system';
  aliases?: string[];
  parameters?: CommandParameter[];
  handler: (args: string[], instanceId?: string) => Promise<void> | void;
  icon?: string;
  shortcut?: string;
}

export interface CommandParameter {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'file' | 'task';
  defaultValue?: any;
}

export interface CommandExecution {
  command: string;
  args: string[];
  timestamp: Date;
  success: boolean;
  error?: string;
}

export const useCommandsStore = defineStore('commands', {
  state: () => ({
    commands: new Map<string, SlashCommand>(),
    customCommands: new Map<string, SlashCommand>(),
    history: [] as CommandExecution[],
    isCommandPaletteOpen: false,
    commandInput: '',
    suggestions: [] as SlashCommand[],
    maxHistory: 50
  }),

  getters: {
    allCommands: (state) => {
      const all = [...state.commands.values(), ...state.customCommands.values()];
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },
    
    commandsByCategory: (state) => {
      const grouped = new Map<string, SlashCommand[]>();
      [...state.commands.values(), ...state.customCommands.values()].forEach(cmd => {
        const category = cmd.category;
        if (!grouped.has(category)) {
          grouped.set(category, []);
        }
        grouped.get(category)!.push(cmd);
      });
      return grouped;
    },
    
    recentCommands: (state) => {
      const recent = new Map<string, number>();
      state.history.forEach(h => {
        recent.set(h.command, (recent.get(h.command) || 0) + 1);
      });
      return Array.from(recent.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cmd]) => cmd);
    }
  },

  actions: {
    async initialize() {
      // Register built-in commands
      this.registerBuiltInCommands();
      
      // Load custom commands from storage
      await this.loadCustomCommands();
      
      // Load command history
      await this.loadHistory();
    },

    registerBuiltInCommands() {
      const editorStore = useEditorStore();
      const tasksStore = useTasksStore();
      const contextStore = useContextStore();
      const claudeStore = useClaudeInstancesStore();
      const mcpStore = useMCPStore();
      const projectContextStore = useProjectContextStore();

      // File Commands
      this.registerCommand({
        name: 'open',
        description: 'Open a file in the editor',
        category: 'file',
        aliases: ['o', 'edit'],
        parameters: [{
          name: 'file',
          description: 'File path to open',
          required: true,
          type: 'file'
        }],
        handler: async (args) => {
          if (args.length === 0) {
            // Open file picker
            window.dispatchEvent(new CustomEvent('open-global-search'));
          } else {
            const filePath = args.join(' ');
            await editorStore.openFile(filePath);
          }
        },
        icon: 'mdi:file-outline',
        shortcut: 'Cmd+O'
      });

      this.registerCommand({
        name: 'save',
        description: 'Save the current file',
        category: 'file',
        aliases: ['s'],
        handler: async () => {
          const activeTab = editorStore.activeTab;
          if (activeTab) {
            await editorStore.saveFile(activeTab);
          }
        },
        icon: 'mdi:content-save',
        shortcut: 'Cmd+S'
      });

      this.registerCommand({
        name: 'close',
        description: 'Close the current file',
        category: 'file',
        handler: () => {
          const activeTab = editorStore.activeTab;
          if (activeTab) {
            editorStore.closeTab(activeTab);
          }
        },
        icon: 'mdi:close'
      });

      // Task Commands
      this.registerCommand({
        name: 'task',
        description: 'Create a new task',
        category: 'task',
        aliases: ['todo', 't'],
        parameters: [{
          name: 'description',
          description: 'Task description',
          required: true,
          type: 'string'
        }],
        handler: (args) => {
          if (args.length > 0) {
            const description = args.join(' ');
            tasksStore.addTask(description, 'To Do');
          }
        },
        icon: 'mdi:checkbox-marked-outline'
      });

      this.registerCommand({
        name: 'tasks',
        description: 'Show all tasks',
        category: 'task',
        aliases: ['todos'],
        handler: () => {
          // Emit event to switch to tasks panel
          window.dispatchEvent(new CustomEvent('show-tasks-panel'));
        },
        icon: 'mdi:format-list-checks'
      });

      // Context Commands
      this.registerCommand({
        name: 'context',
        description: 'Show context usage',
        category: 'context',
        aliases: ['ctx'],
        handler: () => {
          // Open context modal
          window.dispatchEvent(new CustomEvent('show-context-modal'));
        },
        icon: 'mdi:brain'
      });

      this.registerCommand({
        name: 'optimize',
        description: 'Optimize context usage',
        category: 'context',
        handler: async () => {
          await contextStore.optimizeContext();
        },
        icon: 'mdi:auto-fix'
      });

      this.registerCommand({
        name: 'checkpoint',
        description: 'Create a context checkpoint',
        category: 'context',
        aliases: ['cp'],
        parameters: [{
          name: 'name',
          description: 'Checkpoint name',
          required: false,
          type: 'string'
        }],
        handler: async (args) => {
          const name = args.join(' ') || `Checkpoint ${new Date().toLocaleTimeString()}`;
          // For command-based checkpoints, pass empty messages array
          await contextStore.createCheckpoint(name, []);
        },
        icon: 'mdi:bookmark-plus'
      });

      // Claude Commands
      this.registerCommand({
        name: 'claude',
        description: 'Create new Claude instance',
        category: 'claude',
        aliases: ['new'],
        parameters: [{
          name: 'name',
          description: 'Instance name',
          required: false,
          type: 'string'
        }],
        handler: (args) => {
          const name = args.join(' ') || undefined;
          claudeStore.createInstance(name);
        },
        icon: 'mdi:robot'
      });

      this.registerCommand({
        name: 'personality',
        description: 'Set Claude personality',
        category: 'claude',
        aliases: ['p'],
        parameters: [{
          name: 'personality',
          description: 'Personality name',
          required: true,
          type: 'string'
        }],
        handler: (args, instanceId) => {
          if (instanceId && args.length > 0) {
            const personalityName = args.join(' ');
            const personality = claudeStore.personalities.find(
              p => p.name.toLowerCase() === personalityName.toLowerCase()
            );
            if (personality) {
              claudeStore.updateInstancePersonality(instanceId, personality.id);
            }
          }
        },
        icon: 'mdi:account-switch'
      });

      // Workspace Commands
      this.registerCommand({
        name: 'workspace',
        description: 'Switch workspace',
        category: 'workspace',
        aliases: ['ws'],
        handler: async () => {
          const { useWorkspaceManager } = await import('~/composables/useWorkspaceManager');
          const workspaceManager = useWorkspaceManager();
          await workspaceManager.selectWorkspace();
        },
        icon: 'mdi:folder-open'
      });

      // Memory Commands
      this.registerCommand({
        name: 'memory',
        description: 'Edit CLAUDE.md memory files',
        category: 'system',
        aliases: ['mem', 'claude.md', 'memo'],
        handler: () => {
          // Open memory editor modal
          window.dispatchEvent(new CustomEvent('open-memory-editor'));
        },
        icon: 'mdi:brain',
        shortcut: 'Cmd+M'
      });

      // System Commands
      this.registerCommand({
        name: 'help',
        description: 'Show available commands',
        category: 'system',
        aliases: ['?', 'h'],
        handler: () => {
          this.isCommandPaletteOpen = true;
        },
        icon: 'mdi:help-circle'
      });

      this.registerCommand({
        name: 'clear',
        description: 'Clear terminal/chat',
        category: 'system',
        aliases: ['cls'],
        handler: (_, instanceId) => {
          if (instanceId) {
            // Emit event to clear specific terminal
            window.dispatchEvent(new CustomEvent('clear-terminal', { detail: { instanceId } }));
          }
        },
        icon: 'mdi:delete-sweep'
      });

      this.registerCommand({
        name: 'reload',
        description: 'Reload the application',
        category: 'system',
        handler: () => {
          window.location.reload();
        },
        icon: 'mdi:reload'
      });

      // MCP Commands
      this.registerCommand({
        name: 'mcp',
        description: 'Show MCP connections',
        category: 'system',
        handler: () => {
          window.dispatchEvent(new CustomEvent('show-mcp-panel'));
        },
        icon: 'mdi:connection'
      });

      // Session Commands
      this.registerCommand({
        name: 'session',
        description: 'Resume a previous Claude session',
        category: 'claude',
        aliases: ['resume'],
        handler: async () => {
          // Show session browser
          window.dispatchEvent(new CustomEvent('show-session-browser'));
        },
        icon: 'mdi:history'
      });

      this.registerCommand({
        name: 'think',
        description: 'Set Claude thinking level',
        category: 'claude',
        aliases: ['thinking'],
        parameters: [{
          name: 'level',
          description: 'Thinking level: normal, more, hard, ultra',
          required: false,
          type: 'string'
        }],
        handler: (args, instanceId) => {
          const level = args[0] || 'normal';
          const prefix = {
            'normal': '',
            'more': 'think more about this: ',
            'hard': 'think harder about this: ',
            'ultra': 'ultrathink: '
          }[level] || '';
          
          if (instanceId && prefix) {
            window.dispatchEvent(new CustomEvent('set-thinking-prefix', { 
              detail: { instanceId, prefix } 
            }));
          }
        },
        icon: 'mdi:head-cog'
      });

      // File search with context
      this.registerCommand({
        name: 'find',
        description: 'Find in files',
        category: 'file',
        aliases: ['search', 'grep'],
        parameters: [{
          name: 'pattern',
          description: 'Search pattern',
          required: true,
          type: 'string'
        }],
        handler: async (args) => {
          if (args.length > 0) {
            const pattern = args.join(' ');
            const results = await projectContextStore.searchFiles(pattern);
            // Show results in search panel
            window.dispatchEvent(new CustomEvent('show-search-results', { detail: { results } }));
          }
        },
        icon: 'mdi:magnify'
      });
    },

    registerCommand(command: SlashCommand) {
      this.commands.set(command.name, command);
      // Also register aliases
      command.aliases?.forEach(alias => {
        this.commands.set(alias, command);
      });
    },

    async loadCustomCommands() {
      try {
        const stored = await window.electronAPI.store.get('customCommands');
        if (stored && Array.isArray(stored)) {
          stored.forEach((cmd: SlashCommand) => {
            // Recreate handler function from stored string
            if (typeof cmd.handler === 'string') {
              cmd.handler = new Function('args', 'instanceId', cmd.handler as any) as any;
            }
            this.customCommands.set(cmd.name, cmd);
          });
        }
      } catch (error) {
        console.error('Failed to load custom commands:', error);
      }
    },

    async saveCustomCommands() {
      try {
        // Don't save handlers as they can't be serialized properly
        const commands = Array.from(this.customCommands.values()).map(cmd => ({
          name: cmd.name,
          description: cmd.description,
          category: cmd.category,
          aliases: cmd.aliases,
          parameters: cmd.parameters,
          icon: cmd.icon,
          shortcut: cmd.shortcut
          // handler will be recreated when loading
        }));
        await window.electronAPI.store.set('customCommands', commands);
      } catch (error) {
        console.error('Failed to save custom commands:', error);
      }
    },

    async loadHistory() {
      try {
        const history = await window.electronAPI.store.get('commandHistory');
        if (history && Array.isArray(history)) {
          this.history = history.map(h => ({
            ...h,
            timestamp: new Date(h.timestamp)
          }));
        }
      } catch (error) {
        console.error('Failed to load command history:', error);
      }
    },

    async saveHistory() {
      try {
        // Serialize dates to strings for IPC, removing any non-serializable data
        const recent = this.history.slice(-this.maxHistory).map(h => ({
          command: h.command,
          args: [...h.args], // Clone array to ensure it's serializable
          timestamp: h.timestamp instanceof Date ? h.timestamp.toISOString() : h.timestamp,
          success: h.success,
          error: h.error
        }));
        await window.electronAPI.store.set('commandHistory', recent);
      } catch (error) {
        console.error('Failed to save command history:', error);
      }
    },

    async executeCommand(input: string, instanceId?: string) {
      const trimmed = input.trim();
      if (!trimmed.startsWith('/')) return false;

      const [cmdName, ...args] = trimmed.slice(1).split(' ');
      const command = this.commands.get(cmdName) || this.customCommands.get(cmdName);

      if (!command) {
        console.error(`Unknown command: ${cmdName}`);
        return false;
      }

      const execution: CommandExecution = {
        command: cmdName,
        args,
        timestamp: new Date(),
        success: false
      };

      try {
        await command.handler(args, instanceId);
        execution.success = true;
      } catch (error) {
        execution.error = error instanceof Error ? error.message : String(error);
        console.error(`Command execution failed:`, error);
      }

      this.history.push(execution);
      await this.saveHistory();

      return execution.success;
    },

    updateSuggestions(input: string) {
      const trimmed = input.trim().toLowerCase();
      if (!trimmed.startsWith('/')) {
        this.suggestions = [];
        return;
      }

      const search = trimmed.slice(1);
      if (!search) {
        // Show all commands
        this.suggestions = this.allCommands.slice(0, 10);
        return;
      }

      // Filter commands by name and aliases
      this.suggestions = this.allCommands.filter(cmd => {
        const nameMatch = cmd.name.toLowerCase().includes(search);
        const aliasMatch = cmd.aliases?.some(alias => alias.toLowerCase().includes(search));
        const descMatch = cmd.description.toLowerCase().includes(search);
        return nameMatch || aliasMatch || descMatch;
      }).slice(0, 10);
    },

    openCommandPalette() {
      this.isCommandPaletteOpen = true;
      this.commandInput = '/';
    },

    closeCommandPalette() {
      this.isCommandPaletteOpen = false;
      this.commandInput = '';
      this.suggestions = [];
    }
  }
});