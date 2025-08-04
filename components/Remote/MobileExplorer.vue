<template>
  <div class="mobile-explorer">
    <div class="mobile-header">
      <h3>Files</h3>
      <button class="refresh-btn" @click="refreshFiles">
        <Icon name="mdi:refresh" />
      </button>
    </div>
    
    <!-- Navigation Bar -->
    <div class="nav-bar" v-if="navigationHistory.length > 0">
      <button 
        class="nav-btn back-btn" 
        @click="goBack"
        :disabled="navigationHistory.length <= 1"
      >
        <Icon name="mdi:chevron-left" />
      </button>
      <div class="current-path">
        <Icon name="mdi:folder" class="path-icon" />
        <span>{{ currentPathDisplay }}</span>
      </div>
      <button 
        class="nav-btn home-btn" 
        @click="goToRoot"
        :disabled="navigationHistory.length <= 1"
      >
        <Icon name="mdi:home" />
      </button>
    </div>
    
    <!-- Debug info -->
    <div class="debug-info">
      <p>Workspace Remote: {{ workspacePath || 'None' }}</p>
      <p>Files loaded: {{ fileTree.length }}</p>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
const navigationHistory = ref<string[]>([]);

const { error: connectionError } = useRemoteConnection();

// Computed property for display path
const currentPathDisplay = computed(() => {
  if (!currentPath.value) return 'Files';
  const parts = currentPath.value.split('/');
  return parts[parts.length - 1] || 'Files';
});

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
    
    // Add to navigation history if it's a new path
    if (!navigationHistory.value.includes(rootPath)) {
      navigationHistory.value.push(rootPath);
    }
    
    const files = await services.value.file.listDirectory(rootPath);
    console.log('Files loaded:', files);
    
    // Transform to simpler format for RemoteFileTree
    fileTree.value = files.map(file => ({
      name: file.name,
      path: file.path,
      type: file.isDirectory ? 'directory' : 'file'
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

async function goBack() {
  if (navigationHistory.value.length > 1) {
    navigationHistory.value.pop(); // Remove current
    const previousPath = navigationHistory.value[navigationHistory.value.length - 1];
    await loadFileTree(previousPath);
  }
}

async function goToRoot() {
  navigationHistory.value = [];
  await loadFileTree(workspacePath.value || workspaceStore.currentPath);
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
  background: #0a0b0d;
}

.mobile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(180deg, #1a1b1f 0%, #141518 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}

.mobile-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.refresh-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 6px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* Navigation Bar */
.nav-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.nav-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.current-path {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  overflow: hidden;
}

.path-icon {
  color: #5CA0F2;
  font-size: 16px;
}

.current-path span {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 8px 12px;
  margin: 8px 12px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.debug-info p {
  margin: 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.empty-state .debug {
  font-size: 12px;
  font-family: monospace;
  opacity: 0.7;
}
</style>