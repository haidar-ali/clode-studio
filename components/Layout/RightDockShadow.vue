<template>
  <div 
    v-if="shouldShowShadow"
    class="right-dock-shadow" 
    :class="{ 
      'drop-target': dragDropState?.isDragging && canDropInDock('rightDock'),
      'drop-active': dragDropState?.dropTarget === 'rightDock' 
    }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="shadow-content">
      <Icon name="mdi:dock-right" size="32" />
      <span v-if="dragDropState?.isDragging">Drop here to add to right dock</span>
      <span v-else>Right dock (empty)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLayoutStore } from '~/stores/layout';
import { useModuleDragDrop } from '~/composables/useModuleDragDrop';
import Icon from '~/components/Icon.vue';

const layoutStore = useLayoutStore();
const { dragDropState, canDropInDock, handleDrop: handleDropModule, setDropTarget } = useModuleDragDrop();

// Show shadow - always visible in our shadow pane slot
const shouldShowShadow = computed(() => {
  return true; // Since parent controls visibility now
});

const handleDragOver = (event: DragEvent) => {
  if (!canDropInDock('rightDock')) return;
  
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  setDropTarget('rightDock');
};

const handleDragLeave = (event: DragEvent) => {
  const relatedTarget = event.relatedTarget as HTMLElement;
  if (!relatedTarget || !event.currentTarget!.contains(relatedTarget)) {
    setDropTarget(null);
  }
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  handleDropModule('rightDock');
};
</script>

<style scoped>
.right-dock-shadow {
  width: 100%;
  height: 100%;
  background: #252526;
  border-left: 1px solid #1e1e1e;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s ease;
}

.shadow-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #666666;
  text-align: center;
  padding: 20px;
  user-select: none;
}

.shadow-content span {
  font-size: 12px;
  line-height: 1.4;
}

/* Drop target styles */
.right-dock-shadow.drop-target {
  background: rgba(37, 37, 38, 0.8);
}

.right-dock-shadow.drop-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed #007acc;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0.5;
}

.right-dock-shadow.drop-active::after {
  opacity: 1;
  background: rgba(0, 122, 204, 0.1);
}

.right-dock-shadow.drop-active .shadow-content {
  color: #007acc;
}
</style>