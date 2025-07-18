<template>
  <Transition name="think-indicator">
    <div v-if="isThinking" class="think-mode-indicator">
      <div class="think-animation">
        <div class="think-dot" :style="{ animationDelay: '0s' }"></div>
        <div class="think-dot" :style="{ animationDelay: '0.2s' }"></div>
        <div class="think-dot" :style="{ animationDelay: '0.4s' }"></div>
      </div>
      <div class="think-text">
        <span class="think-level">{{ thinkLevelText }}</span>
        <span class="think-status">{{ statusText }}</span>
      </div>
      <div v-if="showProgress" class="think-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

export type ThinkLevel = 'normal' | 'more' | 'hard' | 'ultra';

const props = defineProps<{
  instanceId: string;
  isActive: boolean;
  thinkLevel: ThinkLevel;
}>();

const isThinking = ref(false);
const startTime = ref<number>(0);
const elapsedTime = ref(0);
let intervalId: NodeJS.Timeout | null = null;

const thinkLevelText = computed(() => {
  const levels = {
    normal: 'Thinking',
    more: 'Thinking More',
    hard: 'Thinking Harder',
    ultra: 'Ultra Thinking'
  };
  return levels[props.thinkLevel] || 'Thinking';
});

const statusText = computed(() => {
  if (elapsedTime.value < 2000) return 'Analyzing...';
  if (elapsedTime.value < 5000) return 'Processing...';
  if (elapsedTime.value < 10000) return 'Deep analysis...';
  if (elapsedTime.value < 20000) return 'Complex reasoning...';
  return 'Extended thinking...';
});

const showProgress = computed(() => {
  return props.thinkLevel === 'hard' || props.thinkLevel === 'ultra';
});

const progressPercent = computed(() => {
  const maxTime = props.thinkLevel === 'ultra' ? 30000 : 15000;
  return Math.min((elapsedTime.value / maxTime) * 100, 95);
});

// Start thinking animation
const startThinking = () => {
  isThinking.value = true;
  startTime.value = Date.now();
  elapsedTime.value = 0;
  
  intervalId = setInterval(() => {
    elapsedTime.value = Date.now() - startTime.value;
  }, 100);
};

// Stop thinking animation
const stopThinking = () => {
  isThinking.value = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  elapsedTime.value = 0;
};

// Watch for activation
watch(() => props.isActive, (active) => {
  if (active) {
    startThinking();
  } else {
    stopThinking();
  }
});

// Listen for thinking events
const handleThinkingStart = (event: CustomEvent) => {
  if (event.detail.instanceId === props.instanceId) {
    startThinking();
  }
};

const handleThinkingStop = (event: CustomEvent) => {
  if (event.detail.instanceId === props.instanceId) {
    stopThinking();
  }
};

// Lifecycle
onMounted(() => {
  window.addEventListener('thinking-start', handleThinkingStart as EventListener);
  window.addEventListener('thinking-stop', handleThinkingStop as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('thinking-start', handleThinkingStart as EventListener);
  window.removeEventListener('thinking-stop', handleThinkingStop as EventListener);
  if (intervalId) {
    clearInterval(intervalId);
  }
});
</script>

<style scoped>
.think-mode-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #252526;
  border: 1px solid #007acc;
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
  box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3);
  z-index: 100;
}

.think-animation {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.think-dot {
  width: 8px;
  height: 8px;
  background: #007acc;
  border-radius: 50%;
  animation: think-pulse 1.2s ease-in-out infinite;
}

@keyframes think-pulse {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.think-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.think-level {
  font-size: 12px;
  font-weight: 600;
  color: #cccccc;
}

.think-status {
  font-size: 11px;
  color: #858585;
}

.think-progress {
  margin-top: 4px;
}

.progress-bar {
  height: 3px;
  background: #1e1e1e;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #007acc;
  transition: width 0.3s ease;
  border-radius: 2px;
}

/* Transitions */
.think-indicator-enter-active,
.think-indicator-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.think-indicator-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.think-indicator-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Different styles for different think levels */
.think-mode-indicator[data-level="more"] {
  border-color: #f9c74f;
}

.think-mode-indicator[data-level="more"] .think-dot {
  background: #f9c74f;
}

.think-mode-indicator[data-level="more"] .progress-fill {
  background: #f9c74f;
}

.think-mode-indicator[data-level="hard"] {
  border-color: #f8961e;
}

.think-mode-indicator[data-level="hard"] .think-dot {
  background: #f8961e;
}

.think-mode-indicator[data-level="hard"] .progress-fill {
  background: #f8961e;
}

.think-mode-indicator[data-level="ultra"] {
  border-color: #f94144;
  animation: ultra-glow 2s ease-in-out infinite;
}

.think-mode-indicator[data-level="ultra"] .think-dot {
  background: #f94144;
}

.think-mode-indicator[data-level="ultra"] .progress-fill {
  background: #f94144;
}

@keyframes ultra-glow {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(249, 65, 68, 0.3);
  }
  50% {
    box-shadow: 0 2px 16px rgba(249, 65, 68, 0.6);
  }
}
</style>