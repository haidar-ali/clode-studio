<template>
  <teleport to="body">
    <div class="modal-overlay" @click.self="cancel">
      <div class="modal">
        <div class="modal-header">
          <Icon name="mdi:alert" class="warning-icon" />
          <h3>Delete Worktree</h3>
        </div>
        
        <div class="modal-content">
          <p class="branch-name">
            <Icon name="mdi:source-branch" />
            {{ worktree.branch }}
          </p>
          
          <div v-if="worktree.isOrphaned" class="warning-box">
            <Icon name="mdi:alert-circle" class="alert-icon" />
            <div>
              <p class="warning-title">This is an orphaned worktree</p>
              <p>The worktree directory no longer exists. Git still has a reference to it that needs to be cleaned up.</p>
            </div>
          </div>
          
          <div v-else-if="hasChanges" class="warning-box">
            <Icon name="mdi:alert-circle" class="alert-icon" />
            <div>
              <p class="warning-title">This worktree has uncommitted changes:</p>
              <ul class="change-list">
                <li v-if="changeDetails.staged">{{ changeDetails.staged }} staged file(s)</li>
                <li v-if="changeDetails.modified">{{ changeDetails.modified }} modified file(s)</li>
                <li v-if="changeDetails.untracked">{{ changeDetails.untracked }} untracked file(s)</li>
              </ul>
              <p class="warning-message">
                <strong>All changes will be permanently lost!</strong>
              </p>
            </div>
          </div>
          
          <div v-else-if="isLocked" class="info-box">
            <Icon name="mdi:lock" class="lock-icon" />
            <p>This worktree is locked. Do you want to force remove it?</p>
          </div>
          
          <div v-else class="confirm-box">
            <p>Are you sure you want to remove this worktree?</p>
            <p class="path-info">
              <Icon name="mdi:folder" />
              {{ formatPath(worktree.path) }}
            </p>
          </div>
        </div>
        
        <div class="modal-actions">
          <button @click="cancel" class="btn btn-secondary">
            Cancel
          </button>
          <button 
            @click="confirmDelete" 
            class="btn"
            :class="hasChanges || worktree.isOrphaned ? 'btn-danger' : 'btn-primary'"
          >
            <Icon name="mdi:delete" />
            {{ worktree.isOrphaned ? 'Clean Up' : (hasChanges || isLocked ? 'Force Delete' : 'Delete') }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import Icon from '~/components/Icon.vue';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
  isOrphaned?: boolean;
}

interface ChangeDetails {
  staged?: number;
  modified?: number;
  untracked?: number;
}

const props = defineProps<{
  worktree: Worktree;
  hasChanges?: boolean;
  changeDetails?: ChangeDetails;
  isLocked?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function formatPath(path: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

function confirmDelete() {
  emit('confirm');
}

function cancel() {
  emit('cancel');
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
  z-index: 1000;
}

.modal {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 500px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid #454545;
}

.warning-icon {
  font-size: 24px;
  color: #f48771;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #cccccc;
}

.modal-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.branch-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #cccccc;
}

.warning-box,
.info-box,
.confirm-box {
  padding: 16px;
  border-radius: 6px;
  display: flex;
  gap: 12px;
}

.warning-box {
  background: rgba(244, 135, 113, 0.1);
  border: 1px solid rgba(244, 135, 113, 0.3);
}

.info-box {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
}

.confirm-box {
  background: #2d2d30;
  border: 1px solid #454545;
  flex-direction: column;
  gap: 8px;
}

.alert-icon {
  font-size: 24px;
  color: #f48771;
  flex-shrink: 0;
}

.lock-icon {
  font-size: 24px;
  color: #ffc107;
  flex-shrink: 0;
}

.warning-title {
  margin: 0 0 8px 0;
  font-weight: 600;
  color: #f48771;
}

.change-list {
  margin: 0 0 12px 0;
  padding-left: 20px;
  color: #cccccc;
}

.change-list li {
  margin: 4px 0;
}

.warning-message {
  margin: 0;
  color: #f48771;
  font-size: 14px;
}

.confirm-box p {
  margin: 0;
  color: #cccccc;
}

.path-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #858585;
  font-family: monospace;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #454545;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover {
  background: #1a8cff;
}

.btn-danger {
  background: #f14c4c;
  color: white;
}

.btn-danger:hover {
  background: #ff5555;
}

.btn-secondary {
  background: #3e3e42;
  color: #cccccc;
}

.btn-secondary:hover {
  background: #4e4e52;
}
</style>