<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="cancel">
        <div class="modal-container">
          <div class="modal-header">
            <h3>{{ config.title }}</h3>
            <button class="close-btn" @click="cancel">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <p v-if="config.message" class="modal-message">{{ config.message }}</p>
            <input
              ref="inputRef"
              v-model="inputValue"
              type="text"
              class="modal-input"
              :placeholder="config.placeholder"
              @keydown.enter="submit"
              @keydown.escape="cancel"
            />
          </div>
          
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="cancel">Cancel</button>
            <button class="btn btn-primary" @click="submit">OK</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useDialogs } from '~/composables/useDialogs';

const dialogs = useDialogs();
const inputRef = ref<HTMLInputElement>();
const inputValue = ref('');

// Use the shared state from the composable
const isOpen = dialogs.isModalOpen;
const config = dialogs.modalConfig;

// Watch for modal open and focus input
watch(isOpen, async (newVal) => {
  if (newVal) {
    inputValue.value = config.value.defaultValue;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
  }
});

function submit() {
  dialogs.submitModal(inputValue.value);
  inputValue.value = '';
}

function cancel() {
  dialogs.cancelModal();
  inputValue.value = '';
}
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
  z-index: 9999;
}

.modal-container {
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #cccccc;
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #8b8b8b;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #3e3e42;
  color: #cccccc;
}

.modal-body {
  padding: 20px;
}

.modal-message {
  margin: 0 0 16px 0;
  color: #cccccc;
  font-size: 14px;
}

.modal-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.modal-input:focus {
  border-color: #007acc;
  background: #252526;
}

.modal-input::placeholder {
  color: #6b6b6b;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  border-radius: 0 0 8px 8px;
}

.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #0e639c;
  color: white;
}

.btn-primary:hover {
  background: #1177bb;
}

.btn-secondary {
  background: #3e3e42;
  color: #cccccc;
}

.btn-secondary:hover {
  background: #464647;
}

/* Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}
</style>