<template>
  <div class="context-meter" :class="contextStatusClass">
    <div class="meter-container" @click="$emit('click')">
      <div class="meter-background">
        <div 
          class="meter-fill" 
          :style="{ width: fillWidth }"
          :class="{ 'animated': animated }"
        ></div>
        <div class="meter-segments">
          <div 
            v-for="segment in segments" 
            :key="segment.type"
            class="meter-segment"
            :style="{ width: segment.width, backgroundColor: segment.color }"
            :title="`${segment.type}: ${formatTokens(segment.tokens)}`"
          ></div>
        </div>
      </div>
      <div class="meter-label">
        <span class="percentage">{{ usage.percentage }}%</span>
        <span class="tokens">{{ formatTokens(usage.current) }} / {{ formatTokens(usage.maximum) }}</span>
      </div>
    </div>
    
    <div v-if="showWarning" class="meter-warning">
      <Icon :name="warningIcon" size="16" />
      <span>{{ warningMessage }}</span>
    </div>
    
    <div v-if="showOptimization" class="meter-optimization">
      <button @click="$emit('optimize')" class="optimize-button">
        <Icon name="mdi:auto-fix" size="14" />
        Optimize (save ~{{ formatTokens(potentialSaving) }})
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useContextStore } from '~/stores/context';
import { useTokenCounter } from '~/composables/useTokenCounter';

const props = defineProps<{
  animated?: boolean;
  showWarning?: boolean;
  showOptimization?: boolean;
}>();

const emit = defineEmits<{
  click: [];
  optimize: [];
}>();

const contextStore = useContextStore();
const { formatTokenCount } = useTokenCounter();

const usage = computed(() => contextStore.contextUsage);
const status = computed(() => contextStore.contextStatus);
const availableOptimizations = computed(() => contextStore.availableOptimizations);

const fillWidth = computed(() => `${Math.min(100, usage.value.percentage)}%`);

const contextStatusClass = computed(() => ({
  'status-normal': status.value === 'normal',
  'status-warning': status.value === 'warning',
  'status-critical': status.value === 'critical',
  'status-danger': status.value === 'danger'
}));

const segments = computed(() => {
  const total = usage.value.current || 1;
  const breakdown = usage.value.breakdown;
  
  return [
    {
      type: 'chat',
      tokens: breakdown.chat,
      width: `${(breakdown.chat / total) * 100}%`,
      color: '#3b82f6' // blue
    },
    {
      type: 'code',
      tokens: breakdown.code,
      width: `${(breakdown.code / total) * 100}%`,
      color: '#10b981' // green
    },
    {
      type: 'knowledge',
      tokens: breakdown.knowledge,
      width: `${(breakdown.knowledge / total) * 100}%`,
      color: '#f59e0b' // amber
    },
    {
      type: 'system',
      tokens: breakdown.system,
      width: `${(breakdown.system / total) * 100}%`,
      color: '#6b7280' // gray
    }
  ].filter(s => s.tokens > 0);
});

const warningIcon = computed(() => {
  switch (status.value) {
    case 'warning': return 'mdi:alert';
    case 'critical': return 'mdi:alert-circle';
    case 'danger': return 'mdi:alert-octagon';
    default: return 'mdi:information';
  }
});

const warningMessage = computed(() => {
  switch (status.value) {
    case 'warning': return 'Context usage is getting high';
    case 'critical': return 'Context is almost full';
    case 'danger': return 'Context limit reached!';
    default: return '';
  }
});

const potentialSaving = computed(() => {
  return availableOptimizations.value.reduce((sum, opt) => sum + opt.estimatedSaving, 0);
});

const formatTokens = (tokens: number) => {
  return formatTokenCount(tokens).replace(' tokens', '');
};

// Animate on significant changes
watch(() => usage.value.percentage, (newVal, oldVal) => {
  if (Math.abs(newVal - oldVal) > 5) {
    // Trigger animation
  }
});
</script>

<style scoped>
.context-meter {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meter-container {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.meter-container:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.meter-background {
  position: relative;
  width: 120px;
  height: 8px;
  background-color: #374151;
  border-radius: 4px;
  overflow: hidden;
}

.meter-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: #3b82f6;
  transition: width 0.3s ease-out;
  z-index: 1;
}

.meter-fill.animated {
  animation: pulse 2s ease-in-out infinite;
}

.meter-segments {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  z-index: 2;
}

.meter-segment {
  height: 100%;
  opacity: 0.8;
  transition: width 0.3s ease-out;
}

.meter-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}

.percentage {
  font-weight: 600;
}

.tokens {
  font-size: 10px;
}

/* Status colors */
.status-normal .meter-fill {
  background-color: #10b981;
}

.status-warning .meter-fill {
  background-color: #f59e0b;
}

.status-warning .percentage {
  color: #f59e0b;
}

.status-critical .meter-fill {
  background-color: #ef4444;
}

.status-critical .percentage {
  color: #ef4444;
}

.status-danger .meter-fill {
  background-color: #dc2626;
  animation: blink 1s ease-in-out infinite;
}

.status-danger .percentage {
  color: #dc2626;
  font-weight: 700;
}

.meter-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  font-size: 11px;
  color: #fbbf24;
}

.status-critical .meter-warning,
.status-danger .meter-warning {
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.15);
}

.meter-optimization {
  margin-top: 4px;
}

.optimize-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.optimize-button:hover {
  background-color: #2563eb;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>