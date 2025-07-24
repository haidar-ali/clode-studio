<template>
  <teleport to="body">
    <div class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog">
        <h3>Create New Session</h3>
        
        <div class="form-group">
          <label>Session Name</label>
          <input
            v-model="sessionName"
            @keydown.enter="handleCreate"
            @keydown.escape="$emit('close')"
            placeholder="e.g., Feature implementation, Bug fix..."
            class="form-input"
            ref="sessionInput"
          />
          <p class="form-hint">
            Give this session a descriptive name to track your work
          </p>
        </div>
        
        <div class="form-group">
          <label>Description (Optional)</label>
          <textarea
            v-model="description"
            @keydown.escape="$emit('close')"
            placeholder="Describe the purpose of this session..."
            class="form-input"
            rows="3"
          />
        </div>
        
        <div class="dialog-actions">
          <button @click="$emit('close')" class="btn btn-secondary">
            Cancel
          </button>
          <button 
            @click="handleCreate" 
            class="btn btn-primary"
            :disabled="!sessionName.trim()"
          >
            Create Session
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  worktree: {
    path: string;
    branch: string;
  };
}>();

const emit = defineEmits<{
  close: [];
  create: [data: { name: string; description?: string }];
}>();

const sessionName = ref('');
const description = ref('');
const sessionInput = ref<HTMLInputElement>();

onMounted(() => {
  sessionInput.value?.focus();
});

function handleCreate() {
  if (!sessionName.value.trim()) return;
  
  emit('create', {
    name: sessionName.value.trim(),
    description: description.value.trim() || undefined
  });
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
}

.dialog h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: #cccccc;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #cccccc;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #3e3e42;
  color: #cccccc;
  border: 1px solid #454545;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
  font-family: inherit;
  resize: vertical;
}

.form-input:focus {
  outline: none;
  border-color: #007acc;
  background: #252526;
}

.form-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: #8b8b8b;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn {
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1a8cff;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #3e3e42;
  color: #cccccc;
  border: 1px solid #454545;
}

.btn-secondary:hover {
  background: #252526;
  border-color: #007acc;
}
</style>