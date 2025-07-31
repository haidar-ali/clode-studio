<template>
  <div 
    class="autocomplete-status"
    :class="{ 
      active: isActive,
      disabled: !isEnabled 
    }"
    @click="showSettings"
    :title="statusTooltip"
  >
    <Icon 
      :name="statusIcon" 
      size="14" 
      :class="{ 'spin': isLoading }"
    />
    <span class="status-text">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAutocompleteStore } from '~/stores/autocomplete';

const autocompleteStore = useAutocompleteStore();

const emit = defineEmits<{
  'show-settings': [];
}>();

const isEnabled = computed(() => autocompleteStore.settings.enabled);
const isActive = computed(() => autocompleteStore.activeCompletions.length > 0);
const isLoading = computed(() => autocompleteStore.isActive);

const statusIcon = computed(() => {
  if (!isEnabled.value) return 'mdi:code-braces-box';
  if (isLoading.value) return 'mdi:loading';
  return 'mdi:code-braces';
});

const statusText = computed(() => {
  if (!isEnabled.value) return 'Autocomplete Off';
  if (isLoading.value) return 'Completing...';
  
  const enabledProviders = [];
  if (autocompleteStore.settings.providers.claude.enabled) {
    // Claude autocomplete uses the SDK directly, not terminal instances
    // Check SDK health status
    if (autocompleteStore.settings.privacy.mode === 'offline') {
      enabledProviders.push('Claude (offline mode)');
    } else if (autocompleteStore.claudeSDKHealth.available) {
      enabledProviders.push('Claude');
    } else if (autocompleteStore.claudeSDKHealth.status === 'unchecked') {
      enabledProviders.push('Claude (checking...)');
    } else {
      // Show specific error status
      const errorMsg = autocompleteStore.claudeSDKHealth.error || autocompleteStore.claudeSDKHealth.status;
      enabledProviders.push(`Claude (${errorMsg})`);
    }
  }
  if (autocompleteStore.settings.providers.lsp.enabled) {
    const connectedServers = autocompleteStore.lspStatus.connectedServers || [];
    if (connectedServers.length > 0) {
      enabledProviders.push(`LSP (${connectedServers.length} active)`);
    } else {
      enabledProviders.push('LSP (none active)');
    }
  }
  if (autocompleteStore.settings.providers.cache.enabled) enabledProviders.push('Cache');
  
  return enabledProviders.length > 0 ? `AC: ${enabledProviders.join(', ')}` : 'No Providers';
});

const statusTooltip = computed(() => {
  if (!isEnabled.value) return 'Click to enable autocomplete';
  
  const stats = [];
  if (autocompleteStore.metrics.totalCompletions > 0) {
    stats.push(`${autocompleteStore.metrics.totalCompletions} completions`);
  }
  if (autocompleteStore.metrics.avgLatency.claude > 0) {
    stats.push(`Claude: ${Math.round(autocompleteStore.metrics.avgLatency.claude)}ms`);
  }
  if (autocompleteStore.metrics.avgLatency.lsp > 0) {
    stats.push(`LSP: ${Math.round(autocompleteStore.metrics.avgLatency.lsp)}ms`);
  }
  
  return stats.length > 0 ? stats.join(' • ') : 'Click for settings';
});

const showSettings = () => {
  emit('show-settings');
};
</script>

<style scoped>
.autocomplete-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
}

.autocomplete-status:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.autocomplete-status.disabled {
  opacity: 0.5;
}

.autocomplete-status.active {
  color: #4ec9b0;
}

.status-text {
  font-size: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>