<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay context-status-modal" @click="close">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Context Management</h3>
          <button @click="close" class="close-button">
            <Icon name="mdi:close" size="20" />
          </button>
        </div>
        
        <div class="modal-body">
          <div class="tabs">
            <button 
              :class="{ active: activeTab === 'history' }"
              @click="activeTab = 'history'"
            >
              History
            </button>
            <button 
              :class="{ active: activeTab === 'checkpoints' }"
              @click="activeTab = 'checkpoints'"
            >
              Checkpoints
            </button>
          </div>
          
          <div class="tab-content">
            <ContextHistory v-if="activeTab === 'history'" />
            <ContextCheckpoints v-else />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import ContextHistory from './ContextHistory.vue';
import ContextCheckpoints from './ContextCheckpoints.vue';

const isOpen = ref(false);
const activeTab = ref<'history' | 'checkpoints'>('history');

const open = () => {
  isOpen.value = true;
  document.body.style.overflow = 'hidden';
};

const close = () => {
  isOpen.value = false;
  document.body.style.overflow = '';
};

const handleShowContextStatus = () => {
  open();
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isOpen.value) {
    close();
  }
};

onMounted(() => {
  window.addEventListener('show-context-status', handleShowContextStatus);
  window.addEventListener('show-context-modal', handleShowContextStatus);
  document.addEventListener('keydown', handleKeydown);
  
  // Also expose open method on the element for direct access
  const modalEl = document.querySelector('.context-status-modal');
  if (modalEl) {
    (modalEl as any).open = open;
  }
});

onUnmounted(() => {
  window.removeEventListener('show-context-status', handleShowContextStatus);
  window.removeEventListener('show-context-modal', handleShowContextStatus);
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
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

.modal-content {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  height: 80%;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  border: 1px solid #333;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #2d2d30;
  border-radius: 8px 8px 0 0;
  border-bottom: 1px solid #333;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
  color: #ffffff;
}

.modal-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #333;
  padding: 0 16px;
}

.tabs button {
  padding: 12px 20px;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tabs button:hover {
  background: #2d2d30;
}

.tabs button.active {
  color: #ffffff;
  border-bottom-color: #007acc;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  background: #1e1e1e;
}
</style>