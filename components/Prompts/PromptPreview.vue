<template>
  <div class="prompt-preview">
    <div class="preview-header">
      <h3>Prompt Preview</h3>
      <div class="preview-actions">
        <button class="copy-btn" @click="copyPrompt">
          <Icon name="heroicons:clipboard-document" />
          Copy
        </button>
        <button class="test-btn" @click="testPrompt">
          <Icon name="heroicons:beaker" />
          Test
        </button>
      </div>
    </div>

    <div class="preview-stats">
      <div class="stat">
        <Icon name="heroicons:calculator" />
        <span>~{{ promptStore.tokenEstimate }} tokens</span>
      </div>
      <div class="stat">
        <Icon name="heroicons:chart-bar" />
        <span :class="['complexity', promptStore.complexityScore]">
          {{ promptStore.complexityScore }} complexity
        </span>
      </div>
      <div v-if="subagentCount > 0" class="stat">
        <Icon name="heroicons:users" />
        <span>{{ subagentCount }} subagents</span>
      </div>
    </div>

    <div class="preview-content">
      <pre class="prompt-text">{{ builtPrompt || 'Start building your prompt...' }}</pre>
    </div>

    <!-- Test Dialog -->
    <div v-if="showTestDialog" class="modal-overlay" @click.self="showTestDialog = false">
      <div class="modal-content">
        <h3>Test Prompt</h3>
        <div class="test-options">
          <div class="form-group">
            <label>Test with Claude Instance</label>
            <select v-model="testInstanceId">
              <option value="">New Instance</option>
              <option 
                v-for="instance in claudeInstances" 
                :key="instance.id"
                :value="instance.id"
              >
                {{ instance.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Test Input (optional)</label>
            <textarea 
              v-model="testInput" 
              placeholder="Additional context or question for testing"
              rows="3"
            ></textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showTestDialog = false">Cancel</button>
          <button class="btn-primary" @click="runTest">Run Test</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

const promptStore = usePromptEngineeringStore();
const instancesStore = useClaudeInstancesStore();

const showTestDialog = ref(false);
const testInstanceId = ref('');
const testInput = ref('');
const copied = ref(false);

const builtPrompt = ref('');
const subagentCount = computed(() => 
  promptStore.currentPrompt.structure?.subagents?.length || 0
);

const claudeInstances = computed(() => instancesStore.instances);

// Watch for changes and rebuild prompt
watch(
  () => promptStore.currentPrompt,
  () => {
    builtPrompt.value = promptStore.buildPrompt();
  },
  { deep: true, immediate: true }
);

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(builtPrompt.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

function testPrompt() {
  showTestDialog.value = true;
}

async function runTest() {
  const finalPrompt = testInput.value 
    ? `${builtPrompt.value}\n\n${testInput.value}`
    : builtPrompt.value;

  showTestDialog.value = false;
  testInstanceId.value = '';
  testInput.value = '';
}
</script>

<style scoped>
.prompt-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
}

.preview-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.copy-btn,
.test-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background-color: #252526;
  color: #cccccc;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.copy-btn:hover,
.test-btn:hover {
  background-color: #3e3e42;
}

.preview-stats {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background-color: #2d2d30;
  border-bottom: 1px solid #181818;
}

.stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #858585;
}

.stat svg {
  width: 16px;
  height: 16px;
}

.complexity.simple { color: #10b981; }
.complexity.moderate { color: #f59e0b; }
.complexity.complex { color: #ef4444; }

.preview-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.prompt-text {
  margin: 0;
  padding: 16px;
  background-color: #3c3c3c;
  border: 1px solid #2d2d30;
  border-radius: 8px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #cccccc;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-content h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: #cccccc;
}

.test-options {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
}

.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background-color: #3c3c3c;
  color: #cccccc;
  font-size: 14px;
}

.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #007acc;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-secondary,
.btn-primary {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  border: 1px solid #3c3c3c;
  background-color: #252526;
  color: #cccccc;
}

.btn-secondary:hover {
  background-color: #3e3e42;
}

.btn-primary {
  border: 1px solid #007acc;
  background-color: #007acc;
  color: white;
}

.btn-primary:hover {
  background-color: #005a9e;
}

/* Scrollbar styling */
.preview-content::-webkit-scrollbar {
  width: 8px;
}

.preview-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.preview-content::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

.preview-content::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}
</style>