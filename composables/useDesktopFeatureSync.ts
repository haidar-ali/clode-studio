/**
 * Composable for managing desktop feature sync
 * Syncs desktop-only features to cache when in desktop/hybrid mode
 */
import { onMounted, onUnmounted, watch } from 'vue';
import { DesktopFeatureSync } from '~/services/desktop-feature-sync';
import { useServices } from '~/composables/useServices';
import { AppMode } from '~/services/interfaces/IServiceProvider';
import { useEditorStore } from '~/stores/editor';

let syncInstance: DesktopFeatureSync | null = null;

export function useDesktopFeatureSync() {
  console.log('[DesktopFeatureSync] Composable initialized');
  const { services, initialize } = useServices();
  const editorStore = useEditorStore();
  
  const startSync = async () => {
    // Ensure services are initialized
    await initialize();
    
    // Only sync if we have Electron APIs (desktop or hybrid mode)
    if (!window.electronAPI) {
      console.log('[DesktopFeatureSync] No Electron APIs available - remote only mode');
      return;
    }
    
    if (!services.value || !services.value.cache) {
      console.log('[DesktopFeatureSync] No services or cache available');
      return;
    }
    
    // Only start sync if we have a workspace
    if (!editorStore.workspacePath) {
      console.log('[DesktopFeatureSync] No workspace selected yet, skipping sync');
      return;
    }
    
    // Prevent duplicate instances
    if (syncInstance) {
      console.log('[DesktopFeatureSync] Sync already running');
      return;
    }
    
    console.log('[DesktopFeatureSync] Starting sync (Electron APIs detected, workspace:', editorStore.workspacePath, ')');
    syncInstance = new DesktopFeatureSync(services.value.cache);
    syncInstance.startSync();
  };
  
  const stopSync = () => {
    if (syncInstance) {
     
      syncInstance.stopSync();
      syncInstance = null;
    }
  };
  
  // Watch for workspace changes
  watch(() => editorStore.workspacePath, (newWorkspace, oldWorkspace) => {
    console.log('[DesktopFeatureSync] Workspace watch triggered:', { newWorkspace, oldWorkspace });
    if (newWorkspace && newWorkspace !== oldWorkspace) {
      console.log('[DesktopFeatureSync] Workspace changed, restarting sync');
      
      // Stop existing sync
      if (syncInstance) {
        stopSync();
      }
      
      // Start new sync with the new workspace
      startSync();
    }
  }, { immediate: true });
  
  // Watch for services to be ready
  watch(services, (newServices) => {
    if (newServices && !syncInstance && editorStore.workspacePath) {
      startSync();
    }
  });
  
  // Auto-start on mount if workspace is already selected
  onMounted(() => {
    if (editorStore.workspacePath) {
      startSync();
    }
  });
  
  // Clean up on unmount
  onUnmounted(() => {
    stopSync();
  });
  
  return {
    startSync,
    stopSync
  };
}