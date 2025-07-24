<template>
  <div class="session-resume">
    <div class="session-header">
      <h3>Resume Claude Session</h3>
      <button @click="refreshSessions" class="icon-button" title="Refresh">
        <Icon name="mdi:refresh" size="16" />
      </button>
    </div>

    <div v-if="loading" class="loading">
      <Icon name="mdi:loading" size="24" class="spin" />
      <p>Loading sessions...</p>
    </div>

    <div v-else-if="sessions.length === 0" class="no-sessions">
      <Icon name="mdi:history" size="48" />
      <p>No previous sessions found</p>
      <span>Sessions will appear here after you close a Claude terminal.</span>
    </div>

    <div v-else class="session-list">
      <div
        v-for="session in sortedSessions"
        :key="session.id"
        class="session-card"
        @click="selectSession(session)"
        :class="{ selected: selectedSession?.id === session.id }"
      >
        <div class="session-info">
          <div class="session-title">
            <Icon name="mdi:clock-outline" size="14" />
            {{ formatDate(session.timestamp) }}
          </div>
          <div class="session-details">
            <span class="session-duration">
              <Icon name="mdi:timer-outline" size="12" />
              {{ formatDuration(session.duration) }}
            </span>
            <span class="session-messages">
              <Icon name="mdi:message-text-outline" size="12" />
              {{ session.messageCount }} messages
            </span>
            <span v-if="session.personality" class="session-personality">
              <Icon name="mdi:account-circle-outline" size="12" />
              {{ session.personality }}
            </span>
          </div>
          <div v-if="session.lastMessage" class="session-preview">
            {{ truncateMessage(session.lastMessage) }}
          </div>
        </div>
        <div class="session-actions">
          <button
            @click.stop="resumeSession(session)"
            class="action-button primary"
            :disabled="resuming"
          >
            <Icon name="mdi:play" size="14" />
            Resume
          </button>
          <button
            @click.stop="deleteSession(session)"
            class="action-button danger"
            title="Delete session"
          >
            <Icon name="mdi:delete" size="14" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="selectedSession" class="session-preview-panel">
      <h4>Session Context</h4>
      <div class="context-info">
        <div class="context-item">
          <span class="label">Working Directory:</span>
          <code>{{ selectedSession.workingDirectory }}</code>
        </div>
        <div class="context-item">
          <span class="label">Token Usage:</span>
          <span>{{ selectedSession.tokenUsage }} / {{ selectedSession.maxTokens }}</span>
        </div>
        <div v-if="selectedSession.contextFiles.length > 0" class="context-item">
          <span class="label">Context Files:</span>
          <ul class="file-list">
            <li v-for="file in selectedSession.contextFiles" :key="file">
              {{ file }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

interface Session {
  id: string;
  timestamp: Date;
  duration: number; // in seconds
  messageCount: number;
  personality?: string;
  lastMessage?: string;
  workingDirectory: string;
  tokenUsage: number;
  maxTokens: number;
  contextFiles: string[];
}

const claudeStore = useClaudeInstancesStore();

const sessions = ref<Session[]>([]);
const selectedSession = ref<Session | null>(null);
const loading = ref(true);
const resuming = ref(false);

const sortedSessions = computed(() => {
  return [...sessions.value].sort((a, b) => 
    b.timestamp.getTime() - a.timestamp.getTime()
  );
});

// Load sessions
const loadSessions = async () => {
  loading.value = true;
  try {
    const result = await window.electronAPI.claude.listSessions();
    if (result.success && result.sessions) {
      sessions.value = result.sessions.map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp)
      }));
    }
  } catch (error) {
    console.error('Failed to load sessions:', error);
  } finally {
    loading.value = false;
  }
};

// Refresh sessions
const refreshSessions = () => {
  loadSessions();
};

// Select session
const selectSession = (session: Session) => {
  selectedSession.value = session;
};

// Resume session
const resumeSession = async (session: Session) => {
  resuming.value = true;
  try {
    // Create new Claude instance
    const instance = claudeStore.createInstance(`Resumed: ${formatDate(session.timestamp)}`);
    
    // Set personality if it was set
    if (session.personality) {
      const personality = claudeStore.personalities.find(p => p.name === session.personality);
      if (personality) {
        claudeStore.updateInstancePersonality(instance.id, personality.id);
      }
    }
    
    // Resume the session
    const result = await window.electronAPI.claude.resumeSession(instance.id, session.id);
    
    if (result.success) {
      // Switch to the new instance
      claudeStore.setActiveInstance(instance.id);
      
      // Close the modal
      window.dispatchEvent(new Event('close-session-browser'));
    }
  } catch (error) {
    console.error('Failed to resume session:', error);
  } finally {
    resuming.value = false;
  }
};

// Delete session
const deleteSession = async (session: Session) => {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  
  try {
    // Remove from local list immediately
    const index = sessions.value.findIndex(s => s.id === session.id);
    if (index !== -1) {
      sessions.value.splice(index, 1);
    }
    
    if (selectedSession.value?.id === session.id) {
      selectedSession.value = null;
    }
    
    // Note: Would need backend API to actually delete session
    
  } catch (error) {
    console.error('Failed to delete session:', error);
    // Reload on error
    loadSessions();
  }
};

// Format date
const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }
};

// Format duration
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

// Truncate message
const truncateMessage = (message: string) => {
  const maxLength = 100;
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + '...';
};

onMounted(() => {
  loadSessions();
});
</script>

<style scoped>
.session-resume {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.session-header h3 {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}

.icon-button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.icon-button:hover {
  background: #2d2d30;
  color: #cccccc;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #858585;
  gap: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.no-sessions {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px;
  color: #858585;
  gap: 8px;
}

.no-sessions p {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.no-sessions span {
  font-size: 12px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-card {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.session-card:hover {
  background: #2d2d30;
  border-color: #5a5a5a;
}

.session-card.selected {
  border-color: #007acc;
  background: #2d2d30;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
  margin-bottom: 4px;
}

.session-details {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: #858585;
  margin-bottom: 6px;
}

.session-details span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-preview {
  font-size: 12px;
  color: #858585;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.action-button {
  background: #2d2d30;
  border: 1px solid #454545;
  color: #cccccc;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.action-button:hover {
  background: #3e3e42;
}

.action-button.primary {
  background: #007acc;
  border-color: #007acc;
  color: white;
}

.action-button.primary:hover {
  background: #005a9e;
}

.action-button.danger {
  background: none;
  border: none;
  color: #f48771;
  padding: 4px;
}

.action-button.danger:hover {
  background: #5a1d1d;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.session-preview-panel {
  margin-top: 16px;
  padding: 12px;
  background: #252526;
  border: 1px solid #454545;
  border-radius: 6px;
}

.session-preview-panel h4 {
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #858585;
}

.context-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-item {
  font-size: 12px;
}

.label {
  color: #858585;
  margin-right: 8px;
}

code {
  background: #1e1e1e;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

.file-list {
  margin: 4px 0 0 16px;
  padding: 0;
  list-style: none;
  font-size: 11px;
  color: #cccccc;
}

.file-list li {
  padding: 2px 0;
  font-family: 'Consolas', 'Monaco', monospace;
}
</style>