<template>
  <div class="prompt-studio">
    <!-- Studio Layout -->
    <div class="studio-layout">
      <!-- Center: Prompt Canvas (expanded) -->
      <div class="prompt-canvas">
        <PromptBuilder @open-resources="showResourceModal = true" />
      </div>

      <!-- Right Panel: Settings & Preview (expanded) -->
      <div class="settings-panel">
        <div class="panel-tabs">
          <button 
            :class="['tab', { active: settingsTab === 'subagents' }]"
            @click="settingsTab = 'subagents'"
          >
            SubAgents
          </button>
          <button 
            :class="['tab', { active: settingsTab === 'preview' }]"
            @click="settingsTab = 'preview'"
          >
            Preview
          </button>
          <button 
            :class="['tab', { active: settingsTab === 'templates' }]"
            @click="settingsTab = 'templates'"
          >
            Templates
          </button>
        </div>

        <div class="tab-content">
          <SubAgentDesigner 
            v-if="settingsTab === 'subagents'" 
            @open-resources="openResourceModalForSubagent"
          />
          <PromptPreview v-else-if="settingsTab === 'preview'" />
          <TemplateLibrary v-else-if="settingsTab === 'templates'" />
        </div>
      </div>
    </div>

    <!-- Resource Modal -->
    <ResourceModal 
      :is-open="showResourceModal"
      :context="resourceContext"
      :subagent-id="resourceSubagentId"
      @close="closeResourceModal"
      @add="handleResourceAdd"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import type { ResourceReference } from '~/stores/prompt-engineering';
import ResourceModal from './ResourceModal.vue';
import PromptBuilder from './PromptBuilder.vue';
import SubAgentDesigner from './SubAgentDesigner.vue';
import PromptPreview from './PromptPreview.vue';
import TemplateLibrary from './TemplateLibrary.vue';

const promptStore = usePromptEngineeringStore();

const settingsTab = ref<'subagents' | 'preview' | 'templates'>('preview');
const showResourceModal = ref(false);
const resourceContext = ref<'prompt' | 'subagent'>('prompt');
const resourceSubagentId = ref<string | undefined>();

function openResourceModalForSubagent(subagentId: string) {
  resourceContext.value = 'subagent';
  resourceSubagentId.value = subagentId;
  showResourceModal.value = true;
}

function closeResourceModal() {
  showResourceModal.value = false;
  resourceContext.value = 'prompt';
  resourceSubagentId.value = undefined;
}

function handleResourceAdd(resource: ResourceReference, context?: string, subagentId?: string) {
  if (context === 'subagent' && subagentId) {
    // Add resource to specific subagent
    const subagent = promptStore.currentPrompt.structure?.subagents.find(a => a.id === subagentId);
    if (subagent) {
      if (!subagent.resources) subagent.resources = [];
      subagent.resources.push(resource);
    }
  } else {
    // Add resource to main prompt
    promptStore.addResource(resource);
  }
}

onMounted(() => {
  promptStore.initialize();
});
</script>

<style scoped>
.prompt-studio {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #1e1e1e;
}

/* Studio Mode */
.studio-layout {
  flex: 1;
  display: flex;
  gap: 1px;
  background-color: #2d2d30;
  overflow: hidden;
}

.prompt-canvas {
  flex: 1.5; /* Give more space to canvas */
  background-color: #1e1e1e;
  overflow-y: auto;
}

.settings-panel {
  flex: 1; /* Expanded from fixed width */
  min-width: 400px;
  max-width: 600px;
  background-color: #252526;
  display: flex;
  flex-direction: column;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid #2d2d30;
}

.tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: none;
  color: #858585;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
}

.tab:hover {
  color: #cccccc;
}

.tab.active {
  color: #cccccc;
  border-bottom-color: #007acc;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

</style>