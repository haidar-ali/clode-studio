<template>
  <div class="mobile-explorer">
    <div class="mobile-header">
      <h3>Files</h3>
      <button class="refresh-btn" @click="refreshFiles">
        <Icon name="mdi:refresh" />
      </button>
    </div>
    
    <!-- Debug info -->
    <div class="debug-info">
      <p>Workspace Local: {{ workspaceStore.currentPath || 'None' }}</p>
      <p>Workspace Remote: {{ workspacePath || 'None' }}</p>
      <p>Files loaded: {{ fileTree.length }}</p>
      <p>Service status: {{ serviceStatus }}</p>
      <p v-if="connectionError" style="color: red;">Connection: {{ connectionError }}</p>
    </div>
    
    <!-- Use RemoteFileTree for mobile -->
    <div class="file-tree-container">
      <RemoteFileTree 
        v-if="!isLoading"
        :files="fileTree"
        :error="error"
        @directory-click="handleDirectoryClick"
        @file-click="handleFileClick"
        @file-open="handleFileOpen"
      />
      <div v-else-if="!fileTree.length && !isLoading" class="empty-state">
        <Icon name="mdi:folder-open" />
        <p>No files in workspace</p>
        <p class="debug">Path: {{ workspacePath || workspaceStore.currentPath || '/' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import RemoteFileTree from './RemoteFileTree.vue';
import { useServices } from '~/composables/useServices';
import { useWorkspaceStore } from '~/stores/workspace';
import { remoteConnection } from '~/services/remote-client/RemoteConnectionSingleton';
import { useRemoteConnection } from '~/composables/useRemoteConnection';

const workspaceStore = useWorkspaceStore();
const fileTree = ref<any[]>([]);
const serviceStatus = ref('Not initialized');
const workspacePath = ref<string | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const currentPath = ref<string>('');

const { error: connectionError } = useRemoteConnection();

const emit = defineEmits<{
  'file-opened': [fileData: { path: string; content: string; name: string }];
}>();

async function loadFileTree(path?: string) {
  try {
    isLoading.value = true;
    error.value = null;
    serviceStatus.value = 'Getting services...';
    
    console.log('[MobileExplorer] Starting service initialization...');
    
    // Get services synchronously
    const { services, error: serviceError, initialize } = useServices();
    
    console.log('[MobileExplorer] Got useServices hook, calling initialize...');
    
    // Wait for initialization
    await initialize();
    
    console.log('[MobileExplorer] Initialize completed, checking for errors...');
    
    if (serviceError.value) {
      serviceStatus.value = `Service error: ${serviceError.value.message}`;
      error.value = serviceError.value.message;
      console.error('[MobileExplorer] Service error:', serviceError.value);
      return;
    }
    
    if (!services.value) {
      serviceStatus.value = 'Services not available';
      error.value = 'Services not available';
      console.error('[MobileExplorer] Services not available after initialization');
      return;
    }
    
    console.log('[MobileExplorer] Services ready, checking connection...');
    console.log('[MobileExplorer] Service provider mode:', services.value.mode);
    console.log('[MobileExplorer] Service provider connected:', services.value.isConnected());
    
    serviceStatus.value = 'Services ready';
    
    // Use provided path or workspace path from remote connection or fallback
    const rootPath = path || currentPath.value || workspacePath.value || workspaceStore.currentPath;
    
    if (!rootPath) {
      serviceStatus.value = 'Waiting for workspace info...';
      error.value = 'No workspace path available';
      return;
    }
    
    currentPath.value = rootPath;
    console.log('Loading files from:', rootPath);
    
    const files = await services.value.file.listDirectory(rootPath);
    console.log('Files loaded:', files);
    
    // Transform to simpler format for RemoteFileTree
    fileTree.value = files.map(file => ({
      name: file.name,
      path: file.path,
      type: file.type
    }));
    
    serviceStatus.value = `Loaded ${files.length} files`;
  } catch (err) {
    serviceStatus.value = `Error: ${err.message}`;
    error.value = err.message;
    console.error('Failed to load file tree:', err);
  } finally {
    isLoading.value = false;
  }
}

async function refreshFiles() {
  await loadFileTree();
}

async function handleDirectoryClick(path: string) {
  console.log('Directory clicked:', path);
  await loadFileTree(path);
}

function handleFileClick(path: string) {
  console.log('File clicked:', path);
  // File opening is handled by RemoteFileTree component
}

function handleFileOpen(fileData: { path: string; content: string; name: string }) {
  console.log('File opened:', fileData.path);
  // Emit event to parent to switch to editor tab with file content
  emit('file-opened', fileData);
}

// Handle workspace sync events
function handleWorkspaceSync(workspace: any) {
  console.log('MobileExplorer: Received workspace sync:', workspace);
  if (workspace?.path) {
    workspacePath.value = workspace.path;
    // Reload file tree with new workspace
    loadFileTree();
  }
}

onMounted(() => {
  // Check if workspace info is already available
  const remoteWorkspace = (window as any).__remoteWorkspace;
  if (remoteWorkspace?.path) {
    console.log('MobileExplorer: Found stored workspace:', remoteWorkspace);
    workspacePath.value = remoteWorkspace.path;
  }
  
  // Delay initial load to allow mobile connection to settle
  setTimeout(() => {
    loadFileTree();
  }, 2000);
  
  // Set up polling to check for workspace info
  const checkInterval = setInterval(() => {
    const workspace = (window as any).__remoteWorkspace;
    if (workspace?.path && workspace.path !== workspacePath.value) {
      console.log('MobileExplorer: Workspace updated:', workspace);
      workspacePath.value = workspace.path;
      loadFileTree();
      clearInterval(checkInterval);
    }
  }, 500);
  
  // Clean up after 10 seconds
  setTimeout(() => clearInterval(checkInterval), 10000);
});

onUnmounted(() => {
  // Clean up event listener
  const socket = remoteConnection.getSocket();
  if (socket) {
    socket.off('workspace:sync', handleWorkspaceSync);
  }
});
</script>

<style scoped>
.mobile-explorer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.mobile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--panel-padding, 12px);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.mobile-header h3 {
  margin: 0;
  font-size: 16px;
}

.refresh-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.refresh-btn:hover {
  background: var(--color-bg-hover);
}

.file-tree-container {
  flex: 1;
  overflow: auto;
  padding: var(--panel-padding, 12px);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  gap: 8px;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

/* Mobile optimizations for FileTree */
:deep(.mobile-optimized .file-node) {
  min-height: 44px; /* Touch target size */
  padding: 12px;
}

:deep(.mobile-optimized .file-name) {
  font-size: 14px;
}

/* Debug info styling */
.debug-info {
  background: rgba(0, 100, 200, 0.1);
  border: 1px solid rgba(0, 100, 200, 0.3);
  padding: 8px;
  margin: 8px;
  font-size: 12px;
  font-family: monospace;
}

.debug-info p {
  margin: 2px 0;
}

.empty-state .debug {
  font-size: 12px;
  font-family: monospace;
  opacity: 0.7;
}
</style>