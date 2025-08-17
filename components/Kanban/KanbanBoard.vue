<template>
  <div class="kanban-board">
    <!-- Horizontal top bar with title and actions -->
    <div class="board-header">
      <div class="header-title">
        <Icon name="mdi:view-dashboard" size="24" />
        <span>Task Management</span>
      </div>
      
      <div class="header-controls">
        <!-- View Switcher -->
        <div class="view-switcher">
          <button 
            v-for="view in viewOptions" 
            :key="view.id"
            @click="currentView = view.id"
            class="view-tab"
            :class="{ active: currentView === view.id }"
          >
            <Icon :name="view.icon" size="16" />
            {{ view.label }}
          </button>
        </div>
        
        <!-- Hierarchy Toggle -->
        <div class="hierarchy-toggle">
          <button 
            @click="showHierarchy = !showHierarchy"
            class="toggle-button"
            :class="{ active: showHierarchy }"
            title="Toggle hierarchical view"
          >
            <Icon :name="showHierarchy ? 'mdi:view-list' : 'mdi:view-stream'" size="16" />
            {{ showHierarchy ? 'Flat' : 'Hierarchy' }}
          </button>
        </div>
        
        <div class="header-actions">
          <button @click="createNewProject" class="header-button primary" title="Create new project instructions">
            <Icon name="mdi:rocket-launch" size="18" />
            <span>New Project</span>
          </button>
          
          <button @click="createTaskInstructions" class="header-button" title="Create task management instructions">
            <Icon name="mdi:book-open-page-variant" size="18" />
            <span>Instructions</span>
          </button>
          
          <button @click="addNewItem" class="header-button" :title="`Add a new ${currentView.slice(0, -1)}`">
            <Icon name="mdi:plus" size="18" />
            <span>Add {{ currentView === 'epics' ? 'Epic' : currentView === 'stories' ? 'Story' : 'Task' }}</span>
          </button>
          
          <button @click="openTasksFile" class="header-button" title="View TASKS.md file">
            <Icon name="mdi:file-document-outline" size="18" />
            <span>TASKS.md</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Kanban board content -->
    <div class="board-content">
      <!-- Unified Hierarchical View -->
      <div v-if="showHierarchy && currentView === 'tasks'" class="hierarchical-board">
        <!-- Epic Swimlanes -->
        <div v-for="epic in allEpics" :key="epic.id" class="epic-swimlane">
          <EpicSwimlane
            :epic="epic"
            :stories="getStoriesByEpic(epic.id)"
            :tasks="getTasksByEpic(epic.id)"
            @edit-epic="editEpic"
            @delete-epic="deleteEpic"
            @create-story="createStoryFromEpic"
            @edit-story="editStory"
            @delete-story="deleteStory"
            @create-task="createTaskFromStory"
            @edit-task="editTask"
            @delete-task="deleteTask"
            @drop-story="onStoryDrop"
            @drop-task="onTaskDrop"
          />
        </div>
        
        <!-- Unassigned Stories -->
        <div v-if="unassignedStories.length > 0" class="epic-swimlane unassigned">
          <UnassignedSwimlane
            title="Unassigned Stories"
            :stories="unassignedStories"
            :tasks="unassignedTasks"
            @edit-story="editStory"
            @delete-story="deleteStory"
            @create-task="createTaskFromStory"
            @edit-task="editTask"
            @delete-task="deleteTask"
            @drop-story="onStoryDrop"
            @drop-task="onTaskDrop"
          />
        </div>
        
        <!-- Orphaned Tasks -->
        <div v-if="orphanedTasks.length > 0" class="epic-swimlane orphaned">
          <OrphanedTasksSwimlane
            :tasks="orphanedTasks"
            @edit-task="editTask"
            @delete-task="deleteTask"
            @drop-task="onTaskDrop"
          />
        </div>
      </div>
      
      <!-- Flat Views -->
      <div v-else>
        <!-- Epic View -->
        <div v-if="currentView === 'epics'" class="board-columns">
          <KanbanColumn
            title="Backlog"
            :items="backlogEpics"
            item-type="epic"
            status="backlog"
            @drop="onEpicDrop"
            @edit="editEpic"
            @delete="deleteEpic"
            @create-story="createStoryFromEpic"
          />
          
          <KanbanColumn
            title="Ready"
            :items="readyEpics"
            item-type="epic"
            status="ready"
            @drop="onEpicDrop"
            @edit="editEpic"
            @delete="deleteEpic"
            @create-story="createStoryFromEpic"
          />
          
          <KanbanColumn
            title="In Progress"
            :items="inProgressEpics"
            item-type="epic"
            status="in_progress"
            @drop="onEpicDrop"
            @edit="editEpic"
            @delete="deleteEpic"
            @create-story="createStoryFromEpic"
          />
          
          <KanbanColumn
            title="Done"
            :items="doneEpics"
            item-type="epic"
            status="done"
            @drop="onEpicDrop"
            @edit="editEpic"
            @delete="deleteEpic"
            @create-story="createStoryFromEpic"
          />
        </div>

        <!-- Story View -->
        <div v-else-if="currentView === 'stories'" class="board-columns">
          <KanbanColumn
            title="Backlog"
            :items="backlogStories"
            item-type="story"
            status="backlog"
            @drop="onStoryDrop"
            @edit="editStory"
            @delete="deleteStory"
            @create-task="createTaskFromStory"
          />
          
          <KanbanColumn
            title="Ready"
            :items="readyStories"
            item-type="story"
            status="ready"
            @drop="onStoryDrop"
            @edit="editStory"
            @delete="deleteStory"
            @create-task="createTaskFromStory"
          />
          
          <KanbanColumn
            title="In Progress"
            :items="inProgressStories"
            item-type="story"
            status="in_progress"
            @drop="onStoryDrop"
            @edit="editStory"
            @delete="deleteStory"
            @create-task="createTaskFromStory"
          />
          
          <KanbanColumn
            title="Done"
            :items="doneStories"
            item-type="story"
            status="done"
            @drop="onStoryDrop"
            @edit="editStory"
            @delete="deleteStory"
            @create-task="createTaskFromStory"
          />
        </div>

        <!-- Task View (existing) -->
        <div v-else class="board-columns">
          <KanbanColumn
            title="Backlog"
            :items="backlogTasks"
            item-type="task"
            status="backlog"
            @drop="onTaskDrop"
            @edit="editTask"
            @delete="deleteTask"
          />
          
          <KanbanColumn
            title="To Do"
            :items="todoTasks"
            item-type="task"
            status="pending"
            @drop="onTaskDrop"
            @edit="editTask"
            @delete="deleteTask"
          />
          
          <KanbanColumn
            title="In Progress"
            :items="inProgressTasks"
            item-type="task"
            status="in_progress"
            @drop="onTaskDrop"
            @edit="editTask"
            @delete="deleteTask"
          />
          
          <KanbanColumn
            title="Done"
            :items="completedTasks"
            item-type="task"
            status="completed"
            @drop="onTaskDrop"
            @edit="editTask"
            @delete="deleteTask"
          />
        </div>
      </div>
    </div>

    <!-- Task Modal -->
    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>{{ editingTask ? 'Edit Task' : 'New Task' }}</h3>
          <button @click="closeModal" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>
        
        <form @submit.prevent="saveTask" class="modal-form">
          <div class="form-row">
            <div class="form-group">
              <label for="task-identifier">Identifier (Optional)</label>
              <input
                id="task-identifier"
                v-model="taskForm.identifier"
                type="text"
                placeholder="e.g., TASK-001"
              />
            </div>
            
            <div class="form-group flex-2">
              <label for="task-content">Task Content *</label>
              <input
                id="task-content"
                v-model="taskForm.content"
                type="text"
                required
                placeholder="Task content..."
              />
            </div>
          </div>
          
          <div class="form-group">
            <label for="task-description">Description</label>
            <textarea
              id="task-description"
              v-model="taskForm.description"
              rows="3"
              placeholder="Task description..."
            ></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="task-priority">Priority</label>
              <select id="task-priority" v-model="taskForm.priority">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="task-type">Type</label>
              <select id="task-type" v-model="taskForm.type">
                <option value="feature">Feature</option>
                <option value="bugfix">Bug Fix</option>
                <option value="refactor">Refactor</option>
                <option value="documentation">Documentation</option>
                <option value="research">Research</option>
              </select>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="task-assignee">Assignee</label>
              <select id="task-assignee" v-model="taskForm.assignee">
                <option value="claude">Claude</option>
                <option value="user">User</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label>Resources</label>
            <div class="resources-section">
              <button type="button" @click="openResourceModal" class="add-resource-button">
                <Icon name="mdi:plus" />
                Add Resource
              </button>
              
              <div v-if="taskForm.resources.length > 0" class="resource-list">
                <div v-for="(resource, index) in taskForm.resources" :key="`${resource.type}-${resource.id}`" class="resource-item">
                  <Icon :name="getResourceIcon(resource.type)" />
                  <span class="resource-name">{{ resource.name }}</span>
                  <span class="resource-type">{{ resource.type }}</span>
                  <button type="button" @click="removeResource(index)" class="remove-resource">
                    <Icon name="mdi:close" size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="form-actions">
            <button type="button" @click="closeModal" class="cancel-button">
              Cancel
            </button>
            <button type="submit" class="save-button">
              {{ editingTask ? 'Update' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Resource Modal -->
    <ResourceModal 
      :is-open="showResourceModal" 
      context="task"
      @close="closeResourceModal"
      @add="handleAddResource"
    />

    <!-- View Modal for remote mode -->
    <div v-if="viewModal" class="modal-overlay" @click="viewModal = false">
      <div class="modal view-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ viewModalContent.startsWith('# Project Instructions') ? 'Project Instructions' : 'TASKS.md' }}</h3>
          <button @click="viewModal = false" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>
        <div class="modal-body">
          <pre>{{ viewModalContent }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useEditorStore } from '~/stores/editor';
import ResourceModal from '~/components/Prompts/ResourceModal.vue';
import type { ResourceReference } from '~/stores/prompt-engineering';
import { useServices } from '~/composables/useServices';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

// Using simplified task structure
interface SimpleTask {
  id: string;
  identifier?: string;
  content: string;
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  assignee?: 'claude' | 'user' | 'both';
  description?: string;
  resources?: ResourceReference[];
}

const tasksStore = useTasksStore();
const claudeInstancesStore = useClaudeInstancesStore();
const { services, initialize } = useServices();
const { connected: remoteConnected } = useRemoteConnection();
const isInitialized = ref(false);
const viewModal = ref(false);
const viewModalContent = ref('');

// Import AppMode enum
import { AppMode } from '~/services/interfaces/IServiceProvider';

// Check if we're in remote or hybrid mode (needs manual save)
// In hybrid mode, we still need manual save since auto-save conflicts with desktop
const isRemote = computed(() => {
  // If no Electron API, we're definitely in remote-only mode
  if (!window.electronAPI) return true;
  // Otherwise check the service mode
  return services.value?.mode === AppMode.REMOTE || services.value?.mode === AppMode.HYBRID;
});

// Store cleanup function for file watching
let cleanupFileWatching: (() => void) | undefined;

const showModal = ref(false);
const showResourceModal = ref(false);
const editingTask = ref<SimpleTask | null>(null);
const taskForm = ref({
  identifier: '',
  content: '',
  description: '',
  priority: 'medium' as 'low' | 'medium' | 'high',
  type: 'feature' as SimpleTask['type'],
  assignee: 'claude' as SimpleTask['assignee'],
  resources: [] as ResourceReference[]
});

// View switching
const currentView = ref('tasks');
const showHierarchy = ref(true);
const viewOptions = [
  { id: 'epics', label: 'Epics', icon: 'mdi:flag' },
  { id: 'stories', label: 'Stories', icon: 'mdi:book-open-variant' },
  { id: 'tasks', label: 'Tasks', icon: 'mdi:checkbox-marked-outline' }
];

// Task computed properties
const backlogTasks = computed(() => tasksStore.backlogTasks);
const todoTasks = computed(() => tasksStore.todoTasks);
const inProgressTasks = computed(() => tasksStore.inProgressTasks);
const completedTasks = computed(() => tasksStore.completedTasks);
const taskCount = computed(() => tasksStore.taskCount);

// Epic computed properties
const backlogEpics = computed(() => tasksStore.epics.filter(epic => epic.status === 'backlog'));
const readyEpics = computed(() => tasksStore.epics.filter(epic => epic.status === 'ready'));
const inProgressEpics = computed(() => tasksStore.epics.filter(epic => epic.status === 'in_progress'));
const doneEpics = computed(() => tasksStore.epics.filter(epic => epic.status === 'done'));

// Story computed properties
const backlogStories = computed(() => tasksStore.stories.filter(story => story.status === 'backlog'));
const readyStories = computed(() => tasksStore.stories.filter(story => story.status === 'ready'));
const inProgressStories = computed(() => tasksStore.stories.filter(story => story.status === 'in_progress'));
const doneStories = computed(() => tasksStore.stories.filter(story => story.status === 'done'));

// Hierarchical computed properties
const allEpics = computed(() => tasksStore.epics);
const unassignedStories = computed(() => tasksStore.stories.filter(story => !story.epicId));
const unassignedTasks = computed(() => tasksStore.tasks.filter(task => !task.storyId && !task.epicId));
const orphanedTasks = computed(() => tasksStore.tasks.filter(task => !task.storyId && !task.epicId));

const getStoriesByEpic = (epicId: string) => tasksStore.getStoriesByEpic(epicId);
const getTasksByEpic = (epicId: string) => tasksStore.getTasksByEpic(epicId);
const getTasksByStory = (storyId: string) => tasksStore.getTasksByStory(storyId);

// Helper function to save tasks using the service layer
const saveTasks = async () => {
  if (!tasksStore.projectPath) return;
  
  try {
    // In remote mode, save via API
    if (!window.electronAPI) {
      // Build markdown content from tasks
      const markdownContent = buildTasksMarkdown(tasksStore.tasks);
      
      // Save TASKS.md via API
      await $fetch('/api/files/write', {
        method: 'POST',
        body: {
          path: 'TASKS.md',  // Use relative path from workspace
          content: markdownContent
        }
      });
      
      return;
    }
    
    // Desktop mode - use services
    if (!services.value?.tasks) return;
    
    await services.value.tasks.saveTasks(tasksStore.projectPath, tasksStore.tasks);
    await services.value.tasks.saveTasksToMarkdown(tasksStore.projectPath, tasksStore.tasks);
  } catch (error) {
    console.error('[KanbanBoard] Failed to save tasks:', error);
  }
};

// Build TASKS.md content from tasks
const buildTasksMarkdown = (tasks: SimpleTask[]): string => {
  const backlog = tasks.filter(t => t.status === 'backlog');
  const todo = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');
  
  let content = '# Project Tasks\n\n';
  content += `*Last updated: ${new Date().toISOString()}*\n\n`;
  
  const formatTask = (task: SimpleTask): string => {
    const checkbox = task.status === 'completed' ? '[x]' : '[ ]';
    const taskContent = task.status === 'completed' ? `~~${task.content}~~` : `**${task.content}**`;
    let result = `- ${checkbox} ${taskContent}`;
    
    if (task.status === 'in_progress') result += ' ⏳';
    result += '\n';
    
    if (task.identifier) result += `  - ID: ${task.identifier}\n`;
    if (task.description) result += `  - Description: ${task.description}\n`;
    result += `  - Priority: ${task.priority}\n`;
    result += `  - Type: ${task.type}\n`;
    
    return result;
  };
  
  content += `## Backlog (${backlog.length})\n\n`;
  backlog.forEach(task => { content += formatTask(task) + '\n'; });
  
  content += `## To Do (${todo.length})\n\n`;
  todo.forEach(task => { content += formatTask(task) + '\n'; });
  
  content += `## In Progress (${inProgress.length})\n\n`;
  inProgress.forEach(task => { content += formatTask(task) + '\n'; });
  
  content += `## Completed (${completed.length})\n\n`;
  completed.forEach(task => { content += formatTask(task) + '\n'; });
  
  return content;
};

const onTaskDrop = async (taskId: string, newStatus: SimpleTask['status']) => {
  // Update in local store
  tasksStore.moveTask(taskId, newStatus);
  
  // In desktop mode, the store already saves automatically
  // Only save manually in remote mode
  if (isRemote.value) {
    // Ensure services are initialized
    if (!isInitialized.value) {
      await initialize();
      isInitialized.value = true;
    }
    
    // Save using service layer
    await saveTasks();
  }
};

const onEpicDrop = async (epicId: string, newStatus: string) => {
  tasksStore.moveEpic(epicId, newStatus as any);
  if (isRemote.value) {
    await saveTasks();
  }
};

const onStoryDrop = async (storyId: string, newStatus: string) => {
  tasksStore.moveStory(storyId, newStatus as any);
  if (isRemote.value) {
    await saveTasks();
  }
};

const editEpic = (epic: any) => {
  console.log('Editing epic:', epic);
  // TODO: Implement epic editing
};

const editStory = (story: any) => {
  console.log('Editing story:', story);
  // TODO: Implement story editing
};

const deleteEpic = (epic: any) => {
  tasksStore.deleteEpic(epic.id);
};

const deleteStory = (story: any) => {
  tasksStore.deleteStory(story.id);
};

const createStoryFromEpic = (epic: any) => {
  console.log('Creating story from epic:', epic);
  // TODO: Implement story creation from epic
};

const createTaskFromStory = (story: any) => {
  console.log('Creating task from story:', story);
  // TODO: Implement task creation from story
};

// Removed sync functions since file watching handles it automatically

const addNewItem = () => {
  if (currentView.value === 'epics') {
    addNewEpic();
  } else if (currentView.value === 'stories') {
    addNewStory();
  } else {
    addNewTask();
  }
};

const addNewTask = () => {
  editingTask.value = null;
  taskForm.value = {
    identifier: '',
    content: '',
    description: '',
    priority: 'medium',
    type: 'feature',
    assignee: 'claude',
    resources: []
  };
  showModal.value = true;
};

const addNewEpic = () => {
  // TODO: Implement epic creation modal
  console.log('Creating new epic');
};

const addNewStory = () => {
  // TODO: Implement story creation modal
  console.log('Creating new story');
};

const editTask = (task: SimpleTask) => {
  editingTask.value = task;
  taskForm.value = {
    identifier: task.identifier || '',
    content: task.content,
    description: task.description || '',
    priority: task.priority || 'medium',
    type: task.type || 'feature',
    assignee: task.assignee || 'claude',
    resources: task.resources || []
  };
  showModal.value = true;
};

const deleteTask = async (task: SimpleTask) => {
  if (confirm(`Delete task "${task.content}"?`)) {
    tasksStore.deleteTask(task.id);
    
    // Only save manually in remote mode
    if (isRemote.value) {
      await saveTasks();
    }
  }
};

const saveTask = async () => {
  if (!taskForm.value.content.trim()) return;
  
  if (editingTask.value) {
    tasksStore.updateTask(editingTask.value.id, {
      identifier: taskForm.value.identifier,
      content: taskForm.value.content,
      description: taskForm.value.description,
      priority: taskForm.value.priority,
      type: taskForm.value.type,
      assignee: taskForm.value.assignee,
      resources: taskForm.value.resources
    });
  } else {
    tasksStore.addTask(
      taskForm.value.content,
      taskForm.value.priority,
      taskForm.value.type,
      taskForm.value.identifier
    );
    // Update the task with description, assignee, and resources after creation
    const tasks = tasksStore.tasks;
    const newTask = tasks[tasks.length - 1];
    if (newTask) {
      tasksStore.updateTask(newTask.id, {
        description: taskForm.value.description,
        assignee: taskForm.value.assignee,
        resources: taskForm.value.resources
      });
    }
  }
  
  // Only save manually in remote mode
  if (isRemote.value) {
    await saveTasks();
  }
  
  closeModal();
};

const closeModal = () => {
  showModal.value = false;
  editingTask.value = null;
};

const openResourceModal = () => {
  showResourceModal.value = true;
};

const closeResourceModal = () => {
  showResourceModal.value = false;
};

const handleAddResource = (resource: ResourceReference) => {
  // Check if resource already exists
  const exists = taskForm.value.resources.some(r => 
    r.type === resource.type && r.id === resource.id
  );
  
  if (!exists) {
    taskForm.value.resources.push(resource);
  }
};

const removeResource = (index: number) => {
  taskForm.value.resources.splice(index, 1);
};

const getResourceIcon = (type: string): string => {
  const icons: Record<string, string> = {
    file: 'heroicons:document',
    knowledge: 'heroicons:book-open',
    task: 'heroicons:check-circle',
    hook: 'heroicons:bolt',
    mcp: 'heroicons:server',
    command: 'heroicons:command-line'
  };
  return icons[type] || 'heroicons:document';
};

const createNewProject = async () => {
  try {
    if (!isInitialized.value) {
      await initialize();
      isInitialized.value = true;
    }

    const projectPath = tasksStore.projectPath || '';
    const projectInstructionsPath = `${projectPath}/PROJECT_INSTRUCTIONS.md`;
    const taskInstructionsPath = `${projectPath}/TASK_INSTRUCTIONS.md`;
    
    // Create PROJECT_INSTRUCTIONS.md
    const projectInstructions = `# Project Instructions

## Project Overview

### Project Name
> [Enter your project name here]

### Project Goal
> [Describe what you want to build in 2-3 sentences. Be specific about the main functionality.]

### Target Users
> [Who will use this application? What problems does it solve for them?]

## Technical Preferences

### Preferred Tech Stack
> [List your preferred technologies, or write "Claude's choice" to let Claude recommend]
- Frontend: 
- Backend: 
- Database: 
- Other tools: 

### Must-Have Features
> [List 3-5 core features that are essential]
1. 
2. 
3. 

### Nice-to-Have Features
> [Optional features that could be added later]
- 
- 

## Architecture & Design

### Architecture Style
> [e.g., Monolithic, Microservices, Serverless, or "Claude's recommendation"]

### Design Patterns
> [Any specific patterns you want to use, or leave blank for Claude to decide]

### UI/UX Requirements
> [Describe the desired look and feel, or reference existing apps]

## Development Guidelines

### Code Style
> [Any specific coding standards or preferences]

### Testing Requirements
> [Unit tests, integration tests, E2E tests, or specify coverage goals]

### Documentation Needs
> [What kind of documentation do you need?]

## Resources & References

### API Documentation
> [Links to any APIs you'll be using]
- 

### Design References
> [Links to designs, mockups, or similar applications]
- 

### Technical Documentation
> [Links to relevant technical docs or tutorials]
- 

## Constraints & Considerations

### Technical Constraints
> [Any limitations like browser support, performance requirements, etc.]

### Timeline
> [If you have a specific deadline or preferred development pace]

### Budget/Resource Constraints
> [Any limitations on paid services, hosting, etc.]

---

## Instructions for Claude

1. Read this PROJECT_INSTRUCTIONS.md carefully
2. Review TASK_INSTRUCTIONS.md for task management guidelines
3. Create an initial task list based on this project specification
4. Start with architecture planning and setup tasks
5. Break down features into manageable tasks with clear priorities

Remember to:
- Update TASKS.md as you work
- Ask clarifying questions if specifications are unclear
- Suggest improvements based on best practices
- Keep the user informed of progress and decisions`;

    // Create TASK_INSTRUCTIONS.md
    const taskInstructions = `# Task Management Instructions for Claude

## Overview
This project uses a structured task management system. All tasks should be tracked in the TASKS.md file using the format described below.

## Task Structure

Each task in TASKS.md should include the following metadata:

### Required Fields:
- **Content**: The task description
- **Status**: backlog | pending | in_progress | completed
- **Priority**: high | medium | low
- **Assignee**: Claude | User | Both
- **Type**: feature | bugfix | refactor | documentation | research

### Optional Fields:
- **ID**: A custom identifier for easy reference (e.g., TASK-001, AUTH-42)
- **Description**: Additional context or details about the task
- **Resources**: Linked resources including:
  - Files: Source files relevant to the task
  - Tasks: Related or dependent tasks (by ID)
  - Knowledge: Documentation or reference materials
  - Hooks: Relevant automation scripts
  - MCP: Tools or servers needed
  - Commands: CLI commands or scripts

## TASKS.md Format

\`\`\`markdown
# Project Tasks

*This file is synced with Clode Studio and Claude's native TodoWrite system.*  
*Last updated: [timestamp]*

## Backlog ([count])

- [ ] **[Task Content]**
  - ID: FEAT-001
  - Assignee: Claude
  - Type: feature
  - Priority: low
  - Description: Future enhancement to consider
  - Resources: Task: AUTH-01, File: src/config.ts

## To Do ([count])

- [ ] **[Task Content]**
  - ID: API-003
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Brief description of what needs to be done
  - Resources: File: src/api/users.ts, Task: AUTH-01, knowledge: API Guidelines

## In Progress ([count])

- [ ] **[Task Content]** ⏳
  - ID: BUG-007
  - Assignee: Claude
  - Type: bugfix
  - Priority: high
  - Description: Currently working on fixing the login validation
  - Resources: File: src/auth/login.ts, File: src/utils/validator.ts

## Completed ([count])

- [x] ~~[Task Content]~~
  - ~~ID: AUTH-01~~
  - ~~Assignee: Claude~~
  - ~~Type: feature~~
  - ~~Priority: medium~~
  - ~~Description: Implemented user authentication~~
  - ~~Resources: File: src/auth/*, File: src/middleware/auth.ts~~
\`\`\`

## Important Rules for Claude

### 1. Task Creation
- **ALWAYS** create tasks in TASKS.md when you use TodoWrite
- Include all required metadata (assignee, type, priority)
- Consider adding an ID for easy reference in resources
- Add helpful descriptions for future reference
- Link relevant resources (files, other tasks, knowledge, etc.)

### 2. Task Updates
- Move tasks between sections as you work on them:
  - Ideas & future work → Keep in "Backlog"
  - Ready to work → Move to "To Do"
  - Start work → Move to "In Progress" with ⏳ emoji
  - Complete work → Move to "Completed" with strikethrough
- Update the task counts in section headers
- Keep descriptions updated with progress

### 3. Task Types
- **feature**: New functionality or enhancements
- **bugfix**: Fixing errors or issues
- **refactor**: Code improvements without changing functionality
- **documentation**: Updates to docs, comments, or README files
- **research**: Investigation or exploration tasks

### 4. Priority Guidelines
- **high**: Critical tasks, blockers, or urgent fixes
- **medium**: Important but not blocking other work
- **low**: Nice-to-have improvements or optimizations

### 5. Assignee Guidelines
- **Claude**: Tasks you will handle autonomously
- **User**: Tasks requiring user input or decisions
- **Both**: Collaborative tasks needing both parties

### 6. Resource Linking
- **Files**: Use relative paths from project root
- **Tasks**: Reference by ID (e.g., Task: AUTH-01)
- **Knowledge**: Reference by title or category
- **MCP/Commands**: Reference by name
- Tasks can link to other tasks as dependencies or related work

## Best Practices

1. **Be Specific**: Write clear, actionable task descriptions
2. **Track Progress**: Update status as soon as you start or finish
3. **Group Related**: Keep similar tasks together
4. **Clean Regularly**: Archive very old completed tasks periodically
5. **Communicate**: Note blockers or issues in descriptions

## Integration with IDE

The Clode Studio will:
- Automatically detect changes to TASKS.md
- Update the visual Kanban board in real-time
- Allow drag-and-drop task management
- Sync bidirectionally with your TodoWrite system

## Example Task Creation

When asked to implement a new feature:
\`\`\`
User: "Add a search functionality to the user list"

Claude should create in TASKS.md:
- [ ] **Add search functionality to user list**
  - ID: FEAT-023
  - Assignee: Claude
  - Type: feature
  - Priority: medium
  - Description: Implement real-time search filtering for the user list component
  - Resources: File: src/components/UserList.tsx, File: src/hooks/useSearch.ts, Task: UI-001
\`\`\`

Remember: Good task management helps maintain project clarity and progress visibility!`;

    // Use Electron API first for desktop, fallback to service layer for remote
    if (window.electronAPI?.fs?.writeFile) {
      await window.electronAPI.fs.writeFile(projectInstructionsPath, projectInstructions);
      await window.electronAPI.fs.writeFile(taskInstructionsPath, taskInstructions);
    } else if (services.value?.file) {
      await services.value.file.writeFile(projectInstructionsPath, projectInstructions);
      await services.value.file.writeFile(taskInstructionsPath, taskInstructions);
    } else {
      throw new Error('No file service available');
    }
    
    // Open the PROJECT_INSTRUCTIONS.md file in the editor
    const editorStore = useEditorStore();
    if (isRemote.value) {
      // For remote mode, show in modal viewer
      viewModalContent.value = projectInstructions;
      viewModal.value = true;
    } else {
      await editorStore.openFile(projectInstructionsPath);
    }
    
    // Notify Claude in the terminal
    const activeInstance = claudeInstancesStore.activeInstance;
    
    if (activeInstance && activeInstance.status === 'connected') {
      const command = `I've created both PROJECT_INSTRUCTIONS.md and TASK_INSTRUCTIONS.md for a new project. Please:
1. Read PROJECT_INSTRUCTIONS.md to understand the project requirements
2. Review TASK_INSTRUCTIONS.md to understand how to manage tasks
3. Create an initial task list in TASKS.md based on the project requirements
4. Let me know when you're ready to start development!\n`;
      
      // Use Electron API first for desktop, fallback to service layer for remote
      if (window.electronAPI?.claude?.send) {
        await window.electronAPI.claude.send(activeInstance.id, command);
      } else if (services.value?.claude) {
        await services.value.claude.send(activeInstance.id, command);
      }
    }
    
    alert(`✅ Project Setup Complete!\n\nCreated:\n• PROJECT_INSTRUCTIONS.md - Fill this with your project details\n• TASK_INSTRUCTIONS.md - Guidelines for task management\n\nPROJECT_INSTRUCTIONS.md has been opened ${isRemote.value ? 'in viewer' : 'in the editor'}. Fill in the template with your project details, then Claude will help you plan and build it!`);
    
  } catch (error) {
    console.error('Error creating project instructions:', error);
    alert(`Failed to create project instructions: ${error.message}`);
  }
};

// Parse tasks from TASKS.md content
const parseTasksFromMarkdown = (content: string): SimpleTask[] => {
  const tasks: SimpleTask[] = [];
  const lines = content.split('\n');
  let currentStatus: 'backlog' | 'pending' | 'in_progress' | 'completed' = 'pending';
  let taskIdCounter = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for section headers
    if (line.startsWith('## Backlog')) {
      currentStatus = 'backlog';
    } else if (line.startsWith('## To Do')) {
      currentStatus = 'pending';
    } else if (line.startsWith('## In Progress')) {
      currentStatus = 'in_progress';
    } else if (line.startsWith('## Completed')) {
      currentStatus = 'completed';
    }
    
    // Check for task items
    const taskMatch = line.match(/^- \[[ x]\] \*?\*?(.+?)\*?\*?$/);
    if (taskMatch) {
      const content = taskMatch[1].replace(/~~(.+?)~~/g, '$1').trim();
      const isCompleted = line.includes('[x]');
      
      // Look for metadata in the following lines
      let description = '';
      let identifier = '';
      let priority: 'high' | 'medium' | 'low' = 'medium';
      let type: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research' = 'feature';
      
      // Check next few lines for metadata
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const metaLine = lines[j].trim();
        if (metaLine.startsWith('- ID:')) {
          identifier = metaLine.replace('- ID:', '').trim();
        } else if (metaLine.startsWith('- Description:')) {
          description = metaLine.replace('- Description:', '').trim();
        } else if (metaLine.startsWith('- Priority:')) {
          const p = metaLine.replace('- Priority:', '').trim().toLowerCase();
          if (p === 'high' || p === 'medium' || p === 'low') {
            priority = p;
          }
        } else if (metaLine.startsWith('- Type:')) {
          const t = metaLine.replace('- Type:', '').trim().toLowerCase();
          if (t === 'feature' || t === 'bugfix' || t === 'refactor' || t === 'documentation' || t === 'research') {
            type = t;
          }
        } else if (!metaLine.startsWith('-') && metaLine !== '') {
          break; // Stop if we hit a non-metadata line
        }
      }
      
      tasks.push({
        id: `task-${taskIdCounter++}`,
        content,
        description,
        identifier: identifier || undefined,
        status: isCompleted ? 'completed' : currentStatus,
        priority,
        type,
        assignee: 'Claude',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }
  
  return tasks;
};

const openTasksFile = async () => {
  try {
    const tasksPath = `${tasksStore.projectPath || ''}/TASKS.md`;
    
    if (isRemote.value) {
      // For remote mode, show TASKS.md in modal viewer
      if (!isInitialized.value) {
        await initialize();
        isInitialized.value = true;
      }
      
      // Use Electron API first for desktop, fallback to service layer for remote
      if (window.electronAPI?.fs?.readFile) {
        const result = await window.electronAPI.fs.readFile(tasksPath);
        if (result?.success) {
          viewModalContent.value = result.content;
          viewModal.value = true;
        } else {
          // If TASKS.md doesn't exist, show a message
          viewModalContent.value = `# TASKS.md not found\n\nThe TASKS.md file doesn't exist yet. Create some tasks using the Kanban board or ask Claude to create one.`;
          viewModal.value = true;
        }
      } else if (services.value?.file) {
        try {
          const content = await services.value.file.readFile(tasksPath);
          viewModalContent.value = content;
          viewModal.value = true;
        } catch (error) {
          // If TASKS.md doesn't exist, show a message
          viewModalContent.value = `# TASKS.md not found\n\nThe TASKS.md file doesn't exist yet. Create some tasks using the Kanban board or ask Claude to create one.`;
          viewModal.value = true;
        }
      }
    } else {
      // Desktop mode - open in editor
      const editorStore = useEditorStore();
      await editorStore.openFile(tasksPath);
    }
  } catch (error) {
    console.error('Failed to open TASKS.md:', error);
    alert(`Failed to open TASKS.md: ${error.message}`);
  }
};

const createTaskInstructions = async () => {
  try {
    if (!isInitialized.value) {
      await initialize();
      isInitialized.value = true;
    }

    const instructionsPath = `${tasksStore.projectPath || ''}/TASK_INSTRUCTIONS.md`;
    
    const instructions = `# Task Management Instructions for Claude

## Overview
This project uses a structured task management system. All tasks should be tracked in the TASKS.md file using the format described below.

## Task Structure

Each task in TASKS.md should include the following metadata:

### Required Fields:
- **Content**: The task description
- **Status**: backlog | pending | in_progress | completed
- **Priority**: high | medium | low
- **Assignee**: Claude | User | Both
- **Type**: feature | bugfix | refactor | documentation | research

### Optional Fields:
- **ID**: A custom identifier for easy reference (e.g., TASK-001, AUTH-42)
- **Description**: Additional context or details about the task
- **Resources**: Linked resources including:
  - Files: Source files relevant to the task
  - Tasks: Related or dependent tasks (by ID)
  - Knowledge: Documentation or reference materials
  - Hooks: Relevant automation scripts
  - MCP: Tools or servers needed
  - Commands: CLI commands or scripts

## TASKS.md Format

\`\`\`markdown
# Project Tasks

*This file is synced with Clode Studio and Claude's native TodoWrite system.*  
*Last updated: [timestamp]*

## Backlog ([count])

- [ ] **[Task Content]**
  - ID: FEAT-001
  - Assignee: Claude
  - Type: feature
  - Priority: low
  - Description: Future enhancement to consider
  - Resources: Task: AUTH-01, File: src/config.ts

## To Do ([count])

- [ ] **[Task Content]**
  - ID: API-003
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Brief description of what needs to be done
  - Resources: File: src/api/users.ts, Task: AUTH-01, knowledge: API Guidelines

## In Progress ([count])

- [ ] **[Task Content]** ⏳
  - ID: BUG-007
  - Assignee: Claude
  - Type: bugfix
  - Priority: high
  - Description: Currently working on fixing the login validation
  - Resources: File: src/auth/login.ts, File: src/utils/validator.ts

## Completed ([count])

- [x] ~~[Task Content]~~
  - ~~ID: AUTH-01~~
  - ~~Assignee: Claude~~
  - ~~Type: feature~~
  - ~~Priority: medium~~
  - ~~Description: Implemented user authentication~~
  - ~~Resources: File: src/auth/*, File: src/middleware/auth.ts~~
\`\`\`

## Important Rules for Claude

### 1. Task Creation
- **ALWAYS** create tasks in TASKS.md when you use TodoWrite
- Include all required metadata (assignee, type, priority)
- Consider adding an ID for easy reference in resources
- Add helpful descriptions for future reference
- Link relevant resources (files, other tasks, knowledge, etc.)

### 2. Task Updates
- Move tasks between sections as you work on them:
  - Ideas & future work → Keep in "Backlog"
  - Ready to work → Move to "To Do"
  - Start work → Move to "In Progress" with ⏳ emoji
  - Complete work → Move to "Completed" with strikethrough
- Update the task counts in section headers
- Keep descriptions updated with progress

### 3. Task Types
- **feature**: New functionality or enhancements
- **bugfix**: Fixing errors or issues
- **refactor**: Code improvements without changing functionality
- **documentation**: Updates to docs, comments, or README files
- **research**: Investigation or exploration tasks

### 4. Priority Guidelines
- **high**: Critical tasks, blockers, or urgent fixes
- **medium**: Important but not blocking other work
- **low**: Nice-to-have improvements or optimizations

### 5. Assignee Guidelines
- **Claude**: Tasks you will handle autonomously
- **User**: Tasks requiring user input or decisions
- **Both**: Collaborative tasks needing both parties

### 6. Resource Linking
- **Files**: Use relative paths from project root
- **Tasks**: Reference by ID (e.g., Task: AUTH-01)
- **Knowledge**: Reference by title or category
- **MCP/Commands**: Reference by name
- Tasks can link to other tasks as dependencies or related work

## Best Practices

1. **Be Specific**: Write clear, actionable task descriptions
2. **Track Progress**: Update status as soon as you start or finish
3. **Group Related**: Keep similar tasks together
4. **Clean Regularly**: Archive very old completed tasks periodically
5. **Communicate**: Note blockers or issues in descriptions

## Integration with IDE

The Clode Studio will:
- Automatically detect changes to TASKS.md
- Update the visual Kanban board in real-time
- Allow drag-and-drop task management
- Sync bidirectionally with your TodoWrite system

## Example Task Creation

When asked to implement a new feature:
\`\`\`
User: "Add a search functionality to the user list"

Claude should create in TASKS.md:
- [ ] **Add search functionality to user list**
  - ID: FEAT-023
  - Assignee: Claude
  - Type: feature
  - Priority: medium
  - Description: Implement real-time search filtering for the user list component
  - Resources: File: src/components/UserList.tsx, File: src/hooks/useSearch.ts, Task: UI-001
\`\`\`

Remember: Good task management helps maintain project clarity and progress visibility!`;

    // Use Electron API first for desktop, fallback to service layer for remote
    if (window.electronAPI?.fs?.writeFile) {
      await window.electronAPI.fs.writeFile(instructionsPath, instructions);
    } else if (services.value?.file) {
      await services.value.file.writeFile(instructionsPath, instructions);
    } else {
      throw new Error('No file service available');
    }
    
    alert(`✅ Task Instructions Created!\n\nCreated TASK_INSTRUCTIONS.md in your project.\n\nYou can now share this with Claude to ensure consistent task management.`);
    
    // Optionally, also send to Claude immediately
    const activeInstance = claudeInstancesStore.activeInstance;
    
    if (activeInstance && activeInstance.status === 'connected') {
      const command = `I've created TASK_INSTRUCTIONS.md with detailed guidelines for task management. Please read it and follow these instructions when creating or updating tasks in TASKS.md.\n`;
      
      // Use Electron API first for desktop, fallback to service layer for remote
      if (window.electronAPI?.claude?.send) {
        await window.electronAPI.claude.send(activeInstance.id, command);
      } else if (services.value?.claude) {
        await services.value.claude.send(activeInstance.id, command);
      }
    }
    
  } catch (error) {
    console.error('Error creating task instructions:', error);
    alert(`Failed to create task instructions: ${error.message}`);
  }
};

onMounted(async () => {
 
  
  // Initialize services
  await initialize();
  isInitialized.value = true;
  
  // Wait for workspace info
  const checkWorkspace = async () => {
    // In remote mode, get workspace from API
    if (!window.electronAPI) {
      try {
        const response = await $fetch('/api/workspace/current');
        if (response.path) {
          tasksStore.setProjectPath(response.path);
          
          // Load tasks from TASKS.md via API
          try {
            const tasksResponse = await $fetch('/api/files/read', {
              query: { path: 'TASKS.md' }  // Use relative path from workspace
            });
            
            if (tasksResponse.content) {
              // Parse the TASKS.md content into tasks
              const parsedTasks = parseTasksFromMarkdown(tasksResponse.content);
              tasksStore.tasks = parsedTasks;
            }
          } catch (error) {
            console.debug('No TASKS.md file found, starting with empty tasks');
            tasksStore.tasks = [];
          }
          
          return true;
        }
      } catch (error) {
        console.debug('Could not get workspace from API');
      }
      return false;
    }
    
    // Desktop mode - use existing logic
    let workspacePath = tasksStore.projectPath;
    
    if (!workspacePath && services.value?.workspace?.getCurrentPath) {
      try {
        workspacePath = await services.value.workspace.getCurrentPath();
      } catch (error) {
        console.debug('Could not get workspace path from services');
      }
    }
    
    if (workspacePath) {
      if (!tasksStore.projectPath) {
        tasksStore.setProjectPath(workspacePath);
      }
      
      // Use the tasks service to load tasks if available
      if (services.value?.tasks?.loadTasks) {
        try {
          const tasks = await services.value.tasks.loadTasks(workspacePath);
          tasksStore.tasks = tasks;
        } catch (error) {
          console.debug('Could not load tasks from service');
          tasksStore.tasks = [];
        }
      } else {
        tasksStore.tasks = [];
      }
      return true;
    }
    return false;
  };
  
  // Try immediately
  if (await checkWorkspace()) {
   
  } else {
    // Poll for workspace info
    const workspaceCheckInterval = setInterval(async () => {
      if (await checkWorkspace()) {
        clearInterval(workspaceCheckInterval);
       
      }
    }, 1000);
    
    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(workspaceCheckInterval), 10000);
  }
  
  // Listen for real-time todo updates from Claude (desktop only)
  if (window.electronAPI?.claude?.onTodosUpdated) {
    window.electronAPI.claude.onTodosUpdated((todos) => {
      tasksStore.syncWithClaudeNative(todos);
    });
  }

  // Set up smart polling for remote mode since server doesn't have file watching yet
  // Store last known content hash to avoid unnecessary updates
  let lastContentHash = '';
  let pollingInterval: number | null = null;
  
  const startSmartPolling = () => {
    if (!isRemote.value || !tasksStore.projectPath) return;
    
   
    
    // Function to hash content for comparison
    const hashContent = (tasks: any[]) => {
      return JSON.stringify(tasks.map(t => ({
        id: t.id,
        status: t.status,
        content: t.content,
        priority: t.priority
      })));
    };
    
    // Initial hash
    lastContentHash = hashContent(tasksStore.tasks);
    
    pollingInterval = window.setInterval(async () => {
      if (!tasksStore.projectPath) return;
      
      try {
        const tasks = await services.value.tasks.loadTasks(tasksStore.projectPath);
        const newHash = hashContent(tasks);
        
        // Only update if content actually changed
        if (newHash !== lastContentHash) {
         
          tasksStore.tasks = tasks;
          lastContentHash = newHash;
        }
      } catch (error) {
        // Ignore errors silently
      }
    }, 5000); // Check every 5 seconds
    
    return () => {
      if (pollingInterval) {
        window.clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };
  };
  
  // Start polling when in remote mode
  watchEffect(() => {
    // Clean up previous polling if any
    if (cleanupFileWatching) {
      cleanupFileWatching();
    }
    
    // Start new polling if needed
    if (services.value && isRemote.value && tasksStore.projectPath) {
      cleanupFileWatching = startSmartPolling();
    }
  });
});

onUnmounted(() => {
  // Clean up file watching
  if (cleanupFileWatching) {
    cleanupFileWatching();
  }
});
</script>

<style scoped>
.kanban-board {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  overflow: hidden;
}

.board-header {
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  padding: 10px 16px;
  gap: 16px;
  min-height: 48px;
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #cccccc;
  flex-shrink: 0;
  white-space: nowrap;
}

.header-title span {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.view-switcher {
  display: flex;
  background: #383838;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-tab:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.view-tab.active {
  background: #007acc;
  color: #ffffff;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}

.board-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.board-sidebar {
  background: #2d2d30;
  border-right: 1px solid #181818;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  max-width: 200px;
}

.sidebar-title {
  padding: 20px 16px;
  border-bottom: 1px solid #181818;
  text-align: center;
}

.sidebar-title span {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #ffffff;
}

.sidebar-actions {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid #181818;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  flex-wrap: nowrap;
}

.header-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  white-space: nowrap;
}

.header-button:hover {
  background: #2a2d2e;
  border-color: #007acc;
}

.header-button.primary {
  background: #0e639c;
  border-color: #007acc;
  color: #ffffff;
}

.header-button.primary:hover {
  background: #1177bb;
}

.header-button span {
  font-size: 12px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}

.task-count {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.count-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #252526;
  border-radius: 4px;
}

.count-number {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.count-label {
  font-size: 12px;
  color: #858585;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.board-columns {
  display: flex;
  flex: 1;
  gap: 12px;
  padding: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  min-height: 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #252526;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.close-button:hover {
  background: #3e3e42;
}

.modal-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: #cccccc;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}

.cancel-button,
.save-button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.cancel-button {
  background: #3e3e42;
  color: #cccccc;
}

.cancel-button:hover {
  background: #4e4e52;
}

.save-button {
  background: #007acc;
  color: white;
}

.save-button:hover {
  background: #005a9e;
}

.flex-2 {
  flex: 2;
}

.resources-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.add-resource-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #3e3e42;
  border: 1px dashed #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.add-resource-button:hover {
  background: #4e4e52;
  border-style: solid;
}

.resource-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  font-size: 13px;
}

.resource-name {
  flex: 1;
  color: #d4d4d4;
}

.resource-type {
  font-size: 11px;
  color: #858585;
  text-transform: capitalize;
  padding: 2px 6px;
  background: #2d2d30;
  border-radius: 3px;
}

.remove-resource {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  transition: all 0.2s;
}

.remove-resource:hover {
  background: #f14c4c33;
  color: #f14c4c;
}

.view-modal {
  max-width: 800px;
  width: 90%;
}

.modal-body {
  padding: 20px;
  max-height: 70vh;
  overflow-y: auto;
}

.modal-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #d4d4d4;
}

/* Hierarchy Toggle Styles */
.hierarchy-toggle {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.toggle-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #3e3e42;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.toggle-button:hover {
  background: #4e4e52;
  border-color: #007acc;
}

.toggle-button.active {
  background: #007acc;
  border-color: #007acc;
  color: #ffffff;
}

/* Hierarchical Board Styles */
.hierarchical-board {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.epic-swimlane {
  margin-bottom: 24px;
}

.epic-swimlane.unassigned {
  margin-bottom: 20px;
}

.epic-swimlane.orphaned {
  margin-bottom: 16px;
}

/* Responsive breakpoints */
@media (max-width: 768px) {
  .board-header {
    padding: 8px;
    min-height: auto;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .header-title {
    flex-shrink: 0;
    margin-right: 12px;
  }
  
  .header-title span {
    font-size: 13px;
  }
  
  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
    flex: 0 0 auto;
  }
  
  .header-button span {
    display: none;
  }
  
  .header-button {
    padding: 6px;
    flex-shrink: 0;
  }
  
  .board-columns {
    flex-direction: column;
    overflow-y: auto;
  }
  
  .hierarchical-board {
    padding: 8px;
  }
  
  .epic-swimlane {
    margin-bottom: 16px;
  }
}

</style>