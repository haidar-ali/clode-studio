<template>
  <div class="orphaned-swimlane">
    <!-- Header -->
    <div class="swimlane-header">
      <div class="header-info">
        <div class="title-row">
          <button 
            @click="toggleExpanded" 
            class="expand-button"
            :class="{ expanded: isExpanded }"
          >
            <Icon name="mdi:chevron-right" size="16" />
          </button>
          <h3 class="swimlane-title">Orphaned Tasks</h3>
          <span class="item-count">{{ tasks.length }} tasks</span>
        </div>
        
        <div class="swimlane-description">
          Tasks that haven't been assigned to any story or epic
        </div>
      </div>
      
      <div class="swimlane-actions">
        <button 
          @click="organizeOrphanedTasks" 
          class="action-btn primary"
          title="Organize into stories"
        >
          <Icon name="mdi:auto-fix" size="14" />
          Organize
        </button>
      </div>
    </div>
    
    <!-- Content -->
    <Transition name="expand">
      <div v-if="isExpanded" class="swimlane-content">
        <!-- Task Columns -->
        <div class="tasks-row">
          <div 
            v-for="status in taskStatuses" 
            :key="status.id"
            class="task-column"
          >
            <div class="column-header">
              <h4>{{ status.label }}</h4>
              <span class="task-count">{{ getTasksByStatus(status.id).length }}</span>
            </div>
            
            <div 
              class="task-drop-zone"
              @drop="onTaskDrop($event, status.id)"
              @dragover="onDragOver"
              @dragenter="onDragEnter"
            >
              <!-- Task Cards -->
              <div 
                v-for="task in getTasksByStatus(status.id)" 
                :key="task.id"
                class="orphaned-task-card"
                :class="[`task-status-${task.status}`, `priority-${task.priority}`]"
                draggable="true"
                @dragstart="onTaskDragStart($event, task)"
                @click="$emit('edit-task', task)"
              >
                <div class="task-header">
                  <div class="task-status-icon">
                    <Icon :name="getTaskStatusIcon(task.status)" size="14" />
                  </div>
                  <div class="task-content-area">
                    <h5 class="task-title">{{ task.content }}</h5>
                    <p v-if="task.description" class="task-description">
                      {{ task.description }}
                    </p>
                  </div>
                  <div class="task-actions">
                    <button 
                      @click.stop="$emit('edit-task', task)" 
                      class="task-action-btn"
                      title="Edit Task"
                    >
                      <Icon name="mdi:pencil" size="12" />
                    </button>
                    <button 
                      @click.stop="$emit('delete-task', task)" 
                      class="task-action-btn"
                      title="Delete Task"
                    >
                      <Icon name="mdi:delete" size="12" />
                    </button>
                  </div>
                </div>
                
                <div class="task-meta">
                  <span class="task-priority-badge" :class="`priority-${task.priority}`">
                    {{ task.priority }}
                  </span>
                  <span v-if="task.assignee && task.assignee !== 'claude'" class="task-assignee">
                    @{{ task.assignee }}
                  </span>
                  <span v-if="task.type" class="task-type" :class="`type-${task.type}`">
                    <Icon :name="getTypeIcon(task.type)" size="12" />
                    {{ task.type }}
                  </span>
                </div>
                
                <!-- Action to move to story -->
                <div class="organization-actions">
                  <button 
                    @click.stop="convertToStory(task)"
                    class="organize-btn"
                    title="Convert to Story"
                  >
                    <Icon name="mdi:arrow-up-bold" size="12" />
                    Make Story
                  </button>
                  <button 
                    @click.stop="assignToStory(task)"
                    class="organize-btn"
                    title="Assign to existing Story"
                  >
                    <Icon name="mdi:arrow-right-bold" size="12" />
                    Assign
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Suggestions Panel -->
        <div v-if="suggestions.length > 0" class="suggestions-panel">
          <h4>Organization Suggestions</h4>
          <div class="suggestions-list">
            <div 
              v-for="suggestion in suggestions" 
              :key="suggestion.id"
              class="suggestion-card"
            >
              <div class="suggestion-header">
                <Icon :name="suggestion.icon" size="16" />
                <span class="suggestion-title">{{ suggestion.title }}</span>
                <button 
                  @click="applySuggestion(suggestion)"
                  class="apply-btn"
                >
                  Apply
                </button>
              </div>
              <p class="suggestion-description">{{ suggestion.description }}</p>
              <div class="affected-tasks">
                <span>Affects {{ suggestion.taskIds.length }} tasks</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Task {
  id: string;
  content: string;
  status: string;
  priority: string;
  description?: string;
  type?: string;
  assignee?: string;
  storyId?: string;
  epicId?: string;
}

interface OrganizationSuggestion {
  id: string;
  title: string;
  description: string;
  type: 'group_similar' | 'convert_large' | 'assign_epic';
  icon: string;
  taskIds: string[];
  action: any;
}

const props = defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  'edit-task': [task: Task];
  'delete-task': [task: Task];
  'drop-task': [taskId: string, newStatus: string];
  'convert-to-story': [task: Task];
  'assign-to-story': [task: Task];
}>();

const isExpanded = ref(true);

const taskStatuses = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'pending', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Done' }
];

const getTasksByStatus = (status: string) => 
  props.tasks.filter(task => task.status === status);

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const getTaskStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return 'mdi:check-circle';
    case 'in_progress': return 'mdi:progress-clock';
    case 'pending': return 'mdi:circle-outline';
    case 'backlog': return 'mdi:inbox';
    default: return 'mdi:circle-outline';
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'feature': return 'mdi:plus-circle';
    case 'bugfix': return 'mdi:bug';
    case 'refactor': return 'mdi:wrench';
    case 'documentation': return 'mdi:file-document';
    case 'research': return 'mdi:magnify';
    default: return 'mdi:checkbox-marked-circle';
  }
};

// Organization suggestions
const suggestions = computed(() => {
  const sug: OrganizationSuggestion[] = [];
  
  // Group similar tasks by keywords
  const keywordGroups = groupTasksByKeywords(props.tasks);
  Object.entries(keywordGroups).forEach(([keyword, tasks]) => {
    if (tasks.length >= 3) {
      sug.push({
        id: `group-${keyword}`,
        title: `Group "${keyword}" tasks`,
        description: `Create a story for ${tasks.length} tasks related to ${keyword}`,
        type: 'group_similar',
        icon: 'mdi:group',
        taskIds: tasks.map(t => t.id),
        action: { keyword, tasks }
      });
    }
  });
  
  // Suggest converting large/complex tasks to stories
  const largeTasks = props.tasks.filter(task => 
    task.description && task.description.length > 100
  );
  largeTasks.forEach(task => {
    sug.push({
      id: `convert-${task.id}`,
      title: `Convert "${task.content}" to Story`,
      description: 'This task seems complex enough to be broken down into a story',
      type: 'convert_large',
      icon: 'mdi:arrow-expand-up',
      taskIds: [task.id],
      action: { task }
    });
  });
  
  return sug.slice(0, 3); // Limit to 3 suggestions
});

const groupTasksByKeywords = (tasks: Task[]) => {
  const groups: Record<string, Task[]> = {};
  
  tasks.forEach(task => {
    const words = task.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 3 && !['task', 'todo', 'item', 'work'].includes(word)) {
        if (!groups[word]) groups[word] = [];
        groups[word].push(task);
      }
    });
  });
  
  return groups;
};

const convertToStory = (task: Task) => {
  emit('convert-to-story', task);
};

const assignToStory = (task: Task) => {
  emit('assign-to-story', task);
};

const organizeOrphanedTasks = () => {
  // Trigger automatic organization logic
  console.log('Organizing orphaned tasks...');
};

const applySuggestion = (suggestion: OrganizationSuggestion) => {
  console.log('Applying suggestion:', suggestion);
  // Implementation would depend on suggestion type
};

// Drag and Drop handlers
const onTaskDragStart = (event: DragEvent, task: Task) => {
  event.dataTransfer!.setData('text/plain', JSON.stringify({ type: 'task', id: task.id }));
  event.dataTransfer!.effectAllowed = 'move';
};

const onTaskDrop = (event: DragEvent, newStatus: string) => {
  event.preventDefault();
  const data = JSON.parse(event.dataTransfer!.getData('text/plain'));
  if (data.type === 'task') {
    emit('drop-task', data.id, newStatus);
  }
};

const onDragOver = (event: DragEvent) => {
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
};

const onDragEnter = (event: DragEvent) => {
  event.preventDefault();
};
</script>

<style scoped>
.orphaned-swimlane {
  margin-bottom: 16px;
  background: #252526;
  border-radius: 8px;
  border: 1px solid #f48771;
  border-style: dashed;
  overflow: hidden;
}

.swimlane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(244, 135, 113, 0.1);
  border-bottom: 1px solid #3e3e42;
  cursor: pointer;
  border-left: 4px solid #f48771;
}

.header-info {
  flex: 1;
  margin-right: 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.expand-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  transition: all 0.2s;
}

.expand-button:hover {
  background: #3e3e42;
}

.expand-button.expanded {
  transform: rotate(90deg);
}

.swimlane-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #f48771;
}

.item-count {
  font-size: 12px;
  color: #858585;
  background: rgba(244, 135, 113, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
}

.swimlane-description {
  font-size: 12px;
  color: #858585;
  font-style: italic;
}

.swimlane-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #3e3e42;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.action-btn:hover {
  background: #4e4e52;
  border-color: #f48771;
}

.action-btn.primary {
  background: #f48771;
  border-color: #f48771;
  color: #ffffff;
}

.action-btn.primary:hover {
  background: #e07660;
}

.swimlane-content {
  padding: 16px;
}

.tasks-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 16px;
}

.task-column {
  min-width: 280px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
}

.column-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
}

.task-count {
  background: #3e3e42;
  color: #cccccc;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
}

.task-drop-zone {
  flex: 1;
  padding: 12px;
  min-height: 120px;
}

.orphaned-task-card {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.orphaned-task-card:hover {
  border-color: #6c6c6c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.orphaned-task-card.priority-high {
  border-left-color: #f48771;
}

.orphaned-task-card.priority-medium {
  border-left-color: #e7c547;
}

.orphaned-task-card.priority-low {
  border-left-color: #4ec9b0;
}

.task-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.task-status-icon {
  margin-top: 2px;
  color: #858585;
}

.task-content-area {
  flex: 1;
}

.task-title {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  line-height: 1.3;
}

.task-description {
  margin: 0;
  font-size: 12px;
  color: #cccccc;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.orphaned-task-card:hover .task-actions {
  opacity: 1;
}

.task-action-btn {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-action-btn:hover {
  background: #3e3e42;
  color: #cccccc;
}

.task-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.task-priority-badge {
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-priority-badge.priority-high {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.task-priority-badge.priority-medium {
  background: rgba(231, 197, 71, 0.2);
  color: #e7c547;
}

.task-priority-badge.priority-low {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.task-assignee {
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.1);
  color: #cccccc;
}

.task-type {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: lowercase;
}

.task-type.type-feature {
  background: rgba(0, 122, 204, 0.2);
  color: #007acc;
}

.task-type.type-bugfix {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.task-type.type-refactor {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.organization-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #3e3e42;
}

.organize-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 8px;
  background: none;
  border: 1px dashed #6c6c6c;
  border-radius: 3px;
  color: #858585;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 11px;
}

.organize-btn:hover {
  background: rgba(0, 122, 204, 0.1);
  border-color: #007acc;
  color: #007acc;
}

.suggestions-panel {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 16px;
}

.suggestions-panel h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-card {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.suggestion-title {
  flex: 1;
  font-weight: 500;
  color: #ffffff;
  font-size: 13px;
}

.apply-btn {
  padding: 4px 8px;
  background: #007acc;
  border: none;
  border-radius: 3px;
  color: #ffffff;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.apply-btn:hover {
  background: #005a9e;
}

.suggestion-description {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #cccccc;
  line-height: 1.4;
}

.affected-tasks {
  font-size: 11px;
  color: #858585;
}

/* Expand transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .swimlane-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 12px;
  }
  
  .header-info {
    margin-right: 0;
  }
  
  .title-row {
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .swimlane-title {
    font-size: 14px;
    flex: 1;
    min-width: 0;
  }
  
  .item-count {
    font-size: 11px;
  }
  
  .swimlane-description {
    font-size: 11px;
  }
  
  .swimlane-actions {
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .action-btn {
    padding: 4px 8px;
    font-size: 11px;
  }
  
  .swimlane-content {
    padding: 8px;
  }
  
  .tasks-row {
    flex-direction: column;
    gap: 12px;
    overflow-x: visible;
    margin-bottom: 12px;
  }
  
  .task-column {
    min-width: 100%;
    width: 100%;
  }
  
  .orphaned-task-card {
    padding: 8px;
  }
  
  .task-header {
    gap: 6px;
    flex-wrap: wrap;
  }
  
  .task-content-area {
    min-width: 0;
  }
  
  .task-title {
    font-size: 13px;
  }
  
  .task-description {
    font-size: 11px;
  }
  
  .task-actions {
    opacity: 1; /* Always show on mobile */
  }
  
  .task-meta {
    font-size: 10px;
    gap: 6px;
  }
  
  .organization-actions {
    flex-direction: column;
    gap: 6px;
  }
  
  .organize-btn {
    font-size: 10px;
    padding: 4px 6px;
  }
  
  .suggestions-panel {
    padding: 12px;
  }
  
  .suggestions-panel h4 {
    font-size: 13px;
  }
  
  .suggestion-card {
    padding: 8px;
  }
  
  .suggestion-header {
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .suggestion-title {
    font-size: 12px;
  }
  
  .suggestion-description {
    font-size: 11px;
  }
  
  .affected-tasks {
    font-size: 10px;
  }
  
  .apply-btn {
    font-size: 10px;
    padding: 3px 6px;
  }
}

@media (max-width: 480px) {
  .orphaned-swimlane {
    margin-bottom: 12px;
  }
  
  .swimlane-header {
    padding: 8px;
  }
  
  .swimlane-title {
    font-size: 13px;
  }
  
  .item-count {
    font-size: 10px;
  }
  
  .swimlane-description {
    font-size: 10px;
  }
  
  .swimlane-actions {
    gap: 4px;
  }
  
  .action-btn {
    padding: 3px 6px;
    font-size: 10px;
  }
  
  .action-btn span {
    display: none; /* Hide text, show only icons on very small screens */
  }
  
  .swimlane-content {
    padding: 6px;
  }
  
  .tasks-row {
    gap: 8px;
    margin-bottom: 8px;
  }
  
  .orphaned-task-card {
    padding: 6px;
  }
  
  .task-header {
    gap: 4px;
  }
  
  .task-title {
    font-size: 12px;
  }
  
  .task-description {
    font-size: 10px;
  }
  
  .task-meta {
    font-size: 9px;
    gap: 4px;
  }
  
  .task-priority-badge {
    padding: 1px 4px;
    font-size: 9px;
  }
  
  .organization-actions {
    gap: 4px;
  }
  
  .organize-btn {
    font-size: 9px;
    padding: 3px 4px;
  }
  
  .suggestions-panel {
    padding: 8px;
  }
  
  .suggestions-panel h4 {
    font-size: 12px;
  }
  
  .suggestion-card {
    padding: 6px;
  }
  
  .suggestion-title {
    font-size: 11px;
  }
  
  .suggestion-description {
    font-size: 10px;
  }
  
  .affected-tasks {
    font-size: 9px;
  }
  
  .apply-btn {
    font-size: 9px;
    padding: 2px 4px;
  }
}
</style>