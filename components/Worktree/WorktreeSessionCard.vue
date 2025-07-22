<template>
  <div class="session-card">
    <div class="session-header">
      <div class="session-info">
        <Icon name="mdi:briefcase" class="session-icon" />
        <span class="session-name">{{ session.name }}</span>
        <span v-if="session.metadata.experiment" class="badge experiment-badge">
          <Icon name="mdi:flask" />
          Experiment
        </span>
      </div>
      <div class="session-actions">
        <button 
          @click="$emit('delete', session.id)"
          class="icon-button danger"
          title="Delete session"
        >
          <Icon name="mdi:delete" />
        </button>
      </div>
    </div>
    
    <div class="session-content">
      <div class="info-row">
        <Icon name="mdi:source-branch" class="info-icon" />
        <span class="info-text">{{ session.worktree.branch }}</span>
      </div>
      <div class="info-row">
        <Icon name="mdi:clock-outline" class="info-icon" />
        <span class="info-text">Last accessed {{ formatDate(session.lastAccessed) }}</span>
      </div>
      <div v-if="session.metadata.task" class="info-row">
        <Icon name="mdi:checkbox-marked-circle" class="info-icon" />
        <span class="info-text">{{ session.metadata.task }}</span>
      </div>
      <div v-if="session.metadata.tags && session.metadata.tags.length > 0" class="tags">
        <span v-for="tag in session.metadata.tags" :key="tag" class="tag">
          {{ tag }}
        </span>
      </div>
    </div>
    
    <div class="session-footer">
      <button 
        @click="$emit('switch', session.worktree.path)"
        class="action-button primary"
      >
        <Icon name="mdi:folder-open" />
        Switch to Session
      </button>
      <button 
        @click="handleCompare"
        class="action-button secondary"
        title="Compare with main"
      >
        <Icon name="mdi:compare-horizontal" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceStore } from '~/stores/workspace';
import Icon from '~/components/UI/Icon.vue';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
}

interface WorktreeSession {
  id: string;
  name: string;
  worktree: Worktree;
  created: Date;
  lastAccessed: Date;
  metadata: {
    task?: string;
    experiment?: boolean;
    tags?: string[];
  };
}

const props = defineProps<{
  session: WorktreeSession;
}>();

const emit = defineEmits<{
  switch: [path: string];
  delete: [id: string];
  compare: [worktree1: Worktree, worktree2: Worktree];
}>();

const workspaceStore = useWorkspaceStore();

function handleCompare() {
  // Compare with main worktree (first one in list)
  const mainWorktree: Worktree = {
    path: workspaceStore.currentPath,
    branch: 'main',
    commit: '',
    isActive: true,
    isLocked: false,
    prunable: false
  };
  emit('compare', mainWorktree, props.session.worktree);
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
.session-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.session-card:hover {
  border-color: var(--color-border-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.session-icon {
  font-size: 18px;
  color: var(--color-primary);
}

.session-name {
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

.experiment-badge {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.session-actions {
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

.icon-button:hover {
  background: var(--color-background-mute);
  color: var(--color-text);
}

.icon-button.danger:hover {
  background: var(--color-error-soft);
  color: var(--color-error);
}

.session-content {
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

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.tag {
  padding: 2px 8px;
  background: var(--color-background-mute);
  border-radius: 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.session-footer {
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

.action-button.primary:hover {
  background: var(--color-primary-hover);
}

.action-button.secondary {
  background: var(--color-background-mute);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 6px;
  flex: 0 0 auto;
}

.action-button.secondary:hover {
  background: var(--color-background);
  border-color: var(--color-border-hover);
}

/* Dark theme adjustments */
:root {
  --color-primary-hover: #4a9eff;
  --color-border-hover: #484848;
  --color-info-soft: rgba(33, 150, 243, 0.1);
  --color-info: #2196f3;
  --color-error-soft: rgba(244, 67, 54, 0.1);
}
</style>