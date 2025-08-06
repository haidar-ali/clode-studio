<template>
  <div id="remote-app" :class="appClasses">
    <!-- Simple loading state -->
    <div v-if="!isReady" class="loading-screen">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Connecting to desktop...</p>
    </div>

    <!-- Use existing desktop layout -->
    <RemoteDesktopLayout v-else />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useToast } from '~/composables/useToast';
import { useEditorStore } from '~/stores/editor';
import { useProjectContextStore } from '~/stores/project-context';
import { useAdaptiveUI } from '~/composables/useAdaptiveUI';
import RemoteDesktopLayout from '~/components/Remote/RemoteDesktopLayout.vue';

// Stores
const editorStore = useEditorStore();
const contextStore = useProjectContextStore();
const toast = useToast();

// Adaptive UI
const { adaptiveClasses, isMobile, isTablet, layoutMode } = useAdaptiveUI();

// Connection state
const isReady = ref(false);
const connectionError = ref<string | null>(null);

// App classes for styling
const appClasses = computed(() => ({
  'remote-mode': true,
  'is-loading': !isReady.value,
  'has-error': !!connectionError.value,
  ...adaptiveClasses.value
}));

// Generate persistent device info (survives component remounts)
const getDeviceInfo = () => {
  if (typeof window === 'undefined') return null;
  
  // Check if we already have device info stored
  const stored = window.sessionStorage.getItem('remote-device-info');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // Invalid stored data, regenerate
    }
  }
  
  // Generate new device info and store it
  const deviceInfo = {
    deviceToken: 'remote-' + Date.now(),
    deviceId: 'browser-' + Math.random().toString(36).substr(2, 9)
  };
  
  window.sessionStorage.setItem('remote-device-info', JSON.stringify(deviceInfo));
  return deviceInfo;
};

// Initialize connection and load initial data
onMounted(async () => {
  try {
    // Try to connect to Socket.IO but don't fail if it doesn't work
    const { connect, connected, error: socketError } = useRemoteConnection();
    
    // Check if already connected (from previous mount)
    if (connected.value) {
      console.log('Already connected to Socket.IO, reusing connection');
      isReady.value = true;
      return;
    }
    
    // Get persistent device info
    const deviceInfo = getDeviceInfo();
    if (!deviceInfo) {
      throw new Error('Failed to generate device info');
    }
    
    console.log('Attempting to connect with device info:', deviceInfo);
    
    try {
      await connect(deviceInfo);
      
      // Give it a moment to establish connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('Connection status:', connected.value);
      console.log('Connection error:', socketError.value);
      
      if (connected.value) {
        console.log('Socket.IO connected successfully - real-time features enabled');
        toast.success('Connected to desktop with real-time sync');
      } else {
        console.warn('Socket.IO connection failed - running in read-only mode');
        toast.warning('Running in read-only mode (no real-time sync)');
      }
    } catch (error) {
      console.warn('Socket.IO connection failed:', error);
      toast.warning('Running without real-time features');
    }
    
    // Mark as ready regardless of Socket.IO status
    // The app can work without real-time features
    isReady.value = true;
  } catch (error) {
    console.error('Failed to initialize remote app:', error);
    connectionError.value = error.message;
    toast.error(`Failed to initialize: ${error.message}`);
  }
});
</script>

<style scoped>
#remote-app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--color-background);
  color: var(--color-text);
}

.loading-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.loading-screen svg {
  width: 48px;
  height: 48px;
  color: var(--color-primary);
}

.loading-screen p {
  color: var(--color-text-secondary);
  font-size: 14px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>