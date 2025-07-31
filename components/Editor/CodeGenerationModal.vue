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
            
            <!-- Resources section -->
            <div v-if="selectedResources.length > 0" class="resources-section">
              <div class="resources-header">
                <span class="resources-label">Resources:</span>
                <button @click="clearResources" class="clear-resources-btn">
                  <Icon name="mdi:close-circle-outline" size="14" />
                  Clear
                </button>
              </div>
              <div class="resource-chips">
                <div 
                  v-for="(resource, index) in selectedResources" 
                  :key="index" 
                  class="resource-chip"
                >
                  <Icon :name="getResourceIcon(resource.type)" size="14" />
                  <span>{{ resource.name }}</span>
                  <button @click="removeResource(index)" class="remove-btn">
                    <Icon name="mdi:close" size="12" />
                  </button>
                </div>
              </div>
            </div>
            
            <div class="actions">
              <button 
                @click="openResourceModal" 
                class="add-resources-btn"
              >
                <Icon name="mdi:folder-plus" size="16" />
                Add Resources
              </button>
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
              <h4>{{ showDiff ? 'Changes' : 'Generated Code' }}</h4>
              <div class="preview-actions">
                <button @click="toggleDiff" class="action-btn" :title="showDiff ? 'Show full code' : 'Show changes'">
                  <Icon :name="showDiff ? 'mdi:file-code' : 'mdi:file-compare'" size="16" />
                  {{ showDiff ? 'Full' : 'Diff' }}
                </button>
                <button @click="copyCode" class="action-btn" title="Copy code">
                  <Icon name="mdi:content-copy" size="16" />
                </button>
                <button @click="acceptCode" class="action-btn accept" title="Accept changes">
                  <Icon name="mdi:check" size="16" />
                  Accept
                </button>
              </div>
            </div>
            
            <div v-if="!showDiff" class="code-preview">
              <pre><code>{{ generatedCode }}</code></pre>
            </div>
            <div v-else class="diff-container" ref="diffContainer">
              <!-- Diff view will be mounted here -->
            </div>
          </div>
        </div>
      </div>
    </Transition>
    
    <!-- Resource Modal -->
    <ResourceModal 
      :is-open="showResourceModal" 
      context="codegeneration"
      @close="showResourceModal = false"
      @add="handleAddResource"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, shallowRef } from 'vue';
import { useCodeGeneration } from '~/composables/useCodeGeneration';
import { useEditorStore } from '~/stores/editor';
import ResourceModal from '~/components/Prompts/ResourceModal.vue';
import type { ResourceReference } from '~/stores/prompt-engineering';
import { MergeView } from '@codemirror/merge';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';

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
  originalCode,
  error,
  open,
  close: closeGeneration,
  generate 
} = useCodeGeneration();

const promptInput = ref<HTMLTextAreaElement>();
const showResourceModal = ref(false);
const selectedResources = ref<ResourceReference[]>([]);
const showDiff = ref(false);
const diffContainer = ref<HTMLDivElement>();
const mergeView = shallowRef<MergeView | null>(null);

const openResourceModal = () => {
  showResourceModal.value = true;
};

const handleAddResource = (resource: ResourceReference) => {
  // Check if resource already exists
  const exists = selectedResources.value.some(r => 
    r.type === resource.type && 
    (r.id === resource.id || (r.path === resource.path && resource.path))
  );
  
  if (!exists && selectedResources.value.length < 5) {
    selectedResources.value.push(resource);
  }
};

const removeResource = (index: number) => {
  selectedResources.value.splice(index, 1);
};

const clearResources = () => {
  selectedResources.value = [];
};

const getResourceIcon = (type: string): string => {
  const icons: Record<string, string> = {
    file: 'mdi:file-code',
    knowledge: 'mdi:lightbulb',
    hook: 'mdi:hook',
    mcp: 'mdi:server',
    command: 'mdi:console',
    task: 'mdi:checkbox-marked-circle'
  };
  return icons[type] || 'mdi:folder';
};

const handleGenerate = async () => {
  if (!prompt.value.trim() || isGenerating.value) return;
  
  const activeTab = editorStore.activeTab;
  if (!activeTab) return;
  
  const language = activeTab.name.split('.').pop() || 'text';
  
  // Create serializable resources
  const serializableResources = selectedResources.value.map(resource => ({
    type: resource.type,
    name: resource.name,
    id: resource.id,
    path: resource.path
  }));
  
  await generate({
    prompt: prompt.value,
    fileContent: activeTab.content || '',
    filePath: activeTab.filepath || activeTab.name,
    language,
    resources: serializableResources
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

const toggleDiff = () => {
  showDiff.value = !showDiff.value;
  if (showDiff.value) {
    nextTick(() => createDiffView());
  } else {
    destroyDiffView();
  }
};

const getLanguageSupport = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({ jsx: true, typescript: ext.includes('ts') });
    case 'py':
      return python();
    case 'css':
    case 'scss':
    case 'sass':
      return css();
    case 'html':
    case 'htm':
      return html();
    case 'json':
      return json();
    default:
      return [];
  }
};

const createDiffView = () => {
  if (!diffContainer.value || !originalCode.value || !generatedCode.value) return;
  
  destroyDiffView();
  
  const activeTab = editorStore.activeTab;
  const langSupport = activeTab ? getLanguageSupport(activeTab.name) : [];
  
  mergeView.value = new MergeView({
    parent: diffContainer.value,
    a: {
      doc: originalCode.value,
      extensions: [
        basicSetup,
        oneDark,
        langSupport,
        EditorView.editable.of(false)
      ]
    },
    b: {
      doc: generatedCode.value,
      extensions: [
        basicSetup,
        oneDark,
        langSupport,
        EditorView.editable.of(false)
      ]
    },
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 3, minSize: 4 }
  });
};

const destroyDiffView = () => {
  if (mergeView.value) {
    mergeView.value.destroy();
    mergeView.value = null;
  }
};

const close = () => {
  closeGeneration();
  selectedResources.value = []; // Clear resources when closing
  showDiff.value = false;
  destroyDiffView();
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

.resources-section {
  margin-top: 16px;
  padding: 12px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
}

.resources-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.resources-label {
  color: #b0b0b0;
  font-size: 13px;
  font-weight: 500;
}

.clear-resources-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.clear-resources-btn:hover {
  background: #3c3c3c;
  color: #e0e0e0;
}

.resource-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.resource-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 16px;
  font-size: 12px;
  color: #e0e0e0;
}

.resource-chip .remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.2s;
  margin-left: 4px;
}

.resource-chip .remove-btn:hover {
  background: #3c3c3c;
  color: #e0e0e0;
}

.actions {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.add-resources-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #2d2d30;
  color: #e0e0e0;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-resources-btn:hover {
  background: #3c3c3c;
  border-color: #545454;
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

/* Diff container */
.diff-container {
  flex: 1;
  overflow: auto;
  background: #1e1e1e;
}

/* CodeMirror Merge styles */
.diff-container :deep(.cm-merge) {
  height: 100%;
}

.diff-container :deep(.cm-editor) {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
}

.diff-container :deep(.cm-changedLine) {
  background-color: rgba(255, 235, 59, 0.1);
}

.diff-container :deep(.cm-changedText) {
  background-color: rgba(255, 235, 59, 0.2);
}

.diff-container :deep(.cm-deletedChunk) {
  background-color: rgba(244, 67, 54, 0.1);
}

.diff-container :deep(.cm-insertedChunk) {
  background-color: rgba(76, 175, 80, 0.1);
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
  display: inline-block;
}
</style>