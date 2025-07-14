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
          <div class="form-group">
            <label for="task-content">Task Content</label>
            <input
              id="task-content"
              v-model="taskForm.content"
              type="text"
              required
              placeholder="Task content..."
            />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useChatStore } from '~/stores/chat';
import { useEditorStore } from '~/stores/editor';
// Using simplified task structure
interface SimpleTask {
  id: string;
  content: string;
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  assignee?: 'claude' | 'user' | 'both';
  description?: string;
}

const tasksStore = useTasksStore();

const showModal = ref(false);
const editingTask = ref<SimpleTask | null>(null);
const taskForm = ref({
  content: '',
  description: '',
  priority: 'medium' as 'low' | 'medium' | 'high',
  type: 'feature' as SimpleTask['type'],
  assignee: 'claude' as SimpleTask['assignee']
});

const backlogTasks = computed(() => tasksStore.backlogTasks);
const todoTasks = computed(() => tasksStore.todoTasks);
const inProgressTasks = computed(() => tasksStore.inProgressTasks);
const completedTasks = computed(() => tasksStore.completedTasks);
const taskCount = computed(() => tasksStore.taskCount);

const onTaskDrop = async (taskId: string, newStatus: SimpleTask['status']) => {
  // Update in local store immediately for UI responsiveness
  tasksStore.moveTask(taskId, newStatus);
  
  // Also notify Claude about the status change if Claude is connected
  const chatStore = useChatStore();
  const task = tasksStore.tasks.find(t => t.id === taskId);
  
  if (task && chatStore.claudeStatus === 'connected') {
    // Create a friendly status message
    const statusText = newStatus === 'completed' ? 'completed' : 
                      newStatus === 'in_progress' ? 'in progress' : 'pending';
    
    const command = `Task status update: "${task.content}" is now ${statusText}. Please update the TASKS.md file accordingly.\n`;
    
    try {
      await window.electronAPI.claude.send(command);
    } catch (error) {
      console.error('Failed to notify Claude of task update:', error);
    }
  }
};

// Removed sync functions since file watching handles it automatically

const addNewTask = () => {
  editingTask.value = null;
  taskForm.value = {
    content: '',
    description: '',
    priority: 'medium',
    type: 'feature',
    assignee: 'claude'
  };
  showModal.value = true;
};

const editTask = (task: SimpleTask) => {
  editingTask.value = task;
  taskForm.value = {
    content: task.content,
    description: task.description || '',
    priority: task.priority || 'medium',
    type: task.type || 'feature',
    assignee: task.assignee || 'claude'
  };
  showModal.value = true;
};

const deleteTask = (task: SimpleTask) => {
  if (confirm(`Delete task "${task.content}"?`)) {
    tasksStore.deleteTask(task.id);
  }
};

const saveTask = () => {
  if (!taskForm.value.content.trim()) return;
  
  if (editingTask.value) {
    tasksStore.updateTask(editingTask.value.id, {
      content: taskForm.value.content,
      description: taskForm.value.description,
      priority: taskForm.value.priority,
      type: taskForm.value.type,
      assignee: taskForm.value.assignee
    });
  } else {
    tasksStore.addTask(
      taskForm.value.content,
      taskForm.value.priority,
      taskForm.value.type
    );
  }
  
  closeModal();
};

const closeModal = () => {
  showModal.value = false;
  editingTask.value = null;
};

const createNewProject = async () => {
  try {
    const projectPath = tasksStore.projectPath || process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
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
- **Status**: pending | in_progress | completed
- **Priority**: high | medium | low
- **Assignee**: Claude | User | Both
- **Type**: feature | bugfix | refactor | documentation | research

### Optional Fields:
- **Description**: Additional context or details about the task
- **Files Modified**: List of files that will be or were modified
- **Dependencies**: Other tasks that must be completed first

## TASKS.md Format

\`\`\`markdown
# Project Tasks

*This file is synced with Claude Code IDE and Claude's native TodoWrite system.*  
*Last updated: [timestamp]*

## Backlog ([count])

- [ ] **[Task Content]**
  - Assignee: Claude
  - Type: feature
  - Priority: low
  - Description: Future enhancement to consider
  - Files: TBD

## To Do ([count])

- [ ] **[Task Content]**
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Brief description of what needs to be done
  - Files: src/component.ts, src/types.ts

## In Progress ([count])

- [ ] **[Task Content]** ⏳
  - Assignee: Claude
  - Type: bugfix
  - Priority: high
  - Description: Currently working on fixing the login validation
  - Files: src/auth/login.ts

## Completed ([count])

- [x] ~~[Task Content]~~
  - ~~Assignee: Claude~~
  - ~~Type: feature~~
  - ~~Priority: medium~~
  - ~~Description: Implemented user authentication~~
  - ~~Files: src/auth/*, src/middleware/auth.ts~~
\`\`\`

## Important Rules for Claude

### 1. Task Creation
- **ALWAYS** create tasks in TASKS.md when you use TodoWrite
- Include all required metadata (assignee, type, priority)
- Add helpful descriptions for future reference
- List files that will be modified

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

## Best Practices

1. **Be Specific**: Write clear, actionable task descriptions
2. **Track Progress**: Update status as soon as you start or finish
3. **Group Related**: Keep similar tasks together
4. **Clean Regularly**: Archive very old completed tasks periodically
5. **Communicate**: Note blockers or issues in descriptions

## Integration with IDE

The Claude Code IDE will:
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
  - Assignee: Claude
  - Type: feature
  - Priority: medium
  - Description: Implement real-time search filtering for the user list component
  - Files: src/components/UserList.tsx, src/hooks/useSearch.ts
\`\`\`

Remember: Good task management helps maintain project clarity and progress visibility!`;

    await window.electronAPI.fs.writeFile(projectInstructionsPath, projectInstructions);
    await window.electronAPI.fs.writeFile(taskInstructionsPath, taskInstructions);
    
    // Open the PROJECT_INSTRUCTIONS.md file in the editor
    const editorStore = useEditorStore();
    await editorStore.openFile(projectInstructionsPath);
    
    // Notify Claude in the terminal
    const chatStore = useChatStore();
    if (chatStore.claudeStatus === 'connected') {
      const command = `I've created both PROJECT_INSTRUCTIONS.md and TASK_INSTRUCTIONS.md for a new project. Please:
1. Read PROJECT_INSTRUCTIONS.md to understand the project requirements
2. Review TASK_INSTRUCTIONS.md to understand how to manage tasks
3. Create an initial task list in TASKS.md based on the project requirements
4. Let me know when you're ready to start development!\n`;
      
      await window.electronAPI.claude.send(command);
    }
    
    alert(`✅ Project Setup Complete!\n\nCreated:\n• PROJECT_INSTRUCTIONS.md - Fill this with your project details\n• TASK_INSTRUCTIONS.md - Guidelines for task management\n\nPROJECT_INSTRUCTIONS.md has been opened in the editor. Fill in the template with your project details, then Claude will help you plan and build it!`);
    
  } catch (error) {
    console.error('Error creating project instructions:', error);
    alert(`Failed to create project instructions: ${error.message}`);
  }
};

const createTaskInstructions = async () => {
  try {
    const instructionsPath = `${tasksStore.projectPath || process.env.DEFAULT_WORKSPACE_PATH || process.cwd()}/TASK_INSTRUCTIONS.md`;
    
    const instructions = `# Task Management Instructions for Claude

## Overview
This project uses a structured task management system. All tasks should be tracked in the TASKS.md file using the format described below.

## Task Structure

Each task in TASKS.md should include the following metadata:

### Required Fields:
- **Content**: The task description
- **Status**: pending | in_progress | completed
- **Priority**: high | medium | low
- **Assignee**: Claude | User | Both
- **Type**: feature | bugfix | refactor | documentation | research

### Optional Fields:
- **Description**: Additional context or details about the task
- **Files Modified**: List of files that will be or were modified
- **Dependencies**: Other tasks that must be completed first

## TASKS.md Format

\`\`\`markdown
# Project Tasks

*This file is synced with Claude Code IDE and Claude's native TodoWrite system.*  
*Last updated: [timestamp]*

## Backlog ([count])

- [ ] **[Task Content]**
  - Assignee: Claude
  - Type: feature
  - Priority: low
  - Description: Future enhancement to consider
  - Files: TBD

## To Do ([count])

- [ ] **[Task Content]**
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Brief description of what needs to be done
  - Files: src/component.ts, src/types.ts

## In Progress ([count])

- [ ] **[Task Content]** ⏳
  - Assignee: Claude
  - Type: bugfix
  - Priority: high
  - Description: Currently working on fixing the login validation
  - Files: src/auth/login.ts

## Completed ([count])

- [x] ~~[Task Content]~~
  - ~~Assignee: Claude~~
  - ~~Type: feature~~
  - ~~Priority: medium~~
  - ~~Description: Implemented user authentication~~
  - ~~Files: src/auth/*, src/middleware/auth.ts~~
\`\`\`

## Important Rules for Claude

### 1. Task Creation
- **ALWAYS** create tasks in TASKS.md when you use TodoWrite
- Include all required metadata (assignee, type, priority)
- Add helpful descriptions for future reference
- List files that will be modified

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

## Best Practices

1. **Be Specific**: Write clear, actionable task descriptions
2. **Track Progress**: Update status as soon as you start or finish
3. **Group Related**: Keep similar tasks together
4. **Clean Regularly**: Archive very old completed tasks periodically
5. **Communicate**: Note blockers or issues in descriptions

## Integration with IDE

The Claude Code IDE will:
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
  - Assignee: Claude
  - Type: feature
  - Priority: medium
  - Description: Implement real-time search filtering for the user list component
  - Files: src/components/UserList.tsx, src/hooks/useSearch.ts
\`\`\`

Remember: Good task management helps maintain project clarity and progress visibility!`;

    await window.electronAPI.fs.writeFile(instructionsPath, instructions);
    
    alert(`✅ Task Instructions Created!\n\nCreated TASK_INSTRUCTIONS.md in your project.\n\nYou can now share this with Claude to ensure consistent task management.`);
    
    // Optionally, also send to Claude immediately
    const chatStore = useChatStore();
    if (chatStore.claudeStatus === 'connected') {
      const command = `I've created TASK_INSTRUCTIONS.md with detailed guidelines for task management. Please read it and follow these instructions when creating or updating tasks in TASKS.md.\n`;
      await window.electronAPI.claude.send(command);
    }
    
  } catch (error) {
    console.error('Error creating task instructions:', error);
    alert(`Failed to create task instructions: ${error.message}`);
  }
};

onMounted(async () => {
  // Tasks will be loaded when workspace changes
  if (tasksStore.projectPath) {
    await tasksStore.loadTasksFromProject();
  }
  
  // Listen for real-time todo updates from Claude
  window.electronAPI.claude.onTodosUpdated((todos) => {
    console.log('Real-time todos update from Claude:', todos);
    tasksStore.syncWithClaudeNative(todos);
  });
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
</style>