<template>
  <div class="chat-message" :class="`message-${message.role}`">
    <div class="message-header">
      <Icon :name="roleIcon" class="role-icon" />
      <span class="role-name">{{ roleName }}</span>
      <span class="timestamp">{{ formattedTime }}</span>
    </div>
    <div class="message-content" v-html="formattedContent"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '~/shared/types';

const props = defineProps<{
  message: ChatMessage;
}>();

const roleIcon = computed(() => {
  switch (props.message.role) {
    case 'user':
      return 'mdi:account';
    case 'assistant':
      return 'mdi:robot';
    case 'system':
      return 'mdi:information';
    default:
      return 'mdi:message';
  }
});

const roleName = computed(() => {
  switch (props.message.role) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Claude';
    case 'system':
      return 'System';
    default:
      return 'Unknown';
  }
});

const formattedTime = computed(() => {
  const date = new Date(props.message.timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
});

const formattedContent = computed(() => {
  // Basic markdown-like formatting and code block detection
  let content = props.message.content;
  
  // Escape HTML
  content = content.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks
  content = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="code-block"><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
  });
  
  // Inline code
  content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Bold
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Line breaks
  content = content.replace(/\n/g, '<br>');
  
  return content;
});
</script>

<style scoped>
.chat-message {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
  background: #252526;
}

.message-user {
  background: #264f78;
  margin-left: 40px;
}

.message-assistant {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
}

.message-system {
  background: #2d2d30;
  font-size: 13px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #858585;
}

.role-icon {
  font-size: 16px;
}

.role-name {
  font-weight: 600;
  color: #cccccc;
}

.timestamp {
  margin-left: auto;
  font-size: 11px;
}

.message-content {
  color: #d4d4d4;
  line-height: 1.5;
}

.message-content :deep(.code-block) {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
}

.message-content :deep(.inline-code) {
  background: #3e3e42;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
}

.message-system .message-content {
  color: #f48771;
}
</style>