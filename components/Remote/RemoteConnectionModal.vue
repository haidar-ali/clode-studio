<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Connecting to Clode Studio</h2>
      </div>
      
      <div class="modal-body">
        <div v-if="connecting" class="connecting-state">
          <div class="spinner"></div>
          <p>Establishing connection...</p>
        </div>
        
        <div v-else-if="error" class="error-state">
          <Icon name="mdi:alert-circle" />
          <p>Connection failed</p>
          <p class="error-message">{{ error }}</p>
          <div class="debug-info">
            <p>Device ID: {{ deviceId || 'None' }}</p>
            <p>Has Token: {{ !!deviceToken }}</p>
            <p>Has Pairing: {{ !!pairingCode }}</p>
            <p>Server URL: {{ debugInfo.serverUrl || 'Not set' }}</p>
            <p>Transport: {{ debugInfo.transport || 'None' }}</p>
            <p>Error Type: {{ debugInfo.errorType || 'Unknown' }}</p>
            <p>User Agent: {{ debugInfo.userAgent }}</p>
            <p>Protocol: {{ debugInfo.protocol }}</p>
            <p>Host: {{ debugInfo.host }}</p>
          </div>
          <button @click="retry" class="retry-btn">
            Retry Connection
          </button>
        </div>
        
        <div v-else-if="!hasCredentials" class="no-credentials">
          <Icon name="mdi:qrcode" />
          <p>No connection credentials found</p>
          <p class="hint">Please scan the QR code from your desktop Clode Studio</p>
        </div>
        
        <div v-else class="ready-state">
          <Icon name="mdi:check-circle" />
          <p>Ready to connect</p>
          <p class="device-info">Device ID: {{ deviceId }}</p>
          <p v-if="pairingCode" class="device-info">Pairing: {{ pairingCode }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRemoteConnection } from '~/composables/useRemoteConnection';

interface Props {
  show: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  connected: [];
}>();

const { connect, connected, connecting, error, debugInfo: connectionDebugInfo } = useRemoteConnection();

const deviceId = ref<string>('');
const deviceToken = ref<string>('');
const pairingCode = ref<string>('');

const debugInfo = ref({
  serverUrl: '',
  transport: '',
  errorType: '',
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
  protocol: typeof window !== 'undefined' ? window.location.protocol : 'Unknown',
  host: typeof window !== 'undefined' ? window.location.host : 'Unknown'
});

const hasCredentials = computed(() => !!(deviceId.value && deviceToken.value));

async function attemptConnection() {
  if (!hasCredentials.value) return;
  
  try {
    // Update debug info with connection details
    debugInfo.value = {
      ...debugInfo.value,
      serverUrl: connectionDebugInfo.value.serverUrl || 'Not set',
      transport: connectionDebugInfo.value.transport || 'None',
      errorType: connectionDebugInfo.value.errorType || 'None'
    };
    
    await connect({
      deviceId: deviceId.value,
      deviceToken: deviceToken.value
    });
    
    if (connected.value) {
      emit('connected');
    }
  } catch (err) {
    console.error('Connection failed:', err);
    // Update debug info with error details
    debugInfo.value = {
      ...debugInfo.value,
      serverUrl: connectionDebugInfo.value.serverUrl || 'Not set',
      transport: connectionDebugInfo.value.transport || 'None',
      errorType: connectionDebugInfo.value.errorType || err.message
    };
  }
}

async function retry() {
  await attemptConnection();
}

// Watch for debug info changes
watch([connectionDebugInfo, error], () => {
  if (connectionDebugInfo.value.serverUrl) {
    debugInfo.value = {
      ...debugInfo.value,
      serverUrl: connectionDebugInfo.value.serverUrl,
      transport: connectionDebugInfo.value.transport || 'None',
      errorType: connectionDebugInfo.value.errorType || 'None'
    };
  }
});

onMounted(() => {
  // Extract credentials from URL
  const urlParams = new URLSearchParams(window.location.search);
  deviceId.value = urlParams.get('deviceId') || '';
  deviceToken.value = urlParams.get('token') || '';
  pairingCode.value = urlParams.get('pairing') || '';
  
  // Auto-connect if credentials exist
  if (hasCredentials.value) {
    attemptConnection();
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-content {
  background: var(--color-bg-primary);
  border-radius: 8px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-border);
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  text-align: center;
}

.modal-body {
  padding: 40px 20px;
  text-align: center;
}

.connecting-state,
.error-state,
.no-credentials,
.ready-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state svg {
  width: 48px;
  height: 48px;
  color: var(--color-error);
}

.no-credentials svg,
.ready-state svg {
  width: 48px;
  height: 48px;
  color: var(--color-primary);
}

.error-message {
  color: var(--color-error);
  font-size: 14px;
}

.hint {
  font-size: 14px;
  color: var(--color-text-secondary);
  max-width: 300px;
}

.device-info {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.retry-btn {
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.retry-btn:hover {
  opacity: 0.9;
}

.debug-info {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px;
  margin: 12px 0;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
}

.debug-info p {
  margin: 2px 0;
}
</style>