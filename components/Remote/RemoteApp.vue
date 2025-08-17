<template>
  <div id="remote-app" :class="appClasses">
    <!-- Connection Modal (handles authentication) -->
    <RemoteConnectionModal 
      v-if="!isConnected" 
      :show="true"
      @connected="onConnected"
    />
    
    <!-- Simple loading state -->
    <div v-if="!isReady && isConnected" class="loading-screen">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading workspace...</p>
    </div>

    <!-- Use existing desktop layout -->
    <RemoteDesktopLayout v-else-if="isReady && isConnected" />
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
import RemoteConnectionModal from '~/components/Remote/RemoteConnectionModal.vue';

// Stores
const editorStore = useEditorStore();
const contextStore = useProjectContextStore();
const toast = useToast();

// Adaptive UI
const { adaptiveClasses, isMobile, isTablet, layoutMode } = useAdaptiveUI();

// Connection state
const isReady = ref(false);
const isConnected = ref(false);
const connectionError = ref<string | null>(null);

// App classes for styling
const appClasses = computed(() => ({
  'remote-mode': true,
  'is-loading': !isReady.value,
  'has-error': !!connectionError.value,
  ...adaptiveClasses.value
}));

// Handle successful connection from modal
const onConnected = async () => {
  
  isConnected.value = true;
  
  try {
    toast.success('Connected to desktop with real-time sync');
    
    // Wait for workspace info to be received
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if we have workspace info from Socket.IO
    const remoteWorkspace = (window as any).__remoteWorkspace;
    if (remoteWorkspace?.path) {
      
      // Sync workspace to server for API calls
      await $fetch('/api/workspace/set', {
        method: 'POST',
        body: { workspacePath: remoteWorkspace.path }
      });
    }
    
    // Notify components that connection is ready by emitting a global event
    if (typeof window !== 'undefined') {
      
      window.dispatchEvent(new CustomEvent('remote-connection-ready'));
    }
    
    isReady.value = true;
  } catch (error) {
    console.error('Post-connection setup failed:', error);
    toast.error(`Setup failed: ${error.message}`);
  }
};

// Initialize on mount
onMounted(async () => {
  // RemoteConnectionModal will handle everything
  
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