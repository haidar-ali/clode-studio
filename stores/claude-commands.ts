import { defineStore } from 'pinia';
import matter from 'gray-matter';

export interface ClaudeSlashCommand {
  id: string;
  name: string;
  description?: string;
  argumentHint?: string;
  allowedTools?: string[];
  content: string;
  fullContent: string; // Full markdown with frontmatter
  source: 'project' | 'personal';
  path: string;
  category?: string; // From directory structure
}

export const useClaudeCommandsStore = defineStore('claudeCommands', {
  state: () => ({
    projectCommands: [] as ClaudeSlashCommand[],
    personalCommands: [] as ClaudeSlashCommand[],
    isLoading: false,
    error: null as string | null,
    projectPath: '' as string,
  }),

  getters: {
    allCommands: (state): ClaudeSlashCommand[] => {
      return [...state.projectCommands, ...state.personalCommands];
    },

    commandsByCategory: (state) => {
      const grouped: Record<string, ClaudeSlashCommand[]> = {};
      
      const addToGroup = (cmd: ClaudeSlashCommand) => {
        const category = cmd.category || 'uncategorized';
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(cmd);
      };

      state.projectCommands.forEach(addToGroup);
      state.personalCommands.forEach(addToGroup);
      
      return grouped;
    },

    getCommand: (state) => (name: string): ClaudeSlashCommand | undefined => {
      // Project commands take precedence
      return state.projectCommands.find(c => c.name === name) ||
             state.personalCommands.find(c => c.name === name);
    }
  },

  actions: {
    async initialize(projectPath: string) {
      this.projectPath = projectPath;
      await this.loadCommands();
    },

    async loadCommands() {
      try {
        this.isLoading = true;
        this.error = null;

        // Load both project and personal commands in parallel
        const [projectCmds, personalCmds] = await Promise.all([
          this.loadProjectCommands(),
          this.loadPersonalCommands()
        ]);

        this.projectCommands = projectCmds;
        this.personalCommands = personalCmds;
      } catch (error) {
        console.error('Failed to load Claude commands:', error);
        this.error = error instanceof Error ? error.message : 'Failed to load commands';
      } finally {
        this.isLoading = false;
      }
    },

    async loadProjectCommands(): Promise<ClaudeSlashCommand[]> {
      if (!this.projectPath) return [];

      const commandsPath = `${this.projectPath}/.claude/commands`;
      
      // Check if commands directory exists
      const exists = await window.electronAPI.fs.exists(commandsPath);
      if (!exists) {
        return [];
      }

      return this.loadCommandsFromPath(commandsPath, 'project');
    },

    async loadPersonalCommands(): Promise<ClaudeSlashCommand[]> {
      try {
        // Get user home directory
        const homeDir = await window.electronAPI.getHomeDir();
        if (!homeDir) return [];

        const personalCommandsPath = `${homeDir}/.claude/commands`;
        
        // Check if personal commands directory exists
        const exists = await window.electronAPI.fs.exists(personalCommandsPath);
        if (!exists) {
          return [];
        }

        return this.loadCommandsFromPath(personalCommandsPath, 'personal');
      } catch (error) {
        console.error('Failed to load personal commands:', error);
        return [];
      }
    },

    async loadCommandsFromPath(basePath: string, source: 'project' | 'personal'): Promise<ClaudeSlashCommand[]> {
      const commands: ClaudeSlashCommand[] = [];
      
      const walkDirectory = async (dirPath: string, category: string = '') => {
        const result = await window.electronAPI.fs.readDir(dirPath);
        if (!result.success || !result.files) return;

        for (const file of result.files) {
          if (file.isDirectory) {
            // Subdirectories become categories
            const newCategory = category ? `${category}/${file.name}` : file.name;
            await walkDirectory(file.path, newCategory);
          } else if (file.name.endsWith('.md')) {
            try {
              const fileResult = await window.electronAPI.fs.readFile(file.path);
              if (!fileResult.success) continue;

              const { data, content } = matter(fileResult.content);
              const commandName = file.name.replace('.md', '');
              
              commands.push({
                id: `${source}-${category ? category + '-' : ''}${commandName}`,
                name: category ? `${category}/${commandName}` : commandName,
                description: data.description || data['description'] || '',
                argumentHint: data['argument-hint'] || data.argumentHint || '',
                allowedTools: data['allowed-tools'] || data.allowedTools || [],
                content,
                fullContent: fileResult.content,
                source,
                path: file.path,
                category
              });
            } catch (error) {
              console.error(`Failed to parse command ${file.path}:`, error);
            }
          }
        }
      };

      await walkDirectory(basePath);
      return commands;
    },

    async createCommand(data: {
      name: string;
      description?: string;
      argumentHint?: string;
      allowedTools?: string[];
      content: string;
      source: 'project' | 'personal';
      category?: string;
    }) {
      try {
        // Determine base path
        let basePath: string;
        if (data.source === 'project') {
          if (!this.projectPath) throw new Error('No project path available');
          basePath = `${this.projectPath}/.claude/commands`;
        } else {
          const homeDir = await window.electronAPI.getHomeDir();
          if (!homeDir) throw new Error('Failed to get user home directory');
          basePath = `${homeDir}/.claude/commands`;
        }

        // Add category to path if specified
        if (data.category) {
          basePath = `${basePath}/${data.category}`;
        }

        // Ensure directory exists
        const ensureDirResult = await window.electronAPI.fs.ensureDir(basePath);
        if (!ensureDirResult.success) {
          throw new Error(ensureDirResult.error || 'Failed to create commands directory');
        }

        // Create frontmatter
        const frontmatter: any = {};
        if (data.description) frontmatter.description = data.description;
        if (data.argumentHint) frontmatter['argument-hint'] = data.argumentHint;
        if (data.allowedTools && data.allowedTools.length > 0) {
          frontmatter['allowed-tools'] = data.allowedTools;
        }

        // Create markdown
        const markdown = matter.stringify(data.content, frontmatter);

        // Save file
        const filePath = `${basePath}/${data.name}.md`;
        const writeResult = await window.electronAPI.fs.writeFile(filePath, markdown);
        if (!writeResult.success) {
          throw new Error(writeResult.error || 'Failed to write command file');
        }

        // Reload commands
        await this.loadCommands();
      } catch (error) {
        console.error('Failed to create command:', error);
        throw error;
      }
    },

    async updateCommand(id: string, updates: Partial<{
      description?: string;
      argumentHint?: string;
      allowedTools?: string[];
      content: string;
    }>) {
      const command = this.allCommands.find(c => c.id === id);
      if (!command) throw new Error('Command not found');

      try {
        const { data, content: currentContent } = matter(command.fullContent);
        
        // Update frontmatter
        if (updates.description !== undefined) data.description = updates.description;
        if (updates.argumentHint !== undefined) data['argument-hint'] = updates.argumentHint;
        if (updates.allowedTools !== undefined) data['allowed-tools'] = updates.allowedTools;

        // Update content
        const newContent = updates.content !== undefined ? updates.content : currentContent;
        
        // Create new markdown
        const markdown = matter.stringify(newContent, data);

        // Save file
        const writeResult = await window.electronAPI.fs.writeFile(command.path, markdown);
        if (!writeResult.success) {
          throw new Error(writeResult.error || 'Failed to update command file');
        }

        // Reload commands
        await this.loadCommands();
      } catch (error) {
        console.error('Failed to update command:', error);
        throw error;
      }
    },

    async deleteCommand(id: string) {
      const command = this.allCommands.find(c => c.id === id);
      if (!command) throw new Error('Command not found');

      try {
        const deleteResult = await window.electronAPI.fs.delete(command.path);
        if (!deleteResult.success) {
          throw new Error(deleteResult.error || 'Failed to delete command file');
        }

        // Reload commands
        await this.loadCommands();
      } catch (error) {
        console.error('Failed to delete command:', error);
        throw error;
      }
    },

    async createExampleCommands() {
      // Create some example commands if none exist
      const examples = [
        {
          name: 'review',
          description: 'Review code for best practices',
          argumentHint: '<file or directory>',
          allowedTools: ['read_file', 'list_files'],
          content: `Review the code in {{ args }} and provide feedback on:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Security concerns
5. Suggestions for improvement

Be specific and provide code examples where appropriate.`
        },
        {
          name: 'test',
          description: 'Generate tests for code',
          argumentHint: '<file>',
          allowedTools: ['read_file', 'write_file'],
          content: `Generate comprehensive unit tests for the code in {{ args }}.

Use the appropriate testing framework based on the project:
- For JavaScript/TypeScript: Jest, Vitest, or Mocha
- For Python: pytest or unittest
- For other languages: use the standard testing framework

Include:
- Edge cases
- Error handling
- Mock external dependencies
- Clear test descriptions`
        },
        {
          name: 'explain',
          description: 'Explain how code works',
          argumentHint: '<file or function>',
          allowedTools: ['read_file'],
          content: `Explain how the code in {{ args }} works.

Provide:
1. A high-level overview
2. Step-by-step breakdown of the logic
3. Any important algorithms or patterns used
4. Dependencies and external calls
5. Example usage if applicable

Use clear, concise language suitable for developers.`
        }
      ];

      for (const example of examples) {
        try {
          await this.createCommand({
            ...example,
            source: 'personal'
          });
        } catch (error) {
          console.error(`Failed to create example command ${example.name}:`, error);
        }
      }
    }
  }
});