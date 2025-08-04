<template>
  <div class="mobile-terminal">
    <div class="terminal-header">
      <h3>Terminal</h3>
      <div class="terminal-actions">
        <button @click="createTerminal" v-if="!hasTerminal" class="action-btn">
          <Icon name="mdi:plus" />
        </button>
        <button @click="clearTerminal" v-if="hasTerminal" class="action-btn">
          <Icon name="mdi:broom" />
        </button>
      </div>
    </div>
    
    <!-- Reuse existing Terminal component -->
    <div class="terminal-container">
      <Terminal 
        v-if="hasTerminal"
        ref="terminalRef"
        :instance-id="terminalId"
        class="mobile-optimized"
      />
      <div v-else class="empty-state">
        <Icon name="mdi:console" />
        <p>No terminal active</p>
        <button @click="createTerminal" class="create-btn">
          Create Terminal
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Terminal from '~/components/Terminal/Terminal.vue';
import { useServices } from '~/composables/useServices';
import { useTerminalInstancesStore } from '~/stores/terminal-instances';
import { useWorkspaceStore } from '~/stores/workspace';

const terminalInstancesStore = useTerminalInstancesStore();
const workspaceStore = useWorkspaceStore();
const terminalRef = ref<InstanceType<typeof Terminal>>();
const terminalId = ref<string>('');

const hasTerminal = computed(() => !!terminalId.value);

async function createTerminal() {
  try {
    const services = await useServices();
    const workspace = workspaceStore.currentWorkspace || process.cwd();
    
    // Create a new terminal instance
    const instance = await terminalInstancesStore.createInstance({
      name: 'Mobile Terminal',
      workingDirectory: workspace
    });
    
    terminalId.value = instance.id;
  } catch (error) {
    console.error('Failed to create terminal:', error);
  }
}

function clearTerminal() {
  if (terminalRef.value && 'clear' in terminalRef.value) {
    (terminalRef.value as any).clear();
  }
}

onMounted(() => {
  // Check if there's an existing terminal instance
  const instances = terminalInstancesStore.instances;
  if (instances.length > 0) {
    terminalId.value = instances[0].id;
  }
});

onUnmounted(() => {
  // Don't destroy terminal on unmount - preserve state
});
</script>

<style scoped>
.mobile-terminal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--panel-padding, 12px);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.terminal-header h3 {
  margin: 0;
  font-size: 16px;
}

.terminal-actions {
  display: flex;
  gap: 8px;
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

.terminal-container {
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  gap: 16px;
  background: var(--color-bg-primary);
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
:deep(.mobile-optimized .xterm) {
  padding: 8px;
}

:deep(.mobile-optimized .xterm-viewport) {
  /* Ensure proper scrolling on mobile */
  -webkit-overflow-scrolling: touch;
}
</style>