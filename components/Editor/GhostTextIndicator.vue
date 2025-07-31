<template>
  <Transition name="fade">
    <div 
      v-if="isLoading" 
      class="ghost-text-indicator"
      title="AI is generating suggestions..."
    >
      <div class="ai-brain">
        <div class="neural-network">
          <span class="neuron" v-for="i in 3" :key="i" :style="`--index: ${i}`"></span>
        </div>
        <Icon name="mdi:robot" size="14" class="ai-icon" />
      </div>
      <span class="loading-text">{{ loadingText }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAutocompleteStore } from '~/stores/autocomplete';

const autocompleteStore = useAutocompleteStore();

const isLoading = computed(() => {
  const loading = autocompleteStore.ghostTextLoading;
  console.log('[GhostTextIndicator] Loading state:', loading);
  return loading;
});

// Animated loading text
const loadingStates = ['Thinking', 'Analyzing', 'Generating', 'Crafting'];
const currentStateIndex = ref(0);
const loadingText = computed(() => loadingStates[currentStateIndex.value]);

// Cycle through loading states when loading
let interval: NodeJS.Timeout | null = null;
watch(isLoading, (loading) => {
  if (loading) {
    currentStateIndex.value = 0;
    interval = setInterval(() => {
      currentStateIndex.value = (currentStateIndex.value + 1) % loadingStates.length;
    }, 800);
  } else {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }
});
</script>

<style scoped>
.ghost-text-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(138, 97, 255, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(138, 97, 255, 0.2);
  user-select: none;
}

.ai-brain {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

.neural-network {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.neuron {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #8a61ff;
  border-radius: 50%;
  opacity: 0;
  animation: pulse 2.4s ease-in-out infinite;
  animation-delay: calc(var(--index) * 0.2s);
}

.neuron:nth-child(1) {
  transform: translateX(-8px);
}

.neuron:nth-child(2) {
  transform: translateY(-8px);
}

.neuron:nth-child(3) {
  transform: translateX(8px);
}

@keyframes pulse {
  0%, 60%, 100% {
    opacity: 0;
    transform: scale(0.8) translateX(var(--tx, 0)) translateY(var(--ty, 0));
  }
  30% {
    opacity: 1;
    transform: scale(1.2) translateX(var(--tx, 0)) translateY(var(--ty, 0));
  }
}

.ai-icon {
  color: #8a61ff;
  filter: drop-shadow(0 0 3px rgba(138, 97, 255, 0.5));
  animation: glow 2s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% {
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(138, 97, 255, 0.5));
  }
  50% {
    opacity: 1;
    filter: drop-shadow(0 0 6px rgba(138, 97, 255, 0.8));
  }
}

.loading-text {
  font-size: 11px;
  color: #8a61ff;
  font-weight: 500;
  animation: fadeText 0.8s ease-in-out;
}

@keyframes fadeText {
  0% {
    opacity: 0;
    transform: translateY(2px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Transition for the whole component */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>