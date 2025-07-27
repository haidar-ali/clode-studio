<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-4">Create New Branch</h3>
          
          <form @submit.prevent="handleSubmit">
            <!-- Branch name -->
            <div class="form-control w-full mb-4">
              <label class="label">
                <span class="label-text">Branch name</span>
              </label>
              <input 
                type="text" 
                placeholder="feature/new-feature"
                class="input input-bordered w-full"
                v-model="branchName"
                ref="branchInput"
                required
                pattern="[a-zA-Z0-9/_-]+"
              />
              <label class="label">
                <span class="label-text-alt text-error" v-if="error">{{ error }}</span>
                <span class="label-text-alt" v-else>Use letters, numbers, /, _, and -</span>
              </label>
            </div>

            <!-- Start point -->
            <div class="form-control w-full mb-6">
              <label class="label">
                <span class="label-text">Create from</span>
              </label>
              <select class="select select-bordered w-full" v-model="startPoint">
                <option value="">Current branch ({{ currentBranch }})</option>
                <option value="HEAD">Current commit (HEAD)</option>
                <optgroup label="Recent commits">
                  <option 
                    v-for="commit in recentCommits" 
                    :key="commit.hash"
                    :value="commit.hash"
                  >
                    {{ commit.abbrevHash }} - {{ commit.subject }}
                  </option>
                </optgroup>
              </select>
            </div>

            <!-- Actions -->
            <div class="modal-action">
              <button 
                type="button" 
                class="btn btn-ghost"
                @click="cancel"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                class="btn btn-primary"
                :disabled="!isValid || isCreating"
              >
                <Icon v-if="isCreating" name="mdi:loading" class="w-4 h-4 animate-spin mr-2" />
                Create Branch
              </button>
            </div>
          </form>
        </div>
        
        <div class="modal-backdrop" @click="cancel"></div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { GitTimelineCommit } from '~/utils/git-timeline-types';

const props = defineProps<{
  modelValue: boolean;
  currentBranch?: string;
  recentCommits?: GitTimelineCommit[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'create': [branchName: string, startPoint?: string];
}>();

const branchInput = ref<HTMLInputElement | null>(null);
const branchName = ref('');
const startPoint = ref('');
const error = ref('');
const isCreating = ref(false);

const isValid = computed(() => {
  return branchName.value.length > 0 && 
         /^[a-zA-Z0-9/_-]+$/.test(branchName.value) &&
         !error.value;
});

// Validate branch name
watch(branchName, (name) => {
  if (!name) {
    error.value = '';
    return;
  }

  if (!/^[a-zA-Z0-9/_-]+$/.test(name)) {
    error.value = 'Invalid characters in branch name';
  } else if (name.startsWith('/') || name.endsWith('/')) {
    error.value = 'Branch name cannot start or end with /';
  } else if (name.includes('//')) {
    error.value = 'Branch name cannot contain //';
  } else {
    error.value = '';
  }
});

// Focus input when modal opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      branchInput.value?.focus();
    });
  }
});

async function handleSubmit() {
  if (!isValid.value) return;

  isCreating.value = true;
  
  try {
    await emit('create', branchName.value, startPoint.value || undefined);
    
    // Reset form
    branchName.value = '';
    startPoint.value = '';
    error.value = '';
    
    // Close modal
    emit('update:modelValue', false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create branch';
  } finally {
    isCreating.value = false;
  }
}

function cancel() {
  branchName.value = '';
  startPoint.value = '';
  error.value = '';
  emit('update:modelValue', false);
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-box {
  transform: scale(0.9);
}

.modal-leave-to .modal-box {
  transform: scale(0.9);
}
</style>