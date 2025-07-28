<template>
  <Teleport to="body">
    <div 
      v-if="dragDropState.isDragging" 
      class="drag-indicator"
      :style="{ 
        left: `${mouseX}px`, 
        top: `${mouseY}px` 
      }"
    >
      <Icon :name="getModuleIcon(dragDropState.draggedModule)" size="24" />
      <span>{{ getModuleLabel(dragDropState.draggedModule) }}</span>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import type { ModuleId } from '~/stores/layout';
import Icon from '~/components/Icon.vue';

const { dragDropState } = useModuleDragDrop();

const mouseX = ref(0);
const mouseY = ref(0);

// Module configuration (same as in docks)
const moduleConfig: Record<ModuleId, { label: string; icon: string }> = {
  explorer: { label: 'Explorer', icon: 'mdi:folder-outline' },
  'explorer-editor': { label: 'Explorer + Editor', icon: 'mdi:file-code-outline' },
  claude: { label: 'Claude AI', icon: 'simple-icons:anthropic' },
  terminal: { label: 'Terminal', icon: 'mdi:console' },
  tasks: { label: 'Tasks', icon: 'mdi:checkbox-marked-outline' },
  'source-control': { label: 'Source Control', icon: 'mdi:source-branch' },
  checkpoints: { label: 'Checkpoints', icon: 'mdi:history' },
  worktrees: { label: 'Worktrees', icon: 'mdi:file-tree' },
  context: { label: 'Context', icon: 'mdi:brain' },
  knowledge: { label: 'Knowledge', icon: 'mdi:book-open-page-variant' },
  prompts: { label: 'Prompts', icon: 'mdi:lightning-bolt' }
};

const getModuleLabel = (moduleId: ModuleId | null) => {
  if (!moduleId) return '';
  return moduleConfig[moduleId]?.label || moduleId;
};

const getModuleIcon = (moduleId: ModuleId | null) => {
  if (!moduleId) return 'mdi:help';
  return moduleConfig[moduleId]?.icon || 'mdi:help';
};

const handleMouseMove = (event: MouseEvent) => {
  mouseX.value = event.clientX + 10;
  mouseY.value = event.clientY + 10;
};

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
});
</script>

<style scoped>
.drag-indicator {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d30;
  border: 1px solid #007acc;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  color: #ffffff;
  font-size: 13px;
  opacity: 0.9;
}
</style>