/**
 * Composable to access service layer
 * Provides reactive access to all services through the abstraction layer
 */
import { ref, shallowRef, onMounted, onUnmounted, computed } from 'vue';
import type { IServiceProvider } from '~/services';
import { getServices } from '~/services';

// Singleton service provider instance
const serviceProvider = shallowRef<IServiceProvider | null>(null);
const isLoading = ref(true);
const error = ref<Error | null>(null);

// Initialize services on first use
let initPromise: Promise<void> | null = null;

async function initializeServices() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        isLoading.value = true;
        error.value = null;
        
        // Always get services - the ServiceFactory will handle the mode detection
        // and return the appropriate provider (Desktop or Remote)
        serviceProvider.value = await getServices();
        
        console.log('Services initialized:', {
          mode: !window.electronAPI ? 'remote' : 'desktop',
          provider: serviceProvider.value?.constructor?.name
        });
      } catch (e) {
        error.value = e as Error;
        console.error('Failed to initialize services:', e);
      } finally {
        isLoading.value = false;
      }
    })();
  }
  return initPromise;
}

/**
 * Main composable to access services
 * Usage: const { services } = useServices();
 *        await services.file.readFile(path);
 */
export function useServices() {
  // Set up event listener immediately (not in onMounted) to catch early events
  if (typeof window !== 'undefined') {
    
    const updateSocket = async () => {
      
      
      // If services haven't been initialized yet, do it now
      if (!serviceProvider.value && !initPromise) {
        
        await initializeServices();
      }
      
      // Wait a bit for service provider to be ready if still initializing
      let attempts = 0;
      while (!serviceProvider.value && attempts < 5) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (serviceProvider.value && 'updateSocket' in serviceProvider.value) {
        
        await (serviceProvider.value as any).updateSocket();
        
      } else {
        
      }
    };
    
    window.addEventListener('remote-connection-ready', updateSocket);
    
    // Cleanup on unmount
    onUnmounted(() => {
      window.removeEventListener('remote-connection-ready', updateSocket);
    });
  }
  
  // Initialize on mount if not already done
  onMounted(() => {
    if (!serviceProvider.value && !initPromise) {
      initializeServices();
    }
  });
  
  return {
    services: serviceProvider,
    isLoading,
    error,
    initialize: initializeServices
  };
}

/**
 * Individual service composables for convenience
 */
export function useFileService() {
  const { services, isLoading, error } = useServices();
  return {
    fileService: computed(() => services.value?.file),
    isLoading,
    error
  };
}

export function useClaudeService() {
  const { services, isLoading, error } = useServices();
  return {
    claudeService: computed(() => services.value?.claude),
    isLoading,
    error
  };
}

export function useGitService() {
  const { services, isLoading, error } = useServices();
  return {
    gitService: computed(() => services.value?.git),
    isLoading,
    error
  };
}

export function useTerminalService() {
  const { services, isLoading, error } = useServices();
  return {
    terminalService: computed(() => services.value?.terminal),
    isLoading,
    error
  };
}

export function useKnowledgeService() {
  const { services, isLoading, error } = useServices();
  return {
    knowledgeService: computed(() => services.value?.knowledge),
    isLoading,
    error
  };
}

export function useMCPService() {
  const { services, isLoading, error } = useServices();
  return {
    mcpService: computed(() => services.value?.mcp),
    isLoading,
    error
  };
}

export function useStorageService() {
  const { services, isLoading, error } = useServices();
  return {
    storageService: computed(() => services.value?.storage),
    isLoading,
    error
  };
}

export function useQueueService() {
  const { services, isLoading, error } = useServices();
  return {
    queueService: computed(() => services.value?.queue),
    isLoading,
    error
  };
}