<template>
  <div class="unassigned-swimlane">
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
          <h3 class="swimlane-title">{{ title }}</h3>
          <span class="item-count">{{ stories.length }} stories, {{ tasks.length }} tasks</span>
        </div>
        
        <div class="swimlane-description">
          Stories and tasks that haven't been assigned to an epic yet
        </div>
      </div>
      
      <div class="swimlane-actions">
        <button 
          @click="createStory" 
          class="action-btn primary"
          title="Add Unassigned Story"
        >
          <Icon name="mdi:plus" size="14" />
          Story
        </button>
      </div>
    </div>
    
    <!-- Content -->
    <Transition name="expand">
      <div v-if="isExpanded" class="swimlane-content">
        <!-- Stories Row -->
        <div class="stories-row">
          <!-- Story Columns -->
          <div 
            v-for="status in storyStatuses" 
            :key="status.id"
            class="story-column"
          >
            <div class="column-header">
              <h4>{{ status.label }}</h4>
              <span class="story-count">{{ getStoriesByStatus(status.id).length }}</span>
            </div>
            
            <div 
              class="story-drop-zone"
              @drop="onStoryDrop($event, status.id)"
              @dragover="onDragOver"
              @dragenter="onDragEnter"
            >
              <!-- Story Cards -->
              <div 
                v-for="story in getStoriesByStatus(status.id)" 
                :key="story.id"
                class="story-card"
                draggable="true"
                @dragstart="onStoryDragStart($event, story)"
              >
                <div class="story-header">
                  <h5 class="story-title">{{ story.title }}</h5>
                  <div class="story-actions">
                    <button 
                      @click="$emit('create-task', story)" 
                      class="story-action-btn"
                      title="Add Task"
                    >
                      <Icon name="mdi:plus" size="12" />
                    </button>
                    <button 
                      @click="$emit('edit-story', story)" 
                      class="story-action-btn"
                      title="Edit Story"
                    >
                      <Icon name="mdi:pencil" size="12" />
                    </button>
                    <button 
                      @click="$emit('delete-story', story)" 
                      class="story-action-btn"
                      title="Delete Story"
                    >
                      <Icon name="mdi:delete" size="12" />
                    </button>
                  </div>
                </div>
                
                <p v-if="story.description" class="story-description">
                  {{ story.description }}
                </p>
                
                <div class="story-user-story" v-if="story.userStory">
                  <Icon name="mdi:account" size="12" />
                  {{ story.userStory }}
                </div>
                
                <!-- Tasks within Story -->
                <div class="story-tasks" v-if="getTasksByStory(story.id).length > 0">
                  <div class="tasks-header">
                    <span>Tasks ({{ getTasksByStory(story.id).length }})</span>
                    <div class="task-progress">
                      {{ getCompletedTasksByStory(story.id) }}/{{ getTasksByStory(story.id).length }}
                    </div>
                  </div>
                  
                  <div 
                    class="task-drop-zone"
                    @drop="onTaskDrop($event, story.id)"
                    @dragover="onDragOver"
                    @dragenter="onDragEnter"
                  >
                    <div 
                      v-for="task in getTasksByStory(story.id)" 
                      :key="task.id"
                      class="mini-task-card"
                      :class="`task-status-${task.status}`"
                      draggable="true"
                      @dragstart="onTaskDragStart($event, task)"
                      @click="$emit('edit-task', task)"
                    >
                      <div class="task-row">
                        <Icon :name="getTaskStatusIcon(task.status)" size="12" />
                        <span class="task-content">{{ task.content }}</span>
                        <span class="task-priority" :class="`priority-${task.priority}`">
                          {{ task.priority?.charAt(0)?.toUpperCase() }}
                        </span>
                      </div>
                    </div>
                    
                    <!-- Add Task Button -->
                    <button 
                      @click="$emit('create-task', story)"
                      class="add-task-btn"
                    >
                      <Icon name="mdi:plus" size="12" />
                      Add Task
                    </button>
                  </div>
                </div>
                
                <!-- Add Task Button for stories without tasks -->
                <button 
                  v-else
                  @click="$emit('create-task', story)"
                  class="add-first-task-btn"
                >
                  <Icon name="mdi:plus" size="12" />
                  Add First Task
                </button>
              </div>
              
              <!-- Add Story Button -->
              <button 
                v-if="status.id === 'backlog'"
                @click="createStory"
                class="add-story-btn"
              >
                <Icon name="mdi:plus" size="16" />
                Add Unassigned Story
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Story {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
  userStory?: string;
  epicId?: string;
}

interface Task {
  id: string;
  content: string;
  status: string;
  priority: string;
  storyId?: string;
  epicId?: string;
}

const props = defineProps<{
  title: string;
  stories: Story[];
  tasks: Task[];
}>();

const emit = defineEmits<{
  'edit-story': [story: Story];
  'delete-story': [story: Story];
  'create-task': [story: Story];
  'edit-task': [task: Task];
  'delete-task': [task: Task];
  'drop-story': [storyId: string, newStatus: string];
  'drop-task': [taskId: string, newStatus: string];
  'create-story': [];
}>();

const isExpanded = ref(true);

const storyStatuses = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'ready', label: 'Ready' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' }
];

const getStoriesByStatus = (status: string) => 
  props.stories.filter(story => story.status === status);

const getTasksByStory = (storyId: string) => 
  props.tasks.filter(task => task.storyId === storyId);

const getCompletedTasksByStory = (storyId: string) => 
  props.tasks.filter(task => task.storyId === storyId && task.status === 'completed').length;

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const createStory = () => {
  emit('create-story');
};

const getTaskStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return 'mdi:check-circle';
    case 'in_progress': return 'mdi:progress-clock';
    case 'pending': return 'mdi:circle-outline';
    default: return 'mdi:circle-outline';
  }
};

// Drag and Drop handlers
const onStoryDragStart = (event: DragEvent, story: Story) => {
  event.dataTransfer!.setData('text/plain', JSON.stringify({ type: 'story', id: story.id }));
  event.dataTransfer!.effectAllowed = 'move';
};

const onTaskDragStart = (event: DragEvent, task: Task) => {
  event.dataTransfer!.setData('text/plain', JSON.stringify({ type: 'task', id: task.id }));
  event.dataTransfer!.effectAllowed = 'move';
};

const onStoryDrop = (event: DragEvent, newStatus: string) => {
  event.preventDefault();
  const data = JSON.parse(event.dataTransfer!.getData('text/plain'));
  if (data.type === 'story') {
    emit('drop-story', data.id, newStatus);
  }
};

const onTaskDrop = (event: DragEvent, storyId: string) => {
  event.preventDefault();
  const data = JSON.parse(event.dataTransfer!.getData('text/plain'));
  if (data.type === 'task') {
    emit('drop-task', data.id, 'in_progress');
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
.unassigned-swimlane {
  margin-bottom: 16px;
  background: #252526;
  border-radius: 8px;
  border: 1px solid #6c6c6c;
  border-style: dashed;
  overflow: hidden;
}

.swimlane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  cursor: pointer;
  border-left: 4px solid #858585;
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
  color: #ffffff;
}

.item-count {
  font-size: 12px;
  color: #858585;
  background: rgba(255, 255, 255, 0.1);
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
  border-color: #007acc;
}

.action-btn.primary {
  background: #007acc;
  border-color: #007acc;
  color: #ffffff;
}

.action-btn.primary:hover {
  background: #005a9e;
}

.swimlane-content {
  padding: 16px;
}

.stories-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.story-column {
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

.story-count {
  background: #3e3e42;
  color: #cccccc;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
}

.story-drop-zone {
  flex: 1;
  padding: 12px;
  min-height: 120px;
}

.story-card {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.story-card:hover {
  border-color: #6c6c6c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.story-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.story-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  flex: 1;
  margin-right: 8px;
}

.story-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.story-card:hover .story-actions {
  opacity: 1;
}

.story-action-btn {
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

.story-action-btn:hover {
  background: #3e3e42;
  color: #cccccc;
}

.story-description {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #cccccc;
  line-height: 1.4;
}

.story-user-story {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #858585;
  font-style: italic;
  margin-bottom: 12px;
}

.story-tasks {
  border-top: 1px solid #3e3e42;
  padding-top: 8px;
}

.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 11px;
  color: #858585;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-progress {
  font-weight: 600;
  color: #cccccc;
}

.task-drop-zone {
  min-height: 40px;
}

.mini-task-card {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  padding: 6px 8px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.mini-task-card:hover {
  background: #2d2d30;
  border-color: #6c6c6c;
}

.task-status-completed {
  opacity: 0.7;
  text-decoration: line-through;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.task-content {
  flex: 1;
  color: #cccccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-priority {
  font-size: 10px;
  font-weight: 600;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
}

.task-priority.priority-high {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.task-priority.priority-medium {
  background: rgba(231, 197, 71, 0.2);
  color: #e7c547;
}

.task-priority.priority-low {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.add-task-btn,
.add-first-task-btn,
.add-story-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  background: none;
  border: 1px dashed #6c6c6c;
  border-radius: 4px;
  color: #858585;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  margin-top: 8px;
}

.add-task-btn:hover,
.add-first-task-btn:hover,
.add-story-btn:hover {
  background: rgba(0, 122, 204, 0.1);
  border-color: #007acc;
  color: #007acc;
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
  max-height: 800px;
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
  
  .stories-row {
    flex-direction: column;
    gap: 12px;
    overflow-x: visible;
  }
  
  .story-column {
    min-width: 100%;
    width: 100%;
  }
  
  .story-card {
    padding: 8px;
  }
  
  .story-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .story-title {
    font-size: 13px;
    margin-right: 0;
  }
  
  .story-actions {
    align-self: flex-end;
    opacity: 1; /* Always show on mobile */
  }
  
  .story-description {
    font-size: 11px;
  }
  
  .story-user-story {
    font-size: 11px;
  }
  
  .mini-task-card {
    padding: 4px 6px;
  }
  
  .task-row {
    font-size: 11px;
    gap: 6px;
  }
  
  .task-content {
    white-space: normal;
    overflow: visible;
    text-overflow: initial;
    line-height: 1.3;
  }
  
  .add-task-btn,
  .add-first-task-btn,
  .add-story-btn {
    padding: 6px;
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .unassigned-swimlane {
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
  
  .stories-row {
    gap: 8px;
  }
  
  .story-card {
    padding: 6px;
  }
  
  .story-title {
    font-size: 12px;
  }
  
  .story-description,
  .story-user-story {
    font-size: 10px;
  }
  
  .mini-task-card {
    padding: 3px 4px;
  }
  
  .task-row {
    font-size: 10px;
    gap: 4px;
  }
  
  .task-priority {
    width: 14px;
    height: 14px;
    font-size: 9px;
  }
}
</style>