<template>
  <div class="worktree-card" :class="{ 'active': worktree.isActive }">
    <div class="card-header">
      <div class="branch-info">
        <Icon name="mdi:source-branch" class="branch-icon" />
        <span class="branch-name">{{ worktree.branch }}</span>
        <span v-if="worktree.isActive" class="badge active-badge">Active</span>
        <span v-if="worktree.isLocked" class="badge locked-badge">
          <Icon name="mdi:lock" />
          Locked
        </span>
        <span v-if="worktree.prunable" class="badge prunable-badge">Prunable</span>
      </div>
      <div class="card-actions">
        <button 
          @click="$emit('lock', worktree, !worktree.isLocked)"
          class="icon-button"
          :title="worktree.isLocked ? 'Unlock' : 'Lock'"
        >
          <Icon :name="worktree.isLocked ? 'mdi:lock-open' : 'mdi:lock'" />
        </button>
        <button 
          @click="$emit('remove', worktree)"
          class="icon-button danger"
          title="Remove worktree"
          :disabled="worktree.isActive"
        >
          <Icon name="mdi:delete" />
        </button>
      </div>
    </div>
    
    <div class="card-content">
      <div class="info-row">
        <Icon name="mdi:folder" class="info-icon" />
        <span class="info-text">{{ formatPath(worktree.path) }}</span>
      </div>
      <div class="info-row">
        <Icon name="mdi:source-commit" class="info-icon" />
        <span class="info-text commit">{{ worktree.commit.substring(0, 8) }}</span>
      </div>
      <div v-if="worktree.created" class="info-row">
        <Icon name="mdi:clock-outline" class="info-icon" />
        <span class="info-text">Created {{ formatDate(worktree.created) }}</span>
      </div>
      <div v-if="worktree.description" class="info-row">
        <Icon name="mdi:text" class="info-icon" />
        <span class="info-text">{{ worktree.description }}</span>
      </div>
    </div>
    
    <div class="card-footer">
      <button 
        @click="$emit('switch', worktree.path)"
        class="action-button primary"
        :disabled="worktree.isActive"
      >
        <Icon name="mdi:folder-open" />
        Switch to Worktree
      </button>
      <button 
        @click="$emit('create-session', worktree)"
        class="action-button secondary"
      >
        <Icon name="mdi:plus" />
        Create Session
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '~/components/UI/Icon.vue';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
  created?: Date;
  description?: string;
  linkedCheckpoint?: string;
}

defineProps<{
  worktree: Worktree;
}>();

defineEmits<{
  switch: [path: string];
  remove: [worktree: Worktree];
  lock: [worktree: Worktree, lock: boolean];
  'create-session': [worktree: Worktree];
}>();

function formatPath(path: string): string {
  // Show relative path from home directory
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}
</script>

<style scoped>
.worktree-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.worktree-card:hover {
  border-color: var(--color-border-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.worktree-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.branch-icon {
  font-size: 18px;
  color: var(--color-primary);
}

.branch-name {
  font-weight: 600;
  font-size: 15px;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 4px;
}

.active-badge {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.locked-badge {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.prunable-badge {
  background: var(--color-error-soft);
  color: var(--color-error);
}

.card-actions {
  display: flex;
  gap: 4px;
}

.icon-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: var(--color-background-mute);
  color: var(--color-text);
}

.icon-button.danger:hover:not(:disabled) {
  background: var(--color-error-soft);
  color: var(--color-error);
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.info-icon {
  font-size: 16px;
  opacity: 0.7;
}

.info-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commit {
  font-family: monospace;
  background: var(--color-background-mute);
  padding: 2px 6px;
  border-radius: 4px;
}

.card-footer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.action-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-button.primary {
  background: var(--color-primary);
  color: white;
}

.action-button.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.action-button.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.secondary {
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.action-button.secondary:hover {
  background: var(--color-background);
  border-color: var(--color-border-hover);
}

/* Dark theme adjustments */
:root {
  --color-primary-soft: rgba(66, 184, 221, 0.1);
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
  --color-success-soft: rgba(67, 176, 42, 0.1);
  --color-warning-soft: rgba(255, 152, 0, 0.1);
  --color-error-soft: rgba(244, 67, 54, 0.1);
}
</style>