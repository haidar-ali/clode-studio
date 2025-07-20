<template>
  <div class="prompt-section" :class="section.type">
    <div class="section-header">
      <Icon class="drag-handle" name="heroicons:bars-3" />
      <Icon :name="getSectionIcon(section.type)" />
      <span class="section-label">{{ section.label }}</span>
      <button class="remove-btn" @click="$emit('remove', section.id)">
        <Icon name="heroicons:x-mark" />
      </button>
    </div>
    
    <div class="section-content">
      <textarea
        v-model="content"
        :placeholder="getPlaceholder(section.type)"
        @input="updateContent"
        rows="4"
      ></textarea>
    </div>

    <!-- Special rendering for examples -->
    <div v-if="section.type === 'example'" class="example-hint">
      <Icon name="heroicons:information-circle" />
      <span>Use multishot examples to show Claude the desired pattern</span>
    </div>

    <!-- Special rendering for constraints -->
    <div v-if="section.type === 'constraint'" class="constraint-templates">
      <button 
        v-for="template in constraintTemplates" 
        :key="template"
        class="template-btn"
        @click="addConstraintTemplate(template)"
      >
        + {{ template }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PromptSection } from '~/stores/prompt-engineering';

const props = defineProps<{
  section: PromptSection;
}>();

const emit = defineEmits<{
  update: [id: string, content: string];
  remove: [id: string];
}>();

const content = ref(props.section.content);

const constraintTemplates = [
  'Keep responses concise',
  'Use TypeScript',
  'Follow project conventions',
  'Include error handling',
  'Add comprehensive tests'
];

watch(() => props.section.content, (newContent) => {
  content.value = newContent;
});

function updateContent() {
  emit('update', props.section.id, content.value);
}

function getSectionIcon(type: string): string {
  const icons: Record<string, string> = {
    system: 'heroicons:cog',
    context: 'heroicons:document-duplicate',
    instruction: 'heroicons:list-bullet',
    example: 'heroicons:light-bulb',
    constraint: 'heroicons:shield-check',
    output: 'heroicons:document-text',
    subagent: 'heroicons:users'
  };
  return icons[type] || 'heroicons:document';
}

function getPlaceholder(type: string): string {
  const placeholders: Record<string, string> = {
    system: 'Define Claude\'s role and behavior...',
    context: 'Provide background information and context...',
    instruction: 'List specific instructions for the task...',
    example: 'Input: [example input]\nOutput: [example output]',
    constraint: 'Define constraints and requirements...',
    output: 'Specify the desired output format...',
    subagent: 'Define subagent responsibilities...'
  };
  return placeholders[type] || 'Enter content...';
}

function addConstraintTemplate(template: string) {
  if (content.value) {
    content.value += '\n• ' + template;
  } else {
    content.value = '• ' + template;
  }
  updateContent();
}
</script>

<style scoped>
.prompt-section {
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.prompt-section:hover {
  border-color: var(--color-border-hover);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}

.drag-handle {
  cursor: move;
  color: var(--color-text-secondary);
}

.section-label {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.remove-btn:hover {
  background-color: var(--color-background-mute);
  color: var(--color-danger);
}

.section-content {
  padding: 12px;
}

.section-content textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-background-mute);
  color: var(--color-text);
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  min-height: 80px;
}

.section-content textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* Type-specific styling */
.prompt-section.system {
  border-color: #8b5cf6;
}

.prompt-section.system .section-header {
  background-color: rgba(139, 92, 246, 0.1);
}

.prompt-section.instruction {
  border-color: #3b82f6;
}

.prompt-section.instruction .section-header {
  background-color: rgba(59, 130, 246, 0.1);
}

.prompt-section.example {
  border-color: #f59e0b;
}

.prompt-section.example .section-header {
  background-color: rgba(245, 158, 11, 0.1);
}

.prompt-section.constraint {
  border-color: #ef4444;
}

.prompt-section.constraint .section-header {
  background-color: rgba(239, 68, 68, 0.1);
}

/* Hints and templates */
.example-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 12px;
  padding: 8px 12px;
  background-color: rgba(245, 158, 11, 0.1);
  border-radius: 6px;
  color: #f59e0b;
  font-size: 12px;
}

.constraint-templates {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 12px 12px;
}

.template-btn {
  padding: 4px 8px;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  background: none;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* Dark theme adjustments */
:root {
  --color-border-hover: #4a4a4a;
  --color-danger: #ef4444;
}
</style>