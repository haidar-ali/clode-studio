<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click="close">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2>Add Resources</h2>
            <button class="close-button" @click="close">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          
          <div class="modal-body">
            <ResourceSelector @add="handleAddResource" />
          </div>
          
          <div class="modal-footer">
            <div class="selected-count">
              {{ selectedCount }} resource{{ selectedCount !== 1 ? 's' : '' }} selected
            </div>
            <button class="btn-primary" @click="close">Done</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ResourceSelector from './ResourceSelector.vue';
import type { ResourceReference } from '~/stores/prompt-engineering';

const props = defineProps<{
  isOpen: boolean;
  context?: 'prompt' | 'subagent';
  subagentId?: string;
}>();

const emit = defineEmits<{
  close: [];
  add: [resource: ResourceReference, context?: string, subagentId?: string];
}>();

const selectedCount = ref(0);

const handleAddResource = (resource: ResourceReference) => {
  emit('add', resource, props.context, props.subagentId);
  selectedCount.value++;
};

const close = () => {
  selectedCount.value = 0;
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #454545;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: #cccccc;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  background: #2d2d30;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  min-height: 400px;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid #454545;
}

.selected-count {
  font-size: 13px;
  color: #858585;
}

.btn-primary {
  padding: 8px 20px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #005a9e;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease;
}

.modal-enter-from .modal-container {
  transform: scale(0.9);
}

.modal-leave-to .modal-container {
  transform: scale(0.9);
}
</style>