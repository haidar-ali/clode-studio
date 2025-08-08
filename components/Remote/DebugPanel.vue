<template>
  <div class="debug-panel">
    <h3>Debug Information</h3>
    <div class="debug-content">
      <p><strong>Connection Status:</strong> {{ connectionStatus }}</p>
      <p><strong>Error:</strong> {{ error || 'None' }}</p>
      <p><strong>Server URL:</strong> {{ serverUrl }}</p>
      <p><strong>Current URL:</strong> {{ currentUrl }}</p>
      <p><strong>Protocol:</strong> {{ protocol }}</p>
      <p><strong>Hostname:</strong> {{ hostname }}</p>
      <p><strong>Port:</strong> {{ port }}</p>
      <p><strong>User Agent:</strong></p>
      <p class="user-agent">{{ userAgent }}</p>
      <p><strong>Time:</strong> {{ timestamp }}</p>
      
      <div v-if="logs.length > 0" class="logs">
        <h4>Connection Logs:</h4>
        <div v-for="(log, index) in logs" :key="index" class="log-entry">
          {{ log }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRemoteConnection } from '~/composables/useRemoteConnection';

const { connected, connecting, error, debugInfo } = useRemoteConnection();

const logs = ref<string[]>([]);
const timestamp = ref(new Date().toLocaleTimeString());

const connectionStatus = computed(() => {
  if (connecting.value) return 'Connecting...';
  if (connected.value) return 'Connected';
  return 'Disconnected';
});

const currentUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.href;
  }
  return 'Unknown';
});

const protocol = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.protocol;
  }
  return 'Unknown';
});

const hostname = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'Unknown';
});

const port = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  }
  return 'Unknown';
});

const userAgent = computed(() => {
  if (typeof navigator !== 'undefined') {
    return navigator.userAgent;
  }
  return 'Unknown';
});

const serverUrl = computed(() => {
  return debugInfo.value?.serverUrl || 'Not set';
});

function addLog(message: string) {
  logs.value.push(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (logs.value.length > 20) {  // Increased from 10 to 20
    logs.value.shift();
  }
}

// Override console methods to capture logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  originalLog(...args);
  addLog(`LOG: ${args.join(' ')}`);
};

console.error = (...args) => {
  originalError(...args);
  addLog(`ERROR: ${args.join(' ')}`);
};

console.warn = (...args) => {
  originalWarn(...args);
  addLog(`WARN: ${args.join(' ')}`);
};

// Update timestamp every second
onMounted(() => {
  setInterval(() => {
    timestamp.value = new Date().toLocaleTimeString();
  }, 1000);
  
  // Log initial state
  addLog('Debug panel mounted');
  addLog(`Initial URL: ${currentUrl.value}`);
});

// Expose addLog for external use
defineExpose({ addLog });
</script>

<style scoped>
.debug-panel {
  position: fixed;
  bottom: 60px;
  left: 10px;
  right: 10px;
  max-height: 300px;
  background: rgba(0, 0, 0, 0.9);
  color: #00ff00;
  padding: 10px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 12px;
  overflow-y: auto;
  z-index: 9999;
  border: 1px solid #00ff00;
}

.debug-panel h3 {
  margin: 0 0 10px 0;
  color: #00ff00;
  font-size: 14px;
}

.debug-panel h4 {
  margin: 10px 0 5px 0;
  color: #00ff00;
  font-size: 12px;
}

.debug-content p {
  margin: 2px 0;
  word-break: break-all;
}

.debug-content strong {
  color: #ffff00;
}

.user-agent {
  font-size: 10px;
  opacity: 0.8;
}

.logs {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #00ff00;
}

.log-entry {
  font-size: 11px;
  opacity: 0.8;
  margin: 2px 0;
}

/* Make scrollbar visible */
.debug-panel::-webkit-scrollbar {
  width: 6px;
}

.debug-panel::-webkit-scrollbar-track {
  background: rgba(0, 255, 0, 0.1);
}

.debug-panel::-webkit-scrollbar-thumb {
  background: rgba(0, 255, 0, 0.5);
  border-radius: 3px;
}
</style>