<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click="close">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2>Settings</h2>
            <button class="close-button" @click="close">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="settings-placeholder">
              <Icon name="mdi:cog" size="48" />
              <h3>Settings Panel</h3>
              <p>Settings configuration will be available here soon.</p>
              <p class="hint">Future features will include:</p>
              <ul>
                <li>Theme customization</li>
                <li>Editor preferences</li>
                <li>Claude CLI configuration</li>
                <li>Keyboard shortcuts</li>
                <li>Extension management</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const handleOpenSettings = () => {
  open();
};

onMounted(() => {
  window.addEventListener('open-settings', handleOpenSettings);
});

onUnmounted(() => {
  window.removeEventListener('open-settings', handleOpenSettings);
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

.modal-container {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
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
  transition: background 0.2s;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

.settings-placeholder {
  text-align: center;
  padding: 40px 20px;
  color: #858585;
}

.settings-placeholder h3 {
  margin: 16px 0 8px;
  font-size: 20px;
  color: #cccccc;
}

.settings-placeholder p {
  margin: 8px 0;
  font-size: 14px;
}

.settings-placeholder .hint {
  margin-top: 24px;
  font-weight: 500;
  color: #cccccc;
}

.settings-placeholder ul {
  list-style: none;
  padding: 0;
  margin: 16px 0;
}

.settings-placeholder li {
  padding: 4px 0;
  font-size: 13px;
}

.settings-placeholder li::before {
  content: "• ";
  color: #007acc;
  font-weight: bold;
  margin-right: 8px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s;
}

.modal-enter-from .modal-container {
  transform: scale(0.95);
}

.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>