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

    <!-- Notification Toast -->
    <Transition name="notification">
      <div v-if="notification.show" :class="['notification-toast', notification.type]">
        <Icon :name="getNotificationIcon(notification.type)" />
        <span>{{ notification.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

const promptStore = usePromptEngineeringStore();
const instancesStore = useClaudeInstancesStore();

const showTestDialog = ref(false);
const testInstanceId = ref(''); // Empty string means "New Instance"
const testInput = ref('');
const copied = ref(false);

const notification = ref({
  show: false,
  message: '',
  type: 'info' as 'success' | 'error' | 'info'
});

const builtPrompt = ref('');
const subagentCount = computed(() =>
  promptStore.currentPrompt.structure?.subagents?.length || 0
);

const claudeInstances = computed(() => {
  // Convert Map to array for the dropdown
  return Array.from(instancesStore.instances.values()).filter(instance =>
    instance.status === 'connected'
  );
});

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
  // Reset to "New Instance" first
  testInstanceId.value = '';

  // Always show the dialog to give users options
  showTestDialog.value = true;

  // Only pre-select the active instance if one exists
  if (instancesStore.activeInstanceId && claudeInstances.value.some(i => i.id === instancesStore.activeInstanceId)) {
    testInstanceId.value = instancesStore.activeInstanceId;
  }
}

async function runTest() {
  try {
    const finalPrompt = testInput.value
      ? `${builtPrompt.value}\n\n${testInput.value}`
      : builtPrompt.value;

    if (!finalPrompt || !builtPrompt.value) {
      showNotification('Please build a prompt first', 'error');
      showTestDialog.value = false;
      return;
    }

    showTestDialog.value = false;

    // Determine target instance
    let targetInstanceId = testInstanceId.value;

    // If "New Instance" is selected (empty string) or no instance exists, create one
    if (!targetInstanceId || targetInstanceId === '') {
      // Get workspace path for working directory
      let workingDirectory = '.';
      try {
        const storedWorkspace = await window.electronAPI.store.get('workspacePath');
        if (typeof storedWorkspace === 'string' && storedWorkspace) {
          workingDirectory = storedWorkspace;
        }
      } catch (error) {
        console.error('Failed to get workspace path:', error);
      }

      // Create a new instance with no personality (undefined)
      const newInstanceId = await instancesStore.createInstance('Template Prompt Test', undefined, workingDirectory);

      // Set it as the active instance so the tab shows up
      instancesStore.setActiveInstance(newInstanceId);

      // Wait for Vue to update the DOM
      await nextTick();
      await new Promise(resolve => setTimeout(resolve, 300));

      // Dispatch an event to trigger the start button in the terminal
      window.dispatchEvent(new CustomEvent('start-claude-instance', {
        detail: { instanceId: newInstanceId }
      }));

      targetInstanceId = newInstanceId;

      // Wait for Claude to be ready
      try {
        await waitForClaudeReady(newInstanceId);
      } catch (timeoutError) {
        // If Claude didn't become ready, clean up
        await instancesStore.removeInstance(newInstanceId);
        throw new Error('Claude did not start properly. Please try again.');
      }
    }

    // Send the prompt to the instance
    let sendResult = await window.electronAPI.claude.send(targetInstanceId, finalPrompt);
    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to send test prompt');
    }

    // Send carriage return to submit
    sendResult = await window.electronAPI.claude.send(targetInstanceId, '\r');
    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to submit test prompt');
    }

    // Show success notification
    showNotification('Test prompt sent successfully!', 'success');

    // Switch to terminal view
    window.dispatchEvent(new CustomEvent('prompt-test-sent', {
      detail: { instanceId: targetInstanceId }
    }));

    // Reset form
    testInstanceId.value = '';
    testInput.value = '';
  } catch (error: any) {
    console.error('Test failed:', error);
    showNotification(error.message || 'Failed to run test', 'error');
  }
}

// Notification helper
function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
  notification.value = {
    show: true,
    message,
    type
  };

  // Auto-hide after 4 seconds
  setTimeout(() => {
    notification.value.show = false;
  }, 4000);
}

function getNotificationIcon(type: string): string {
  const icons: Record<string, string> = {
    success: 'heroicons:check-circle',
    error: 'heroicons:x-circle',
    info: 'heroicons:information-circle'
  };
  return icons[type] || icons.info;
}

// Wait for Claude to be ready by monitoring its output
function waitForClaudeReady(instanceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let outputBuffer = '';
    let cleanup: (() => void) | null = null;

    // Set a timeout in case Claude doesn't start properly
    const timeout = setTimeout(() => {
      if (cleanup) cleanup();
      reject(new Error('Timeout waiting for Claude to be ready'));
    }, 5000);

    // Listen for Claude's output
    cleanup = window.electronAPI.claude.onOutput(instanceId, (data: string) => {
      outputBuffer += data;

      // Check if Claude is ready - look for the welcome message
      // The text might have ANSI escape codes, so we need to check for the text with possible codes in between
      if (outputBuffer.includes('Welcome to') && outputBuffer.includes('Claude Code')) {
        clearTimeout(timeout);
        if (cleanup) cleanup();

        // Small additional delay to ensure Claude is fully ready
        setTimeout(() => resolve(), 500);
      }
    });
  });
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

/* Notification Toast */
.notification-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 8px;
  background-color: #3c3c3c;
  color: #cccccc;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 1001;
  max-width: 400px;
}

.notification-toast.success {
  background-color: #10b981;
  color: white;
}

.notification-toast.error {
  background-color: #ef4444;
  color: white;
}

.notification-toast svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* Notification transition */
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.notification-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>