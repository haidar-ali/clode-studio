<template>
  <div class="autocomplete-debug" v-if="show">
    <div class="debug-header">
      <span>Autocomplete Debug</span>
      <button @click="show = false">×</button>
    </div>
    <div class="debug-content">
      <div class="debug-item">
        <strong>Status:</strong>
        <span :class="['status', debugState.enabled ? 'enabled' : 'disabled']">
          {{ debugState.enabled ? 'Enabled' : 'Disabled' }}
        </span>
      </div>
      <div class="debug-item">
        <strong>Active:</strong>
        <span :class="['status', debugState.active ? 'active' : 'inactive']">
          {{ debugState.active ? 'Yes' : 'No' }}
        </span>
      </div>
      <div class="debug-item">
        <strong>Providers:</strong>
        <ul>
          <li>
            Claude: 
            <span :class="['status', debugState.providers.claude.enabled && debugState.providers.claude.available ? 'enabled' : 'disabled']">
              {{ debugState.providers.claude.enabled ? 'Enabled' : 'Disabled' }}
              {{ debugState.providers.claude.available ? '✓' : '✗' }}
            </span>
          </li>
          <li>
            LSP: 
            <span :class="['status', debugState.providers.lsp.enabled ? 'enabled' : 'disabled']">
              {{ debugState.providers.lsp.enabled ? 'Enabled' : 'Disabled' }}
              ({{ debugState.providers.lsp.connected.length }} connected)
            </span>
          </li>
        </ul>
      </div>
      <div class="debug-item">
        <strong>Active Completions:</strong> {{ debugState.activeCompletions }}
      </div>
      <div class="debug-item">
        <strong>Cache Size:</strong> {{ debugState.cacheSize }}
      </div>
      <div class="debug-item">
        <strong>Settings:</strong>
        <ul>
          <li>Timeout: {{ debugState.settings.timeout }}ms</li>
          <li>Context Lines: {{ debugState.settings.contextLines }}</li>
          <li>Model: {{ debugState.settings.model }}</li>
        </ul>
      </div>
      <div class="debug-actions">
        <button @click="triggerCompletion">Trigger Completion</button>
        <button @click="clearCache">Clear Cache</button>
        <button @click="refresh">Refresh</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAutocompleteStore } from '~/stores/autocomplete';
import { startCompletion } from '@codemirror/autocomplete';

const autocompleteStore = useAutocompleteStore();
const show = ref(false);

const debugState = computed(() => autocompleteStore.getDebugState());

const triggerCompletion = () => {
  // Dispatch event to trigger completion
  window.dispatchEvent(new CustomEvent('autocomplete:trigger'));

};

const clearCache = () => {
  autocompleteStore.clearCache();

};

const refresh = () => {
  // Force refresh debug state

};

// Keyboard shortcut to toggle debug panel
const handleKeydown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    show.value = !show.value;
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.autocomplete-debug {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 300px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  font-size: 12px;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #333;
  border-bottom: 1px solid #444;
}

.debug-header button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.debug-header button:hover {
  color: #fff;
}

.debug-content {
  padding: 12px;
}

.debug-item {
  margin-bottom: 8px;
}

.debug-item strong {
  color: #e0e0e0;
}

.debug-item ul {
  margin: 4px 0 0 20px;
  padding: 0;
  list-style: none;
}

.debug-item li {
  margin: 2px 0;
}

.status {
  font-weight: 500;
}

.status.enabled,
.status.active {
  color: #4ec9b0;
}

.status.disabled,
.status.inactive {
  color: #f48771;
}

.debug-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.debug-actions button {
  flex: 1;
  padding: 4px 8px;
  background: #444;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.debug-actions button:hover {
  background: #555;
}
</style>