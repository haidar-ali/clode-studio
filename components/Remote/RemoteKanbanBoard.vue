<template>
  <div class="kanban-board">
    <div class="board-content">
      <!-- Vertical sidebar with title and actions -->
      <div class="board-sidebar">
        <div class="sidebar-title">
          <span>Task Management</span>
        </div>
        
        <div class="sidebar-actions">
          <button @click="createNewProject" class="sidebar-button primary" title="Create new project instructions">
            <Icon name="mdi:rocket-launch" size="20" />
            <span>New Project</span>
          </button>
          
          <button @click="createTaskInstructions" class="sidebar-button" title="Create task management instructions">
            <Icon name="mdi:book-open-page-variant" size="20" />
            <span>Task Instructions</span>
          </button>
          
          <button @click="addNewTask" class="sidebar-button" title="Add a new task">
            <Icon name="mdi:plus" size="20" />
            <span>Add Task</span>
          </button>
          
          <button @click="openTasksFile" class="sidebar-button" title="View TASKS.md">
            <Icon name="mdi:file-document" size="20" />
            <span>View TASKS.md</span>
          </button>
        </div>
        
        <div class="sidebar-info">
          <div class="task-count-vertical">
            <div class="count-item">
              <span class="count-number">{{ taskCount.total }}</span>
              <span class="count-label">Total Tasks</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Kanban columns -->
      <div class="board-columns">
        <KanbanColumn
          title="Backlog"
          :tasks="backlogTasks"
          status="backlog"
          @drop="onTaskDrop"
          @edit="editTask"
          @delete="deleteTask"
        />
        
        <KanbanColumn
          title="To Do"
          :tasks="todoTasks"
          status="pending"
          @drop="onTaskDrop"
          @edit="editTask"
          @delete="deleteTask"
        />
        
        <KanbanColumn
          title="In Progress"
          :tasks="inProgressTasks"
          status="in_progress"
          @drop="onTaskDrop"
          @edit="editTask"
          @delete="deleteTask"
        />
        
        <KanbanColumn
          title="Done"
          :tasks="completedTasks"
          status="completed"
          @drop="onTaskDrop"
          @edit="editTask"
          @delete="deleteTask"
        />
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
    
    <!-- TASKS.md Viewer Modal -->
    <div v-if="showTasksFileModal" class="modal-overlay" @click="showTasksFileModal = false">
      <div class="modal tasks-viewer-modal" @click.stop>
        <div class="modal-header">
          <h3>TASKS.md</h3>
          <button class="close-btn" @click="showTasksFileModal = false">
            <Icon name="mdi:close" />
          </button>
        </div>
        <div class="modal-content">
          <pre class="tasks-content">{{ tasksFileContent }}</pre>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showTasksFileModal = false">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useEditorStore } from '~/stores/editor';
import { useWorkspaceStore } from '~/stores/workspace';
import { useServices } from '~/composables/useServices';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import ResourceModal from '~/components/Prompts/ResourceModal.vue';
import type { ResourceReference } from '~/stores/prompt-engineering';

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
const editorStore = useEditorStore();
const workspaceStore = useWorkspaceStore();
const { services, initialize } = useServices();
const { connected } = useRemoteConnection();
const claudeStore = useClaudeInstancesStore();

const showModal = ref(false);
const showResourceModal = ref(false);
const showTasksFileModal = ref(false);
const tasksFileContent = ref('');
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

const backlogTasks = computed(() => tasksStore.backlogTasks);
const todoTasks = computed(() => tasksStore.todoTasks);
const inProgressTasks = computed(() => tasksStore.inProgressTasks);
const completedTasks = computed(() => tasksStore.completedTasks);
const taskCount = computed(() => tasksStore.taskCount);

// Log initial state
console.log('[RemoteKanbanBoard] Initial state:');
console.log('[RemoteKanbanBoard] Total tasks in store:', tasksStore.tasks.length);
console.log('[RemoteKanbanBoard] Task count:', taskCount.value);
console.log('[RemoteKanbanBoard] Is initialized:', tasksStore.isInitialized);
console.log('[RemoteKanbanBoard] Project path:', tasksStore.projectPath);
console.log('[RemoteKanbanBoard] Tasks markdown path:', tasksStore.tasksMarkdownPath);

const onTaskDrop = async (taskId: string, newStatus: SimpleTask['status']) => {
  console.log('[RemoteKanbanBoard] Task dropped:', taskId, 'new status:', newStatus);
  
  try {
    // Temporarily disable auto-save to prevent the store from using Electron APIs
    const originalAutoSave = tasksStore.isAutoSaveEnabled;
    tasksStore.isAutoSaveEnabled = false;
    
    // Update the task status in the store
    tasksStore.moveTask(taskId, newStatus);
    console.log('[RemoteKanbanBoard] Task moved in store');
    
    // Manually save using our remote-compatible method
    console.log('[RemoteKanbanBoard] Starting manual save...');
    await saveTasksToFile();
    console.log('[RemoteKanbanBoard] Manual save completed');
    
    // Restore auto-save setting
    tasksStore.isAutoSaveEnabled = originalAutoSave;
  } catch (error) {
    console.error('[RemoteKanbanBoard] Error in onTaskDrop:', error);
    throw error;
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
    // Temporarily disable auto-save
    const originalAutoSave = tasksStore.isAutoSaveEnabled;
    tasksStore.isAutoSaveEnabled = false;
    
    tasksStore.deleteTask(task.id);
    
    // Manually save
    await saveTasksToFile();
    
    // Restore auto-save
    tasksStore.isAutoSaveEnabled = originalAutoSave;
  }
};

const saveTask = async () => {
  console.log('[RemoteKanbanBoard] saveTask called');
  if (!taskForm.value.content.trim()) return;
  
  try {
    // Temporarily disable auto-save
    const originalAutoSave = tasksStore.isAutoSaveEnabled;
    tasksStore.isAutoSaveEnabled = false;
    
    if (editingTask.value) {
      console.log('[RemoteKanbanBoard] Updating task:', editingTask.value.id);
      console.log('[RemoteKanbanBoard] Update data:', {
        identifier: taskForm.value.identifier,
        content: taskForm.value.content,
        description: taskForm.value.description,
        priority: taskForm.value.priority,
        type: taskForm.value.type,
        assignee: taskForm.value.assignee,
        resources: taskForm.value.resources
      });
      
      tasksStore.updateTask(editingTask.value.id, {
        identifier: taskForm.value.identifier,
        content: taskForm.value.content,
        description: taskForm.value.description,
        priority: taskForm.value.priority,
        type: taskForm.value.type,
        assignee: taskForm.value.assignee,
        resources: taskForm.value.resources
      });
      
      // Verify the update worked
      const updatedTask = tasksStore.tasks.find(t => t.id === editingTask.value.id);
      console.log('[RemoteKanbanBoard] Task after update:', updatedTask);
    } else {
      console.log('[RemoteKanbanBoard] Adding new task');
      tasksStore.addTask(
        taskForm.value.content,
        taskForm.value.priority,
        taskForm.value.type,
        taskForm.value.identifier
      );
      // Update the task with resources after creation
      const tasks = tasksStore.tasks;
      const newTask = tasks[tasks.length - 1];
      if (newTask && taskForm.value.resources.length > 0) {
        tasksStore.updateTask(newTask.id, { resources: taskForm.value.resources });
      }
      console.log('[RemoteKanbanBoard] New task added to store');
    }
    
    // Manually save
    console.log('[RemoteKanbanBoard] Calling saveTasksToFile...');
    await saveTasksToFile();
    console.log('[RemoteKanbanBoard] saveTasksToFile completed');
    
    // Force immediate reload to show changes
    await loadTasksFromFile();
    console.log('[RemoteKanbanBoard] Reloaded tasks after save');
    
    // Restore auto-save
    tasksStore.isAutoSaveEnabled = originalAutoSave;
    
    closeModal();
  } catch (error) {
    console.error('[RemoteKanbanBoard] Error in saveTask:', error);
    alert('Failed to save task: ' + error.message);
  }
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

// Send message to Claude using service abstraction
const sendToClaudeViaChat = async (message: string) => {
  if (!services.value?.claude) {
    console.error('Claude service not available');
    alert('Claude service not available. Please ensure you are connected.');
    return;
  }

  // Get the active Claude instance
  const activeInstance = claudeStore.activeInstance;
  if (!activeInstance) {
    alert('No active Claude instance. Please start Claude first.');
    return;
  }

  // Send the message to Claude
  try {
    await services.value.claude.send(activeInstance.id, message + '\n');
  } catch (error) {
    console.error('Failed to send message to Claude:', error);
    alert('Failed to send message to Claude. Please check if Claude is running.');
  }
};

const createNewProject = async () => {
  if (!services.value?.file || !tasksStore.projectPath) {
    alert('Services not available or no project path');
    return;
  }
  
  try {
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

    await services.value.file.writeFile(projectInstructionsPath, projectInstructions);
    await services.value.file.writeFile(taskInstructionsPath, taskInstructions);
    
    // In remote mode, we can't open files in the editor directly
    // Just show a success message instead
    
    // Send message to Claude
    const command = `I've created both PROJECT_INSTRUCTIONS.md and TASK_INSTRUCTIONS.md for a new project. Please:
1. Read PROJECT_INSTRUCTIONS.md to understand the project requirements
2. Review TASK_INSTRUCTIONS.md to understand how to manage tasks
3. Create an initial task list in TASKS.md based on the project requirements
4. Let me know when you're ready to start development!`;

    await sendToClaudeViaChat(command);
    
    alert(`✅ Project Setup Complete!\n\nCreated:\n• PROJECT_INSTRUCTIONS.md - Fill this with your project details\n• TASK_INSTRUCTIONS.md - Guidelines for task management\n\nPlease open PROJECT_INSTRUCTIONS.md in your editor and fill in the template with your project details, then Claude will help you plan and build it!`);
    
  } catch (error) {
    console.error('Error creating project instructions:', error);
    alert(`Failed to create project instructions: ${error.message}`);
  }
};

const openTasksFile = async () => {
  try {
    if (!services.value?.file || !tasksStore.projectPath) {
      alert('Services not available or no project path');
      return;
    }
    
    const tasksPath = `${tasksStore.projectPath}/TASKS.md`;
    console.log('[RemoteKanbanBoard] Opening TASKS.md:', tasksPath);
    
    // Load the content and show in modal
    const content = await services.value.file.readFile(tasksPath);
    tasksFileContent.value = content;
    showTasksFileModal.value = true;
    
  } catch (error) {
    console.error('Failed to open TASKS.md:', error);
    alert(`Failed to open TASKS.md: ${error.message}`);
  }
};

const createTaskInstructions = async () => {
  if (!services.value?.file || !tasksStore.projectPath) {
    alert('Services not available or no project path');
    return;
  }
  
  try {
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

    await services.value.file.writeFile(instructionsPath, instructions);
    
    alert(`✅ Task Instructions Created!\n\nCreated TASK_INSTRUCTIONS.md in your project.\n\nYou can now share this with Claude to ensure consistent task management.`);
    
    // Send message to Claude
    const command = `I've created TASK_INSTRUCTIONS.md with detailed guidelines for task management. Please read it and follow these instructions when creating or updating tasks in TASKS.md.`;
    await sendToClaudeViaChat(command);
    
  } catch (error) {
    console.error('Error creating task instructions:', error);
    alert(`Failed to create task instructions: ${error.message}`);
  }
};

// Load tasks from JSON file using remote file service
const loadTasksFromFile = async () => {
  console.log('[RemoteKanbanBoard] loadTasksFromFile called');
  console.log('[RemoteKanbanBoard] services.value:', services.value);
  console.log('[RemoteKanbanBoard] projectPath:', tasksStore.projectPath);
  
  if (!services.value?.file || !tasksStore.projectPath) {
    console.log('[RemoteKanbanBoard] Missing services or projectPath, returning');
    return;
  }
  
  const filePath = `${tasksStore.projectPath}/.claude/simple-tasks.json`;
  console.log('[RemoteKanbanBoard] Attempting to load tasks from:', filePath);
  
  try {
    const content = await services.value.file.readFile(filePath);
    console.log('[RemoteKanbanBoard] File content loaded, length:', content.length);
    
    const data = JSON.parse(content);
    console.log('[RemoteKanbanBoard] Parsed data, tasks count:', data.tasks?.length || 0);
    
    // Update the tasks in the store
    tasksStore.tasks = data.tasks.map((task: any) => ({
      ...task,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
      // Ensure resources is properly handled
      resources: Array.isArray(task.resources) ? task.resources : [],
      // Ensure filesModified is properly handled  
      filesModified: Array.isArray(task.filesModified) ? task.filesModified : []
    }));
    
    if (data.lastSyncedWithClaude) {
      tasksStore.lastSyncedWithClaude = new Date(data.lastSyncedWithClaude);
    }
    
    console.log('[RemoteKanbanBoard] Tasks loaded successfully:', tasksStore.tasks.length);
  } catch (error) {
    console.log('[RemoteKanbanBoard] Failed to load tasks:', error);
    // Try loading from TASKS.md as fallback
    await loadTasksFromMarkdown();
  }
};

// Load tasks from TASKS.md as fallback
const loadTasksFromMarkdown = async () => {
  if (!services.value?.file || !tasksStore.projectPath) return;
  
  const tasksPath = `${tasksStore.projectPath}/TASKS.md`;
  console.log('[RemoteKanbanBoard] Attempting to load from TASKS.md:', tasksPath);
  
  try {
    const content = await services.value.file.readFile(tasksPath);
    console.log('[RemoteKanbanBoard] TASKS.md content loaded, importing...');
    
    // Use the store's import method
    const importedCount = tasksStore.importTasksFromText(content);
    console.log('[RemoteKanbanBoard] Imported tasks from TASKS.md:', importedCount);
  } catch (error) {
    console.log('[RemoteKanbanBoard] No TASKS.md file found:', error);
  }
};

// Save tasks to both JSON and markdown files using remote file service
const saveTasksToFile = async () => {
  console.log('[RemoteKanbanBoard] saveTasksToFile called');
  console.log('[RemoteKanbanBoard] Current editingTask:', editingTask.value);
  console.log('[RemoteKanbanBoard] Total tasks in store:', tasksStore.tasks.length);
  
  if (!services.value?.file || !tasksStore.projectPath) {
    console.log('[RemoteKanbanBoard] Missing services or projectPath in save');
    return;
  }
  
  try {
    // Skip directory creation for now - assume it exists
    console.log('[RemoteKanbanBoard] Skipping directory check, proceeding directly to save...');
    
    // Save JSON file
    const jsonPath = `${tasksStore.projectPath}/.claude/simple-tasks.json`;
    const data = {
      tasks: tasksStore.tasks,
      lastSyncedWithClaude: tasksStore.lastSyncedWithClaude,
      lastUpdated: new Date()
    };
    console.log('[RemoteKanbanBoard] Saving JSON to:', jsonPath, 'with', data.tasks.length, 'tasks');
    
    // Log the specific task that was just edited to verify changes
    if (editingTask.value) {
      const updatedTask = data.tasks.find(t => t.id === editingTask.value.id);
      console.log('[RemoteKanbanBoard] Updated task in data:', updatedTask);
    }
    
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      console.log('[RemoteKanbanBoard] Writing JSON content, length:', jsonContent.length);
      await services.value.file.writeFile(jsonPath, jsonContent);
      console.log('[RemoteKanbanBoard] JSON saved successfully');
    } catch (writeError) {
      console.error('[RemoteKanbanBoard] Error writing JSON file:', writeError);
      throw writeError;
    }
    
    // The store's updateTasksMarkdown method handles generating the markdown
    // We need to implement that separately for remote mode
    await updateTasksMarkdownRemote();
  } catch (error) {
    console.error('[RemoteKanbanBoard] Failed to save tasks:', error);
  }
};

// Generate and save TASKS.md using remote file service
const updateTasksMarkdownRemote = async () => {
  if (!services.value?.file || !tasksStore.tasksMarkdownPath) return;
  
  // Format task for markdown (same logic as in the store)
  const formatTask = (task: SimpleTask, isCompleted = false) => {
    const checkbox = isCompleted ? '[x]' : '[ ]';
    const title = isCompleted ? `~~${task.content}~~` : `**${task.content}**`;
    const emoji = task.status === 'in_progress' ? ' ⏳' : '';
    
    let text = `- ${checkbox} ${title}${emoji}`;
    
    // Add identifier if present
    if (task.identifier) {
      const id = isCompleted ? `~~ID: ${task.identifier}~~` : `ID: ${task.identifier}`;
      text += `\n  - ${id}`;
    }
    
    // Add structured metadata
    const assignee = isCompleted ? `~~Assignee: ${task.assignee || 'Claude'}~~` : `Assignee: ${task.assignee || 'Claude'}`;
    const type = isCompleted ? `~~Type: ${task.type || 'feature'}~~` : `Type: ${task.type || 'feature'}`;
    const priority = isCompleted ? `~~Priority: ${task.priority}~~` : `Priority: ${task.priority}`;
    
    text += `\n  - ${assignee}`;
    text += `\n  - ${type}`;
    text += `\n  - ${priority}`;
    
    // Add description if present
    if (task.description) {
      const desc = isCompleted ? `~~Description: ${task.description}~~` : `Description: ${task.description}`;
      text += `\n  - ${desc}`;
    }
    
    // Add resources if present
    if (task.resources && task.resources.length > 0) {
      const resourcesText = task.resources.map(r => {
        if (r.type === 'file') return `File: ${r.path || r.name}`;
        if (r.type === 'task') return `Task: ${r.name}`;
        return `${r.type}: ${r.name}`;
      }).join(', ');
      
      const resources = isCompleted ? `~~Resources: ${resourcesText}~~` : `Resources: ${resourcesText}`;
      text += `\n  - ${resources}`;
    }
    
    return text;
  };
  
  const backlog = tasksStore.backlogTasks;
  const todo = tasksStore.todoTasks;
  const inProgress = tasksStore.inProgressTasks;
  const completed = tasksStore.completedTasks;
  
  let markdown = `# Project Tasks

*This file is synced with Clode Studio and Claude's native TodoWrite system.*  
*Last updated: ${new Date().toLocaleString()}*

## Backlog (${backlog.length})

${backlog.map(task => formatTask(task)).join('\n\n')}

## To Do (${todo.length})

${todo.map(task => formatTask(task)).join('\n\n')}

## In Progress (${inProgress.length})

${inProgress.map(task => formatTask(task)).join('\n\n')}

## Completed (${completed.length})

${completed.map(task => formatTask(task, true)).join('\n\n')}

---
*To update tasks, use the Kanban board in Clode Studio, ask Claude to modify this file, or use Claude's native TodoWrite system.*
`;
  
  try {
    await services.value.file.writeFile(tasksStore.tasksMarkdownPath, markdown);
  } catch (error) {
    console.error('Failed to update TASKS.md:', error);
  }
};

// Function to initialize and load tasks
const initializeAndLoadTasks = async () => {
  // Get workspace path from various sources
  let workspacePath = tasksStore.projectPath || workspaceStore.currentPath || (window as any).__remoteWorkspace?.path;
  
  console.log('[RemoteKanbanBoard] Workspace path sources:');
  console.log('  - tasksStore.projectPath:', tasksStore.projectPath);
  console.log('  - workspaceStore.currentPath:', workspaceStore.currentPath);
  console.log('  - window.__remoteWorkspace:', (window as any).__remoteWorkspace);
  console.log('  - Final workspacePath:', workspacePath);
  
  if (!workspacePath) {
    console.log('[RemoteKanbanBoard] No workspace path available yet');
    return false;
  }
  
  // Initialize the tasks store with the workspace path
  if (!tasksStore.isInitialized || tasksStore.projectPath !== workspacePath) {
    console.log('[RemoteKanbanBoard] Initializing tasks store with path:', workspacePath);
    await tasksStore.initialize(workspacePath);
  }
  
  // Now load tasks
  console.log('[RemoteKanbanBoard] Loading tasks from file...');
  await loadTasksFromFile();
  return true;
};

// Store polling interval
const pollingInterval = ref<number | null>(null);

// Set up polling for file changes
const setupFilePolling = () => {
  console.log('[RemoteKanbanBoard] Setting up file polling...');
  
  // Clear existing interval if any
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value);
  }
  
  if (!services.value?.file || !tasksStore.projectPath) {
    console.log('[RemoteKanbanBoard] Cannot set up polling - missing services or project path');
    return;
  }
  
  // Poll every 3 seconds for changes
  pollingInterval.value = window.setInterval(async () => {
    try {
      // Check if the JSON file has been modified
      const jsonPath = `${tasksStore.projectPath}/.claude/simple-tasks.json`;
      const content = await services.value.file.readFile(jsonPath);
      const data = JSON.parse(content);
      
      // Compare task count and last updated time
      if (data.tasks && data.tasks.length !== tasksStore.tasks.length) {
        console.log('[RemoteKanbanBoard] Task count changed, reloading...');
        await loadTasksFromFile();
      } else if (data.lastUpdated) {
        // Check if any task has been updated more recently than our last load
        const lastUpdated = new Date(data.lastUpdated).getTime();
        const ourLastUpdate = tasksStore.tasks.reduce((latest, task) => {
          const taskTime = new Date(task.updatedAt).getTime();
          return taskTime > latest ? taskTime : latest;
        }, 0);
        
        if (lastUpdated > ourLastUpdate) {
          console.log('[RemoteKanbanBoard] Tasks updated, reloading...');
          await loadTasksFromFile();
        }
      }
    } catch (error) {
      // Ignore errors - file might not exist yet
    }
  }, 8000);
};

onMounted(async () => {
  console.log('[RemoteKanbanBoard] Component mounted');
  
  // Initialize services first
  console.log('[RemoteKanbanBoard] Initializing services...');
  await initialize();
  console.log('[RemoteKanbanBoard] Services initialized');
  
  // Check connection
  console.log('[RemoteKanbanBoard] Connected:', connected.value);
  
  // Try to initialize and load tasks
  const loaded = await initializeAndLoadTasks();
  
  if (loaded) {
    // Set up file polling if we loaded successfully
    setupFilePolling();
  } else {
    // Set up polling to check for workspace info
    console.log('[RemoteKanbanBoard] Setting up workspace polling...');
    const checkInterval = setInterval(async () => {
      const workspace = (window as any).__remoteWorkspace;
      const currentPath = workspaceStore.currentPath;
      
      if ((workspace?.path || currentPath) && services.value?.file) {
        console.log('[RemoteKanbanBoard] Workspace became available:', workspace?.path || currentPath);
        clearInterval(checkInterval);
        const loaded = await initializeAndLoadTasks();
        if (loaded) {
          setupFilePolling();
        }
      }
    }, 1000);
    
    // Clear interval after 30 seconds to prevent infinite polling
    setTimeout(() => clearInterval(checkInterval), 30000);
  }
  
  // Watch for task changes and save
  watch(() => tasksStore.tasks, async (newTasks, oldTasks) => {
    console.log('[RemoteKanbanBoard] Tasks changed:', oldTasks?.length || 0, '->', newTasks.length);
    if (services.value?.file && tasksStore.isAutoSaveEnabled) {
      console.log('[RemoteKanbanBoard] Auto-saving tasks...');
      await saveTasksToFile();
    }
  }, { deep: true });
  
  // Watch for workspace changes
  watch(() => workspaceStore.currentPath, async (newPath) => {
    if (newPath && newPath !== tasksStore.projectPath) {
      console.log('[RemoteKanbanBoard] Workspace changed to:', newPath);
      const loaded = await initializeAndLoadTasks();
      if (loaded) {
        setupFilePolling();
      }
    }
  });
  
  // Note: In remote mode, we don't listen for desktop Claude todo updates
  // Instead, we rely on file watching and the tasks store
});

onUnmounted(() => {
  console.log('[RemoteKanbanBoard] Component unmounted, cleaning up...');
  
  // Clear polling interval
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value);
    pollingInterval.value = null;
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

.sidebar-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: #3e3e42;
  border: none;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  text-align: left;
}

.sidebar-button:hover {
  background: #4e4e52;
  color: white;
}

.sidebar-button.primary {
  background: #007acc;
  color: white;
  font-weight: 500;
}

.sidebar-button.primary:hover {
  background: #005a9e;
  box-shadow: 0 2px 4px rgba(0, 122, 204, 0.3);
}

.sidebar-button span {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-info {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.task-count-vertical {
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

/* Mobile adjustments */
@media (max-width: 768px) {
  .board-sidebar {
    min-width: 120px;
    max-width: 150px;
  }
  
  .sidebar-button {
    font-size: 12px;
    padding: 6px 8px;
  }
  
  .sidebar-button span {
    display: none;
  }
  
  .board-columns {
    gap: 8px;
    padding: 12px;
  }
}

/* Tasks Viewer Modal */
.tasks-viewer-modal {
  max-width: 800px;
  width: 95%;
}

.tasks-viewer-modal .modal-content {
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}

.tasks-content {
  margin: 0;
  padding: 20px;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  border: none;
  outline: none;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>