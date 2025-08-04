<template>
  <div class="remote-code-editor">
    <textarea
      ref="textareaRef"
      v-model="content"
      @input="handleInput"
      class="code-textarea"
      :placeholder="placeholder"
      spellcheck="false"
      autocorrect="off"
      autocapitalize="off"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';

interface Props {
  filePath: string;
  initialContent: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  change: [content: string];
}>();

const textareaRef = ref<HTMLTextAreaElement>();
const content = ref(props.initialContent);

const placeholder = 'Start typing...';

watch(() => props.initialContent, (newContent) => {
  content.value = newContent;
});

function handleInput() {
  emit('change', content.value);
}

// Auto-resize textarea
function adjustHeight() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px';
  }
}

watch(content, () => {
  adjustHeight();
});

onMounted(() => {
  adjustHeight();
});
</script>

<style scoped>
.remote-code-editor {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.code-textarea {
  width: 100%;
  height: 100%;
  padding: 16px;
  border: none;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  tab-size: 2;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

/* Syntax highlighting would require a library like Prism.js or CodeMirror */
/* For now, we'll use a simple textarea */

/* Dark theme adjustments */
:root[data-theme="dark"] .code-textarea {
  background: #1e1e1e;
  color: #d4d4d4;
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .code-textarea {
    font-size: 16px; /* Prevent zoom on iOS */
    padding: 12px;
  }
}

/* Scrollbar styling */
.code-textarea::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.code-textarea::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
}

.code-textarea::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

.code-textarea::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-hover);
}
</style>