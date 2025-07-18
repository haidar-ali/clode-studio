<template>
  <div class="instance-status-indicator">
    <div 
      v-for="instance in instances" 
      :key="instance.id"
      class="instance-badge"
      :class="{
        'is-active': instance.status === 'connected',
        'is-thinking': thinkingInstances.has(instance.id),
        'just-finished': finishedInstances.has(instance.id)
      }"
      @click="() => emit('select-instance', instance.id)"
      :title="`${instance.name} - ${getStatusText(instance)}`"
    >
      <Icon 
        :name="getInstanceIcon(instance)" 
        size="14" 
      />
      <span class="instance-name">{{ instance.name }}</span>
      <span v-if="thinkingInstances.has(instance.id)" class="thinking-dot"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import type { ClaudeInstance } from '~/stores/claude-instances';

const emit = defineEmits<{
  'select-instance': [instanceId: string]
}>();

const instancesStore = useClaudeInstancesStore();
const instances = computed(() => instancesStore.instancesList);

// Track thinking and finished states
const thinkingInstances = ref(new Set<string>());
const finishedInstances = ref(new Set<string>());

// State tracking based on output patterns
const outputBuffers = new Map<string, string>();
const BUFFER_SIZE = 500; // Keep last 500 chars per instance

const getStatusText = (instance: ClaudeInstance) => {
  if (instance.status === 'disconnected') return 'Disconnected';
  if (thinkingInstances.value.has(instance.id)) return 'Thinking...';
  if (finishedInstances.value.has(instance.id)) return 'Finished';
  return 'Connected';
};

const getInstanceIcon = (instance: ClaudeInstance) => {
  if (instance.status === 'disconnected') return 'mdi:power-off';
  if (thinkingInstances.value.has(instance.id)) return 'mdi:brain';
  if (finishedInstances.value.has(instance.id)) return 'mdi:check-circle';
  return 'mdi:console';
};

// Monitor Claude output to detect thinking/finished states
const setupOutputMonitoring = () => {
  instances.value.forEach(instance => {
    if (instance.status === 'connected') {
      // Listen to output for this instance
      window.electronAPI.claude.onOutput(instance.id, (data: string) => {
        // Update output buffer
        let buffer = outputBuffers.get(instance.id) || '';
        buffer = (buffer + data).slice(-BUFFER_SIZE);
        outputBuffers.set(instance.id, buffer);
        
        // Detect thinking patterns
        if (data.includes('🤔') || data.includes('thinking') || data.includes('analyzing')) {
          thinkingInstances.value.add(instance.id);
          finishedInstances.value.delete(instance.id);
        }
        
        // Detect completion patterns
        if (buffer.includes('Human:') && !data.includes('Human:')) {
          // Claude finished responding (Human: prompt appeared)
          thinkingInstances.value.delete(instance.id);
          finishedInstances.value.add(instance.id);
          
          // Clear finished state after 3 seconds
          setTimeout(() => {
            finishedInstances.value.delete(instance.id);
          }, 3000);
        }
      });
    }
  });
};

// Watch for instance changes
let cleanupFunctions: (() => void)[] = [];

const cleanup = () => {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];
};

onMounted(() => {
  setupOutputMonitoring();
  
  // Re-setup when instances change
  instancesStore.$subscribe(() => {
    cleanup();
    setupOutputMonitoring();
  });
});

onUnmounted(() => {
  cleanup();
  outputBuffers.clear();
});
</script>

<style scoped>
.instance-status-indicator {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  align-items: center;
}

.instance-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  position: relative;
}

.instance-badge:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.instance-badge.is-active {
  background: rgba(0, 122, 204, 0.2);
  border: 1px solid rgba(0, 122, 204, 0.5);
}

.instance-badge.is-thinking {
  background: rgba(255, 193, 7, 0.2);
  border: 1px solid rgba(255, 193, 7, 0.5);
  animation: pulse 2s infinite;
}

.instance-badge.just-finished {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.instance-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thinking-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  background: #ffc107;
  border-radius: 50%;
  animation: blink 1s infinite;
}

@keyframes pulse {
  0% { opacity: 0.8; }
  50% { opacity: 1; }
  100% { opacity: 0.8; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>