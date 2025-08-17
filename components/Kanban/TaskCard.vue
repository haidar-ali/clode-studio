<template>
  <div
    class="task-card"
    :class="[`priority-${task.priority}`, { dragging: isDragging }]"
    :data-item-type="props.itemType || 'task'"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @click="$emit('click')"
  >
    <div class="task-header">
      <h5 class="task-title">
        <span v-if="task.identifier || task.id" class="task-id">
          [{{ task.identifier || task.id }}]
        </span>
        {{ getItemTitle(task) }}
      </h5>
      <div class="task-actions">
        <!-- Epic/Story specific actions -->
        <button 
          v-if="props.itemType === 'epic'" 
          @click="$emit('create-story', task)" 
          class="action-button" 
          title="Add Story"
        >
          <Icon name="mdi:plus" size="14" />
        </button>
        <button 
          v-if="props.itemType === 'story'" 
          @click="$emit('create-task', task)" 
          class="action-button" 
          title="Add Task"
        >
          <Icon name="mdi:plus" size="14" />
        </button>
        <button @click="$emit('edit')" class="action-button" title="Edit">
          <Icon name="mdi:pencil" size="14" />
        </button>
        <button @click="$emit('delete')" class="action-button" title="Delete">
          <Icon name="mdi:delete" size="14" />
        </button>
      </div>
    </div>
    
    <!-- Epic/Story specific content -->
    <p v-if="getItemDescription(task)" class="task-description">
      {{ getItemDescription(task) }}
    </p>
    
    <!-- Epic business value -->
    <div v-if="props.itemType === 'epic' && task.businessValue" class="business-value">
      <Icon name="mdi:currency-usd" size="12" />
      <span>{{ task.businessValue }}</span>
    </div>
    
    <!-- Story user story -->
    <div v-if="props.itemType === 'story' && task.userStory" class="user-story">
      <Icon name="mdi:account" size="12" />
      <span>{{ task.userStory }}</span>
    </div>
    
    <div class="task-footer">
      <div class="task-meta">
        <!-- Item type indicator -->
        <span class="item-type-badge" :class="`item-${props.itemType || 'task'}`">
          <Icon :name="getItemTypeIcon()" size="12" />
          {{ props.itemType || 'task' }}
        </span>
        
        <!-- Task specific metadata -->
        <span v-if="props.itemType === 'task' && task.type" class="task-type" :class="`type-${task.type}`">
          <Icon :name="getTypeIcon(task.type)" size="12" />
          {{ task.type }}
        </span>
        
        <span class="priority-badge" :class="`priority-${task.priority}`">
          {{ task.priority }}
        </span>
        
        <!-- Story points for stories -->
        <span v-if="props.itemType === 'story' && task.storyPoints" class="story-points">
          <Icon name="mdi:numeric" size="12" />
          {{ task.storyPoints }}pts
        </span>
        
        <!-- Progress indicators -->
        <span v-if="props.itemType === 'epic' && getEpicProgress(task)" class="progress-indicator">
          <Icon name="mdi:progress-check" size="12" />
          {{ getEpicProgress(task) }}%
        </span>
        
        <span v-if="task.assignee && task.assignee !== 'claude'" class="assignee-badge">
          @{{ task.assignee }}
        </span>
      </div>
      <span class="task-date">
        {{ formatDate(task.updatedAt || task.createdAt || new Date()) }}
      </span>
    </div>
    
    <div v-if="(task.resources && task.resources.length > 0) || (task.filesModified && task.filesModified.length > 0)" class="task-resources" @click.stop>
      <div class="resources-indicator">
        <Icon name="mdi:link-variant" size="12" />
        <span>{{ task.resources?.length || task.filesModified?.length || 0 }} resources</span>
      </div>
      <div class="resources-tooltip">
        <div class="tooltip-header">Linked Resources:</div>
        <div v-if="task.resources && task.resources.length > 0">
          <div v-for="(resource, index) in task.resources" :key="`resource-${index}`" class="tooltip-resource">
            <Icon :name="getResourceIcon(resource.type)" size="12" />
            <span class="resource-type-label">{{ resource.type }}:</span>
            <span class="resource-name">{{ resource.name }}</span>
          </div>
        </div>
        <div v-else-if="task.filesModified && task.filesModified.length > 0">
          <div v-for="(file, index) in task.filesModified" :key="`file-${index}`" class="tooltip-resource">
            <Icon name="mdi:file" size="12" />
            <span class="resource-type-label">file:</span>
            <span class="resource-name">{{ file }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
// Simple task interface
interface SimpleTask {
  id: string;
  identifier?: string;
  content: string;
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  assignee?: 'claude' | 'user' | 'both';
  description?: string;
  filesModified?: string[];
  resources?: Array<{
    type: 'file' | 'knowledge' | 'hook' | 'mcp' | 'command' | 'task';
    id: string;
    name: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const props = defineProps<{
  task: SimpleTask;
  itemType?: 'task' | 'epic' | 'story';
}>();

const emit = defineEmits<{
  edit: [];
  delete: [];
  click: [];
  'create-story': [item: any];
  'create-task': [item: any];
}>();

const isDragging = ref(false);

const onDragStart = (event: DragEvent) => {
  isDragging.value = true;
  event.dataTransfer!.setData('text/plain', props.task.id);
  event.dataTransfer!.effectAllowed = 'move';
};

const onDragEnd = () => {
  isDragging.value = false;
};

const formatDate = (date: Date) => {
  const now = new Date();
  const taskDate = new Date(date);
  const diffInHours = Math.abs(now.getTime() - taskDate.getTime()) / 36e5;
  
  if (diffInHours < 24) {
    return taskDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    return taskDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }
};

const getTypeIcon = (type: SimpleTask['type']) => {
  switch (type) {
    case 'feature': return 'mdi:plus-circle';
    case 'bugfix': return 'mdi:bug';
    case 'refactor': return 'mdi:wrench';
    case 'documentation': return 'mdi:file-document';
    case 'research': return 'mdi:magnify';
    default: return 'mdi:checkbox-marked-circle';
  }
};

const getResourceIcon = (type: string): string => {
  const icons: Record<string, string> = {
    file: 'mdi:file',
    knowledge: 'mdi:book-open-variant',
    task: 'mdi:checkbox-marked-circle',
    hook: 'mdi:hook',
    mcp: 'mdi:server',
    command: 'mdi:console'
  };
  return icons[type] || 'mdi:file';
};

const getItemTitle = (item: any) => {
  return item.title || item.content || 'Untitled';
};

const getItemDescription = (item: any) => {
  return item.description || '';
};

const getItemTypeIcon = () => {
  switch (props.itemType) {
    case 'epic': return 'mdi:flag';
    case 'story': return 'mdi:book-open-variant';
    case 'task': return 'mdi:checkbox-marked-outline';
    default: return 'mdi:checkbox-marked-outline';
  }
};

const getEpicProgress = (epic: any) => {
  // This would calculate epic progress based on completed stories
  // For now, return a placeholder
  if (epic.storyIds && epic.storyIds.length > 0) {
    // Would need access to stories to calculate actual progress
    return Math.round(Math.random() * 100); // Placeholder
  }
  return 0;
};
</script>

<style scoped>
.task-card {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.task-card:hover {
  border-color: #6c6c6c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.task-card.dragging {
  opacity: 0.5;
  transform: rotate(5deg);
  cursor: grabbing;
}

.task-card.priority-high {
  border-left: 3px solid #f48771;
}

.task-card.priority-medium {
  border-left: 3px solid #e7c547;
}

.task-card.priority-low {
  border-left: 3px solid #4ec9b0;
}

/* Epic cards have special styling */
.task-card[data-item-type="epic"] {
  background: linear-gradient(135deg, #252526 0%, #2d2d30 100%);
  border: 1px solid #f48771;
}

.task-card[data-item-type="epic"]:hover {
  box-shadow: 0 4px 12px rgba(244, 135, 113, 0.2);
}

/* Story cards have special styling */
.task-card[data-item-type="story"] {
  background: linear-gradient(135deg, #252526 0%, #2a2d32 100%);
  border: 1px solid #007acc;
}

.task-card[data-item-type="story"]:hover {
  box-shadow: 0 4px 12px rgba(0, 122, 204, 0.2);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.task-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  line-height: 1.3;
  flex: 1;
  margin-right: 8px;
}

.task-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.task-card:hover .task-actions {
  opacity: 1;
}

.action-button {
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

.action-button:hover {
  background: #3e3e42;
  color: #cccccc;
}

.task-description {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #cccccc;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  flex-wrap: wrap;
  gap: 4px;
}

.task-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.task-type {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: lowercase;
  font-size: 10px;
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

.task-type.type-documentation {
  background: rgba(142, 142, 147, 0.2);
  color: #8e8e93;
}

.task-type.type-research {
  background: rgba(156, 104, 255, 0.2);
  color: #9c68ff;
}

.priority-badge {
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.priority-badge.priority-high {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.priority-badge.priority-medium {
  background: rgba(231, 197, 71, 0.2);
  color: #e7c547;
}

.priority-badge.priority-low {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.task-date {
  color: #858585;
}

.assignee-badge {
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.1);
  color: #cccccc;
  font-size: 10px;
}

.task-id {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #858585;
  margin-right: 6px;
}

.task-resources {
  position: relative;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #3e3e42;
  width: 100%;
}

.resources-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #858585;
  cursor: help;
  transition: color 0.2s;
}

.task-resources:hover .resources-indicator {
  color: #cccccc;
}

.resources-tooltip {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 100;
  min-width: 200px;
  max-width: 400px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: all 0.2s;
  pointer-events: none;
  margin-bottom: 4px;
}

.task-resources:hover .resources-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.tooltip-header {
  font-size: 11px;
  font-weight: 600;
  color: #cccccc;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-resource {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #d4d4d4;
  padding: 3px 0;
}

.tooltip-resource:hover {
  color: #ffffff;
}

.resource-type-label {
  color: #858585;
  font-size: 11px;
  text-transform: lowercase;
}

.resource-name {
  word-break: break-all;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

/* Epic and Story specific styles */
.business-value {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
  font-size: 12px;
  color: #4ec9b0;
  background: rgba(78, 201, 176, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  border-left: 3px solid #4ec9b0;
}

.user-story {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 8px 0;
  font-size: 12px;
  color: #858585;
  font-style: italic;
  line-height: 1.4;
}

.item-type-badge {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
}

.item-epic {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.item-story {
  background: rgba(0, 122, 204, 0.2);
  color: #007acc;
}

.item-task {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.story-points {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  background: rgba(156, 104, 255, 0.2);
  color: #9c68ff;
  font-size: 10px;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  background: rgba(231, 197, 71, 0.2);
  color: #e7c547;
  font-size: 10px;
}
</style>