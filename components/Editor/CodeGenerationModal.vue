<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-container">
          <div class="modal-header">
            <h3>Generate Code with Claude</h3>
            <button @click="close" class="close-btn">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          
          <div class="prompt-section">
            <textarea
              v-model="prompt"
              @keydown.enter.meta="handleGenerate"
              @keydown.enter.ctrl="handleGenerate"
              placeholder="Describe what you want to generate...

Examples:
• Add a function that validates email addresses
• Create an interface for user authentication
• Implement error handling for the API calls
• Add unit tests for the calculateTotal function"
              class="prompt-input"
              :disabled="isGenerating"
              ref="promptInput"
            />
            
            <div class="actions">
              <button 
                @click="handleGenerate" 
                class="generate-btn"
                :disabled="!prompt.trim() || isGenerating"
              >
                <Icon 
                  :name="isGenerating ? 'mdi:loading' : 'mdi:magic'" 
                  size="16" 
                  :class="{ 'spinning': isGenerating }"
                />
                {{ isGenerating ? 'Generating...' : 'Generate (⌘+Enter)' }}
              </button>
            </div>
          </div>
          
          <div v-if="error" class="error-message">
            <Icon name="mdi:alert-circle" size="16" />
            {{ error }}
          </div>
          
          <div v-if="generatedCode && !error" class="preview-section">
            <div class="preview-header">
              <h4>Generated Code</h4>
              <div class="preview-actions">
                <button @click="copyCode" class="action-btn" title="Copy code">
                  <Icon name="mdi:content-copy" size="16" />
                </button>
                <button @click="acceptCode" class="action-btn accept" title="Accept changes">
                  <Icon name="mdi:check" size="16" />
                  Accept
                </button>
              </div>
            </div>
            
            <div class="code-preview">
              <pre><code>{{ generatedCode }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useCodeGeneration } from '~/composables/useCodeGeneration';
import { useEditorStore } from '~/stores/editor';

const emit = defineEmits<{
  accept: [code: string]
  close: []
}>();

const editorStore = useEditorStore();
const { 
  isOpen, 
  prompt, 
  isGenerating, 
  generatedCode, 
  error,
  open,
  close: closeGeneration,
  generate 
} = useCodeGeneration();

const promptInput = ref<HTMLTextAreaElement>();

const handleGenerate = async () => {
  if (!prompt.value.trim() || isGenerating.value) return;
  
  const activeTab = editorStore.activeTab;
  if (!activeTab) return;
  
  const language = activeTab.name.split('.').pop() || 'text';
  
  await generate({
    prompt: prompt.value,
    fileContent: activeTab.content || '',
    filePath: activeTab.filepath || activeTab.name,
    language
  });
};

const acceptCode = () => {
  if (generatedCode.value) {
    emit('accept', generatedCode.value);
    close();
  }
};

const copyCode = async () => {
  if (generatedCode.value) {
    try {
      await navigator.clipboard.writeText(generatedCode.value);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }
};

const close = () => {
  closeGeneration();
  emit('close');
};

watch(isOpen, async (newVal) => {
  if (newVal) {
    await nextTick();
    promptInput.value?.focus();
  }
});

defineExpose({
  open,
  close
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  background: #1e1e1e;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid #3c3c3c;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #3c3c3c;
}

.modal-header h3 {
  margin: 0;
  color: #e0e0e0;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #2d2d30;
  color: #e0e0e0;
}

.prompt-section {
  padding: 24px;
}

.prompt-input {
  width: 100%;
  min-height: 120px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  color: #e0e0e0;
  padding: 12px;
  font-family: 'Fira Code', monospace;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.2s;
}

.prompt-input:focus {
  outline: none;
  border-color: #007acc;
}

.prompt-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.generate-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  background: #005a9e;
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  margin: 0 24px 16px;
  padding: 12px;
  background: #5a1e1e;
  border: 1px solid #8b2c2c;
  border-radius: 6px;
  color: #f48771;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid #3c3c3c;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #3c3c3c;
}

.preview-header h4 {
  margin: 0;
  color: #b0b0b0;
  font-size: 14px;
  text-transform: uppercase;
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d30;
  color: #e0e0e0;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #3c3c3c;
  border-color: #545454;
}

.action-btn.accept {
  background: #28a745;
  border-color: #28a745;
  color: white;
}

.action-btn.accept:hover {
  background: #218838;
  border-color: #218838;
}

.code-preview {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: #2d2d30;
}

.code-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.code-preview code {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  color: #d4d4d4;
  line-height: 1.5;
}

/* Scrollbar styling */
.code-preview::-webkit-scrollbar {
  width: 12px;
}

.code-preview::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.code-preview::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 6px;
}

.code-preview::-webkit-scrollbar-thumb:hover {
  background: #777;
}

/* Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>