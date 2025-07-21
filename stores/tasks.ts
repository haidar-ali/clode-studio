import { defineStore } from 'pinia';

// Simple path joining for browser context
const joinPath = (...parts: string[]) => {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '');
};

// Simple task type that mirrors Claude's native TodoWrite
interface SimpleTask {
  id: string;
  content: string;
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  updatedAt: Date;
  assignee?: 'claude' | 'user' | 'both';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  description?: string;
  filesModified?: string[];
}

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as SimpleTask[],
    filter: 'all' as 'all' | 'active' | 'completed',
    projectPath: '',
    isAutoSaveEnabled: true,
    lastSyncedWithClaude: null as Date | null,
    claudeNativeTodos: [] as Array<{content: string, status: string, priority: string, id: string}>,
    isImportingFromFile: false,
    isInitialized: false
  }),

  getters: {
    backlogTasks: (state) => state.tasks.filter(task => task.status === 'backlog'),
    todoTasks: (state) => state.tasks.filter(task => task.status === 'pending'),
    inProgressTasks: (state) => state.tasks.filter(task => task.status === 'in_progress'),
    completedTasks: (state) => state.tasks.filter(task => task.status === 'completed'),
    
    filteredTasks: (state) => {
      switch (state.filter) {
        case 'active':
          return state.tasks.filter(task => task.status !== 'completed');
        case 'completed':
          return state.tasks.filter(task => task.status === 'completed');
        default:
          return state.tasks;
      }
    },
    
    taskCount: (state) => ({
      total: state.tasks.length,
      backlog: state.tasks.filter(t => t.status === 'backlog').length,
      pending: state.tasks.filter(t => t.status === 'pending').length,
      inProgress: state.tasks.filter(t => t.status === 'in_progress').length,
      completed: state.tasks.filter(t => t.status === 'completed').length
    }),
    
    tasksMarkdownPath: (state) => {
      if (!state.projectPath) return null;
      return joinPath(state.projectPath, 'TASKS.md');
    }
  },

  actions: {
    setProjectPath(path: string) {
      this.projectPath = path;
    },

    // Initialize the store
    async initialize(projectPath?: string) {
      if (projectPath) {
        this.projectPath = projectPath;
      }
      
      // Mark as initialized
      this.isInitialized = true;
      
      // Load tasks if we have a project path
      if (this.projectPath) {
        await this.loadTasksFromProject();
      }
    },

    // Add task from user input
    addTask(content: string, priority: SimpleTask['priority'] = 'medium', type: SimpleTask['type'] = 'feature') {
      const task: SimpleTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        content,
        status: 'pending',
        priority,
        createdAt: new Date(),
        updatedAt: new Date(),
        assignee: 'claude',
        type,
        description: '',
        filesModified: []
      };
      
      this.tasks.push(task);
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
      
      return task;
    },

    // Update task
    updateTask(id: string, updates: Partial<SimpleTask>) {
      const index = this.tasks.findIndex(task => task.id === id);
      if (index !== -1) {
        this.tasks[index] = {
          ...this.tasks[index],
          ...updates,
          updatedAt: new Date()
        };
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    // Delete task
    deleteTask(id: string) {
      const index = this.tasks.findIndex(task => task.id === id);
      if (index !== -1) {
        this.tasks.splice(index, 1);
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    // Move task to new status
    moveTask(taskId: string, newStatus: SimpleTask['status']) {
      this.updateTask(taskId, { status: newStatus });
    },

    // Sync with Claude's native TodoWrite
    syncWithClaudeNative(claudeTodos: Array<{content: string, status: string, priority: string, id: string}>) {
      this.claudeNativeTodos = claudeTodos;
      
      // Convert Claude's native todos to our format
      const claudeToSimpleStatus = (status: string): SimpleTask['status'] => {
        switch (status) {
          case 'in_progress': return 'in_progress';
          case 'completed': return 'completed';
          default: return 'pending';
        }
      };
      
      const claudeToSimplePriority = (priority: string): SimpleTask['priority'] => {
        switch (priority) {
          case 'high': return 'high';
          case 'low': return 'low';
          default: return 'medium';
        }
      };
      
      // Update existing tasks or add new ones
      for (const claudeTodo of claudeTodos) {
        const existing = this.tasks.find(t => t.id === claudeTodo.id);
        if (existing) {
          // Update existing task
          this.updateTask(claudeTodo.id, {
            content: claudeTodo.content,
            status: claudeToSimpleStatus(claudeTodo.status),
            priority: claudeToSimplePriority(claudeTodo.priority)
          });
        } else {
          // Add new task from Claude
          const task: SimpleTask = {
            id: claudeTodo.id,
            content: claudeTodo.content,
            status: claudeToSimpleStatus(claudeTodo.status),
            priority: claudeToSimplePriority(claudeTodo.priority),
            createdAt: new Date(),
            updatedAt: new Date(),
            assignee: 'claude',
            type: 'feature',
            description: '',
            filesModified: []
          };
          this.tasks.push(task);
        }
      }
      
      // Remove tasks that are no longer in Claude's list
      this.tasks = this.tasks.filter(task => 
        claudeTodos.some(ct => ct.id === task.id) || task.assignee !== 'claude'
      );
      
      this.lastSyncedWithClaude = new Date();
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
    },

    // Load tasks from project
    async loadTasksFromProject() {
      if (!this.projectPath) return;
      
      const filePath = joinPath(this.projectPath, '.claude', 'simple-tasks.json');
      
      try {
        const result = await window.electronAPI.fs.readFile(filePath);
        if (result.success && result.content) {
          const data = JSON.parse(result.content);
          this.tasks = data.tasks.map((task: any) => ({
            ...task,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt)
          }));
          console.log(`Loaded ${this.tasks.length} tasks from project`);
        }
      } catch (error) {
        console.log('No tasks file found, starting fresh');
      }
    },

    // Save tasks to project
    async saveTasksToProject() {
      if (!this.projectPath) return;
      
      try {
        // Save to JSON
        await this.saveTasksToProjectJSON();
        
        // Only update TASKS.md if not importing from file (to prevent infinite loop)
        if (!this.isImportingFromFile) {
          await this.updateTasksMarkdown();
        }
      } catch (error) {
        console.error('Failed to save tasks:', error);
      }
    },

    // Save tasks to project JSON only
    async saveTasksToProjectJSON() {
      if (!this.projectPath) return;
      
      try {
        // Ensure .claude directory exists
        const claudeDir = joinPath(this.projectPath, '.claude');
        await window.electronAPI.fs.ensureDir(claudeDir);
        
        // Save simple tasks
        const filePath = joinPath(this.projectPath, '.claude', 'simple-tasks.json');
        const data = {
          tasks: this.tasks,
          lastSyncedWithClaude: this.lastSyncedWithClaude,
          lastUpdated: new Date()
        };
        await window.electronAPI.fs.writeFile(filePath, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('Failed to save tasks JSON:', error);
      }
    },

    // Generate simple TASKS.md file
    async updateTasksMarkdown() {
      if (!this.tasksMarkdownPath) return;
      
      const formatTask = (task: SimpleTask, isCompleted = false) => {
        const checkbox = isCompleted ? '[x]' : '[ ]';
        const title = isCompleted ? `~~${task.content}~~` : `**${task.content}**`;
        const emoji = task.status === 'in_progress' ? ' ⏳' : '';
        
        let text = `- ${checkbox} ${title}${emoji}`;
        
        // Add structured metadata
        const assignee = isCompleted ? `~~Assignee: ${task.assignee || 'Claude'}~~` : `Assignee: ${task.assignee || 'Claude'}`;
        const type = isCompleted ? `~~Type: ${task.type || 'feature'}~~` : `Type: ${task.type || 'feature'}`;
        const priority = isCompleted ? `~~Priority: ${task.priority}~~` : `Priority: ${task.priority}`;
        
        text += `\n  - ${assignee}`;
        text += `\n  - ${type}`;
        text += `\n  - ${priority}`;
        
        if (task.description) {
          const desc = isCompleted ? `~~Description: ${task.description}~~` : `Description: ${task.description}`;
          text += `\n  - ${desc}`;
        }
        
        if (task.filesModified && task.filesModified.length > 0) {
          const files = task.filesModified.slice(0, 3).join(', ') + (task.filesModified.length > 3 ? '...' : '');
          const filesText = isCompleted ? `~~Files: ${files}~~` : `Files: ${files}`;
          text += `\n  - ${filesText}`;
        }
        
        return text;
      };
      
      const markdown = `# Project Tasks

*This file is synced with Clode Studio and Claude's native TodoWrite system.*  
*Last updated: ${new Date().toISOString()}*

## Backlog (${this.backlogTasks.length})

${this.backlogTasks.map(task => formatTask(task)).join('\n')}

## To Do (${this.todoTasks.length})

${this.todoTasks.map(task => formatTask(task)).join('\n')}

## In Progress (${this.inProgressTasks.length})

${this.inProgressTasks.map(task => formatTask(task)).join('\n')}

## Completed (${this.completedTasks.length})

${this.completedTasks.map(task => formatTask(task, true)).join('\n')}

---
*To update tasks, use the Kanban board in Clode Studio, ask Claude to modify this file, or use Claude's native TodoWrite system.*
`;
      
      try {
        await window.electronAPI.fs.writeFile(this.tasksMarkdownPath, markdown);
      } catch (error) {
        console.error('Failed to update TASKS.md:', error);
      }
    },

    // Import tasks from TASKS.md or Claude output
    importTasksFromText(text: string): number {
      const lines = text.split('\n');
      const newTasks: Partial<SimpleTask>[] = [];
      
      let currentSection: 'backlog' | 'pending' | 'in_progress' | 'completed' | null = null;
      let currentTask: Partial<SimpleTask> | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detect sections
        if (line.includes('## Backlog')) {
          currentSection = 'backlog';
        } else if (line.includes('## To Do')) {
          currentSection = 'pending';
        } else if (line.includes('## In Progress')) {
          currentSection = 'in_progress';
        } else if (line.includes('## Completed') || line.includes('## Done')) {
          currentSection = 'completed';
        }
        // Parse task header
        else if (currentSection && line.match(/^[\s-]*\[[ x]\]/)) {
          // Save previous task if exists
          if (currentTask && currentTask.content) {
            newTasks.push(currentTask);
          }
          
          // Start new task
          let taskLine = line.replace(/^[\s-]*\[[ x]\]\s*/, '');
          const content = taskLine.replace(/\*\*/g, '').replace(/~~/g, '').replace(/⏳/g, '').trim();
          
          currentTask = {
            content,
            status: currentSection,
            priority: 'medium',
            assignee: 'claude',
            type: 'feature'
          };
        }
        // Parse task metadata
        else if (currentTask && line.match(/^\s*-\s*/)) {
          const metaLine = line.replace(/^\s*-\s*/, '').replace(/~~/g, '').trim();
          
          if (metaLine.startsWith('Assignee:')) {
            const assignee = metaLine.replace('Assignee:', '').trim().toLowerCase();
            if (assignee === 'user' || assignee === 'claude' || assignee === 'both') {
              currentTask.assignee = assignee as SimpleTask['assignee'];
            }
          } else if (metaLine.startsWith('Type:')) {
            const type = metaLine.replace('Type:', '').trim().toLowerCase();
            if (['feature', 'bugfix', 'refactor', 'documentation', 'research'].includes(type)) {
              currentTask.type = type as SimpleTask['type'];
            }
          } else if (metaLine.startsWith('Priority:')) {
            const priority = metaLine.replace('Priority:', '').trim().toLowerCase();
            if (priority === 'high' || priority === 'medium' || priority === 'low') {
              currentTask.priority = priority;
            }
          } else if (metaLine.startsWith('Description:')) {
            currentTask.description = metaLine.replace('Description:', '').trim();
          } else if (metaLine.startsWith('Files:')) {
            const files = metaLine.replace('Files:', '').trim();
            currentTask.filesModified = files.split(',').map(f => f.trim()).filter(f => f);
          }
        }
      }
      
      // Don't forget the last task
      if (currentTask && currentTask.content) {
        newTasks.push(currentTask);
      }
      
      // Add new tasks
      let imported = 0;
      for (const task of newTasks) {
        if (task.content) {
          const newTask: SimpleTask = {
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            content: task.content,
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            createdAt: new Date(),
            updatedAt: new Date(),
            assignee: task.assignee || 'claude',
            type: task.type || 'feature',
            description: task.description || '',
            filesModified: task.filesModified || []
          };
          
          this.tasks.push(newTask);
          imported++;
        }
      }
      
      return imported;
    },

    // Clear completed tasks
    clearCompleted() {
      this.tasks = this.tasks.filter(task => task.status !== 'completed');
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
    },

    // Clear all tasks
    clearAll() {
      this.tasks = [];
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
    },

    // Import tasks from TASKS.md file content and replace all existing tasks
    importTasksFromFile(fileContent: string): number {
      // Set flag to prevent infinite loop
      this.isImportingFromFile = true;
      
      try {
        // Clear all existing tasks first
        this.tasks = [];
        
        // Import new tasks from file content
        const imported = this.importTasksFromText(fileContent);
        
        // Save to project JSON only (not TASKS.md to avoid loop)
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProjectJSON();
        }
        
        return imported;
      } finally {
        // Always reset the flag
        this.isImportingFromFile = false;
      }
    }
  }
});