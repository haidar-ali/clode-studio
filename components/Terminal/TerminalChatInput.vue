<template>
  <div class="chat-input-container" v-if="isVisible">
    <div class="chat-input-wrapper">
      <div class="chat-header">
        <Icon name="heroicons:chat-bubble-left-right" />
        <span>Chat Mode</span>
        <button class="close-btn" @click="close">
          <Icon name="heroicons:x-mark" />
        </button>
      </div>
      
      <div class="input-area">
        <textarea
          ref="textareaRef"
          v-model="message"
          @keydown="handleKeydown"
          placeholder="Type your message to Claude... (Enter to send, Shift+Enter for new line, Esc to close)"
          class="chat-textarea"
          :rows="rows"
        ></textarea>
        
        <div class="input-actions">
          <button 
            class="action-btn"
            @click="showPrompts = !showPrompts"
            :class="{ active: showPrompts }"
          >
            <Icon name="heroicons:bookmark" />
            Prompts
          </button>
          
          <button 
            class="action-btn primary"
            @click="sendMessage"
            :disabled="!message.trim()"
          >
            <Icon name="heroicons:paper-airplane" />
            Send
          </button>
        </div>
      </div>
      
      <!-- Quick prompts dropdown -->
      <div v-if="showPrompts" class="prompts-dropdown">
        <div class="prompts-header">
          <span>Quick Prompts</span>
        </div>
        <div 
          v-for="prompt in quickPrompts" 
          :key="prompt.id"
          class="prompt-item"
          @click="usePrompt(prompt)"
        >
          <Icon :name="prompt.icon" />
          <div class="prompt-info">
            <span class="prompt-name">{{ prompt.name }}</span>
            <span class="prompt-desc">{{ prompt.description }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useCheckpoints } from '~/composables/useCheckpoints';

interface QuickPrompt {
  id: string;
  name: string;
  description: string;
  template: string;
  icon: string;
}

const props = defineProps<{
  isVisible: boolean;
  instanceId: string;
}>();

const emit = defineEmits<{
  close: [];
  send: [message: string];
}>();

const message = ref('');
const textareaRef = ref<HTMLTextAreaElement>();
const showPrompts = ref(false);

// Checkpoint system
const { createCheckpoint, isCreatingCheckpoint } = useCheckpoints();

const quickPrompts: QuickPrompt[] = [
  {
    id: 'explain',
    name: 'Explain Code',
    description: 'Explain the selected code or current file',
    template: 'Please explain the following code:\n\n',
    icon: 'heroicons:academic-cap'
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Suggest refactoring improvements',
    template: 'Please refactor the following code to improve readability and performance:\n\n',
    icon: 'heroicons:wrench'
  },
  {
    id: 'debug',
    name: 'Debug Issue',
    description: 'Help debug an error or issue',
    template: 'I\'m experiencing the following issue:\n\n[Describe the issue]\n\nError message:\n```\n[Paste error here]\n```\n\nCan you help me debug this?',
    icon: 'heroicons:bug-ant'
  },
  {
    id: 'test',
    name: 'Write Tests',
    description: 'Generate unit tests for code',
    template: 'Please write comprehensive unit tests for the following code:\n\n',
    icon: 'heroicons:beaker'
  },
  {
    id: 'optimize',
    name: 'Optimize',
    description: 'Optimize code for performance',
    template: 'Please optimize the following code for better performance:\n\n',
    icon: 'heroicons:rocket-launch'
  }
];

// Auto-resize textarea
const rows = computed(() => {
  const lines = message.value.split('\n').length;
  return Math.min(Math.max(lines, 3), 10);
});

// Focus textarea when visible
watch(() => props.isVisible, async (isVisible) => {
  if (isVisible) {
    await nextTick();
    textareaRef.value?.focus();
  }
});

// Listen for input transfer from terminal
const handleTerminalInput = (event: CustomEvent) => {
  if (event.detail.instanceId === props.instanceId && event.detail.input) {
    message.value = event.detail.input;
  }
};

// Listen for append-to-chat event
const handleAppendToChat = (event: CustomEvent) => {
  if (event.detail.instanceId === props.instanceId && event.detail.text) {
    // If there's existing text, add a newline separator
    if (message.value.trim()) {
      message.value += '\n\n';
    }
    message.value += event.detail.text;
    
    // Focus the textarea
    nextTick(() => {
      textareaRef.value?.focus();
      // Move cursor to end
      if (textareaRef.value) {
        textareaRef.value.selectionStart = textareaRef.value.selectionEnd = message.value.length;
      }
    });
  }
};

onMounted(() => {
  window.addEventListener('claude-terminal-input', handleTerminalInput as EventListener);
  window.addEventListener('append-to-claude-chat', handleAppendToChat as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('claude-terminal-input', handleTerminalInput as EventListener);
  window.removeEventListener('append-to-claude-chat', handleAppendToChat as EventListener);
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  } else if (event.key === 'Escape') {
    close();
  }
}

async function sendMessage() {
  if (!message.value.trim() || isCreatingCheckpoint.value) return;
  
  const userMessage = message.value.trim();
  
  try {
    // 🔍 Create checkpoint BEFORE sending to Claude
  
    const checkpointCreated = await createCheckpoint(props.instanceId, userMessage);
    
    if (!checkpointCreated) {
      console.warn('[Checkpoint] Failed to create checkpoint, but continuing with message...');
    }
    
    // Send the message through the Claude API
    await window.electronAPI.claude.send(props.instanceId, userMessage);
    
    // Clear the message
    message.value = '';
    showPrompts.value = false;
    
    // Close the chat input
    close();
  } catch (error) {
    console.error('Failed to send message:', error);
    alert('Failed to send message to Claude');
  }
}

function usePrompt(prompt: QuickPrompt) {
  message.value = prompt.template;
  showPrompts.value = false;
  textareaRef.value?.focus();
}

function close() {
  message.value = '';
  showPrompts.value = false;
  emit('close');
}
</script>

<style scoped>
.chat-input-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  z-index: 100;
}

.chat-input-wrapper {
  position: relative;
  margin: 20px;
  background-color: #252526;
  border: 1px solid #2d2d30;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
  background-color: #2d2d30;
  border-radius: 8px 8px 0 0;
}

.chat-header span {
  flex: 1;
  font-weight: 500;
  color: #cccccc;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: #858585;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background-color: #383838;
  color: #cccccc;
}

.input-area {
  padding: 16px;
}

.chat-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background-color: #3c3c3c;
  color: #cccccc;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  margin-bottom: 12px;
}

.chat-textarea:focus {
  outline: none;
  border-color: #007acc;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #2d2d30;
  border-radius: 6px;
  background-color: #1e1e1e;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.action-btn:hover {
  background-color: #2d2d30;
}

.action-btn.active {
  background-color: #2d2d30;
  border-color: #007acc;
  color: #007acc;
}

.action-btn.primary {
  background-color: #007acc;
  color: white;
  border-color: #007acc;
}

.action-btn.primary:hover:not(:disabled) {
  background-color: #1a7dc4;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.prompts-dropdown {
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  margin-bottom: 8px;
  background-color: #252526;
  border: 1px solid #2d2d30;
  border-radius: 8px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
  max-height: 300px;
  overflow-y: auto;
}

.prompts-header {
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
  font-size: 12px;
  font-weight: 600;
  color: #858585;
}

.prompt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.prompt-item:hover {
  background-color: #2a2d2e;
}

.prompt-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prompt-name {
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
}

.prompt-desc {
  font-size: 11px;
  color: #858585;
}
</style>