<template>
  <div class="context-checkpoints">
    <div class="checkpoints-header">
      <h4>Context Checkpoints</h4>
      <button 
        @click="createNewCheckpoint" 
        class="create-button"
        :disabled="creating"
      >
        <Icon name="mdi:plus" size="16" />
        Create Checkpoint
      </button>
    </div>
    
    <div v-if="checkpoints.length === 0" class="empty-state">
      <Icon name="mdi:bookmark-outline" size="48" />
      <p>No checkpoints yet</p>
      <span>Create checkpoints to save context states</span>
    </div>
    
    <div v-else class="checkpoints-list">
      <div 
        v-for="checkpoint in checkpoints" 
        :key="checkpoint.id"
        class="checkpoint-item"
      >
        <div class="checkpoint-header">
          <h5>{{ checkpoint.name }}</h5>
          <span class="checkpoint-time">{{ formatTime(checkpoint.timestamp) }}</span>
        </div>
        
        <div class="checkpoint-info">
          <span class="message-info">
            <Icon name="mdi:message-text" size="14" />
            {{ checkpoint.messages?.length || 0 }} messages
          </span>
          <span v-if="checkpoint.description" class="description">
            {{ checkpoint.description }}
          </span>
        </div>
        
        <div class="checkpoint-actions">
          <button 
            @click="restoreCheckpoint(checkpoint.id)"
            class="action-button restore"
            title="Restore this checkpoint"
          >
            <Icon name="mdi:restore" size="16" />
            Restore
          </button>
          <button 
            @click="deleteCheckpoint(checkpoint.id)"
            class="action-button delete"
            title="Delete this checkpoint"
          >
            <Icon name="mdi:delete" size="16" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Create Checkpoint Dialog -->
    <div v-if="showCreateDialog" class="create-dialog">
      <div class="dialog-content">
        <h5>Create New Checkpoint</h5>
        <input 
          v-model="newCheckpointName"
          placeholder="Checkpoint name..."
          class="input-field"
          @keyup.enter="confirmCreateCheckpoint"
        />
        <textarea 
          v-model="newCheckpointDescription"
          placeholder="Description (optional)..."
          class="textarea-field"
          rows="3"
        ></textarea>
        <div class="dialog-actions">
          <button @click="cancelCreateCheckpoint" class="cancel-button">
            Cancel
          </button>
          <button 
            @click="confirmCreateCheckpoint" 
            class="confirm-button"
            :disabled="!newCheckpointName.trim()"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useContextStore } from '~/stores/context';

const contextStore = useContextStore();
const checkpoints = computed(() => contextStore.checkpoints);

const creating = ref(false);
const showCreateDialog = ref(false);
const newCheckpointName = ref('');
const newCheckpointDescription = ref('');

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

const createNewCheckpoint = () => {
  showCreateDialog.value = true;
  newCheckpointName.value = `Checkpoint ${new Date().toLocaleTimeString()}`;
  newCheckpointDescription.value = '';
};

const confirmCreateCheckpoint = async () => {
  if (!newCheckpointName.value.trim()) return;
  
  creating.value = true;
  try {
    // Get current messages from chat store
    const { useChatStore } = await import('~/stores/chat');
    const chatStore = useChatStore();
    const messages = chatStore.messages;
    
    await contextStore.createCheckpoint(
      newCheckpointName.value,
      messages,
      newCheckpointDescription.value || undefined
    );
    
    showCreateDialog.value = false;
    newCheckpointName.value = '';
    newCheckpointDescription.value = '';
  } catch (error) {
    console.error('Failed to create checkpoint:', error);
  } finally {
    creating.value = false;
  }
};

const cancelCreateCheckpoint = () => {
  showCreateDialog.value = false;
  newCheckpointName.value = '';
  newCheckpointDescription.value = '';
};

const restoreCheckpoint = async (checkpointId: string) => {
  try {
    const checkpoint = contextStore.restoreCheckpoint(checkpointId);
    if (checkpoint) {
      
      // TODO: Also restore messages to chat
    }
  } catch (error) {
    console.error('Failed to restore checkpoint:', error);
  }
};

const deleteCheckpoint = async (checkpointId: string) => {
  if (confirm('Are you sure you want to delete this checkpoint?')) {
    try {
      await contextStore.deleteCheckpoint(checkpointId);
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
    }
  }
};
</script>

<style scoped>
.context-checkpoints {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.checkpoints-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.checkpoints-header h4 {
  margin: 0;
  font-size: 14px;
  color: #ffffff;
}

.create-button {
  background: #0e8a16;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.create-button:hover:not(:disabled) {
  background: #0fa418;
}

.create-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
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

.checkpoints-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkpoint-item {
  background: #252526;
  border-radius: 6px;
  padding: 12px;
  border: 1px solid #333;
  transition: all 0.2s;
}

.checkpoint-item:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.checkpoint-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.checkpoint-header h5 {
  margin: 0;
  font-size: 13px;
  color: #ffffff;
}

.checkpoint-time {
  font-size: 11px;
  color: #999999;
}

.checkpoint-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.message-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #4ec9b0;
}

.description {
  font-size: 12px;
  color: #cccccc;
  font-style: italic;
}

.checkpoint-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  background: #3c3c3c;
  color: #cccccc;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.action-button:hover {
  background: #4e4e4e;
  color: #ffffff;
}

.action-button.restore {
  background: #007acc;
  color: white;
}

.action-button.restore:hover {
  background: #005a9e;
}

.action-button.delete:hover {
  background: #cd3131;
  color: white;
}

/* Create Dialog */
.create-dialog {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog-content {
  background: #252526;
  border-radius: 8px;
  padding: 20px;
  width: 90%;
  max-width: 400px;
  border: 1px solid #333;
}

.dialog-content h5 {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #ffffff;
}

.input-field, .textarea-field {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
  margin-bottom: 12px;
}

.input-field:focus, .textarea-field:focus {
  outline: none;
  border-color: #007acc;
}

.textarea-field {
  resize: vertical;
  min-height: 60px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.cancel-button, .confirm-button {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-button {
  background: #3c3c3c;
  color: #cccccc;
}

.cancel-button:hover {
  background: #4e4e4e;
}

.confirm-button {
  background: #0e8a16;
  color: white;
}

.confirm-button:hover:not(:disabled) {
  background: #0fa418;
}

.confirm-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>