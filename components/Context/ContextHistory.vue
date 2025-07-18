<template>
  <div class="context-history">
    <div class="history-header">
      <h4>Context History</h4>
      <div class="header-actions">
        <button 
          @click="exportHistory" 
          class="icon-button"
          title="Export context history"
        >
          <Icon name="mdi:download" size="16" />
        </button>
        <button 
          @click="refreshHistory" 
          class="icon-button"
          title="Refresh history"
        >
          <Icon name="mdi:refresh" size="16" />
        </button>
      </div>
    </div>
    
    <div v-if="loading" class="loading-state">
      <Icon name="mdi:loading" size="24" />
      <p>Loading history...</p>
    </div>
    
    <div v-else-if="history.length === 0" class="empty-state">
      <Icon name="mdi:history" size="48" />
      <p>No context history yet</p>
      <span>Context usage will appear here</span>
    </div>
    
    <div v-else class="history-list">
      <div 
        v-for="entry in history" 
        :key="entry.timestamp"
        class="history-entry"
        @click="selectedEntry = selectedEntry === entry ? null : entry"
        :class="{ expanded: selectedEntry === entry }"
      >
        <div class="entry-header">
          <div class="entry-info">
            <span class="entry-query">{{ entry.query }}</span>
            <span class="entry-time">{{ formatTime(entry.timestamp) }}</span>
          </div>
          <div class="entry-stats">
            <span class="token-count">{{ entry.tokens }} tokens</span>
            <Icon 
              :name="selectedEntry === entry ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
              size="16" 
            />
          </div>
        </div>
        
        <div v-if="selectedEntry === entry" class="entry-content">
          <pre>{{ entry.context }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTasksStore } from '~/stores/tasks';

const tasksStore = useTasksStore();
const history = ref<any[]>([]);
const loading = ref(false);
const selectedEntry = ref<any>(null);

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
};

const refreshHistory = async () => {
  if (!tasksStore.projectPath) return;
  
  loading.value = true;
  try {
    const result = await window.electronAPI.workspace.getRecentHistory(tasksStore.projectPath, 20);
    if (result.success) {
      history.value = result.history;
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  } finally {
    loading.value = false;
  }
};

const exportHistory = async () => {
  if (!tasksStore.projectPath) return;
  
  try {
    const result = await window.electronAPI.workspace.exportContext(tasksStore.projectPath);
    if (result.success) {
      // Create download link
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `context-history-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Failed to export history:', error);
  }
};

onMounted(() => {
  refreshHistory();
});
</script>

<style scoped>
.context-history {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #333;
}

.history-header h4 {
  margin: 0;
  font-size: 14px;
  color: #ffffff;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-button:hover {
  background: #3e3e42;
  color: #ffffff;
}

.loading-state, .empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #cccccc;
  gap: 12px;
}

.empty-state span {
  font-size: 12px;
  color: #999999;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-entry {
  background: #252526;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.history-entry:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.history-entry.expanded {
  border-color: #007acc;
}

.entry-header {
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.entry-info {
  flex: 1;
  overflow: hidden;
}

.entry-query {
  display: block;
  color: #ffffff;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.entry-time {
  font-size: 11px;
  color: #999999;
}

.entry-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-count {
  font-size: 11px;
  color: #4ec9b0;
  font-weight: 600;
}

.entry-content {
  padding: 0 12px 12px;
  border-top: 1px solid #333;
  margin-top: 8px;
}

.entry-content pre {
  margin: 8px 0 0 0;
  padding: 8px;
  background: #1e1e1e;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #d4d4d4;
  max-height: 200px;
  overflow-y: auto;
}
</style>