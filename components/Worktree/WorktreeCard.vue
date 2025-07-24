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
      <!-- Session information -->
      <div v-if="session" class="session-info">
        <div class="info-row">
          <Icon name="mdi:bookmark" class="info-icon" />
          <span class="info-text session-name">{{ session.name }}</span>
        </div>
        <div v-if="session.metadata?.description" class="info-row">
          <Icon name="mdi:text" class="info-icon" />
          <span class="info-text description">{{ session.metadata.description }}</span>
        </div>
        <div v-if="session.lastAccessed" class="info-row">
          <Icon name="mdi:clock-check" class="info-icon" />
          <span class="info-text">Last accessed {{ formatDate(session.lastAccessed) }}</span>
        </div>
      </div>
    </div>
    
    <div class="card-footer">
      <div v-if="worktree.isActive" class="active-indicator">
        <Icon name="mdi:check-circle" />
        Currently Active
      </div>
      
      <!-- Session actions -->
      <button 
        v-if="session"
        @click="$emit('delete-session', session.id)"
        class="action-button secondary"
        title="Delete session"
      >
        <Icon name="mdi:delete" />
        Delete Session
      </button>
      <button 
        v-else
        @click="$emit('create-session', worktree)"
        class="action-button secondary"
        title="Create a named session for this worktree"
      >
        <Icon name="mdi:plus" />
        Create Session
      </button>
    </div>
  </div>
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
  created?: Date;
  description?: string;
  linkedCheckpoint?: string;
}

interface Session {
  id: string;
  name: string;
  worktree: Worktree;
  created: Date;
  lastAccessed: Date;
  metadata?: {
    description?: string;
  };
}

const props = defineProps<{
  worktree: Worktree;
  session?: Session;
}>();

const emit = defineEmits<{
  switch: [path: string];
  remove: [worktree: Worktree];
  lock: [worktree: Worktree, lock: boolean];
  'create-session': [worktree: Worktree];
  'delete-session': [sessionId: string];
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
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.worktree-card:hover {
  border-color: #007acc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.worktree-card.active {
  border-color: #007acc;
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
  color: #007acc;
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
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.locked-badge {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.prunable-badge {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
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
  color: #858585;
  transition: all 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: #3e3e42;
  color: #cccccc;
}

.icon-button.danger:hover:not(:disabled) {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
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
  color: #858585;
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
  background: #3e3e42;
  padding: 2px 6px;
  border-radius: 4px;
}

.card-footer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #454545;
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
  background: #007acc;
  color: white;
}

.action-button.primary:hover:not(:disabled) {
  background: #1a8cff;
}

.action-button.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.secondary {
  background: #3e3e42;
  color: #cccccc;
  border: 1px solid #454545;
}

.action-button.secondary:hover {
  background: #252526;
  border-color: #007acc;
}

.active-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #4ec9b0;
  font-weight: 500;
  padding: 8px 16px;
  background: rgba(78, 201, 176, 0.2);
  border-radius: 4px;
}

.session-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #007acc;
  font-size: 13px;
  padding: 8px 16px;
  background: rgba(0, 122, 204, 0.1);
  border-radius: 4px;
}

.info-text.session-name {
  color: #007acc;
  font-weight: 500;
}

.session-info {
  background: #252526;
  padding: 8px;
  margin: 8px 0;
  border-radius: 4px;
  border: 1px solid #3e3e42;
}

.session-info .info-row {
  margin-bottom: 4px;
}

.session-info .info-row:last-child {
  margin-bottom: 0;
}

.session-info .session-name {
  font-weight: 500;
  color: #4ec9b0;
}

.session-info .description {
  font-style: italic;
  opacity: 0.9;
}

.card-footer {
  align-items: center;
  flex-wrap: wrap;
}

</style>