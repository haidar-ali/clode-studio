<template>
  <div class="chat-container">
    <div class="chat-header">
      <h3>Claude Chat</h3>
      <div class="chat-actions">
        <button
          v-if="claudeStatus === 'disconnected'"
          @click="startClaude"
          class="icon-button"
          title="Start Claude"
        >
          <Icon name="mdi:play" />
        </button>
        <button
          v-else-if="claudeStatus === 'connected'"
          @click="stopClaude"
          class="icon-button"
          title="Stop Claude"
        >
          <Icon name="mdi:stop" />
        </button>
        <button
          @click="clearMessages"
          class="icon-button"
          title="Clear chat"
        >
          <Icon name="mdi:delete" />
        </button>
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div v-if="messages.length === 0 && !isWaitingForInput" class="empty-state">
        <Icon name="mdi:robot" size="48" />
        <p>Start a conversation with Claude</p>
        <button v-if="claudeStatus === 'disconnected'" @click="startClaude">
          Connect to Claude
        </button>
      </div>
      
      <ChatMessage
        v-for="message in messages"
        :key="message.id"
        :message="message"
      />
      
      <!-- Interactive prompt display -->
      <div v-if="isWaitingForInput" class="interactive-prompt">
        <div class="prompt-content">
          <pre>{{ pendingPrompt }}</pre>
        </div>
        <div class="prompt-input-container">
          <input
            v-model="promptResponse"
            @keydown.enter="submitPromptResponse"
            @keydown.escape="cancelPrompt"
            placeholder="Enter response (e.g., 1 for Yes, 2 for No)"
            class="prompt-input"
            ref="promptInputRef"
            autofocus
          />
          <button @click="submitPromptResponse" class="prompt-submit">
            Send
          </button>
        </div>
      </div>
    </div>

    <ChatInput
      v-model="currentInput"
      :disabled="claudeStatus !== 'connected' || isProcessing || isWaitingForInput"
      @submit="sendMessage"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useChatStore } from '~/stores/chat';

const chatStore = useChatStore();

const messagesContainer = ref<HTMLElement>();
const promptInputRef = ref<HTMLInputElement>();
const promptResponse = ref('');

const messages = computed(() => chatStore.messages);
const claudeStatus = computed(() => chatStore.claudeStatus);
const isProcessing = computed(() => chatStore.isProcessing);
const isWaitingForInput = computed(() => chatStore.isWaitingForInput);
const pendingPrompt = computed(() => chatStore.pendingPrompt);
const currentInput = computed({
  get: () => chatStore.currentInput,
  set: (value) => chatStore.currentInput = value
});

const startClaude = () => chatStore.startClaude();
const stopClaude = () => chatStore.stopClaude();
const clearMessages = () => chatStore.clearMessages();
const sendMessage = () => {
  if (currentInput.value.trim()) {
    chatStore.sendMessage(currentInput.value);
    currentInput.value = '';
  }
};

const submitPromptResponse = () => {
  if (promptResponse.value.trim()) {
    chatStore.sendPromptResponse(promptResponse.value);
    promptResponse.value = '';
  }
};

const cancelPrompt = () => {
  // Send escape or cancel
  chatStore.sendPromptResponse('\x1b');
  promptResponse.value = '';
};

// Auto-scroll to bottom when new messages arrive
watch(messages, async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}, { deep: true });

// Focus prompt input when waiting for input
watch(isWaitingForInput, async (waiting) => {
  if (waiting) {
    await nextTick();
    promptInputRef.value?.focus();
    // Also scroll to show the prompt
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  }
});
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
}

.chat-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: normal;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chat-actions {
  display: flex;
  gap: 4px;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button:hover {
  background: #3e3e42;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  text-align: center;
}

.empty-state p {
  margin: 16px 0;
}

.empty-state button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.empty-state button:hover {
  background: #005a9e;
}

.interactive-prompt {
  margin: 16px;
  padding: 16px;
  background: #2d2d30;
  border: 1px solid #007acc;
  border-radius: 8px;
}

.prompt-content {
  margin-bottom: 16px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  white-space: pre-wrap;
  color: #d4d4d4;
  line-height: 1.4;
}

.prompt-content pre {
  margin: 0;
  font-family: inherit;
}

.prompt-input-container {
  display: flex;
  gap: 8px;
}

.prompt-input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 8px 12px;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.prompt-input:focus {
  outline: none;
  border-color: #007acc;
}

.prompt-submit {
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}

.prompt-submit:hover {
  background: #005a9e;
}
</style>