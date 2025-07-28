<template>
  <div class="startup-loader">
    <div class="loader-content">
      <div class="logo-section">
        <Icon name="mdi:view-dashboard" class="logo-icon" />
        <h1>Clode Studio</h1>
      </div>

      <!-- Checking Claude Installation -->
      <div v-if="status === 'checking'" class="status-section">
        <div class="spinner"></div>
        <p>Checking Claude CLI installation...</p>
      </div>

      <!-- Claude Not Found -->
      <div v-else-if="status === 'claude-not-found'" class="status-section error">
        <Icon name="heroicons:exclamation-triangle" class="error-icon" />
        <h2>Claude CLI Not Found</h2>
        <p>Claude CLI is required to use Clode Studio.</p>
        <p class="instruction">Please install Claude CLI by running:</p>
        <code class="command">npm install -g @anthropic-ai/claude-code</code>
        <button class="action-btn" @click="checkClaude">
          <Icon name="heroicons:arrow-path" />
          Retry
        </button>
      </div>

      <!-- Claude Found, Need Workspace -->
      <div v-else-if="status === 'needs-workspace'" class="status-section">
        <Icon name="heroicons:folder" class="folder-icon" />
        <h2>Choose Your Workspace</h2>
        <p>Select how you want to open Clode Studio</p>
        
        <!-- Default Workspace Option -->
        <div v-if="defaultWorkspace" class="workspace-option">
          <button class="workspace-btn primary" @click="useDefaultWorkspace">
            <Icon name="heroicons:home" class="option-icon" />
            <div class="option-content">
              <h3>Open Default Workspace</h3>
              <p>{{ getWorkspaceName(defaultWorkspace) }}</p>
              <span class="workspace-path">{{ defaultWorkspace }}</span>
            </div>
          </button>
        </div>

        <!-- Recent Workspaces -->
        <div v-if="recentWorkspaces.length > 0" class="workspace-option">
          <h3 class="option-title">Recent Workspaces</h3>
          <div class="recent-list">
            <button 
              v-for="workspace in recentWorkspaces" 
              :key="workspace.path"
              class="workspace-btn secondary"
              @click="useRecentWorkspace(workspace.path)"
            >
              <Icon name="heroicons:clock" class="option-icon" />
              <div class="option-content">
                <h4>{{ getWorkspaceName(workspace.path) }}</h4>
                <span class="workspace-path">{{ workspace.path }}</span>
                <span class="last-accessed">Last accessed: {{ formatDate(workspace.lastAccessed) }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Select New Workspace -->
        <div class="workspace-option">
          <button class="workspace-btn outline" @click="selectWorkspace">
            <Icon name="heroicons:folder-plus" class="option-icon" />
            <div class="option-content">
              <h3>Select Different Workspace</h3>
              <p>Browse and choose a new workspace folder</p>
            </div>
          </button>
        </div>
      </div>

      <!-- Ready -->
      <div v-else-if="status === 'ready'" class="status-section success">
        <Icon name="heroicons:check-circle" class="success-icon" />
        <h2>Ready to Start</h2>
        <p>Claude CLI: {{ claudeInfo?.version || 'Detected' }}</p>
        <p>Workspace: {{ selectedWorkspace }}</p>
        <div class="spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

type Status = 'checking' | 'claude-not-found' | 'needs-workspace' | 'ready';

interface RecentWorkspace {
  path: string;
  lastAccessed: string;
}

const emit = defineEmits<{
  ready: [workspace: string];
}>();

const status = ref<Status>('checking');
const claudeInfo = ref<any>(null);
const selectedWorkspace = ref<string>('');
const defaultWorkspace = ref<string>('');
const recentWorkspaces = ref<RecentWorkspace[]>([]);

async function checkClaude() {
  status.value = 'checking';
  
  try {
    const result = await window.electronAPI.claude.detectInstallation();
    
    if (result.success && result.info) {
      claudeInfo.value = result.info;
      
      // Load default workspace and recent workspaces
      defaultWorkspace.value = await window.electronAPI.store.get('workspace.lastPath') || '';
      const recentList = await window.electronAPI.store.get('workspace.recent') || [];
      
      // Filter out non-existent workspaces and the default workspace
      const validRecent = [];
      for (const workspace of recentList) {
        if (workspace.path !== defaultWorkspace.value && await window.electronAPI.fs.exists(workspace.path)) {
          validRecent.push(workspace);
        }
      }
      recentWorkspaces.value = validRecent.slice(0, 5); // Keep max 5 recent workspaces
      
      // Always show workspace selection screen
      status.value = 'needs-workspace';
    } else {
      status.value = 'claude-not-found';
    }
  } catch (error) {
    console.error('Error checking Claude:', error);
    status.value = 'claude-not-found';
  }
}

async function selectWorkspace() {
  try {
    const result = await window.electronAPI.dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Folder',
      buttonLabel: 'Select Workspace'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const workspace = result.filePaths[0];
      await openWorkspace(workspace);
    }
  } catch (error) {
    console.error('Error selecting workspace:', error);
  }
}

async function useDefaultWorkspace() {
  if (defaultWorkspace.value) {
    await openWorkspace(defaultWorkspace.value);
  }
}

async function useRecentWorkspace(workspace: string) {
  await openWorkspace(workspace);
}

async function openWorkspace(workspace: string) {
  selectedWorkspace.value = workspace;

  
  // Update default workspace if it's different
  if (workspace !== defaultWorkspace.value) {
    await window.electronAPI.store.set('workspace.lastPath', workspace);
    
    // Update recent workspaces
    await updateRecentWorkspaces(workspace);
  }
  
  status.value = 'ready';
  setTimeout(() => {
    emit('ready', workspace);
  }, 1000);
}

async function updateRecentWorkspaces(workspace: string) {
  // Get current recent workspaces
  let recent = await window.electronAPI.store.get('workspace.recent') || [];
  
  // Remove this workspace if it already exists
  recent = recent.filter((w: RecentWorkspace) => w.path !== workspace);
  
  // Add to the beginning
  recent.unshift({
    path: workspace,
    lastAccessed: new Date().toISOString()
  });
  
  // Keep only the last 5
  recent = recent.slice(0, 5);
  
  // Save back
  await window.electronAPI.store.set('workspace.recent', recent);
}

function getWorkspaceName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || 'Workspace';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

onMounted(() => {

  checkClaude();
});
</script>

<style scoped>
.startup-loader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #1e1e1e;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loader-content {
  text-align: center;
  max-width: 500px;
  padding: 40px;
}

.logo-section {
  margin-bottom: 40px;
}

.logo-icon {
  font-size: 64px;
  color: #007acc;
  margin-bottom: 16px;
}

.logo-section h1 {
  font-size: 32px;
  font-weight: 300;
  margin: 0;
  color: #cccccc;
  letter-spacing: 2px;
}

.status-section {
  animation: fadeIn 0.3s ease-in;
}

.status-section h2 {
  font-size: 20px;
  margin: 0 0 12px 0;
  color: #cccccc;
}

.status-section p {
  color: #858585;
  margin: 8px 0;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #2d2d30;
  border-radius: 50%;
  border-top-color: #007acc;
  animation: spin 1s linear infinite;
  margin: 20px auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.error-icon {
  font-size: 48px;
  color: #f14c4c;
  margin-bottom: 16px;
}

.success-icon {
  font-size: 48px;
  color: #0dbc79;
  margin-bottom: 16px;
}

.folder-icon {
  font-size: 48px;
  color: #007acc;
  margin-bottom: 16px;
}

.instruction {
  margin: 20px 0 12px 0;
  font-size: 14px;
}

.command {
  display: inline-block;
  padding: 12px 20px;
  background-color: #2d2d30;
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  color: #d4d4d4;
  margin: 8px 0 24px 0;
  user-select: all;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 1px solid #2d2d30;
  border-radius: 6px;
  background-color: #2d2d30;
  color: #cccccc;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  margin: 8px 4px;
}

.action-btn:hover {
  background-color: #3e3e42;
  border-color: #3e3e42;
}

.action-btn.primary {
  background-color: #007acc;
  border-color: #007acc;
  color: white;
}

.action-btn.primary:hover {
  background-color: #005a9e;
  border-color: #005a9e;
}

.action-btn.secondary {
  background-color: transparent;
  border-color: #3e3e42;
}

.action-btn.secondary:hover {
  background-color: #2d2d30;
}

.workspace-option {
  margin: 20px 0;
}

.option-title {
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.workspace-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  background-color: #252526;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  margin-bottom: 8px;
}

.workspace-btn:hover {
  background-color: #2d2d30;
  border-color: #007acc;
  transform: translateY(-1px);
}

.workspace-btn.primary {
  background-color: #007acc;
  border-color: #007acc;
  color: white;
}

.workspace-btn.primary:hover {
  background-color: #005a9e;
  border-color: #005a9e;
}

.workspace-btn.secondary {
  background-color: #2d2d30;
}

.workspace-btn.outline {
  background-color: transparent;
  border-style: dashed;
}

.option-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.option-content {
  flex: 1;
  overflow: hidden;
}

.option-content h3,
.option-content h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.option-content h4 {
  font-size: 14px;
}

.option-content p {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #cccccc;
}

.workspace-path {
  display: block;
  font-size: 12px;
  color: #858585;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.last-accessed {
  display: block;
  font-size: 11px;
  color: #858585;
  margin-top: 4px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>