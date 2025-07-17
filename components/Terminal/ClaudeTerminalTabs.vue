<template>
  <div class="claude-terminal-tabs">
    <div class="tabs-header">
      <div class="tabs-container">
        <div
          v-for="instance in instances"
          :key="instance.id"
          :class="['tab', { active: instance.id === activeInstanceId }]"
          @click="setActiveInstance(instance.id)"
        >
          <Icon 
            v-if="getInstancePersonality(instance.id)?.icon" 
            :name="getInstancePersonality(instance.id)!.icon" 
            size="14" 
            class="tab-icon"
          />
          <span class="tab-name">{{ instance.name }}</span>
          <div class="tab-status" :class="`status-${instance.status}`"></div>
          <button
            v-if="instances.length > 1"
            @click.stop="removeInstance(instance.id)"
            class="tab-close"
            title="Close terminal"
          >
            <Icon name="mdi:close" size="14" />
          </button>
        </div>
        <button
          @click="createNewInstance"
          class="tab-add"
          title="New Claude terminal"
        >
          <Icon name="mdi:plus" size="16" />
        </button>
      </div>
      
      <div class="header-actions">
        <!-- Personality selector moved to individual terminal headers -->
      </div>
    </div>
    
    <div class="terminals-container">
      <ClaudeTerminalTab
        v-for="instance in instances"
        :key="instance.id"
        v-show="instance.id === activeInstanceId"
        :instance="instance"
        @status-change="(status, pid) => updateInstanceStatus(instance.id, status, pid)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import ClaudeTerminalTab from './ClaudeTerminalTab.vue';

const instancesStore = useClaudeInstancesStore();

const instances = computed(() => instancesStore.instancesList);
const activeInstanceId = computed(() => instancesStore.activeInstanceId);
const activeInstance = computed(() => instancesStore.activeInstance);

const getInstancePersonality = (instanceId: string) => {
  return instancesStore.getInstancePersonality(instanceId);
};

const setActiveInstance = (id: string) => {
  instancesStore.setActiveInstance(id);
};

const createNewInstance = async () => {
  const count = instances.value.length + 1;
  await instancesStore.createInstance(`Claude ${count}`);
};

const removeInstance = async (id: string) => {
  if (confirm('Are you sure you want to close this Claude terminal?')) {
    await instancesStore.removeInstance(id);
  }
};

const updateInstanceStatus = (id: string, status: any, pid?: number) => {
  instancesStore.updateInstanceStatus(id, status, pid);
};

const updateInstancePersonality = (id: string, personalityId: string | undefined) => {
  instancesStore.updateInstancePersonality(id, personalityId);
};

onMounted(async () => {
  // Only initialize in client/electron context
  if (typeof window !== 'undefined' && window.electronAPI) {
    await instancesStore.init();
    
    // Load workspace configuration if workspace is set
    const { useWorkspaceManager } = await import('~/composables/useWorkspaceManager');
    const { currentWorkspacePath } = useWorkspaceManager();
    
    if (currentWorkspacePath.value) {
      await instancesStore.loadWorkspaceConfiguration(currentWorkspacePath.value);
    }
  } else {
    console.warn('ClaudeTerminalTabs: Electron API not available');
  }
});
</script>

<style scoped>
.claude-terminal-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.tabs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  padding: 0 8px;
  min-height: 38px;
  position: relative;
  z-index: 10;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.tabs-container::-webkit-scrollbar {
  height: 3px;
}

.tabs-container::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: #505050;
  border-radius: 3px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-bottom: none;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  position: relative;
  white-space: nowrap;
  font-size: 13px;
}

.tab:hover {
  background: #383838;
}

.tab.active {
  background: #1e1e1e;
  border-color: #181818;
  border-bottom-color: #1e1e1e;
}

.tab-icon {
  opacity: 0.8;
}

.tab-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 4px;
}

.status-connected {
  background: #0dbc79;
}

.status-connecting {
  background: #e5e510;
  animation: pulse 1.5s ease-in-out infinite;
}

.status-disconnected {
  background: #666;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 2px;
  margin-left: 4px;
  border-radius: 3px;
  opacity: 0;
  transition: all 0.2s;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: #505050;
  color: #fff;
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 3px;
  transition: all 0.2s;
}

.tab-add:hover {
  background: #383838;
  color: #fff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.terminals-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>