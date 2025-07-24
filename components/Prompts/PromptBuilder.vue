<template>
  <div class="prompt-builder">
    <!-- Header with actions -->
    <div class="builder-header">
      <h2>Prompt Builder</h2>
      <div class="header-actions">
        <button class="action-btn" @click="$emit('open-resources')">
          <Icon name="heroicons:folder-plus" />
          Add Resources
        </button>
        <button class="action-btn" @click="clearPrompt">
          <Icon name="heroicons:trash" />
          Clear
        </button>
        <button class="action-btn primary" @click="showSaveDialog = true">
          <Icon name="heroicons:bookmark" />
          Save Template
        </button>
        <button class="action-btn success" @click="executePrompt">
          <Icon name="heroicons:play" />
          Execute
        </button>
        <button class="action-btn chat" @click="sendToChat">
          <Icon name="heroicons:chat-bubble-left-right" />
          Send to Chat
        </button>
      </div>
    </div>

    <!-- Token counter -->
    <div class="token-counter">
      <Icon name="heroicons:calculator" />
      <span>~{{ promptStore.tokenEstimate }} tokens</span>
      <span class="separator">•</span>
      <span :class="['complexity', promptStore.complexityScore]">
        {{ promptStore.complexityScore }}
      </span>
    </div>

    <!-- Section buttons -->
    <div class="section-buttons">
      <button 
        v-for="type in sectionTypes" 
        :key="type.value"
        class="add-section-btn"
        @click="addSection(type.value)"
      >
        <Icon :name="type.icon" />
        {{ type.label }}
      </button>
    </div>

    <!-- Prompt sections -->
    <div class="sections-container">
      <div class="sections-list">
        <PromptSection
          v-for="section in sections"
          :key="section.id"
          :section="section"
          @update="updateSection"
          @remove="removeSection"
        />
      </div>

      <div v-if="sections.length === 0" class="empty-state">
        <Icon name="heroicons:document-text" />
        <p>Start building your prompt by adding sections above</p>
      </div>
    </div>

    <!-- Resources summary -->
    <div v-if="resources.length > 0" class="resources-summary">
      <h3>Attached Resources</h3>
      <div class="resource-list">
        <div 
          v-for="(resource, index) in resources" 
          :key="`${resource.type}-${resource.id}`"
          class="resource-item"
        >
          <Icon :name="getResourceIcon(resource.type)" />
          <span>{{ resource.name }}</span>
          <button class="remove-btn" @click="removeResource(index)">
            <Icon name="heroicons:x-mark" />
          </button>
        </div>
      </div>
    </div>

    <!-- Save Template Dialog -->
    <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog = false">
      <div class="modal-content">
        <h3>Save as Template</h3>
        <div class="form-group">
          <label>Template Name</label>
          <input 
            v-model="templateName" 
            type="text" 
            placeholder="e.g., Smart Refactoring"
            class="form-input"
          >
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea 
            v-model="templateDescription" 
            placeholder="Describe what this template does"
            class="form-textarea"
            rows="3"
          ></textarea>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select v-model="templateCategory" class="form-select">
            <option value="coding">Coding</option>
            <option value="research">Research</option>
            <option value="analysis">Analysis</option>
            <option value="refactoring">Refactoring</option>
            <option value="debugging">Debugging</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showSaveDialog = false">Cancel</button>
          <button class="btn-primary" @click="saveTemplate">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import PromptSection from './PromptSection.vue';

const promptStore = usePromptEngineeringStore();

const showSaveDialog = ref(false);
const templateName = ref('');
const templateDescription = ref('');
const templateCategory = ref<'coding' | 'research' | 'analysis' | 'refactoring' | 'debugging' | 'custom'>('coding');

const sections = computed({
  get: () => promptStore.currentPrompt.structure?.sections || [],
  set: (value) => {
    if (promptStore.currentPrompt.structure) {
      promptStore.currentPrompt.structure.sections = value;
    }
  }
});

const resources = computed(() => promptStore.currentPrompt.structure?.resources || []);

const sectionTypes = [
  { value: 'system', label: 'System Prompt', icon: 'heroicons:cog' },
  { value: 'context', label: 'Context', icon: 'heroicons:document-duplicate' },
  { value: 'instruction', label: 'Instructions', icon: 'heroicons:list-bullet' },
  { value: 'example', label: 'Example', icon: 'heroicons:light-bulb' },
  { value: 'constraint', label: 'Constraints', icon: 'heroicons:shield-check' },
  { value: 'output', label: 'Output Format', icon: 'heroicons:document-text' }
];

function addSection(type: any) {
  promptStore.addSection(type);
}

function updateSection(id: string, content: string) {
  promptStore.updateSection(id, content);
}

function removeSection(id: string) {
  promptStore.removeSection(id);
}

function removeResource(index: number) {
  promptStore.removeResource(index);
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

function clearPrompt() {
  if (confirm('Are you sure you want to clear the current prompt?')) {
    promptStore.clearCurrentPrompt();
  }
}

async function saveTemplate() {
  if (!templateName.value || !templateDescription.value) {
    alert('Please provide a name and description for the template');
    return;
  }

  await promptStore.saveTemplate(
    templateName.value,
    templateDescription.value,
    templateCategory.value
  );

  // Reset form
  templateName.value = '';
  templateDescription.value = '';
  templateCategory.value = 'coding';
  showSaveDialog.value = false;
}

async function executePrompt() {
  try {
    const result = await promptStore.executePrompt();
    if (result) {
      
      // Optionally show success message or switch to terminal view
    }
  } catch (error: any) {
    console.error('Failed to execute prompt:', error);
    alert(error.message || 'Failed to send prompt to Claude terminal');
  }
}

async function sendToChat() {
  const prompt = promptStore.buildPrompt();
  if (!prompt) {
    alert('Please build a prompt first');
    return;
  }

  // Get the active Claude instance
  const { useClaudeInstancesStore } = await import('~/stores/claude-instances');
  const claudeInstancesStore = useClaudeInstancesStore();
  const activeInstanceId = claudeInstancesStore.activeInstanceId;
  
  if (!activeInstanceId) {
    alert('Please start a Claude instance first');
    return;
  }

  // First, dispatch event to open chat modal
  window.dispatchEvent(new CustomEvent('open-claude-chat', {
    detail: {
      instanceId: activeInstanceId
    }
  }));

  // Then, after a small delay to ensure chat is open, send the prompt text
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('append-to-claude-chat', {
      detail: {
        instanceId: activeInstanceId,
        text: prompt
      }
    }));
  }, 100);
}
</script>

<style scoped>
.prompt-builder {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.builder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #2d2d30;
}

.builder-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #cccccc;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
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

.action-btn.primary {
  background-color: #007acc;
  color: white;
  border-color: #007acc;
}

.action-btn.success {
  background-color: #10b981;
  color: white;
  border-color: #10b981;
}

.action-btn.success:hover {
  background-color: #059669;
}

.action-btn.chat {
  background-color: #8b5cf6;
  color: white;
  border-color: #8b5cf6;
}

.action-btn.chat:hover {
  background-color: #7c3aed;
}

.token-counter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  background-color: #252526;
  color: #858585;
  font-size: 13px;
}

.separator {
  opacity: 0.5;
}

.complexity {
  text-transform: capitalize;
  font-weight: 500;
}

.complexity.simple { color: #10b981; }
.complexity.moderate { color: #f59e0b; }
.complexity.complex { color: #ef4444; }

.section-buttons {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  background-color: #2d2d30;
  overflow-x: auto;
}

.add-section-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px dashed #3c3c3c;
  border-radius: 6px;
  background-color: transparent;
  color: #858585;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  white-space: nowrap;
}

.add-section-btn:hover {
  border-color: #007acc;
  color: #007acc;
}

.sections-container {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.sections-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  color: var(--color-text-secondary);
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.resources-summary {
  padding: 16px 20px;
  border-top: 1px solid #2d2d30;
  background-color: #252526;
}

.resources-summary h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
}

.resource-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background-color: #1e1e1e;
  border: 1px solid #2d2d30;
  border-radius: 4px;
  font-size: 12px;
  color: #cccccc;
}

.remove-btn {
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
  border-radius: 3px;
}

.remove-btn:hover {
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
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: #252526;
  border: 1px solid #2d2d30;
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

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background-color: #3c3c3c;
  color: #cccccc;
  font-size: 14px;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: #007acc;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
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
  border: 1px solid #2d2d30;
  background-color: #1e1e1e;
  color: #cccccc;
}

.btn-secondary:hover {
  background-color: #2d2d30;
}

.btn-primary {
  border: 1px solid #007acc;
  background-color: #007acc;
  color: white;
}

.btn-primary:hover {
  background-color: #1a7dc4;
}
</style>