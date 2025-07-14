<template>
  <div
    class="task-card"
    :class="[`priority-${task.priority}`, { dragging: isDragging }]"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @click="$emit('click')"
  >
    <div class="task-header">
      <h5 class="task-title">{{ task.content }}</h5>
      <div class="task-actions">
        <button @click="$emit('edit')" class="action-button" title="Edit">
          <Icon name="mdi:pencil" size="14" />
        </button>
        <button @click="$emit('delete')" class="action-button" title="Delete">
          <Icon name="mdi:delete" size="14" />
        </button>
      </div>
    </div>
    
    <p v-if="task.description" class="task-description">
      {{ task.description }}
    </p>
    
    <div class="task-footer">
      <div class="task-meta">
        <span class="task-type" :class="`type-${task.type}`">
          <Icon :name="getTypeIcon(task.type)" size="12" />
          {{ task.type }}
        </span>
        <span class="priority-badge" :class="`priority-${task.priority}`">
          {{ task.priority }}
        </span>
        <span v-if="task.assignee !== 'claude'" class="assignee-badge">
          @{{ task.assignee }}
        </span>
      </div>
      <span class="task-date">
        {{ formatDate(task.updatedAt) }}
      </span>
    </div>
    
    <div v-if="task.filesModified && task.filesModified.length > 0" class="task-files" @click.stop>
      <div class="files-indicator">
        <Icon name="mdi:file-multiple" size="12" />
        <span>{{ task.filesModified.length }} files</span>
      </div>
      <div class="files-tooltip">
        <div class="tooltip-header">Files Modified:</div>
        <div v-for="(file, index) in task.filesModified" :key="index" class="tooltip-file">
          {{ file }}
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
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  assignee?: 'claude' | 'user' | 'both';
  description?: string;
  filesModified?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const props = defineProps<{
  task: SimpleTask;
}>();

const emit = defineEmits<{
  edit: [];
  delete: [];
  click: [];
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

.task-files {
  position: relative;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #3e3e42;
  width: 100%;
}

.files-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #858585;
  cursor: help;
  transition: color 0.2s;
}

.task-files:hover .files-indicator {
  color: #cccccc;
}

.files-tooltip {
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

.task-files:hover .files-tooltip {
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

.tooltip-file {
  font-size: 12px;
  color: #d4d4d4;
  padding: 3px 0;
  word-break: break-all;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.tooltip-file:hover {
  color: #ffffff;
}
</style>