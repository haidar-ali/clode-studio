/**
 * App Status Composable
 * Tracks application mode and remote server status
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

export interface AppStatus {
  mode: 'desktop' | 'hybrid' | 'server';
  config: {
    mode: string;
    serverPort?: number;
    serverHost?: string;
    enableRemoteAccess?: boolean;
    maxRemoteConnections?: number;
    authRequired?: boolean;
  };
  remoteServerRunning: boolean;
  remoteConnections: number;
}

// Singleton state
const appStatus = ref<AppStatus | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
let updateInterval: NodeJS.Timeout | null = null;

// Update app status
async function updateStatus() {
  if (!window.electronAPI?.app?.getStatus) {
    return;
  }
  
  try {
    isLoading.value = true;
    error.value = null;
    
    const status = await window.electronAPI.app.getStatus();
    appStatus.value = status;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to get app status:', err);
  } finally {
    isLoading.value = false;
  }
}

export function useAppStatus() {
  // Computed values
  const isHybridMode = computed(() => appStatus.value?.mode === 'hybrid');
  const isDesktopMode = computed(() => appStatus.value?.mode === 'desktop');
  const isServerMode = computed(() => appStatus.value?.mode === 'server');
  
  const isRemoteServerRunning = computed(() => 
    appStatus.value?.remoteServerRunning || false
  );
  
  const remoteConnectionCount = computed(() => 
    appStatus.value?.remoteConnections || 0
  );
  
  const serverUrl = computed(() => {
    if (!appStatus.value?.config.enableRemoteAccess) return null;
    
    let host = appStatus.value.config.serverHost || 'localhost';
    // If server is bound to all interfaces, use localhost for local connections
    if (host === '0.0.0.0') {
      host = 'localhost';
    }
    const port = appStatus.value.config.serverPort || 3789;
    return `http://${host}:${port}`;
  });
  
  const serverPort = computed(() => 
    appStatus.value?.config.serverPort || 3789
  );
  
  // Lifecycle
  onMounted(() => {
    // Initial load
    updateStatus();
    
    // Update every 5 seconds
    updateInterval = setInterval(updateStatus, 5000);
  });
  
  onUnmounted(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  });
  
  return {
    // State
    appStatus: computed(() => appStatus.value),
    isLoading,
    error,
    
    // Computed
    isHybridMode,
    isDesktopMode,
    isServerMode,
    isRemoteServerRunning,
    remoteConnectionCount,
    serverUrl,
    serverPort,
    
    // Methods
    refresh: updateStatus
  };
}