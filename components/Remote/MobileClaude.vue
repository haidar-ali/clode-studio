<template>
  <div class="mobile-claude">
    <div class="claude-header">
      <h3>Claude Assistant</h3>
      <div class="claude-actions">
        <button @click="createNewInstance" class="action-btn">
          <Icon name="mdi:plus" />
        </button>
        <PersonalitySelector 
          v-if="activeInstance"
          :model-value="activeInstance.personality"
          @update:model-value="updatePersonality"
          class="mobile-personality"
        />
      </div>
    </div>
    
    <!-- Instance tabs for multiple Claude instances -->
    <div v-if="instances.length > 1" class="instance-tabs">
      <button 
        v-for="instance in instances" 
        :key="instance.id"
        :class="{ active: instance.id === activeInstanceId }"
        @click="activeInstanceId = instance.id"
        class="instance-tab"
      >
        {{ instance.name }}
      </button>
    </div>
    
    <!-- Reuse existing ClaudeTerminal component -->
    <div class="claude-container">
      <ClaudeTerminal 
        v-if="activeInstance"
        :instance="activeInstance"
        :instance-id="activeInstance.id"
        class="mobile-optimized"
      />
      <div v-else class="empty-state">
        <Icon name="mdi:robot" />
        <p>No Claude instance active</p>
        <button @click="createNewInstance" class="create-btn">
          Start Claude
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ClaudeTerminal from '~/components/Terminal/ClaudeTerminal.vue';
import PersonalitySelector from '~/components/Terminal/PersonalitySelector.vue';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useWorkspaceStore } from '~/stores/workspace';

const claudeStore = useClaudeInstancesStore();
const workspaceStore = useWorkspaceStore();

const activeInstanceId = ref<string>('');
const instances = computed(() => claudeStore.instances);
const activeInstance = computed(() => 
  instances.value.find(i => i.id === activeInstanceId.value)
);

async function createNewInstance() {
  try {
    const workspace = workspaceStore.currentWorkspace || process.cwd();
    const instance = await claudeStore.createInstance({
      name: `Claude ${instances.value.length + 1}`,
      personality: 'assistant',
      workingDirectory: workspace
    });
    
    activeInstanceId.value = instance.id;
  } catch (error) {
    console.error('Failed to create Claude instance:', error);
  }
}

async function updatePersonality(personality: string) {
  if (activeInstance.value) {
    await claudeStore.updatePersonality(activeInstance.value.id, personality);
  }
}

onMounted(() => {
  // Set first instance as active if exists
  if (instances.value.length > 0) {
    activeInstanceId.value = instances.value[0].id;
  }
});
</script>

<style scoped>
.mobile-claude {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.claude-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--panel-padding, 12px);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.claude-header h3 {
  margin: 0;
  font-size: 16px;
}

.claude-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.action-btn:hover {
  background: var(--color-bg-hover);
}

.instance-tabs {
  display: flex;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.instance-tab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.instance-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.claude-container {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  gap: 16px;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.create-btn {
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.create-btn:hover {
  opacity: 0.9;
}

/* Mobile optimizations */
:deep(.mobile-personality) {
  min-width: 120px;
}

:deep(.mobile-optimized .terminal-content) {
  font-size: 14px;
}

:deep(.mobile-optimized .chat-input) {
  font-size: 16px; /* Prevent zoom on iOS */
}
</style>