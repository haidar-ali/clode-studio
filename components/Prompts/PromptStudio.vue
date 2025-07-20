<template>
  <div class="prompt-studio">
    <!-- Studio Layout -->
    <div class="studio-layout">
      <!-- Left Panel: Resources -->
      <div class="resources-panel">
        <h3>Resources</h3>
        <ResourceSelector @add="addResource" />
      </div>

      <!-- Center: Prompt Canvas -->
      <div class="prompt-canvas">
        <PromptBuilder />
      </div>

      <!-- Right Panel: Settings & Preview -->
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
          <SubAgentDesigner v-if="settingsTab === 'subagents'" />
          <PromptPreview v-else-if="settingsTab === 'preview'" />
          <TemplateLibrary v-else-if="settingsTab === 'templates'" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import ResourceSelector from './ResourceSelector.vue';
import PromptBuilder from './PromptBuilder.vue';
import SubAgentDesigner from './SubAgentDesigner.vue';
import PromptPreview from './PromptPreview.vue';
import TemplateLibrary from './TemplateLibrary.vue';

const promptStore = usePromptEngineeringStore();

const settingsTab = ref<'subagents' | 'preview' | 'templates'>('preview');

function addResource(resource: any) {
  promptStore.addResource(resource);
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

.resources-panel {
  width: 280px;
  background-color: #252526;
  overflow-y: auto;
}

.resources-panel h3 {
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
  border-bottom: 1px solid #2d2d30;
}

.prompt-canvas {
  flex: 1;
  background-color: #1e1e1e;
  overflow-y: auto;
}

.settings-panel {
  width: 320px;
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