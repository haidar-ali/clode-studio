<template>
  <div class="server-card" :class="{ 'connected': server.status === 'connected' }">
    <div class="server-header">
      <div class="server-info">
        <Icon 
          :name="getStatusIcon(server.status)" 
          :color="getStatusColor(server.status)"
          size="16" 
        />
        <h5 class="server-name">{{ server.name }}</h5>
        <span class="server-type">{{ server.type.toUpperCase() }}</span>
      </div>
      <div class="server-actions">
        <button
          @click="$emit('refresh', server.name)"
          class="action-button"
          title="Refresh details"
        >
          <Icon name="mdi:refresh" size="14" />
        </button>
        <button
          @click="showDetails = !showDetails"
          class="action-button"
          title="Toggle details"
        >
          <Icon :name="showDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'" size="14" />
        </button>
        <button
          @click="$emit('remove', server.name)"
          class="action-button remove"
          title="Remove"
        >
          <Icon name="mdi:delete" size="14" />
        </button>
      </div>
    </div>

    <div v-if="server.error" class="server-error">
      <Icon name="mdi:alert-circle" size="14" />
      <span>{{ server.error }}</span>
    </div>

    <div v-if="showDetails" class="server-details">
      <div class="detail-row">
        <span class="detail-label">Type:</span>
        <span class="detail-value">{{ server.type }}</span>
      </div>
      
      <div v-if="server.type === 'stdio'" class="detail-row">
        <span class="detail-label">Command:</span>
        <span class="detail-value mono">{{ server.command }}</span>
      </div>
      
      <div v-if="server.type === 'stdio' && server.args && server.args.length > 0" class="detail-row">
        <span class="detail-label">Arguments:</span>
        <span class="detail-value mono">{{ server.args.join(' ') }}</span>
      </div>
      
      <div v-if="(server.type === 'sse' || server.type === 'http') && server.url" class="detail-row">
        <span class="detail-label">URL:</span>
        <span class="detail-value mono">{{ server.url }}</span>
      </div>
      
      <div v-if="server.env && Object.keys(server.env).length > 0" class="detail-row">
        <span class="detail-label">Environment:</span>
        <div class="env-list">
          <span v-for="(value, key) in server.env" :key="key" class="env-item">
            {{ key }}={{ value }}
          </span>
        </div>
      </div>
      
      <div v-if="server.lastConnected" class="detail-row">
        <span class="detail-label">Last Connected:</span>
        <span class="detail-value">{{ formatDate(server.lastConnected) }}</span>
      </div>
      
      <div v-if="server.status === 'connected' && server.capabilities" class="detail-row">
        <span class="detail-label">Capabilities:</span>
        <div class="capabilities">
          <span v-if="server.capabilities.resources" class="capability">
            <Icon name="mdi:database" size="12" />
            Resources
          </span>
          <span v-if="server.capabilities.prompts" class="capability">
            <Icon name="mdi:message-text" size="12" />
            Prompts
          </span>
          <span v-if="server.capabilities.tools" class="capability">
            <Icon name="mdi:tools" size="12" />
            Tools
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { MCPServer } from '~/stores/mcp';

const props = defineProps<{
  server: MCPServer;
}>();

const emit = defineEmits<{
  refresh: [name: string];
  remove: [name: string];
}>();

const showDetails = ref(false);

const getStatusIcon = (status: MCPServer['status']) => {
  switch (status) {
    case 'connected': return 'mdi:check-circle';
    case 'connecting': return 'mdi:loading';
    case 'error': return 'mdi:alert-circle';
    default: return 'mdi:circle-outline';
  }
};

const getStatusColor = (status: MCPServer['status']) => {
  switch (status) {
    case 'connected': return '#4ec9b0';
    case 'connecting': return '#e7c547';
    case 'error': return '#f48771';
    default: return '#858585';
  }
};

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  
  if (hours < 1) {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else {
    return new Date(date).toLocaleDateString();
  }
};
</script>

<style scoped>
.server-card {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 12px;
  transition: all 0.2s;
}

.server-card:hover {
  border-color: #6c6c6c;
}

.server-card.connected {
  border-color: #4ec9b0;
  background: rgba(78, 201, 176, 0.05);
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.server-name {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-type {
  font-size: 11px;
  color: #858585;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.server-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.action-button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-button:hover:not(:disabled) {
  background: #3e3e42;
  color: #cccccc;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.connect:hover {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
}

.action-button.disconnect:hover {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.action-button.remove:hover:not(:disabled) {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
}

.action-button.connecting {
  color: #e7c547;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.server-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  background: rgba(244, 135, 113, 0.1);
  border: 1px solid rgba(244, 135, 113, 0.3);
  border-radius: 4px;
  color: #f48771;
  font-size: 12px;
}

.server-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

.detail-label {
  color: #858585;
  min-width: 80px;
  flex-shrink: 0;
}

.detail-value {
  color: #cccccc;
  word-break: break-all;
}

.detail-value.mono {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
}

.env-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.env-item {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  color: #cccccc;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.capabilities {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.capability {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(78, 201, 176, 0.2);
  border: 1px solid rgba(78, 201, 176, 0.4);
  border-radius: 12px;
  color: #4ec9b0;
  font-size: 11px;
}
</style>