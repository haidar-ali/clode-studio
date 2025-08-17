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
  identifier?: string; // Optional custom identifier for referencing
  content: string;
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  updatedAt: Date;
  assignee?: 'claude' | 'user' | 'both';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  description?: string;
  filesModified?: string[]; // Deprecated - kept for backward compatibility
  resources?: ResourceReference[]; // New field for linked resources
  // Epic/Story hierarchy fields
  epicId?: string;
  storyId?: string;
  parentId?: string; // For parent-child relationships
  children?: string[]; // Child task IDs
  dependencies?: string[]; // Task dependencies
  estimatedEffort?: number; // Story points or hours
  actualEffort?: number;
}

// Epic type for high-level features
interface Epic {
  id: string;
  title: string;
  description: string;
  businessValue: string;
  acceptanceCriteria: string[];
  status: 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'critical';
  storyIds: string[];
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

// Story type for feature decomposition
interface Story {
  id: string;
  epicId: string;
  title: string;
  description: string;
  userStory: string; // As a... I want... So that...
  acceptanceCriteria: string[];
  status: 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'critical';
  taskIds: string[];
  dependencies: string[]; // Other story IDs
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

// Import type from prompt-engineering store
interface ResourceReference {
  type: 'file' | 'knowledge' | 'hook' | 'mcp' | 'command' | 'task';
  id: string;
  path?: string;
  name: string;
  metadata?: Record<string, any>;
}

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as SimpleTask[],
    epics: [] as Epic[],
    stories: [] as Story[],
    filter: 'all' as 'all' | 'active' | 'completed',
    projectPath: '',
    isAutoSaveEnabled: true,
    lastSyncedWithClaude: null as Date | null,
    claudeNativeTodos: [] as Array<{content: string, status: string, priority: string, id: string}>,
    isImportingFromFile: false,
    isInitialized: false,
    hierarchyConnected: false // Track if connected to agent task hierarchy
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
    
    // Epic/Story getters
    activeEpics: (state) => state.epics.filter(e => e.status !== 'done' && e.status !== 'cancelled'),
    completedEpics: (state) => state.epics.filter(e => e.status === 'done'),
    
    getEpic: (state) => (id: string) => state.epics.find(e => e.id === id),
    getStory: (state) => (id: string) => state.stories.find(s => s.id === id),
    
    getStoriesByEpic: (state) => (epicId: string) => 
      state.stories.filter(s => s.epicId === epicId),
    
    getTasksByStory: (state) => (storyId: string) => 
      state.tasks.filter(t => t.storyId === storyId),
    
    getTasksByEpic: (state) => (epicId: string) => 
      state.tasks.filter(t => t.epicId === epicId),
    
    unassignedTasks: (state) => 
      state.tasks.filter(t => !t.epicId && !t.storyId),
    
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
    addTask(content: string, priority: SimpleTask['priority'] = 'medium', type: SimpleTask['type'] = 'feature', identifier?: string) {
      const task: SimpleTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        identifier,
        content,
        status: 'pending',
        priority,
        createdAt: new Date(),
        updatedAt: new Date(),
        assignee: 'claude',
        type,
        description: '',
        filesModified: [],
        resources: []
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

    // Move epic to new status
    moveEpic(epicId: string, newStatus: Epic['status']) {
      this.updateEpic(epicId, { status: newStatus });
    },

    // Move story to new status
    moveStory(storyId: string, newStatus: Story['status']) {
      this.updateStory(storyId, { status: newStatus });
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
            filesModified: [],
            resources: []
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
      
      // Skip if not in desktop mode (remote mode loads through service layer)
      if (!window.electronAPI?.fs) {
        return;
      }
      
      const filePath = joinPath(this.projectPath, '.claude', 'simple-tasks.json');
      
      try {
        const result = await window.electronAPI.fs.readFile(filePath);
        if (result.success && result.content) {
          const data = JSON.parse(result.content);
          
          // Load tasks
          this.tasks = (data.tasks || []).map((task: any) => ({
            ...task,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt)
          }));
          
          // Load epics
          this.epics = (data.epics || []).map((epic: any) => ({
            ...epic,
            createdAt: new Date(epic.createdAt),
            updatedAt: new Date(epic.updatedAt)
          }));
          
          // Load stories
          this.stories = (data.stories || []).map((story: any) => ({
            ...story,
            createdAt: new Date(story.createdAt),
            updatedAt: new Date(story.updatedAt)
          }));
          
        }
      } catch (error) {
        
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
      
      // Skip if not in desktop mode (remote mode saves through service layer)
      if (!window.electronAPI?.fs) {
        return;
      }
      
      try {
        // Ensure .claude directory exists
        const claudeDir = joinPath(this.projectPath, '.claude');
        await window.electronAPI.fs.ensureDir(claudeDir);
        
        // Save complete hierarchy (tasks, epics, stories)
        const filePath = joinPath(this.projectPath, '.claude', 'simple-tasks.json');
        const data = {
          tasks: this.tasks,
          epics: this.epics,
          stories: this.stories,
          lastSyncedWithClaude: this.lastSyncedWithClaude,
          lastUpdated: new Date()
        };
        await window.electronAPI.fs.writeFile(filePath, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('Failed to save tasks JSON:', error);
      }
    },

    // Generate TASKS.md file with epic/story hierarchy
    async updateTasksMarkdown() {
      if (!this.tasksMarkdownPath) return;
      
      const formatTask = (task: SimpleTask, indent = 0, isCompleted = false) => {
        const indentStr = '  '.repeat(indent);
        const checkbox = isCompleted ? '[x]' : '[ ]';
        const title = isCompleted ? `~~${task.content}~~` : `**${task.content}**`;
        const emoji = task.status === 'in_progress' ? ' ⏳' : '';
        
        let text = `${indentStr}- ${checkbox} ${title}${emoji}`;
        
        // Add identifier if present
        if (task.identifier) {
          const id = isCompleted ? `~~ID: ${task.identifier}~~` : `ID: ${task.identifier}`;
          text += `\n${indentStr}  - ${id}`;
        }
        
        // Add epic/story reference if present
        if (task.epicId) {
          const epic = this.epics.find(e => e.id === task.epicId);
          if (epic) {
            const epicRef = isCompleted ? `~~Epic: ${epic.title}~~` : `Epic: ${epic.title}`;
            text += `\n${indentStr}  - ${epicRef}`;
          }
        }
        
        if (task.storyId) {
          const story = this.stories.find(s => s.id === task.storyId);
          if (story) {
            const storyRef = isCompleted ? `~~Story: ${story.title}~~` : `Story: ${story.title}`;
            text += `\n${indentStr}  - ${storyRef}`;
          }
        }
        
        // Add structured metadata
        const assignee = isCompleted ? `~~Assignee: ${task.assignee || 'Claude'}~~` : `Assignee: ${task.assignee || 'Claude'}`;
        const type = isCompleted ? `~~Type: ${task.type || 'feature'}~~` : `Type: ${task.type || 'feature'}`;
        const priority = isCompleted ? `~~Priority: ${task.priority}~~` : `Priority: ${task.priority}`;
        
        text += `\n${indentStr}  - ${assignee}`;
        text += `\n${indentStr}  - ${type}`;
        text += `\n${indentStr}  - ${priority}`;
        
        if (task.description) {
          const desc = isCompleted ? `~~Description: ${task.description}~~` : `Description: ${task.description}`;
          text += `\n${indentStr}  - ${desc}`;
        }
        
        // Add dependencies if present
        if (task.dependencies && task.dependencies.length > 0) {
          const deps = task.dependencies.join(', ');
          const depsText = isCompleted ? `~~Dependencies: ${deps}~~` : `Dependencies: ${deps}`;
          text += `\n${indentStr}  - ${depsText}`;
        }
        
        // Format resources if present
        if (task.resources && task.resources.length > 0) {
          const resourceTexts = task.resources.map(r => {
            if (r.type === 'task') {
              return `Task: ${r.name}`;
            } else if (r.type === 'file') {
              return `File: ${r.name}`;
            } else {
              return `${r.type}: ${r.name}`;
            }
          });
          const resourcesStr = resourceTexts.slice(0, 3).join(', ') + (resourceTexts.length > 3 ? '...' : '');
          const resourcesText = isCompleted ? `~~Resources: ${resourcesStr}~~` : `Resources: ${resourcesStr}`;
          text += `\n${indentStr}  - ${resourcesText}`;
        }
        
        return text;
      };
      
      // Format epics section
      let epicsSection = '';
      if (this.epics.length > 0) {
        epicsSection = `## Epics (${this.epics.length})\n\n`;
        for (const epic of this.epics) {
          epicsSection += `### ${epic.title}\n`;
          epicsSection += `- **Status**: ${epic.status}\n`;
          epicsSection += `- **Priority**: ${epic.priority}\n`;
          epicsSection += `- **Business Value**: ${epic.businessValue}\n`;
          epicsSection += `- **Acceptance Criteria**:\n`;
          epicsSection += epic.acceptanceCriteria.map(ac => `  - ${ac}`).join('\n') + '\n\n';
          
          // List stories under each epic
          const stories = this.stories.filter(s => s.epicId === epic.id);
          if (stories.length > 0) {
            epicsSection += `#### Stories:\n`;
            for (const story of stories) {
              epicsSection += `- **${story.title}** (${story.status})\n`;
              epicsSection += `  - User Story: ${story.userStory}\n`;
              epicsSection += `  - Tasks: ${story.taskIds.length}\n`;
            }
            epicsSection += '\n';
          }
        }
      }
      
      // Enhanced format with hierarchical view
      const formatEpic = (epic: Epic, isCompleted = false) => {
        const checkbox = isCompleted ? '[x]' : '[ ]';
        const title = isCompleted ? `~~${epic.title}~~` : `**${epic.title}**`;
        const emoji = epic.status === 'in_progress' ? ' ⏳' : '';
        
        let text = `- ${checkbox} ${title}${emoji} *(Epic)*`;
        text += `\n  - ID: ${epic.id}`;
        text += `\n  - Status: ${epic.status}`;
        text += `\n  - Priority: ${epic.priority}`;
        text += `\n  - Business Value: ${epic.businessValue}`;
        
        if (epic.description) {
          text += `\n  - Description: ${epic.description}`;
        }
        
        if (epic.acceptanceCriteria.length > 0) {
          text += `\n  - Acceptance Criteria:`;
          epic.acceptanceCriteria.forEach(criterion => {
            text += `\n    - ${criterion}`;
          });
        }
        
        // Show story count and progress
        const stories = this.stories.filter(s => s.epicId === epic.id);
        const completedStories = stories.filter(s => s.status === 'done').length;
        text += `\n  - Stories: ${completedStories}/${stories.length} completed`;
        
        return text;
      };
      
      const formatStory = (story: Story, isCompleted = false) => {
        const checkbox = isCompleted ? '[x]' : '[ ]';
        const title = isCompleted ? `~~${story.title}~~` : `**${story.title}**`;
        const emoji = story.status === 'in_progress' ? ' ⏳' : '';
        
        let text = `- ${checkbox} ${title}${emoji} *(Story)*`;
        text += `\n  - ID: ${story.id}`;
        text += `\n  - Status: ${story.status}`;
        text += `\n  - Priority: ${story.priority}`;
        text += `\n  - User Story: ${story.userStory}`;
        
        if (story.description) {
          text += `\n  - Description: ${story.description}`;
        }
        
        if (story.epicId) {
          const epic = this.epics.find(e => e.id === story.epicId);
          if (epic) {
            text += `\n  - Epic: ${epic.title}`;
          }
        }
        
        if (story.acceptanceCriteria.length > 0) {
          text += `\n  - Acceptance Criteria:`;
          story.acceptanceCriteria.forEach(criterion => {
            text += `\n    - ${criterion}`;
          });
        }
        
        // Show task count and progress
        const tasks = this.tasks.filter(t => t.storyId === story.id);
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        text += `\n  - Tasks: ${completedTasks}/${tasks.length} completed`;
        
        return text;
      };
      
      // Enhanced epics section with hierarchical view
      let hierarchySection = '';
      if (this.epics.length > 0 || this.stories.length > 0) {
        hierarchySection = `## 📋 Epic/Story/Task Hierarchy\n\n`;
        
        for (const epic of this.epics) {
          const isEpicCompleted = epic.status === 'done';
          hierarchySection += formatEpic(epic, isEpicCompleted) + '\n\n';
          
          // List stories under each epic with their tasks
          const stories = this.stories.filter(s => s.epicId === epic.id);
          stories.forEach(story => {
            const isStoryCompleted = story.status === 'done';
            hierarchySection += '  ' + formatStory(story, isStoryCompleted).replace(/\n/g, '\n  ') + '\n\n';
            
            // List tasks under each story
            const tasks = this.tasks.filter(t => t.storyId === story.id);
            tasks.forEach(task => {
              const isTaskCompleted = task.status === 'completed';
              hierarchySection += '    ' + formatTask(task, 0, isTaskCompleted).replace(/\n/g, '\n    ') + '\n\n';
            });
          });
        }
        
        // Unassigned stories
        const unassignedStories = this.stories.filter(s => !s.epicId);
        if (unassignedStories.length > 0) {
          hierarchySection += `### 📑 Unassigned Stories\n\n`;
          unassignedStories.forEach(story => {
            const isStoryCompleted = story.status === 'done';
            hierarchySection += formatStory(story, isStoryCompleted) + '\n\n';
            
            // List tasks under each unassigned story
            const tasks = this.tasks.filter(t => t.storyId === story.id);
            tasks.forEach(task => {
              const isTaskCompleted = task.status === 'completed';
              hierarchySection += '  ' + formatTask(task, 0, isTaskCompleted).replace(/\n/g, '\n  ') + '\n\n';
            });
          });
        }
        
        hierarchySection += `---\n\n`;
      }
      
      // Orphaned tasks (not assigned to any story)
      const orphanedTasks = this.tasks.filter(t => !t.storyId && !t.epicId);
      let statusSection = '';
      if (orphanedTasks.length > 0) {
        statusSection = `## 🔄 Task Status View\n\n*Tasks organized by current status (including orphaned tasks)*\n\n`;
      } else {
        statusSection = `## 🔄 Task Status View\n\n*All tasks are organized within the Epic/Story hierarchy above*\n\n`;
      }
      
      const markdown = `# 📊 Project Tasks & Hierarchy\n\n*This file is synced with Clode Studio and supports Epic/Story/Task hierarchy.*  \n*Last updated: ${new Date().toISOString()}*\n\n${hierarchySection}${statusSection}### Backlog (${this.backlogTasks.filter(t => !t.storyId).length})\n\n${this.backlogTasks.filter(t => !t.storyId).map(task => formatTask(task, 0, false)).join('\n\n')}\n\n### To Do (${this.todoTasks.filter(t => !t.storyId).length})\n\n${this.todoTasks.filter(t => !t.storyId).map(task => formatTask(task, 0, false)).join('\n\n')}\n\n### In Progress (${this.inProgressTasks.filter(t => !t.storyId).length})\n\n${this.inProgressTasks.filter(t => !t.storyId).map(task => formatTask(task, 0, false)).join('\n\n')}\n\n### Completed (${this.completedTasks.filter(t => !t.storyId).length})\n\n${this.completedTasks.filter(t => !t.storyId).map(task => formatTask(task, 0, true)).join('\n\n')}\n\n---\n\n## 🎯 Quick Stats\n\n- **Epics**: ${this.epics.length} (${this.epics.filter(e => e.status === 'done').length} completed)\n- **Stories**: ${this.stories.length} (${this.stories.filter(s => s.status === 'done').length} completed)\n- **Tasks**: ${this.tasks.length} (${this.completedTasks.length} completed)\n- **Orphaned Tasks**: ${orphanedTasks.length}\n\n*To update tasks, use the Kanban board in Clode Studio, ask Claude to modify this file, or use Claude's native TodoWrite system.*\n`;
      
      // Skip if not in desktop mode (remote mode saves through service layer)
      if (!window.electronAPI?.fs) {
        return;
      }
      
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
          
          if (metaLine.startsWith('ID:')) {
            currentTask.identifier = metaLine.replace('ID:', '').trim();
          } else if (metaLine.startsWith('Assignee:')) {
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
          } else if (metaLine.startsWith('Resources:')) {
            // Parse resources string back to array
            const resourcesStr = metaLine.replace('Resources:', '').trim();
            currentTask.resources = [];
            
            // Split by comma and parse each resource
            const resourceParts = resourcesStr.split(',').map(r => r.trim()).filter(r => r);
            for (const part of resourceParts) {
              // Format is "Type: Name" e.g., "File: src/api.ts" or "Task: AUTH-01"
              const colonIndex = part.indexOf(':');
              if (colonIndex > -1) {
                const type = part.substring(0, colonIndex).trim().toLowerCase();
                const name = part.substring(colonIndex + 1).trim();
                
                // Map to our resource types
                const typeMap: Record<string, string> = {
                  'file': 'file',
                  'task': 'task',
                  'knowledge': 'knowledge',
                  'hook': 'hook',
                  'mcp': 'mcp',
                  'command': 'command'
                };
                
                if (typeMap[type]) {
                  currentTask.resources.push({
                    type: typeMap[type] as any,
                    id: `${type}-${name}`, // Generate a simple ID
                    name: name,
                    metadata: {}
                  });
                }
              }
            }
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
            identifier: task.identifier,
            content: task.content,
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            createdAt: new Date(),
            updatedAt: new Date(),
            assignee: task.assignee || 'claude',
            type: task.type || 'feature',
            description: task.description || '',
            filesModified: task.filesModified || [],
            resources: task.resources || []
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

    // Epic/Story Management Actions
    createEpic(epic: Omit<Epic, 'id' | 'createdAt' | 'updatedAt' | 'storyIds'>): Epic {
      const newEpic: Epic = {
        ...epic,
        id: `epic-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        storyIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.epics.push(newEpic);
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
      
      return newEpic;
    },

    createStory(story: Omit<Story, 'id' | 'createdAt' | 'updatedAt' | 'taskIds'>): Story {
      const newStory: Story = {
        ...story,
        id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        taskIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.stories.push(newStory);
      
      // Add to epic's story list
      const epic = this.epics.find(e => e.id === story.epicId);
      if (epic) {
        epic.storyIds.push(newStory.id);
        epic.updatedAt = new Date();
      }
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
      
      return newStory;
    },

    assignTaskToStory(taskId: string, storyId: string) {
      const task = this.tasks.find(t => t.id === taskId);
      const story = this.stories.find(s => s.id === storyId);
      
      if (task && story) {
        task.storyId = storyId;
        task.epicId = story.epicId;
        task.updatedAt = new Date();
        
        if (!story.taskIds.includes(taskId)) {
          story.taskIds.push(taskId);
          story.updatedAt = new Date();
        }
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    updateEpic(id: string, updates: Partial<Epic>) {
      const index = this.epics.findIndex(e => e.id === id);
      if (index !== -1) {
        this.epics[index] = {
          ...this.epics[index],
          ...updates,
          updatedAt: new Date()
        };
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    updateStory(id: string, updates: Partial<Story>) {
      const index = this.stories.findIndex(s => s.id === id);
      if (index !== -1) {
        this.stories[index] = {
          ...this.stories[index],
          ...updates,
          updatedAt: new Date()
        };
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    deleteEpic(id: string) {
      const index = this.epics.findIndex(e => e.id === id);
      if (index !== -1) {
        const epic = this.epics[index];
        
        // Remove all associated stories and tasks
        epic.storyIds.forEach(storyId => {
          this.deleteStory(storyId);
        });
        
        this.epics.splice(index, 1);
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    deleteStory(id: string) {
      const index = this.stories.findIndex(s => s.id === id);
      if (index !== -1) {
        const story = this.stories[index];
        
        // Remove story ID from epic
        const epic = this.epics.find(e => e.id === story.epicId);
        if (epic) {
          const storyIndex = epic.storyIds.indexOf(id);
          if (storyIndex !== -1) {
            epic.storyIds.splice(storyIndex, 1);
          }
        }
        
        // Clear story references from tasks
        story.taskIds.forEach(taskId => {
          const task = this.tasks.find(t => t.id === taskId);
          if (task) {
            task.storyId = undefined;
            task.epicId = undefined;
          }
        });
        
        this.stories.splice(index, 1);
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      }
    },

    // Connect to Agent Task Hierarchy system
    async connectToHierarchy() {
      if (this.hierarchyConnected) return;
      
      try {
        // Check if we have access to the agent orchestration system
        if (window.electronAPI && window.electronAPI.agent) {
          const result = await window.electronAPI.agent.executeTask('getEpics', {});
          
          if (result.success && result.epics) {
            // Sync epics from agent system
            result.epics.forEach((agentEpic: any) => {
              const existingEpic = this.epics.find(e => e.id === agentEpic.id);
              if (!existingEpic) {
                this.epics.push({
                  id: agentEpic.id,
                  title: agentEpic.title,
                  description: agentEpic.description,
                  businessValue: agentEpic.businessValue,
                  acceptanceCriteria: agentEpic.acceptanceCriteria,
                  status: agentEpic.status,
                  priority: agentEpic.priority,
                  storyIds: agentEpic.stories?.map((s: any) => s.id) || [],
                  createdAt: new Date(agentEpic.createdAt || Date.now()),
                  updatedAt: new Date(agentEpic.updatedAt || Date.now()),
                  tags: agentEpic.tags
                });
              }
            });
            
            this.hierarchyConnected = true;
            console.log('[TasksStore] Connected to agent task hierarchy');
          }
        }
      } catch (error) {
        console.error('[TasksStore] Failed to connect to hierarchy:', error);
      }
    },

    // Import tasks from TASKS.md file content and replace all existing tasks
    importTasksFromFile(fileContent: string): number {
      // Set flag to prevent infinite loop
      this.isImportingFromFile = true;
      
      try {
        // Clear all existing data first
        this.tasks = [];
        this.epics = [];
        this.stories = [];
        
        // Import new data from file content (epics, stories, and tasks)
        const imported = this.importFromHierarchicalText(fileContent);
        
        // Save to project JSON only (not TASKS.md to avoid loop)
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProjectJSON();
        }
        
        return imported;
      } finally {
        // Always reset the flag
        this.isImportingFromFile = false;
      }
    },

    // Enhanced import that handles epics, stories, and tasks from hierarchical markdown
    importFromHierarchicalText(text: string): number {
      const lines = text.split('\n');
      let importedCount = 0;
      
      let currentEpic: Epic | null = null;
      let currentStory: Story | null = null;
      let currentSection: 'hierarchy' | 'tasks' | null = null;
      let currentTaskSection: 'backlog' | 'pending' | 'in_progress' | 'completed' | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Detect sections
        if (trimmedLine.includes('## 📋 Epic/Story/Task Hierarchy')) {
          currentSection = 'hierarchy';
          continue;
        } else if (trimmedLine.includes('## 🔄 Task Status View')) {
          currentSection = 'tasks';
          continue;
        } else if (currentSection === 'tasks') {
          // Handle task status sections
          if (trimmedLine.includes('### Backlog')) {
            currentTaskSection = 'backlog';
          } else if (trimmedLine.includes('### To Do')) {
            currentTaskSection = 'pending';
          } else if (trimmedLine.includes('### In Progress')) {
            currentTaskSection = 'in_progress';
          } else if (trimmedLine.includes('### Completed')) {
            currentTaskSection = 'completed';
          }
        }
        
        if (currentSection === 'hierarchy') {
          // Parse epic headers (main level - no indent)
          if (line.match(/^- \[[ x]\].*\*\(Epic\)\*/)) {
            // Save previous epic if exists
            if (currentEpic) {
              this.epics.push(currentEpic);
            }
            
            currentEpic = this.parseEpicFromLine(line);
            currentStory = null;
            if (currentEpic) importedCount++;
          }
          // Parse story headers (one level indent)
          else if (line.match(/^  - \[[ x]\].*\*\(Story\)\*/)) {
            // Save previous story if exists
            if (currentStory && currentEpic) {
              currentEpic.storyIds.push(currentStory.id);
              this.stories.push(currentStory);
            }
            
            currentStory = this.parseStoryFromLine(line, currentEpic?.id);
            if (currentStory) importedCount++;
          }
          // Parse task headers (two level indent)
          else if (line.match(/^    - \[[ x]\]/)) {
            const task = this.parseTaskFromLine(line, currentStory?.id, currentEpic?.id);
            if (task) {
              this.tasks.push(task);
              if (currentStory) {
                currentStory.taskIds.push(task.id);
              }
              importedCount++;
            }
          }
          // Parse metadata for current item
          else if (currentEpic && line.match(/^  - /)) {
            this.parseEpicMetadata(line, currentEpic);
          } else if (currentStory && line.match(/^    - /)) {
            this.parseStoryMetadata(line, currentStory);
          } else if (line.match(/^      - /)) {
            // Task metadata in hierarchy section would be 6 spaces deep
            const lastTask = this.tasks[this.tasks.length - 1];
            if (lastTask) {
              this.parseTaskMetadata(line, lastTask);
            }
          }
        } else if (currentSection === 'tasks' && currentTaskSection) {
          // Parse orphaned tasks in status view
          if (line.match(/^- \[[ x]\]/)) {
            const task = this.parseTaskFromLine(line, undefined, undefined, currentTaskSection);
            if (task) {
              // Check if this task already exists (avoid duplicates from hierarchy section)
              const existingTask = this.tasks.find(t => t.content === task.content);
              if (!existingTask) {
                this.tasks.push(task);
                importedCount++;
              }
            }
          }
        }
      }
      
      // Don't forget the last epic and story
      if (currentStory && currentEpic) {
        currentEpic.storyIds.push(currentStory.id);
        this.stories.push(currentStory);
      }
      if (currentEpic) {
        this.epics.push(currentEpic);
      }
      
      return importedCount;
    },

    // Parse epic from markdown line
    parseEpicFromLine(line: string): Epic | null {
      const match = line.match(/^- \[([x ])\] \*\*(.+?)\*\*(.*)?\*\(Epic\)\*/);
      if (!match) return null;
      
      const isCompleted = match[1] === 'x';
      const title = match[2].replace(/~~/g, '').trim();
      
      const epic: Epic = {
        id: `epic-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title,
        description: '',
        businessValue: '',
        acceptanceCriteria: [],
        status: isCompleted ? 'done' : 'backlog',
        priority: 'normal',
        storyIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: []
      };
      
      return epic;
    },

    // Parse story from markdown line
    parseStoryFromLine(line: string, epicId?: string): Story | null {
      const match = line.match(/^  - \[([x ])\] \*\*(.+?)\*\*(.*)?\*\(Story\)\*/);
      if (!match) return null;
      
      const isCompleted = match[1] === 'x';
      const title = match[2].replace(/~~/g, '').trim();
      
      const story: Story = {
        id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        epicId: epicId || '',
        title,
        description: '',
        userStory: '',
        acceptanceCriteria: [],
        status: isCompleted ? 'done' : 'backlog',
        priority: 'normal',
        taskIds: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: []
      };
      
      return story;
    },

    // Parse task from markdown line
    parseTaskFromLine(line: string, storyId?: string, epicId?: string, defaultStatus?: string): SimpleTask | null {
      const match = line.match(/^(?:    )?- \[([x ])\] \*\*(.+?)\*\*/);
      if (!match) return null;
      
      const isCompleted = match[1] === 'x';
      const content = match[2].replace(/~~/g, '').trim();
      
      let status: SimpleTask['status'] = defaultStatus as any || 'pending';
      if (isCompleted) status = 'completed';
      else if (line.includes('⏳')) status = 'in_progress';
      
      const task: SimpleTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        content,
        status,
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date(),
        assignee: 'claude',
        type: 'feature',
        description: '',
        filesModified: [],
        resources: [],
        storyId,
        epicId
      };
      
      return task;
    },

    // Parse epic metadata
    parseEpicMetadata(line: string, epic: Epic) {
      const metaLine = line.replace(/^\s*-\s*/, '').replace(/~~/g, '').trim();
      
      if (metaLine.startsWith('ID:')) {
        // Update the ID to use the one from file
        const fileId = metaLine.replace('ID:', '').trim();
        if (fileId && fileId !== epic.id) {
          epic.id = fileId;
        }
      } else if (metaLine.startsWith('Status:')) {
        const status = metaLine.replace('Status:', '').trim().toLowerCase();
        if (['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done', 'cancelled'].includes(status)) {
          epic.status = status as Epic['status'];
        }
      } else if (metaLine.startsWith('Priority:')) {
        const priority = metaLine.replace('Priority:', '').trim().toLowerCase();
        if (['low', 'normal', 'high', 'critical'].includes(priority)) {
          epic.priority = priority as Epic['priority'];
        }
      } else if (metaLine.startsWith('Business Value:')) {
        epic.businessValue = metaLine.replace('Business Value:', '').trim();
      } else if (metaLine.startsWith('Description:')) {
        epic.description = metaLine.replace('Description:', '').trim();
      }
    },

    // Parse story metadata
    parseStoryMetadata(line: string, story: Story) {
      const metaLine = line.replace(/^\s*-\s*/, '').replace(/~~/g, '').trim();
      
      if (metaLine.startsWith('ID:')) {
        const fileId = metaLine.replace('ID:', '').trim();
        if (fileId && fileId !== story.id) {
          story.id = fileId;
        }
      } else if (metaLine.startsWith('Status:')) {
        const status = metaLine.replace('Status:', '').trim().toLowerCase();
        if (['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done', 'cancelled'].includes(status)) {
          story.status = status as Story['status'];
        }
      } else if (metaLine.startsWith('Priority:')) {
        const priority = metaLine.replace('Priority:', '').trim().toLowerCase();
        if (['low', 'normal', 'high', 'critical'].includes(priority)) {
          story.priority = priority as Story['priority'];
        }
      } else if (metaLine.startsWith('User Story:')) {
        story.userStory = metaLine.replace('User Story:', '').trim();
      } else if (metaLine.startsWith('Description:')) {
        story.description = metaLine.replace('Description:', '').trim();
      } else if (metaLine.startsWith('Epic:')) {
        // Epic reference - could be used to validate/correct epic assignment
        const epicTitle = metaLine.replace('Epic:', '').trim();
        const epic = this.epics.find(e => e.title === epicTitle);
        if (epic && story.epicId !== epic.id) {
          story.epicId = epic.id;
        }
      }
    },

    // Parse task metadata (existing method, enhanced to handle hierarchy context)
    parseTaskMetadata(line: string, task: SimpleTask) {
      const metaLine = line.replace(/^\s*-\s*/, '').replace(/~~/g, '').trim();
      
      if (metaLine.startsWith('ID:')) {
        task.identifier = metaLine.replace('ID:', '').trim();
      } else if (metaLine.startsWith('Assignee:')) {
        const assignee = metaLine.replace('Assignee:', '').trim().toLowerCase();
        if (assignee === 'user' || assignee === 'claude' || assignee === 'both') {
          task.assignee = assignee as SimpleTask['assignee'];
        }
      } else if (metaLine.startsWith('Type:')) {
        const type = metaLine.replace('Type:', '').trim().toLowerCase();
        if (['feature', 'bugfix', 'refactor', 'documentation', 'research'].includes(type)) {
          task.type = type as SimpleTask['type'];
        }
      } else if (metaLine.startsWith('Priority:')) {
        const priority = metaLine.replace('Priority:', '').trim().toLowerCase();
        if (priority === 'high' || priority === 'medium' || priority === 'low') {
          task.priority = priority;
        }
      } else if (metaLine.startsWith('Description:')) {
        task.description = metaLine.replace('Description:', '').trim();
      } else if (metaLine.startsWith('Resources:')) {
        // Parse resources string back to array
        const resourcesStr = metaLine.replace('Resources:', '').trim();
        task.resources = [];
        
        // Split by comma and parse each resource
        const resourceParts = resourcesStr.split(',').map(r => r.trim()).filter(r => r);
        for (const part of resourceParts) {
          // Format is "Type: Name" e.g., "File: src/api.ts" or "Task: AUTH-01"
          const colonIndex = part.indexOf(':');
          if (colonIndex > -1) {
            const type = part.substring(0, colonIndex).trim().toLowerCase();
            const name = part.substring(colonIndex + 1).trim();
            
            // Map to our resource types
            const typeMap: Record<string, string> = {
              'file': 'file',
              'task': 'task',
              'knowledge': 'knowledge',
              'hook': 'hook',
              'mcp': 'mcp',
              'command': 'command'
            };
            
            if (typeMap[type]) {
              task.resources.push({
                type: typeMap[type] as any,
                id: `${type}-${name}`,
                name: name,
                metadata: {}
              });
            }
          }
        }
      } else if (metaLine.startsWith('Dependencies:')) {
        const deps = metaLine.replace('Dependencies:', '').trim();
        task.dependencies = deps.split(',').map(d => d.trim()).filter(d => d);
      } else if (metaLine.startsWith('Epic:')) {
        const epicTitle = metaLine.replace('Epic:', '').trim();
        const epic = this.epics.find(e => e.title === epicTitle);
        if (epic) {
          task.epicId = epic.id;
        }
      } else if (metaLine.startsWith('Story:')) {
        const storyTitle = metaLine.replace('Story:', '').trim();
        const story = this.stories.find(s => s.title === storyTitle);
        if (story) {
          task.storyId = story.id;
        }
      }
    },
    
    // Method for checkpoint system
    restoreState(state: { columns: any[]; taskOrder: Record<string, string[]> }) {
      // Note: This store seems to use a simpler task structure
      // The checkpoint system expects columns and taskOrder, but this store uses a flat task list
      // We'll need to adapt the restoration logic
      
      if (state.columns && Array.isArray(state.columns)) {
        // Convert columns format to flat task list
        const allTasks: SimpleTask[] = [];
        
        state.columns.forEach(column => {
          if (column.tasks && Array.isArray(column.tasks)) {
            column.tasks.forEach((task: any) => {
              // Map task from column format to SimpleTask format
              const simpleTask: SimpleTask = {
                id: task.id,
                title: task.title || task.content || '',
                status: this.mapColumnToStatus(column.id || column.title),
                assignee: task.assignee,
                priority: task.priority,
                type: task.type,
                createdAt: task.createdAt || new Date().toISOString(),
                updatedAt: task.updatedAt || new Date().toISOString(),
                description: task.description,
                filesModified: task.filesModified || [],
                resources: task.resources || []
              };
              allTasks.push(simpleTask);
            });
          }
        });
        
        this.tasks = allTasks;
        this.saveTasksToProject();
      }
    },
    
    mapColumnToStatus(columnId: string): TaskStatus {
      const columnMap: Record<string, TaskStatus> = {
        'backlog': 'backlog',
        'todo': 'todo',
        'to-do': 'todo',
        'in-progress': 'in_progress',
        'in_progress': 'in_progress',
        'completed': 'completed',
        'done': 'completed'
      };
      
      return columnMap[columnId.toLowerCase()] || 'todo';
    }
  }
});