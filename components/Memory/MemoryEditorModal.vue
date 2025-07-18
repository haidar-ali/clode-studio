<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click="close">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2>CLAUDE.md Memory Editor</h2>
            <button class="close-button" @click="close">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          <div class="modal-content">
            <ClaudeMemoryEditor />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import ClaudeMemoryEditor from './ClaudeMemoryEditor.vue';

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

// Handle keyboard shortcut
const handleKeydown = (event: KeyboardEvent) => {
  // Cmd/Ctrl + M to open memory editor
  if ((event.metaKey || event.ctrlKey) && event.key === 'm') {
    event.preventDefault();
    open();
  }
  
  // Escape to close
  if (event.key === 'Escape' && isOpen.value) {
    close();
  }
};

// Handle custom event
const handleOpenMemoryEditor = () => {
  open();
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('open-memory-editor', handleOpenMemoryEditor);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('open-memory-editor', handleOpenMemoryEditor);
});
</script>

<style scoped>
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
  z-index: 9998;
  padding: 20px;
}

.modal-container {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 90%;
  max-width: 1200px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  border-radius: 8px 8px 0 0;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 500;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  color: #cccccc;
  background: #3e3e42;
}

.modal-content {
  flex: 1;
  overflow: hidden;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s, opacity 0.3s;
}

.modal-enter-from .modal-container {
  transform: scale(0.9);
  opacity: 0;
}

.modal-leave-to .modal-container {
  transform: scale(0.9);
  opacity: 0;
}
</style>