<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-backdrop" @click="close">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Workspaces & Worktrees</h3>
            <button class="close-btn" @click="close">
              <Icon name="mdi:close" />
            </button>
          </div>

          <div class="modal-body">
            <!-- Current Workspace -->
            <div class="workspace-section">
              <div class="section-title">Current Workspace</div>
              <div class="workspace-card current">
                <Icon name="mdi:folder-open" class="workspace-icon" />
                <div class="workspace-info">
                  <div class="workspace-name">{{ currentWorkspaceName }}</div>
                  <div class="workspace-path">{{ currentWorkspace }}</div>
                  <div class="workspace-branch">
                    <Icon name="mdi:source-branch" />
                    {{ currentBranch }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Worktrees -->
            <div class="workspace-section" v-if="worktrees.length > 0">
              <div class="section-title">
                Git Worktrees
                <button class="add-btn" @click="showCreateWorktree = true">
                  <Icon name="mdi:plus" />
                  New Worktree
                </button>
              </div>
              <div class="workspace-list">
                <div 
                  v-for="worktree in worktrees"
                  :key="worktree.path"
                  class="workspace-card"
                  :class="{ active: worktree.path === currentWorkspace }"
                  @click="switchToWorktree(worktree)"
                >
                  <Icon name="mdi:source-fork" class="workspace-icon" />
                  <div class="workspace-info">
                    <div class="workspace-name">{{ worktree.branch }}</div>
                    <div class="workspace-path">{{ worktree.path }}</div>
                    <div class="workspace-status">
                      <span v-if="worktree.isLocked" class="status-badge locked">
                        <Icon name="mdi:lock" /> Locked
                      </span>
                      <span v-if="worktree.prunable" class="status-badge prunable">
                        Prunable
                      </span>
                    </div>
                  </div>
                  <div class="workspace-actions">
                    <button 
                      v-if="!worktree.isLocked"
                      class="action-btn"
                      @click.stop="lockWorktree(worktree)"
                      title="Lock Worktree"
                    >
                      <Icon name="mdi:lock-open" />
                    </button>
                    <button 
                      v-else
                      class="action-btn"
                      @click.stop="unlockWorktree(worktree)"
                      title="Unlock Worktree"
                    >
                      <Icon name="mdi:lock" />
                    </button>
                    <button 
                      class="action-btn danger"
                      @click.stop="removeWorktree(worktree)"
                      title="Remove Worktree"
                    >
                      <Icon name="mdi:delete" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent Workspaces -->
            <div class="workspace-section" v-if="recentWorkspaces.length > 0">
              <div class="section-title">Recent Workspaces</div>
              <div class="workspace-list">
                <div 
                  v-for="workspace in recentWorkspaces"
                  :key="workspace.path"
                  class="workspace-card"
                  @click="openWorkspace(workspace)"
                >
                  <Icon name="mdi:history" class="workspace-icon" />
                  <div class="workspace-info">
                    <div class="workspace-name">{{ workspace.name }}</div>
                    <div class="workspace-path">{{ workspace.path }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="modal-actions">
              <button class="action-button" @click="openFolder">
                <Icon name="mdi:folder-open" />
                Open Folder
              </button>
              <button class="action-button" @click="cloneRepository">
                <Icon name="mdi:git" />
                Clone Repository
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Create Worktree Dialog -->
    <CreateWorktreeDialog
      v-model="showCreateWorktree"
      @create="handleCreateWorktree"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useWorkspaceStore } from '~/stores/workspace';
import { useSourceControlStore } from '~/stores/source-control';
import { useWorktreeStore } from '~/stores/worktree';
import CreateWorktreeDialog from './CreateWorktreeDialog.vue';

const props = defineProps<{
  modelValue: boolean;
  currentWorkspace: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'switch': [path: string];
  'create': [data: {
    branchName: string;
    sessionName: string;
    startPoint: string;
    checkout: boolean;
  }];
}>();

const workspace = useWorkspaceStore();
const sourceControl = useSourceControlStore();
const worktreeStore = useWorktreeStore();

const showCreateWorktree = ref(false);

// Get real worktree data from store
const worktrees = computed(() => worktreeStore.worktrees);
const isLoading = computed(() => worktreeStore.isLoading);

// Get recent workspaces from store
const recentWorkspaces = computed(() => {
  const recent = workspace.recentWorkspaces || [];
  // Filter out current workspace
  return recent.filter(w => w.path !== props.currentWorkspace);
});

const currentWorkspaceName = computed(() => 
  props.currentWorkspace.split('/').pop() || 'Workspace'
);

const currentBranch = computed(() => 
  sourceControl.currentBranch || 'main'
);

function close() {
  emit('update:modelValue', false);
}

function switchToWorktree(worktree: any) {
  emit('switch', worktree.path);
  close();
}

function openWorkspace(workspace: any) {
  emit('switch', workspace.path);
  close();
}

async function lockWorktree(worktree: any) {
  try {
    await worktreeStore.lockWorktree(worktree.path, true);
  } catch (error) {
    console.error('Failed to lock worktree:', error);
    alert('Failed to lock worktree');
  }
}

async function unlockWorktree(worktree: any) {
  try {
    await worktreeStore.lockWorktree(worktree.path, false);
  } catch (error) {
    console.error('Failed to unlock worktree:', error);
    alert('Failed to unlock worktree');
  }
}

async function removeWorktree(worktree: any) {
  if (confirm(`Remove worktree "${worktree.branch}"?`)) {
    try {
      await worktreeStore.removeWorktree(worktree.path, false);
    } catch (error) {
      console.error('Failed to remove worktree:', error);
      alert('Failed to remove worktree');
    }
  }
}

function handleCreateWorktree(data: any) {
  emit('create', data);
  showCreateWorktree.value = false;
}

async function openFolder() {
  // Implementation

}

async function cloneRepository() {
  // Implementation

}

// Refresh worktrees when modal opens
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen) {
    await worktreeStore.refreshWorktrees();
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #252526;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
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

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.workspace-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8b8b8b;
  margin-bottom: 12px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: none;
  border: none;
  color: #569cd6;
  font-size: 12px;
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #2a2d2e;
}

.add-btn svg {
  width: 14px;
  height: 14px;
}

.workspace-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.workspace-card:hover {
  background: #2a2d2e;
  border-color: #464647;
}

.workspace-card.current {
  background: #2a2d2e;
  border-color: #007acc;
  cursor: default;
}

.workspace-card.active {
  border-color: #569cd6;
}

.workspace-icon {
  width: 24px;
  height: 24px;
  opacity: 0.8;
  flex-shrink: 0;
}

.workspace-info {
  flex: 1;
  min-width: 0;
}

.workspace-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-path {
  font-size: 12px;
  color: #8b8b8b;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-branch {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #73c991;
}

.workspace-branch svg {
  width: 12px;
  height: 12px;
}

.workspace-status {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 11px;
  border-radius: 3px;
  background: #3e3e42;
}

.status-badge svg {
  width: 10px;
  height: 10px;
}

.status-badge.locked {
  color: #e2c08d;
}

.status-badge.prunable {
  color: #f14c4c;
}

.workspace-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.workspace-card:hover .workspace-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
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

.action-btn:hover {
  background: #3e3e42;
}

.action-btn.danger:hover {
  background: #5a1d1d;
  color: #f14c4c;
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #3e3e42;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-button:hover {
  background: #1177bb;
}

.action-button svg {
  width: 16px;
  height: 16px;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-content {
  transform: scale(0.9);
}

.modal-leave-to .modal-content {
  transform: scale(0.9);
}
</style>