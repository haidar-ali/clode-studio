<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="dialog-backdrop" @click="close">
        <div class="dialog-content" @click.stop>
          <div class="dialog-header">
            <h3>Create New Worktree</h3>
            <button class="close-btn" @click="close">
              <Icon name="mdi:close" />
            </button>
          </div>

          <div class="dialog-body">
            <div class="form-group">
              <label>Branch Name</label>
              <input
                v-model="branchName"
                type="text"
                placeholder="feature/new-feature"
                class="form-input"
                @keydown.enter="handleCreate"
              />
              <div class="form-hint">
                Use prefixes like feature/, bugfix/, or hotfix/
              </div>
            </div>

            <div class="form-group">
              <label>Session Name (Optional)</label>
              <input
                v-model="sessionName"
                type="text"
                placeholder="Implementing new authentication"
                class="form-input"
              />
              <div class="form-hint">
                A descriptive name for this work session
              </div>
            </div>

            <div class="form-group">
              <label>Start From</label>
              <select v-model="startPoint" class="form-select">
                <option value="">Current branch ({{ currentBranch }})</option>
                <option value="HEAD">Current commit (HEAD)</option>
                <optgroup label="Recent Commits">
                  <option 
                    v-for="commit in recentCommits" 
                    :key="commit.hash"
                    :value="commit.hash"
                  >
                    {{ commit.abbrevHash }} - {{ commit.subject }}
                  </option>
                </optgroup>
                <optgroup label="Remote Branches">
                  <option 
                    v-for="branch in remoteBranches" 
                    :key="branch.name"
                    :value="branch.name"
                  >
                    {{ branch.name }}
                  </option>
                </optgroup>
              </select>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input
                  v-model="checkoutAfterCreate"
                  type="checkbox"
                  class="form-checkbox"
                />
                Switch to new worktree after creation
              </label>
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn btn-secondary" @click="close">
              Cancel
            </button>
            <button 
              class="btn btn-primary"
              @click="handleCreate"
              :disabled="!isValid || isCreating"
            >
              <Icon v-if="isCreating" name="mdi:loading" class="animate-spin" />
              Create Worktree
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSourceControlStore } from '~/stores/source-control';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'create': [data: {
    branchName: string;
    sessionName: string;
    startPoint: string;
    checkout: boolean;
  }];
}>();

const sourceControl = useSourceControlStore();

const branchName = ref('');
const sessionName = ref('');
const startPoint = ref('');
const checkoutAfterCreate = ref(true);
const isCreating = ref(false);

// Get actual data from store
const currentBranch = computed(() => sourceControl.currentBranch || 'main');

const recentCommits = computed(() => {
  // Get last 10 commits from commit history
  return sourceControl.commitHistory.slice(0, 10).map(commit => ({
    hash: commit.hash,
    abbrevHash: commit.hash.substring(0, 7),
    subject: commit.message.split('\n')[0] // First line of commit message
  }));
});

const remoteBranches = computed(() => {
  // Get remote branches (those starting with origin/)
  return sourceControl.branches
    .filter(branch => branch.name.startsWith('origin/'))
    .map(branch => ({ name: branch.name }));
});

const isValid = computed(() => {
  return branchName.value.length > 0 && 
         /^[a-zA-Z0-9/_-]+$/.test(branchName.value);
});

function close() {
  emit('update:modelValue', false);
}

async function handleCreate() {
  if (!isValid.value || isCreating.value) return;

  isCreating.value = true;
  
  try {
    emit('create', {
      branchName: branchName.value,
      sessionName: sessionName.value || branchName.value,
      startPoint: startPoint.value,
      checkout: checkoutAfterCreate.value
    });
    
    // Reset form
    branchName.value = '';
    sessionName.value = '';
    startPoint.value = '';
    
    close();
  } finally {
    isCreating.value = false;
  }
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.dialog-content {
  background: #252526;
  border-radius: 8px;
  width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #cccccc;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #cccccc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #3e3e42;
}

.dialog-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
  margin-bottom: 8px;
}

.form-input,
.form-select {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  background: #3c3c3c;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
}

.form-input:focus,
.form-select:focus {
  border-color: #007acc;
  background: #2d2d30;
}

.form-hint {
  font-size: 12px;
  color: #8b8b8b;
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
}

.form-checkbox {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  cursor: pointer;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #3e3e42;
}

.btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
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

.btn-primary:hover:not(:disabled) {
  background: #1177bb;
}

.btn-primary:disabled {
  background: #3e3e42;
  cursor: default;
}

.btn-secondary {
  background: #3e3e42;
  color: #cccccc;
}

.btn-secondary:hover {
  background: #464647;
}

.btn svg {
  width: 16px;
  height: 16px;
}

/* Dialog transition */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog-content,
.dialog-leave-active .dialog-content {
  transition: transform 0.3s ease;
}

.dialog-enter-from .dialog-content {
  transform: scale(0.9);
}

.dialog-leave-to .dialog-content {
  transform: scale(0.9);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>