<template>
  <teleport to="body">
    <div class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog">
        <h3>Create New Worktree</h3>
        
        <div class="form-group">
          <label>Branch Name</label>
          <div class="input-with-suggest">
            <input
              v-model="branchName"
              @keydown.enter="handleCreate"
              @keydown.escape="$emit('close')"
              placeholder="feature/new-feature or describe your changes..."
              class="form-input"
              ref="branchInput"
            />
            <button 
              @click="suggestBranchName" 
              class="suggest-button"
              :disabled="!branchName.trim() || isGenerating"
              title="Generate branch name with AI"
            >
              <Icon name="mdi:robot" />
            </button>
          </div>
          <p class="form-hint">
            Enter a branch name directly or describe your changes for AI suggestions
          </p>
        </div>
        
        <div class="form-group">
          <label>Session Name (Optional)</label>
          <input
            v-model="sessionName"
            @keydown.enter="handleCreate"
            @keydown.escape="$emit('close')"
            placeholder="e.g., Feature implementation, Bug fix..."
            class="form-input"
          />
          <p class="form-hint">
            Create a named session to easily track this worktree's purpose
          </p>
        </div>
        
        <div class="form-group">
          <label>
            <input
              v-model="createFromCurrent"
              type="checkbox"
              class="form-checkbox"
            />
            Create from current branch
          </label>
          <p class="form-hint">
            If unchecked, worktree will be created from main/master branch
          </p>
        </div>
        
        <div class="dialog-actions">
          <button @click="$emit('close')" class="cancel-button">
            Cancel
          </button>
          <button 
            @click="handleCreate" 
            class="confirm-button" 
            :disabled="!branchName.trim() || isCreating"
          >
            <Icon v-if="isCreating" name="mdi:loading" class="animate-spin" />
            <Icon v-else name="mdi:plus" />
            Create Worktree
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useSourceControlStore } from '~/stores/source-control';
import Icon from '~/components/UI/Icon.vue';

const emit = defineEmits<{
  close: [];
  create: [branchName: string, sessionName?: string];
}>();

const sourceControlStore = useSourceControlStore();

// State
const branchName = ref('');
const sessionName = ref('');
const createFromCurrent = ref(false);
const isGenerating = ref(false);
const isCreating = ref(false);
const branchInput = ref<HTMLInputElement>();

// Focus input on mount
onMounted(() => {
  nextTick(() => {
    branchInput.value?.focus();
  });
});

async function suggestBranchName() {
  if (!branchName.value.trim() || isGenerating.value) return;
  
  try {
    isGenerating.value = true;
    const { useAIGit } = await import('~/composables/useAIGit');
    const aiGit = useAIGit();
    
    const originalName = branchName.value;
    branchName.value = 'Generating suggestion...';
    
    const suggestion = await aiGit.generateBranchName(originalName, {
      style: detectBranchStyle(originalName),
      includeTicketNumber: true
    });
    
    if (suggestion) {
      branchName.value = suggestion;
    } else {
      branchName.value = originalName;
    }
  } catch (error) {
    console.error('Failed to generate branch name:', error);
    branchName.value = branchName.value.replace('Generating suggestion...', '');
  } finally {
    isGenerating.value = false;
  }
}

function detectBranchStyle(description: string): 'feature' | 'bugfix' | 'hotfix' | 'release' | 'chore' {
  const lower = description.toLowerCase();
  if (lower.includes('fix') || lower.includes('bug')) return 'bugfix';
  if (lower.includes('hotfix') || lower.includes('urgent')) return 'hotfix';
  if (lower.includes('release') || lower.includes('version')) return 'release';
  if (lower.includes('chore') || lower.includes('update')) return 'chore';
  return 'feature';
}

async function handleCreate() {
  if (!branchName.value.trim() || isCreating.value) return;
  
  isCreating.value = true;
  try {
    // If not creating from current, checkout main first
    if (!createFromCurrent.value && sourceControlStore.currentBranch !== 'main') {
      await sourceControlStore.switchBranch('main');
    }
    
    emit('create', branchName.value, sessionName.value || undefined);
  } finally {
    isCreating.value = false;
  }
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 24px;
  width: 500px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.dialog h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.input-with-suggest {
  display: flex;
  gap: 8px;
}

.form-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: var(--color-background);
}

.suggest-button {
  padding: 10px 12px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.suggest-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.suggest-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.form-checkbox {
  margin-right: 8px;
  cursor: pointer;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.cancel-button {
  padding: 8px 16px;
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-button:hover {
  background: var(--color-background-soft);
  border-color: var(--color-border-hover);
}

.confirm-button {
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.confirm-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.confirm-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Dark theme adjustments */
:root {
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
}
</style>