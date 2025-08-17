<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2>Autocomplete Settings</h2>
            <button class="close-button" @click="$emit('close')">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          <div class="modal-content">
            <AutocompleteSettings :is-open="isOpen" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import AutocompleteSettings from './AutocompleteSettings.vue';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

// Handle escape key
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.isOpen) {
    emit('close');
  }
};

// Add/remove event listener based on modal state
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeydown);
  } else {
    document.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: #2d2d30;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  width: 90%;
  max-width: 900px;
  height: 80vh;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
  flex-shrink: 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e0e0e0;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
  color: #ffffff;
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  background: #1e1e1e;
}

/* Custom scrollbar */
.modal-content::-webkit-scrollbar {
  width: 10px;
}

.modal-content::-webkit-scrollbar-track {
  background: #2d2d30;
}

.modal-content::-webkit-scrollbar-thumb {
  background: #454545;
  border-radius: 5px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>