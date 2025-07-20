<template>
  <div class="chat-mode">
    <div class="chat-container">
      <!-- Messages -->
      <div class="messages-container" ref="messagesContainer">
        <div 
          v-for="message in messages" 
          :key="message.id"
          :class="['message', message.role]"
        >
          <div class="message-header">
            <Icon :name="message.role === 'user' ? 'heroicons:user' : 'heroicons:sparkles'" />
            <span class="role">{{ message.role === 'user' ? 'You' : 'Claude' }}</span>
            <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
          </div>
          <div class="message-content" v-html="renderMessage(message.content)"></div>
        </div>
        
        <div v-if="isStreaming" class="message assistant">
          <div class="message-header">
            <Icon name="heroicons:sparkles" />
            <span class="role">Claude</span>
          </div>
          <div class="message-content">
            <span class="typing-indicator">●●●</span>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="chat-input-container">
        <div class="input-toolbar">
          <button 
            class="toolbar-btn"
            @click="showResourceSelector = !showResourceSelector"
            :class="{ active: showResourceSelector }"
          >
            <Icon name="heroicons:paper-clip" />
            Attach
          </button>
          <button 
            class="toolbar-btn"
            @click="showPromptTemplates = !showPromptTemplates"
          >
            <Icon name="heroicons:bookmark" />
            Templates
          </button>
          <button 
            class="toolbar-btn"
            @click="clearChat"
          >
            <Icon name="heroicons:trash" />
            Clear
          </button>
        </div>
        
        <div class="input-area">
          <textarea
            v-model="currentMessage"
            @keydown.enter.prevent="handleEnter"
            placeholder="Type your message... (Shift+Enter for new line)"
            class="chat-input"
            :disabled="isStreaming"
            ref="inputRef"
          ></textarea>
          <button 
            @click="sendMessage"
            :disabled="!currentMessage.trim() || isStreaming"
            class="send-btn"
          >
            <Icon name="heroicons:paper-airplane" />
          </button>
        </div>
        
        <!-- Attached resources -->
        <div v-if="attachedResources.length > 0" class="attached-resources">
          <div 
            v-for="(resource, index) in attachedResources" 
            :key="`${resource.type}-${resource.id}`"
            class="resource-chip"
          >
            <Icon :name="getResourceIcon(resource.type)" />
            <span>{{ resource.name }}</span>
            <button @click="removeResource(index)" class="remove-btn">
              <Icon name="heroicons:x-mark" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Resource Selector Modal -->
    <div v-if="showResourceSelector" class="modal-overlay" @click.self="showResourceSelector = false">
      <div class="modal-content">
        <h3>Attach Resources</h3>
        <ResourceSelector @add="addResource" />
        <div class="modal-actions">
          <button class="btn-secondary" @click="showResourceSelector = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import { useKnowledgeStore } from '~/stores/knowledge';
import type { ResourceReference } from '~/stores/prompt-engineering';
import ResourceSelector from './ResourceSelector.vue';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  resources?: ResourceReference[];
}

const claudeStore = useClaudeInstancesStore();
const promptStore = usePromptEngineeringStore();

const messages = ref<ChatMessage[]>([]);
const currentMessage = ref('');
const attachedResources = ref<ResourceReference[]>([]);
const isStreaming = ref(false);
const showResourceSelector = ref(false);
const showPromptTemplates = ref(false);
const messagesContainer = ref<HTMLElement>();
const inputRef = ref<HTMLTextAreaElement>();

let outputBuffer = '';
let cleanupHandlers: (() => void)[] = [];

// Configure marked for syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (_) {}
    }
    return hljs.highlightAuto(code).value;
  }
});

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function renderMessage(content: string): string {
  return marked(content);
}

function getResourceIcon(type: string): string {
  const icons: Record<string, string> = {
    file: 'heroicons:document',
    knowledge: 'heroicons:book-open',
    hook: 'heroicons:bolt',
    mcp: 'heroicons:server',
    command: 'heroicons:command-line'
  };
  return icons[type] || 'heroicons:folder';
}

async function sendMessage() {
  if (!currentMessage.value.trim() || isStreaming.value) return;
  
  const instanceId = claudeStore.activeInstanceId;
  if (!instanceId) {
    alert('No active Claude instance. Please start a Claude terminal first.');
    return;
  }

  // Add user message
  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: currentMessage.value,
    timestamp: new Date(),
    resources: [...attachedResources.value]
  };
  messages.value.push(userMessage);

  // Build the full prompt with resources
  let fullPrompt = currentMessage.value;
  
  // Add resource context if any
  if (attachedResources.value.length > 0) {
    fullPrompt = await buildPromptWithResources(currentMessage.value, attachedResources.value);
  }

  // Clear input and resources
  currentMessage.value = '';
  attachedResources.value = [];
  isStreaming.value = true;
  outputBuffer = '';

  // Scroll to bottom
  await nextTick();
  scrollToBottom();

  try {
    // Send to Claude
    await window.electronAPI.claude.send(instanceId, fullPrompt);
  } catch (error) {
    console.error('Failed to send message:', error);
    isStreaming.value = false;
    alert('Failed to send message to Claude');
  }
}

async function buildPromptWithResources(message: string, resources: ResourceReference[]): Promise<string> {
  let prompt = message;
  
  // Group resources by type
  const fileResources = resources.filter(r => r.type === 'file');
  const knowledgeResources = resources.filter(r => r.type === 'knowledge');
  const otherResources = resources.filter(r => !['file', 'knowledge'].includes(r.type));
  
  // Add file contents
  if (fileResources.length > 0) {
    prompt += '\n\n--- Attached Files ---\n';
    for (const file of fileResources) {
      try {
        const content = await window.electronAPI.fs.readFile(file.path!);
        prompt += `\n### ${file.name}\n\`\`\`\n${content}\n\`\`\`\n`;
      } catch (error) {
        console.error(`Failed to read file ${file.path}:`, error);
      }
    }
  }
  
  // Add knowledge entries
  if (knowledgeResources.length > 0) {
    const knowledgeStore = useKnowledgeStore();
    prompt += '\n\n--- Knowledge Context ---\n';
    for (const knowledge of knowledgeResources) {
      const entry = knowledgeStore.entries.find(e => e.id === knowledge.id);
      if (entry) {
        prompt += `\n### ${entry.title}\n${entry.content}\n`;
      }
    }
  }
  
  // Add other resources as metadata
  if (otherResources.length > 0) {
    prompt += '\n\n--- Additional Context ---\n';
    for (const resource of otherResources) {
      prompt += `- ${resource.type}: ${resource.name}\n`;
    }
  }
  
  return prompt;
}

function handleEnter(event: KeyboardEvent) {
  if (!event.shiftKey) {
    sendMessage();
  } else {
    // Insert newline
    const start = inputRef.value!.selectionStart;
    const end = inputRef.value!.selectionEnd;
    const value = currentMessage.value;
    currentMessage.value = value.substring(0, start) + '\n' + value.substring(end);
    
    // Move cursor after newline
    nextTick(() => {
      inputRef.value!.selectionStart = inputRef.value!.selectionEnd = start + 1;
    });
  }
}

function addResource(resource: ResourceReference) {
  // Avoid duplicates
  const exists = attachedResources.value.some(
    r => r.type === resource.type && r.id === resource.id
  );
  
  if (!exists) {
    attachedResources.value.push(resource);
  }
  
  showResourceSelector.value = false;
}

function removeResource(index: number) {
  attachedResources.value.splice(index, 1);
}

function clearChat() {
  if (confirm('Clear all messages?')) {
    messages.value = [];
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function handleClaudeOutput(data: string) {
  outputBuffer += data;
  
  // Update or create assistant message
  if (messages.value.length === 0 || messages.value[messages.value.length - 1].role !== 'assistant') {
    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: outputBuffer,
      timestamp: new Date()
    });
  } else {
    messages.value[messages.value.length - 1].content = outputBuffer;
  }
  
  scrollToBottom();
}

function handleClaudeExit() {
  isStreaming.value = false;
  outputBuffer = '';
}

onMounted(() => {
  const instanceId = claudeStore.activeInstanceId;
  if (instanceId) {
    // Set up listeners for Claude output
    cleanupHandlers.push(
      window.electronAPI.claude.onOutput(instanceId, handleClaudeOutput)
    );
    cleanupHandlers.push(
      window.electronAPI.claude.onExit(instanceId, handleClaudeExit)
    );
  }
  
  // Focus input
  inputRef.value?.focus();
});

onUnmounted(() => {
  // Clean up listeners
  cleanupHandlers.forEach(cleanup => cleanup());
});
</script>

<style scoped>
.chat-mode {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background);
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message {
  margin-bottom: 24px;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.message-header svg {
  width: 16px;
  height: 16px;
}

.message.user .message-header {
  color: var(--color-primary);
}

.message.assistant .message-header {
  color: #10b981;
}

.role {
  font-weight: 600;
}

.timestamp {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.message-content {
  padding-left: 24px;
  line-height: 1.6;
}

.message-content :deep(p) {
  margin: 0 0 12px 0;
}

.message-content :deep(pre) {
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
}

.message-content :deep(code) {
  background-color: var(--color-background-soft);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
}

.typing-indicator {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.5;
  }
  40% {
    opacity: 1;
  }
}

.chat-input-container {
  border-top: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
}

.input-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background-color: var(--color-background-mute);
  color: var(--color-text);
}

.toolbar-btn.active {
  background-color: var(--color-primary);
  color: white;
}

.input-area {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px;
}

.chat-input {
  flex: 1;
  min-height: 60px;
  max-height: 200px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
}

.chat-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.chat-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background-color: var(--color-primary);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attached-resources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 12px 12px;
}

.resource-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  font-size: 12px;
}

.resource-chip .remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 50%;
}

.resource-chip .remove-btn:hover {
  background-color: var(--color-background-soft);
  color: var(--color-danger);
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  background-color: var(--color-background);
  color: var(--color-text);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background-color: var(--color-background-soft);
}

/* Scrollbar styling */
.messages-container::-webkit-scrollbar {
  width: 8px;
}

.messages-container::-webkit-scrollbar-track {
  background: var(--color-background);
}

.messages-container::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}
</style>