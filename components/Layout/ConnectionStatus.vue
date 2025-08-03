<template>
  <div>
    <button 
      class="connection-status-btn"
      :class="statusClass"
      @click="showModal = true"
      title="Click to view connection details"
    >
      <div class="status-main">
        <Icon :name="statusIcon" :class="{ 'animate-spin': isConnecting }" />
        <span class="status-text">{{ statusText }}</span>
        <Icon name="mdi:chevron-down" class="expand-icon" />
      </div>
      
    </button>
    
    <ConnectionStatusModal 
      :show="showModal" 
      @close="showModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useConnectionManager } from '~/composables/useConnectionManager';
import ConnectionStatusModal from './ConnectionStatusModal.vue';

const connectionManager = useConnectionManager();

const showModal = ref(false);

// Connection state
const connectionState = computed(() => connectionManager.state.value);
const isConnected = computed(() => connectionState.value === 'connected' || connectionState.value === 'synchronized');
const isConnecting = computed(() => connectionState.value === 'connecting' || connectionState.value === 'syncing');
const serverUrl = computed(() => connectionManager.serverUrl.value);
const sessionId = computed(() => connectionManager.sessionId.value);
const currentDeviceId = computed(() => connectionManager.currentDeviceId.value);
const connectedDevices = computed(() => connectionManager.connectedDevices.value);

// Performance metrics
const latency = computed(() => connectionManager.latency.value);


// Status display
const statusClass = computed(() => ({
  'status-offline': connectionState.value === 'offline',
  'status-connecting': isConnecting.value,
  'status-connected': connectionState.value === 'connected',
  'status-synchronized': connectionState.value === 'synchronized',
  'status-error': connectionState.value === 'error'
}));

const statusIcon = computed(() => {
  switch (connectionState.value) {
    case 'offline': return 'ph:wifi-slash';
    case 'connecting': return 'ph:circle-notch';
    case 'connected': return 'ph:wifi-high';
    case 'syncing': return 'ph:arrow-clockwise';
    case 'synchronized': return 'ph:check-circle';
    case 'error': return 'ph:warning-circle';
    default: return 'ph:circle';
  }
});

const statusText = computed(() => {
  switch (connectionState.value) {
    case 'offline': return 'Offline';
    case 'connecting': return 'Connecting...';
    case 'connected': return 'Connected';
    case 'syncing': return 'Syncing...';
    case 'synchronized': return 'Synchronized';
    case 'error': return 'Connection Error';
    default: return 'Unknown';
  }
});

</script>

<style scoped>
.connection-status-btn {
  @apply flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer
         transition-all duration-200 select-none relative
         font-medium text-sm;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  min-width: 160px;
}

.connection-status-btn:hover {
  background: var(--color-surface-3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.connection-status-btn:active {
  transform: translateY(0);
}

/* Status classes */
.status-offline {
  --status-color: var(--color-text-3);
}

.status-connecting {
  --status-color: var(--color-blue);
}

.status-connected {
  --status-color: var(--color-green);
}

.status-synchronized {
  --status-color: var(--color-green);
}

.status-error {
  --status-color: var(--color-red);
}

/* Main status */
.status-main {
  @apply flex items-center gap-2 w-full;
  color: var(--status-color);
}

.status-text {
  @apply flex-1 text-left;
}

.expand-icon {
  @apply text-xs opacity-60 transition-opacity;
}

.connection-status-btn:hover .expand-icon {
  opacity: 1;
}

/* Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

</style>