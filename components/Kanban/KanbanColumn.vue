<template>
  <div class="kanban-column">
    <div class="column-header">
      <h4>{{ title }}</h4>
      <span class="task-count">{{ tasks.length }}</span>
    </div>
    
    <div
      class="column-content"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      :class="{ 'drag-over': isDragOver }"
    >
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @edit="$emit('edit', task)"
        @delete="$emit('delete', task)"
        @click="$emit('task-click', task)"
      />
      
      <div v-if="tasks.length === 0" class="empty-state">
        <Icon name="mdi:inbox" size="32" />
        <p>No tasks</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { EnhancedTask } from '~/shared/types';

const props = defineProps<{
  title: string;
  tasks: EnhancedTask[];
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
}>();

const emit = defineEmits<{
  drop: [taskId: string, newStatus: EnhancedTask['status']];
  edit: [task: EnhancedTask];
  delete: [task: EnhancedTask];
  'task-click': [task: EnhancedTask];
}>();

const isDragOver = ref(false);

const onDragOver = (event: DragEvent) => {
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
};

const onDragEnter = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = true;
};

const onDragLeave = (event: DragEvent) => {
  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
    isDragOver.value = false;
  }
};

const onDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;
  
  const taskId = event.dataTransfer?.getData('text/plain');
  if (taskId) {
    emit('drop', taskId, props.status);
  }
};
</script>

<style scoped>
.kanban-column {
  flex: 1;
  min-width: 280px;
  max-width: 400px;
  background: #252526;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-radius: 8px 8px 0 0;
  border-bottom: 1px solid #3e3e42;
}

.column-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}

.task-count {
  background: #3e3e42;
  color: #cccccc;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.column-content {
  flex: 1;
  padding: 12px;
  min-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  transition: background-color 0.2s;
}

.column-content.drag-over {
  background: #37373d;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: #858585;
  text-align: center;
}

.empty-state p {
  margin: 8px 0 0 0;
  font-size: 13px;
}
</style>