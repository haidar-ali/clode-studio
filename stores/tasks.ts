import { defineStore } from 'pinia';
import { getProjectStorage, type ProjectStorage } from '~/services/ProjectStorage';

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
export interface Epic {
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
  resources?: ResourceReference[];
  estimatedStoryPoints?: number;
  targetTimeline?: string;
  dependencies?: string[];
}

// Story type for feature decomposition
export interface Story {
  id: string;
  epicId?: string; // Made optional for unassigned stories
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
  resources?: ResourceReference[];
  storyPoints?: number;
  timeEstimate?: string;
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
    lastSaveTime: null as Date | null, // Track last save to avoid reload conflicts
    claudeNativeTodos: [] as Array<{content: string, status: string, priority: string, id: string}>,
    isImportingFromFile: false,
    isInitialized: false,
    hierarchyConnected: false, // Track if connected to agent task hierarchy
    storage: null as ProjectStorage | null,
    isUsingNewStorage: true // Flag to use new JSON storage
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
    async setProjectPath(path: string) {
      this.projectPath = path;
      
      // Initialize storage for the new path
      if (path) {
        this.storage = getProjectStorage(path);
        await this.storage.initialize();
      }
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

    // Load tasks from project using new storage system
    async loadTasksFromProject() {
      if (!this.projectPath) return;
      
      // Skip if not in desktop mode (remote mode loads through service layer)
      if (!window.electronAPI?.fs) {
        return;
      }
      
      // Initialize storage if not already done
      if (!this.storage) {
        this.storage = getProjectStorage(this.projectPath);
        await this.storage.initialize();
      }
      
      try {
        // Try new storage format first
        const { epics, stories, tasks } = await this.storage.loadAll();
        
        if (epics.length > 0 || stories.length > 0 || tasks.length > 0) {
          console.log('[TasksStore] Loaded from new JSON storage:', {
            epics: epics.length,
            stories: stories.length,
            tasks: tasks.length
          });
          
          // Convert dates from strings
          this.epics = epics.map(e => ({
            ...e,
            createdAt: new Date(e.createdAt),
            updatedAt: new Date(e.updatedAt)
          }));
          
          this.stories = stories.map(s => ({
            ...s,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt)
          }));
          
          this.tasks = tasks.map(t => ({
            ...t,
            createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
            updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined
          }));
          
          // Generate and save the lightweight TASKS.md reference
          const reference = await this.storage.generateTasksReference(this.epics, this.stories, this.tasks);
          await window.electronAPI.fs.writeFile(`${this.projectPath}/TASKS.md`, reference);
          
          return; // Successfully loaded from new format
        }
        
        // Fall back to old format if new format is empty
        await this.loadTasksFromOldFormat();
        
      } catch (error) {
        console.error('[TasksStore] Failed to load from new storage, trying old format:', error);
        await this.loadTasksFromOldFormat();
      }
    },
    
    // Load from old format (fallback)
    async loadTasksFromOldFormat() {
      if (!this.projectPath) return;
      
      const filePath = joinPath(this.projectPath, '.claude', 'simple-tasks.json');
      
      try {
        const result = await window.electronAPI.fs.readFile(filePath);
        if (result.success && result.content) {
          const data = JSON.parse(result.content);
          
          // Load tasks
          this.tasks = (data.tasks || []).map((task: any) => ({
            ...task,
            createdAt: task.createdAt ? new Date(task.createdAt) : undefined,
            updatedAt: task.updatedAt ? new Date(task.updatedAt) : undefined
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
          
          // Migrate to new format
          if (this.storage && (this.epics.length > 0 || this.stories.length > 0 || this.tasks.length > 0)) {
            console.log('[TasksStore] Migrating from old format to new storage');
            await this.storage.migrateFromTasksMd('', this.epics, this.stories, this.tasks);
          }
        }
      } catch (error) {
        console.error('[TasksStore] Failed to load from old format:', error);
      }
    },

    // Save tasks to project using new storage system
    async saveTasksToProject() {
      if (!this.projectPath || this.isImportingFromFile) return;
      
      // Initialize storage if not already done
      if (!this.storage) {
        this.storage = getProjectStorage(this.projectPath);
        await this.storage.initialize();
      }
      
      try {
        // Save to separate JSON files
        await Promise.all([
          this.storage.saveEpics(this.epics),
          this.storage.saveStories(this.stories),
          this.storage.saveTasks(this.tasks)
        ]);
        
        // Track save time to avoid reload conflicts
        this.lastSaveTime = new Date();
        
        console.log('[TasksStore] Saved to JSON storage:', {
          epics: this.epics.length,
          stories: this.stories.length,
          tasks: this.tasks.length
        });
        
        // Generate and save the lightweight TASKS.md reference
        const reference = await this.storage.generateTasksReference(this.epics, this.stories, this.tasks);
        await window.electronAPI.fs.writeFile(`${this.projectPath}/TASKS.md`, reference);
        
      } catch (error) {
        console.error('[TasksStore] Failed to save to JSON storage:', error);
      }
    },

    // Save tasks to project JSON only (for backwards compatibility)
    async saveTasksToProjectJSON() {
      // This now just calls the main save method
      await this.saveTasksToProject();
    },

    // Generate TASKS.md file (now just a lightweight reference)
    async updateTasksMarkdown() {
      if (!this.projectPath || !this.storage) return;
      
      // Skip if not in desktop mode (remote mode saves through service layer)
      if (!window.electronAPI?.fs) {
        return;
      }
      
      try {
        // Generate and save the lightweight TASKS.md reference
        const reference = await this.storage.generateTasksReference(this.epics, this.stories, this.tasks);
        await window.electronAPI.fs.writeFile(`${this.projectPath}/TASKS.md`, reference);
      } catch (error) {
        console.error('[TasksStore] Failed to update TASKS.md:', error);
      }
      
      return; // The old implementation below is no longer needed

      // Check if TASKS.md already exists
      let existingContent = '';
      try {
        const result = await window.electronAPI.fs.readFile(this.tasksMarkdownPath);
        if (result.success && result.content) {
          existingContent = result.content;
        }
      } catch (error) {
        // File doesn't exist, will create new one
        console.log('TASKS.md does not exist, creating new file');
      }

      // Format task for simple list (existing format without emojis)
      const formatSimpleTask = (task: SimpleTask) => {
        const status = task.status === 'completed' ? '✓' : 
                      task.status === 'in_progress' ? '→' : '○';
        let text = `${status} ${task.content}`;
        
        // Add epic/story reference if present
        if (task.epicId || task.storyId) {
          const refs = [];
          if (task.epicId) {
            const epic = this.epics.find(e => e.id === task.epicId);
            if (epic) refs.push(`Epic: ${epic.title}`);
          }
          if (task.storyId) {
            const story = this.stories.find(s => s.id === task.storyId);
            if (story) refs.push(`Story: ${story.title}`);
          }
          if (refs.length > 0) {
            text += ` [${refs.join(', ')}]`;
          }
        }
        
        return text;
      };
      
      // Build hierarchy reference section (only if we have epics/stories)
      let hierarchyReference = '';
      if (this.epics.length > 0 || this.stories.length > 0) {
        hierarchyReference = '## Epic/Story/Task Hierarchy Reference\n\n';
        
        // List epics with their stories and tasks
        for (const epic of this.epics) {
          hierarchyReference += `### ${epic.title}\n`;
          hierarchyReference += `Status: ${epic.status} | Priority: ${epic.priority}\n\n`;
          
          // List stories under this epic
          const stories = this.stories.filter(s => s.epicId === epic.id);
          if (stories.length > 0) {
            stories.forEach(story => {
              hierarchyReference += `  - **${story.title}** (${story.status})\n`;
              
              // List tasks under this story
              const tasks = this.tasks.filter(t => t.storyId === story.id);
              if (tasks.length > 0) {
                tasks.forEach(task => {
                  const status = task.status === 'completed' ? '✓' :
                               task.status === 'in_progress' ? '→' : '○';
                  hierarchyReference += `    ${status} ${task.content}\n`;
                });
              }
            });
            hierarchyReference += '\n';
          }
        }
        
        // List unassigned stories (only once, not duplicated)
        const unassignedStories = this.stories.filter(s => !s.epicId);
        if (unassignedStories.length > 0) {
          hierarchyReference += '### Unassigned Stories\n\n';
          unassignedStories.forEach(story => {
            hierarchyReference += `  - **${story.title}** (${story.status})\n`;
            
            // List tasks under this story
            const tasks = this.tasks.filter(t => t.storyId === story.id);
            if (tasks.length > 0) {
              tasks.forEach(task => {
                const status = task.status === 'completed' ? '✓' :
                             task.status === 'in_progress' ? '→' : '○';
                hierarchyReference += `    ${status} ${task.content}\n`;
              });
            }
          });
          hierarchyReference += '\n';
        }
        
        hierarchyReference += '---\n\n';
      }
      
      // If existing file, preserve its structure and update only the hierarchy reference
      if (existingContent) {
        // Find where to insert the hierarchy reference
        let updatedContent = existingContent;
        
        // Check if hierarchy reference already exists
        // Updated regex to properly capture the entire hierarchy section including ALL content until next section
        const hierarchyRefRegex = /## Epic\/Story\/Task Hierarchy Reference[\s\S]*?(?=\n## |$)/;
        
        if (hierarchyRefRegex.test(updatedContent)) {
          // Replace existing hierarchy reference completely
          console.log('[TasksStore] Replacing existing hierarchy reference');
          updatedContent = updatedContent.replace(hierarchyRefRegex, hierarchyReference.trim() + '\n\n');
        } else if (hierarchyReference) {
          // Add hierarchy reference after header and metadata, before first section
          const lines = updatedContent.split('\n');
          let insertIndex = -1;
          
          // Find the insertion point - after title and metadata, before first ## section
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip title (# Project Tasks)
            if (i === 0 && line.startsWith('# ')) continue;
            // Skip metadata lines (starting with *)
            if (line.startsWith('*')) continue;
            // Skip empty lines after metadata
            if (line.trim() === '') continue;
            // Found first content section (## Backlog, ## To Do, etc.)
            if (line.startsWith('## ')) {
              insertIndex = i;
              break;
            }
          }
          
          // Insert hierarchy reference before the first section
          if (insertIndex > 0) {
            lines.splice(insertIndex, 0, hierarchyReference);
            updatedContent = lines.join('\n');
          }
        }
        
        // Write the updated content
        try {
          await window.electronAPI.fs.writeFile(this.tasksMarkdownPath, updatedContent);
        } catch (error) {
          console.error('Failed to update TASKS.md:', error);
        }
        return;
      }
      
      // Create new file in simple format (no existing file)
      const backlogTasks = this.tasks.filter(t => t.status === 'backlog');
      const todoTasks = this.tasks.filter(t => t.status === 'pending' || t.status === 'todo');
      const inProgressTasks = this.tasks.filter(t => t.status === 'in_progress');
      const completedTasks = this.tasks.filter(t => t.status === 'completed');
      
      let markdown = '# Project Tasks\n\n';
      
      // Add hierarchy reference if we have epics/stories
      if (hierarchyReference) {
        markdown += hierarchyReference;
      }
      
      // Add task sections in simple format
      if (backlogTasks.length > 0) {
        markdown += '## Backlog\n\n';
        backlogTasks.forEach(task => {
          markdown += formatSimpleTask(task) + '\n';
        });
        markdown += '\n';
      }
      
      if (todoTasks.length > 0) {
        markdown += '## To Do\n\n';
        todoTasks.forEach(task => {
          markdown += formatSimpleTask(task) + '\n';
        });
        markdown += '\n';
      }
      
      if (inProgressTasks.length > 0) {
        markdown += '## In Progress\n\n';
        inProgressTasks.forEach(task => {
          markdown += formatSimpleTask(task) + '\n';
        });
        markdown += '\n';
      }
      
      if (completedTasks.length > 0) {
        markdown += '## Completed\n\n';
        completedTasks.forEach(task => {
          markdown += formatSimpleTask(task) + '\n';
        });
        markdown += '\n';
      }
      
      // Add footer
      markdown += '---\n\n';
      markdown += `*Last updated: ${new Date().toISOString()}*\n`;
      
      // Write the new file
      try {
        await window.electronAPI.fs.writeFile(this.tasksMarkdownPath, markdown);
      } catch (error) {
        console.error('Failed to update TASKS.md:', error);
      }
    },

    // Legacy import function - kept for compatibility
    importTasksFromText(text: string): number {
      // Just use the new unified parser
      const result = this.parseTasksMarkdown(text);
      this.tasks = result.tasks;
      return result.tasks.length;
    },
    
    // Legacy import function kept for compatibility
    importTasksFromTextOld(text: string): number {
      const lines = text.split('\n');
      const newTasks: Partial<SimpleTask>[] = [];
      
      let currentSection: 'backlog' | 'pending' | 'in_progress' | 'completed' | null = null;
      let currentTask: Partial<SimpleTask> | null = null;
      let skipHierarchySection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip hierarchy reference section
        if (line.includes('## Epic/Story/Task Hierarchy Reference')) {
          skipHierarchySection = true;
          continue;
        }
        
        // Detect sections
        if (line.includes('## Backlog')) {
          currentSection = 'backlog';
          skipHierarchySection = false;
        } else if (line.includes('## To Do')) {
          currentSection = 'pending';
          skipHierarchySection = false;
        } else if (line.includes('## In Progress')) {
          currentSection = 'in_progress';
          skipHierarchySection = false;
        } else if (line.includes('## Completed') || line.includes('## Done')) {
          currentSection = 'completed';
          skipHierarchySection = false;
        }
        
        // Skip lines in hierarchy section
        if (skipHierarchySection && !line.startsWith('## ')) {
          continue;
        }
        
        // Parse task header
        if (currentSection && line.match(/^[\s-]*\[[ x]\]/)) {
          // Save previous task if exists
          if (currentTask && currentTask.content) {
            newTasks.push(currentTask);
          }
          
          // Start new task - handle bold text properly
          let taskLine = line.replace(/^[\s-]*\[[ x]\]\s*/, '');
          // Extract content from bold markdown if present
          const boldMatch = taskLine.match(/\*\*(.+?)\*\*/);
          const content = boldMatch ? boldMatch[1].replace(/~~/g, '').trim() : taskLine.replace(/\*\*/g, '').replace(/~~/g, '').replace(/⏳/g, '').trim();
          
          // Check if completed
          const isCompleted = line.includes('[x]');
          
          currentTask = {
            content,
            status: isCompleted ? 'completed' : currentSection,
            priority: 'medium',
            assignee: 'claude',
            type: 'feature'
          };
          
          // Check for in-progress indicator
          if (line.includes('⏳')) {
            currentTask.status = 'in_progress';
          }
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

    addEpic(epicData: Partial<Epic>) {
      console.log('[TasksStore] addEpic called with:', epicData);
      
      const newEpic: Epic = {
        id: epicData.id || `epic-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: epicData.title || 'Untitled Epic',
        description: epicData.description || '',
        businessValue: epicData.businessValue || '',
        acceptanceCriteria: epicData.acceptanceCriteria || [],
        status: epicData.status || 'backlog',
        priority: epicData.priority || 'normal',
        storyIds: epicData.storyIds || [],
        tags: epicData.tags || [],
        resources: epicData.resources || [],
        estimatedStoryPoints: epicData.estimatedStoryPoints,
        targetTimeline: epicData.targetTimeline || '',
        dependencies: epicData.dependencies || [],
        createdAt: epicData.createdAt || new Date(),
        updatedAt: epicData.updatedAt || new Date()
      };
      
      console.log('[TasksStore] Created epic:', newEpic);
      this.epics.push(newEpic);
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
      
      return newEpic;
    },

    addStory(storyData: Partial<Story>) {
      const newStory: Story = {
        id: storyData.id || `story-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        epicId: storyData.epicId || '',
        title: storyData.title || 'Untitled Story',
        description: storyData.description || '',
        userStory: storyData.userStory || '',
        acceptanceCriteria: storyData.acceptanceCriteria || [],
        status: storyData.status || 'backlog',
        priority: storyData.priority || 'normal',
        taskIds: storyData.taskIds || [],
        dependencies: storyData.dependencies || [],
        tags: storyData.tags || [],
        resources: storyData.resources || [],
        storyPoints: storyData.storyPoints,
        timeEstimate: storyData.timeEstimate || '',
        createdAt: storyData.createdAt || new Date(),
        updatedAt: storyData.updatedAt || new Date()
      };
      
      this.stories.push(newStory);
      
      // If assigned to an epic, add story ID to epic's storyIds
      if (newStory.epicId) {
        const epic = this.epics.find(e => e.id === newStory.epicId);
        if (epic && !epic.storyIds.includes(newStory.id)) {
          epic.storyIds.push(newStory.id);
        }
      }
      
      if (this.isAutoSaveEnabled) {
        this.saveTasksToProject();
      }
      
      return newStory;
    },

    updateEpic(id: string, updates: Partial<Epic>) {
      console.log('[TasksStore] updateEpic called with id:', id, 'updates:', updates);
      const index = this.epics.findIndex(e => e.id === id);
      if (index !== -1) {
        this.epics[index] = {
          ...this.epics[index],
          ...updates,
          updatedAt: new Date()
        };
        console.log('[TasksStore] Updated epic:', this.epics[index]);
        
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProject();
        }
      } else {
        console.error('[TasksStore] Epic not found with id:', id);
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
      console.log('[TasksStore] importTasksFromFile called');
      // Set flag to prevent infinite loop
      this.isImportingFromFile = true;
      
      try {
        // IMPORTANT: Don't clear epics and stories - they are managed through the UI
        // Only clear and reimport tasks from the file
        this.tasks = [];
        
        // Parse the file but only use the tasks, not epics/stories from hierarchy
        const { tasks } = this.parseTasksMarkdown(fileContent);
        
        // Set only the tasks - epics and stories remain unchanged
        // The hierarchy reference is just for display, not the source of truth
        this.tasks = tasks;
        
        // Save to project JSON only (not TASKS.md to avoid loop)
        if (this.isAutoSaveEnabled) {
          this.saveTasksToProjectJSON();
        }
        
        return tasks.length + epics.length + stories.length;
      } finally {
        // Always reset the flag
        this.isImportingFromFile = false;
      }
    },

    // Unified parser for TASKS.md format
    parseTasksMarkdown(content: string): { epics: Epic[], stories: Story[], tasks: SimpleTask[] } {
      const lines = content.split('\n');
      const epics: Epic[] = [];
      const stories: Story[] = [];
      const tasks: SimpleTask[] = [];
      
      let currentSection: 'hierarchy' | 'backlog' | 'todo' | 'in_progress' | 'completed' | null = null;
      let currentEpic: Epic | null = null;
      let currentTask: Partial<SimpleTask> | null = null;
      let inHierarchy = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Detect sections
        if (trimmed.includes('## Epic/Story/Task Hierarchy Reference')) {
          currentSection = 'hierarchy';
          inHierarchy = true;
          continue;
        } else if (trimmed === '## Backlog' || trimmed.includes('## Backlog')) {
          currentSection = 'backlog';
          inHierarchy = false;
          currentEpic = null;
        } else if (trimmed === '## To Do' || trimmed.includes('## To Do')) {
          currentSection = 'todo';
          inHierarchy = false;
          currentEpic = null;
        } else if (trimmed === '## In Progress' || trimmed.includes('## In Progress')) {
          currentSection = 'in_progress';
          inHierarchy = false;
          currentEpic = null;
        } else if (trimmed === '## Completed' || trimmed.includes('## Completed')) {
          currentSection = 'completed';
          inHierarchy = false;
          currentEpic = null;
        } else if (trimmed.startsWith('## ') && !trimmed.includes('Epic/Story')) {
          inHierarchy = false;
          currentEpic = null;
        }
        
        // Skip parsing hierarchy reference section for epics/stories
        // This is just a reference, not the source of truth
        if (inHierarchy && currentSection === 'hierarchy') {
          // Skip the hierarchy section entirely - we don't create epics from here
          continue;
        }
        
        // Parse task sections (Backlog, To Do, In Progress, Completed)
        if (!inHierarchy && currentSection && currentSection !== 'hierarchy') {
          // Parse task header
          if (line.match(/^-\s*\[[ x]\]/)) {
            // Save previous task if exists
            if (currentTask && currentTask.content) {
              const status = currentSection === 'backlog' ? 'backlog' :
                           currentSection === 'todo' ? 'pending' :
                           currentSection === 'in_progress' ? 'in_progress' :
                           currentSection === 'completed' ? 'completed' : 'pending';
              
              tasks.push({
                id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                content: currentTask.content,
                status: currentTask.status || status,
                priority: currentTask.priority || 'medium',
                createdAt: new Date(),
                updatedAt: new Date(),
                assignee: currentTask.assignee || 'claude',
                type: currentTask.type || 'feature',
                identifier: currentTask.identifier,
                description: currentTask.description || '',
                filesModified: currentTask.filesModified || [],
                resources: currentTask.resources || [],
                dependencies: currentTask.dependencies
              } as SimpleTask);
            }
            
            // Start new task
            const isCompleted = line.includes('[x]');
            const taskLine = line.replace(/^-\s*\[[ x]\]\s*/, '');
            const boldMatch = taskLine.match(/\*\*(.+?)\*\*/);
            const content = boldMatch ? boldMatch[1].replace(/~~/g, '').trim() : 
                          taskLine.replace(/\*\*/g, '').replace(/~~/g, '').replace(/⏳/g, '').trim();
            
            currentTask = {
              content,
              status: isCompleted ? 'completed' : 
                     line.includes('⏳') ? 'in_progress' : undefined
            };
          }
          // Parse task metadata
          else if (currentTask && line.match(/^\s+-\s+/)) {
            const metaLine = line.replace(/^\s+-\s+/, '').replace(/~~/g, '').trim();
            
            if (metaLine.startsWith('ID:')) {
              currentTask.identifier = metaLine.replace('ID:', '').trim();
            } else if (metaLine.startsWith('Assignee:')) {
              const assignee = metaLine.replace('Assignee:', '').trim().toLowerCase();
              if (['user', 'claude', 'both'].includes(assignee)) {
                currentTask.assignee = assignee as any;
              }
            } else if (metaLine.startsWith('Type:')) {
              const type = metaLine.replace('Type:', '').trim().toLowerCase();
              if (['feature', 'bugfix', 'refactor', 'documentation', 'research'].includes(type)) {
                currentTask.type = type as any;
              }
            } else if (metaLine.startsWith('Priority:')) {
              const priority = metaLine.replace('Priority:', '').trim().toLowerCase();
              if (['high', 'medium', 'low'].includes(priority)) {
                currentTask.priority = priority;
              }
            } else if (metaLine.startsWith('Description:')) {
              currentTask.description = metaLine.replace('Description:', '').trim();
            } else if (metaLine.startsWith('Resources:')) {
              const resourcesStr = metaLine.replace('Resources:', '').trim();
              currentTask.resources = [];
              
              const resourceParts = resourcesStr.split(',').map(r => r.trim()).filter(r => r);
              for (const part of resourceParts) {
                const colonIndex = part.indexOf(':');
                if (colonIndex > -1) {
                  const type = part.substring(0, colonIndex).trim().toLowerCase();
                  const name = part.substring(colonIndex + 1).trim();
                  
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
                      id: `${type}-${name}`,
                      name: name,
                      metadata: {}
                    });
                  }
                }
              }
            } else if (metaLine.startsWith('Dependencies:')) {
              const deps = metaLine.replace('Dependencies:', '').trim();
              currentTask.dependencies = deps.split(',').map(d => d.trim()).filter(d => d);
            }
          }
        }
      }
      
      // Don't forget the last task
      if (currentTask && currentTask.content && currentSection && currentSection !== 'hierarchy') {
        const status = currentSection === 'backlog' ? 'backlog' :
                     currentSection === 'todo' ? 'pending' :
                     currentSection === 'in_progress' ? 'in_progress' :
                     currentSection === 'completed' ? 'completed' : 'pending';
        
        tasks.push({
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          content: currentTask.content,
          status: currentTask.status || status,
          priority: currentTask.priority || 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          assignee: currentTask.assignee || 'claude',
          type: currentTask.type || 'feature',
          identifier: currentTask.identifier,
          description: currentTask.description || '',
          filesModified: currentTask.filesModified || [],
          resources: currentTask.resources || [],
          dependencies: currentTask.dependencies
        } as SimpleTask);
      }
      
      return { epics, stories, tasks };
    },

    // Enhanced import that handles epics, stories, and tasks from hierarchical markdown
    importFromHierarchicalText(text: string): number {
      const lines = text.split('\n');
      let importedCount = 0;
      
      // Clear epics and stories only (tasks are handled by importTasksFromText)
      this.epics = [];
      this.stories = [];
      
      let currentEpic: Epic | null = null;
      let currentStory: Story | null = null;
      let currentSection: 'hierarchy' | 'tasks' | null = null;
      let currentTaskSection: 'backlog' | 'pending' | 'in_progress' | 'completed' | null = null;
      let inHierarchySection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Detect hierarchy section (handle both emoji and non-emoji versions)
        if (trimmedLine.includes('Epic/Story/Task Hierarchy')) {
          currentSection = 'hierarchy';
          inHierarchySection = true;
          continue;
        } else if (trimmedLine.startsWith('## ') && !trimmedLine.includes('Epic/Story/Task Hierarchy')) {
          // Exit hierarchy section when we hit another ## section
          inHierarchySection = false;
          currentSection = 'tasks';
          continue;
        }
        
        // Only process hierarchy section lines
        if (inHierarchySection && currentSection === 'hierarchy') {
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
      // Try to match checkbox format first
      let match = line.match(/^(?:    )?- \[([x ])\] \*\*(.+?)\*\*/);
      if (match) {
        const isCompleted = match[1] === 'x';
        const content = match[2].replace(/~~/g, '').trim();
        
        let status: SimpleTask['status'] = defaultStatus as any || 'pending';
        if (isCompleted) status = 'completed';
        else if (line.includes('⏳') || line.includes('→')) status = 'in_progress';
        
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
      }
      
      // Try to match simple format (○ Task, → Task, ✓ Task)
      match = line.match(/^(?:    )?([○→✓]) (.+)/);
      if (!match) return null;
      
      const statusSymbol = match[1];
      const contentWithRef = match[2].trim();
      
      // Extract content and references
      let content = contentWithRef;
      let extractedStoryId = storyId;
      let extractedEpicId = epicId;
      
      // Check for [Epic: X, Story: Y] format
      const refMatch = contentWithRef.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
      if (refMatch) {
        content = refMatch[1].trim();
        // Parse references - we won't use them for now since we're tracking hierarchy differently
      }
      
      let status: SimpleTask['status'] = defaultStatus as any || 'pending';
      if (statusSymbol === '✓') status = 'completed';
      else if (statusSymbol === '→') status = 'in_progress';
      else if (statusSymbol === '○') status = 'pending';
      
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