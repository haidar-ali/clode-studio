<template>
  <div class="branch-selector">
    <div class="branch-info" @click="toggleDropdown">
      <Icon name="mdi:source-branch" class="branch-icon" />
      <span class="branch-name">{{ currentBranch || 'No branch' }}</span>
      <Icon name="mdi:chevron-down" class="dropdown-icon" :class="{ 'rotate': showDropdown }" />
      
      <!-- Sync status -->
      <div v-if="ahead > 0 || behind > 0" class="sync-status">
        <span v-if="ahead > 0" class="ahead">
          <Icon name="mdi:arrow-up" />
          {{ ahead }}
        </span>
        <span v-if="behind > 0" class="behind">
          <Icon name="mdi:arrow-down" />
          {{ behind }}
        </span>
      </div>
    </div>

    <!-- Dropdown menu -->
    <transition name="dropdown">
      <div v-if="showDropdown" class="dropdown-menu" v-click-outside="closeDropdown">
        <!-- Current branch info -->
        <div v-if="tracking" class="tracking-info">
          <Icon name="mdi:link" />
          <span>{{ tracking }}</span>
        </div>

        <!-- Search/Create input -->
        <div class="dropdown-search">
          <input
            v-model="searchQuery"
            @keydown.enter="handleEnter"
            @keydown.escape="closeDropdown"
            placeholder="Search or create branch..."
            class="search-input"
            ref="searchInput"
          />
        </div>

        <!-- Branch list -->
        <div class="branch-list">
          <div
            v-for="branch in filteredBranches"
            :key="branch.name"
            @click="selectBranch(branch.name)"
            class="branch-item"
            :class="{ 'current': branch.current }"
          >
            <Icon name="mdi:source-branch" class="branch-icon" />
            <span class="branch-name">{{ branch.name }}</span>
            <Icon v-if="branch.current" name="mdi:check" class="current-icon" />
          </div>

          <!-- No branches found -->
          <div v-if="filteredBranches.length === 0 && searchQuery" class="no-branches">
            <p>No branches found</p>
            <button @click="createBranch" class="create-button">
              <Icon name="mdi:plus" />
              Create "{{ searchQuery }}"
            </button>
          </div>
        </div>

        <!-- Quick actions -->
        <div class="dropdown-actions">
          <button @click="showCreateDialog" class="action-button">
            <Icon name="mdi:plus" />
            Create new branch
          </button>
          <button @click="handlePull" class="action-button">
            <Icon name="mdi:arrow-down" />
            Pull from remote
          </button>
          <button @click="handlePush" class="action-button">
            <Icon name="mdi:arrow-up" />
            Push to remote
          </button>
        </div>
      </div>
    </transition>

    <!-- Create branch dialog -->
    <teleport to="body">
      <div v-if="showCreateBranchDialog" class="dialog-overlay" @click.self="closeCreateDialog">
        <div class="dialog">
          <h3>Create New Branch</h3>
          <div class="input-with-suggest">
            <input
              v-model="newBranchName"
              @keydown.enter="confirmCreateBranch"
              @keydown.escape="closeCreateDialog"
              placeholder="Branch name or description..."
              class="dialog-input"
              ref="createInput"
            />
            <button 
              @click="suggestBranchName" 
              class="suggest-button"
              :disabled="!newBranchName.trim()"
              title="Generate branch name with AI"
            >
              <Icon name="mdi:robot" />
            </button>
          </div>
          <p class="dialog-hint">
            Enter a branch name directly or describe your changes for AI suggestions
          </p>
          <div class="dialog-actions">
            <button @click="closeCreateDialog" class="cancel-button">Cancel</button>
            <button @click="confirmCreateBranch" class="confirm-button" :disabled="!newBranchName.trim()">
              Create Branch
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import Icon from '~/components/UI/Icon.vue';

interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  label?: string;
}

const props = defineProps<{
  currentBranch: string;
  branches: BranchInfo[];
  ahead: number;
  behind: number;
  tracking: string | null;
}>();

const emit = defineEmits<{
  switch: [branch: string];
  create: [branch: string];
  pull: [];
  push: [];
}>();

// State
const showDropdown = ref(false);
const showCreateBranchDialog = ref(false);
const searchQuery = ref('');
const newBranchName = ref('');
const searchInput = ref<HTMLInputElement>();
const createInput = ref<HTMLInputElement>();

// Computed
const filteredBranches = computed(() => {
  if (!searchQuery.value) {
    return props.branches;
  }
  
  const query = searchQuery.value.toLowerCase();
  return props.branches.filter(branch => 
    branch.name.toLowerCase().includes(query)
  );
});

// Methods
function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
  if (showDropdown.value) {
    nextTick(() => {
      searchInput.value?.focus();
    });
  }
}

function closeDropdown() {
  showDropdown.value = false;
  searchQuery.value = '';
}

function selectBranch(branchName: string) {
  if (branchName !== props.currentBranch) {
    emit('switch', branchName);
  }
  closeDropdown();
}

function handleEnter() {
  if (filteredBranches.value.length === 1) {
    selectBranch(filteredBranches.value[0].name);
  } else if (filteredBranches.value.length === 0 && searchQuery.value) {
    createBranch();
  }
}

function createBranch() {
  const branchName = searchQuery.value.trim();
  if (branchName) {
    emit('create', branchName);
    closeDropdown();
  }
}

function showCreateDialog() {
  showCreateBranchDialog.value = true;
  closeDropdown();
  nextTick(() => {
    createInput.value?.focus();
  });
}

async function suggestBranchName() {
  if (!newBranchName.value.trim()) return;
  
  try {
    const { useAIGit } = await import('~/composables/useAIGit');
    const aiGit = useAIGit();
    
    const originalName = newBranchName.value;
    newBranchName.value = 'Generating suggestion...';
    
    const suggestion = await aiGit.generateBranchName(originalName, {
      style: detectBranchStyle(originalName),
      includeTicketNumber: true
    });
    
    if (suggestion) {
      newBranchName.value = suggestion;
    } else {
      newBranchName.value = originalName;
    }
  } catch (error) {
    console.error('Failed to generate branch name:', error);
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

function closeCreateDialog() {
  showCreateBranchDialog.value = false;
  newBranchName.value = '';
}

function confirmCreateBranch() {
  const branchName = newBranchName.value.trim();
  if (branchName) {
    emit('create', branchName);
    closeCreateDialog();
  }
}

function handlePull() {
  emit('pull');
  closeDropdown();
}

function handlePush() {
  emit('push');
  closeDropdown();
}

// Click outside directive
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value();
      }
    };
    document.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent);
  }
};
</script>

<style scoped>
.branch-selector {
  position: relative;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-background-mute);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.branch-info:hover {
  background: var(--color-background-soft);
  border-color: var(--color-border-hover);
}

.branch-icon {
  font-size: 18px;
  color: var(--color-primary);
}

.branch-name {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.dropdown-icon {
  font-size: 18px;
  color: var(--color-text-secondary);
  transition: transform 0.2s;
}

.dropdown-icon.rotate {
  transform: rotate(180deg);
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-size: 12px;
}

.ahead {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--color-success);
}

.behind {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--color-warning);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 300px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.tracking-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}

.dropdown-search {
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: var(--color-background);
}

.branch-list {
  max-height: 300px;
  overflow-y: auto;
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.branch-item:hover {
  background: var(--color-background-mute);
}

.branch-item.current {
  background: var(--color-primary-soft);
}

.branch-item .branch-icon {
  font-size: 16px;
  color: var(--color-text-secondary);
}

.branch-item .branch-name {
  flex: 1;
  font-size: 14px;
}

.current-icon {
  font-size: 16px;
  color: var(--color-primary);
}

.no-branches {
  padding: 16px;
  text-align: center;
}

.no-branches p {
  margin: 0 0 12px 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.create-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.create-button:hover {
  background: var(--color-primary-hover);
}

.dropdown-actions {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 0;
  border-top: 1px solid var(--color-border);
}

.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  color: var(--color-text);
  border: none;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.action-button:hover {
  background: var(--color-background-mute);
}

/* Dialog styles */
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
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.dialog h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
}

.input-with-suggest {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.dialog-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
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

.dialog-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 0 0 20px 0;
}

.dialog-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: var(--color-background);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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
}

.confirm-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.confirm-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transitions */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Dark theme adjustments */
:root {
  --color-primary-soft: rgba(66, 184, 221, 0.1);
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
}
</style>