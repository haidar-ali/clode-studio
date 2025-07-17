<template>
  <div class="status-bar">
    <div class="status-bar-left">
      <span class="status-item">
        <Icon name="mdi:source-branch" />
        main
      </span>
      <span class="status-item" v-if="activeTab">
        {{ activeTab.language }}
      </span>
    </div>
    
    <div class="status-bar-center">
      <span class="status-item" :class="claudeStatusClass">
        <Icon :name="claudeStatusIcon" />
        Claude: {{ claudeStatus }}
      </span>
    </div>
    
    <div class="status-bar-right">
      <div class="context-meter-wrapper">
        <ContextMeter 
          :animated="true"
          :show-warning="contextStore.contextStatus !== 'normal'"
          @click="showContextDetails"
          @optimize="optimizeContext"
        />
      </div>
      <span class="status-item" v-if="activeTab">
        Ln {{ cursorLine }}, Col {{ cursorColumn }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useContextStore } from '~/stores/context';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import ContextMeter from '~/components/Context/ContextMeter.vue';

const editorStore = useEditorStore();
const chatStore = useChatStore();
const contextStore = useContextStore();
const claudeInstancesStore = useClaudeInstancesStore();

const activeTab = computed(() => editorStore.activeTab);
const claudeStatus = computed(() => {
  const activeInstance = claudeInstancesStore.activeInstance;
  return activeInstance?.status || 'disconnected';
});

const cursorLine = ref(1);
const cursorColumn = ref(1);
const contextPercentage = computed(() => contextStore.contextUsage.percentage);

const claudeStatusClass = computed(() => ({
  'status-connected': claudeStatus.value === 'connected',
  'status-disconnected': claudeStatus.value === 'disconnected',
  'status-connecting': claudeStatus.value === 'connecting'
}));

const claudeStatusIcon = computed(() => {
  switch (claudeStatus.value) {
    case 'connected':
      return 'mdi:check-circle';
    case 'connecting':
      return 'mdi:loading';
    case 'disconnected':
    default:
      return 'mdi:alert-circle';
  }
});

const showContextDetails = () => {
  // TODO: Emit event to show context optimization panel
  console.log('Show context details');
};

const optimizeContext = async () => {
  await contextStore.optimizeContext();
};
</script>

<style scoped>
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #007acc;
  color: white;
  height: 22px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
}

.status-bar-left,
.status-bar-center,
.status-bar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-connected {
  color: #4ec9b0;
}

.status-disconnected {
  color: #f48771;
}

.status-connecting {
  color: #e7c547;
}

.context-meter-wrapper {
  display: flex;
  align-items: center;
  padding: 0 8px;
}
</style>