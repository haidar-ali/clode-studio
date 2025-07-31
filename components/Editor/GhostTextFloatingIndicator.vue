<template>
  <Teleport to="body">
    <Transition name="slide-fade">
      <div 
        v-if="isLoading && editorElement" 
        class="ghost-text-floating-indicator"
        :style="floatingStyle"
      >
        <div class="indicator-content">
          <div class="ai-brain">
            <div class="neural-network">
              <span class="neuron" v-for="i in 3" :key="i" :style="`--index: ${i}`"></span>
            </div>
            <Icon name="mdi:robot" size="16" class="ai-icon" />
          </div>
          <div class="text-content">
            <span class="loading-text">{{ loadingText }}</span>
            <span class="sub-text">AI is crafting your code...</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useAutocompleteStore } from '~/stores/autocomplete';
import { useEditorStore } from '~/stores/editor';

const autocompleteStore = useAutocompleteStore();
const editorStore = useEditorStore();

const isLoading = computed(() => autocompleteStore.ghostTextLoading);
const editorElement = ref<HTMLElement | null>(null);
const floatingStyle = ref({});

// Animated loading text
const loadingStates = ['Thinking', 'Analyzing', 'Generating', 'Crafting'];
const currentStateIndex = ref(0);
const loadingText = computed(() => loadingStates[currentStateIndex.value]);

// Update position based on active editor
const updatePosition = () => {
  const activeTab = editorStore.activeTab;
  if (!activeTab) return;
  
  // Find the CodeMirror editor element
  const editor = document.querySelector('.cm-editor');
  if (editor) {
    editorElement.value = editor as HTMLElement;
    const rect = editor.getBoundingClientRect();
    
    floatingStyle.value = {
      left: `${rect.left + rect.width / 2}px`,
      bottom: `${window.innerHeight - rect.bottom + 30}px`, // 30px above status bar
      transform: 'translateX(-50%)'
    };
  }
};

// Watch for editor changes
watch(() => editorStore.activeTabId, () => {
  setTimeout(updatePosition, 100);
});

// Cycle through loading states when loading
let interval: NodeJS.Timeout | null = null;
watch(isLoading, (loading) => {
  if (loading) {
    currentStateIndex.value = 0;
    updatePosition();
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

onMounted(() => {
  updatePosition();
  window.addEventListener('resize', updatePosition);
});

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition);
  if (interval) {
    clearInterval(interval);
  }
});
</script>

<style scoped>
.ghost-text-floating-indicator {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
}

.indicator-content {
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  padding: 10px 16px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.5),
    0 0 24px rgba(0, 122, 204, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 260px;
}

.ai-brain {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
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
  background: #007acc;
  border-radius: 50%;
  opacity: 0;
  box-shadow: 0 0 8px rgba(0, 122, 204, 0.6);
  animation: pulse 2.4s ease-in-out infinite;
  animation-delay: calc(var(--index) * 0.2s);
}

.neuron:nth-child(1) {
  transform: translateX(-12px);
}

.neuron:nth-child(2) {
  transform: translateY(-12px);
}

.neuron:nth-child(3) {
  transform: translateX(12px);
}

@keyframes pulse {
  0%, 60%, 100% {
    opacity: 0;
    transform: scale(0.6) translateX(var(--tx, 0)) translateY(var(--ty, 0));
  }
  30% {
    opacity: 1;
    transform: scale(1.4) translateX(var(--tx, 0)) translateY(var(--ty, 0));
  }
}

.ai-icon {
  color: #007acc;
  filter: drop-shadow(0 0 6px rgba(0, 122, 204, 0.4));
  animation: glow 2s ease-in-out infinite;
  z-index: 1;
}

@keyframes glow {
  0%, 100% {
    opacity: 0.8;
    filter: drop-shadow(0 0 6px rgba(0, 122, 204, 0.4));
  }
  50% {
    opacity: 1;
    filter: drop-shadow(0 0 10px rgba(0, 122, 204, 0.7));
  }
}

.text-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.loading-text {
  font-size: 13px;
  color: #e0e0e0;
  font-weight: 500;
  animation: fadeText 0.8s ease-in-out;
}

.sub-text {
  font-size: 11px;
  color: #858585;
  font-weight: 400;
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

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(0, 122, 204, 0.2);
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007acc 0%, #4ec9b0 100%);
  animation: progress 2s ease-in-out infinite;
}

@keyframes progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/* Transition for the whole component */
.slide-fade-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.6, 1);
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px) scale(0.95);
}
</style>