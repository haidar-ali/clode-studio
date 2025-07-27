<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click="close">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-title">
            <Icon name="mdi:slash-forward" size="20" />
            <h2>Slash Command Studio</h2>
            <span v-if="commandCount > 0" class="command-badge">
              {{ commandCount }} commands
            </span>
          </div>
          <button @click="close" class="close-button" title="Close (Esc)">
            <Icon name="mdi:close" size="20" />
          </button>
        </div>
        
        <div class="modal-body">
          <CommandStudio v-if="modelValue" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue';
import { useClaudeCommandsStore } from '~/stores/claude-commands';

// Lazy load the CommandStudio component
const CommandStudio = defineAsyncComponent(() => import('~/components/Commands/CommandStudio.vue'));

interface Props {
  modelValue: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const commandsStore = useClaudeCommandsStore();

const commandCount = computed(() => {
  const projectCount = commandsStore.projectCommands?.length || 0;
  const personalCount = commandsStore.personalCommands?.length || 0;
  return projectCount + personalCount;
});

const close = () => {
  emit('update:modelValue', false);
};

// Handle escape key
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.modelValue) {
    close();
  }
};

// Add/remove keyboard listener and ensure store is initialized
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeydown);
    // Ensure commands are loaded
    await commandsStore.loadProjectCommands();
    await commandsStore.loadPersonalCommands();
  } else {
    document.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-container {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90vw;
  height: 85vh;
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid #3e3e42;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #cccccc;
}

.command-badge {
  background: #0e639c;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.close-button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
  color: white;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Adjust CommandStudio styles for modal context */
:deep(.command-studio) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.studio-header) {
  flex-shrink: 0;
}

:deep(.studio-content) {
  flex: 1;
  overflow: hidden;
}
</style>