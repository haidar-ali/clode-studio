<template>
  <div>
    <NuxtRouteAnnouncer />
    <StartupLoader v-if="!workspaceReady" @ready="onWorkspaceReady" />
    <template v-else>
      <IDELayout />
      <FileSelector />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import FileSelector from '~/components/Knowledge/FileSelector.vue';
import StartupLoader from '~/components/Layout/StartupLoader.vue';
import IDELayout from '~/components/Layout/IDELayout.vue';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useAutocompleteStore } from '~/stores/autocomplete';

const workspaceReady = ref(false);
const workspaceManager = useWorkspaceManager();
const autocompleteStore = useAutocompleteStore();

async function onWorkspaceReady(workspace: string) {
  try {
    // Clear all Claude instance PIDs and status from storage on app startup
    // This needs to happen before any store loads the data
    // Clear from general claudeInstances storage
    const savedInstances = await window.electronAPI.store.get('claudeInstances');
    if (savedInstances && Array.isArray(savedInstances)) {
      const cleanedInstances = savedInstances.map((instance: any) => ({
        ...instance,
        status: 'disconnected',
        pid: undefined
      }));
      await window.electronAPI.store.set('claudeInstances', cleanedInstances);
    }
    
    // Clear terminal instance PTY process IDs on app startup
    // PTY processes don't persist across app restarts
    const savedTerminalInstances = await window.electronAPI.store.get('terminalInstances');
    if (savedTerminalInstances && Array.isArray(savedTerminalInstances)) {
      const cleanedTerminalInstances = savedTerminalInstances.map((instance: any) => ({
        ...instance,
        ptyProcessId: undefined
      }));
      await window.electronAPI.store.set('terminalInstances', cleanedTerminalInstances);
    }
    
    // Clear from all worktree-specific configurations
    const allStoreData = await window.electronAPI.store.getAll();
    for (const [key, value] of Object.entries(allStoreData)) {
      if (key.startsWith('worktree-') && value && typeof value === 'object' && 'instances' in value) {
        const worktreeConfig = value as any;
        if (worktreeConfig.instances && Array.isArray(worktreeConfig.instances)) {
          worktreeConfig.instances = worktreeConfig.instances.map((inst: any) => ({
            ...inst,
            status: 'disconnected',
            pid: undefined
          }));
          await window.electronAPI.store.set(key, worktreeConfig);
        }
      }
      
      // Clear terminal worktree configurations PTY process IDs
      if (key.startsWith('terminal-worktree-') && value && typeof value === 'object' && 'instances' in value) {
        const terminalWorktreeConfig = value as any;
        if (terminalWorktreeConfig.instances && Array.isArray(terminalWorktreeConfig.instances)) {
          terminalWorktreeConfig.instances = terminalWorktreeConfig.instances.map((inst: any) => ({
            ...inst,
            ptyProcessId: undefined
          }));
          await window.electronAPI.store.set(key, terminalWorktreeConfig);
        }
      }
    }
    
    // Now proceed with normal workspace setup
    await workspaceManager.changeWorkspace(workspace);
    
    // Mark as ready
    workspaceReady.value = true;
  } catch (error) {
    console.error('Failed to initialize workspace:', error);
    // Keep showing the startup loader on error
    workspaceReady.value = false;
  }
}

// Set up ghost text loading listener
let removeGhostTextListener: (() => void) | null = null;

onMounted(() => {
  // Listen for ghost text loading events from main process
  if (window.electronAPI?.onGhostTextLoading) {
    removeGhostTextListener = window.electronAPI.onGhostTextLoading((isLoading: boolean) => {
      autocompleteStore.setGhostTextLoading(isLoading);
    });
  }
  
  // Set up remote snapshot request handlers
  if (window.electronAPI?.ipcRenderer?.on) {
    // Handle remote snapshot list requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-list', async (event: any, data: any) => {
      try {
        const { allBranches, branch } = data;
        const snapshotsStore = (await import('~/stores/snapshots')).useSnapshotsStore();
        
        // Load snapshots using desktop store
        await snapshotsStore.loadSnapshots(allBranches);
        const snapshots = allBranches ? snapshotsStore.sortedSnapshots : snapshotsStore.sortedSnapshots;
        
        // Convert reactive objects to plain objects for IPC
        const plainSnapshots = JSON.parse(JSON.stringify(snapshots));
        
        // Send response back to main process
        window.electronAPI.send('snapshots-list-response', plainSnapshots);
      } catch (error) {
        console.error('Failed to handle remote snapshot list:', error);
        window.electronAPI.send('snapshots-list-response', []);
      }
    });
    
    // Handle remote snapshot capture requests  
    window.electronAPI.ipcRenderer.on('remote-snapshot-capture', async (event: any, data: any) => {
      try {
        const { name, trigger, ideState } = data;
        const snapshotsStore = (await import('~/stores/snapshots')).useSnapshotsStore();
        
        // Capture snapshot using desktop store
        const snapshot = await snapshotsStore.captureSnapshot(name, trigger);
        
        // Convert to plain object for IPC
        const plainSnapshot = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        
        // Send response back to main process
        window.electronAPI.send('snapshots-capture-response', plainSnapshot);
      } catch (error) {
        console.error('Failed to handle remote snapshot capture:', error);
        window.electronAPI.send('snapshots-capture-response', null);
      }
    });
    
    // Handle remote snapshot restore requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-restore', async (event: any, data: any) => {
      try {
        const { snapshotId, options } = data;
        const snapshotsStore = (await import('~/stores/snapshots')).useSnapshotsStore();
        
        // Restore snapshot using desktop store
        const result = await snapshotsStore.restoreSnapshot(snapshotId, options);
        
        // Send response back to main process
        window.electronAPI.send('snapshots-restore-response', result);
      } catch (error) {
        console.error('Failed to handle remote snapshot restore:', error);
        window.electronAPI.send('snapshots-restore-response', false);
      }
    });
    
    // Handle remote snapshot delete requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-delete', async (event: any, data: any) => {
      try {
        const { snapshotId, branch } = data;
        const snapshotsStore = (await import('~/stores/snapshots')).useSnapshotsStore();
        
        // Delete snapshot using desktop store
        await snapshotsStore.deleteSnapshot(snapshotId);
        
        // Send response back to main process
        window.electronAPI.send('snapshots-delete-response', { success: true });
      } catch (error) {
        console.error('Failed to handle remote snapshot delete:', error);
        window.electronAPI.send('snapshots-delete-response', { success: false, error: error.message });
      }
    });
    
    // Handle remote snapshot update requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-update', async (event: any, data: any) => {
      try {
        const { snapshot } = data;
        // For updates, we could update tags or other metadata
        // For now, just acknowledge
        window.electronAPI.send('snapshots-update-response', { success: true });
      } catch (error) {
        console.error('Failed to handle remote snapshot update:', error);
        window.electronAPI.send('snapshots-update-response', { success: false, error: error.message });
      }
    });
    
    // Handle remote snapshot content requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-content', async (event: any, data: any) => {
      try {
        const { hash, projectPath } = data;
        
        // Use the file content manager to get content
        const { useFileContentManager } = await import('~/composables/useFileContentManager');
        const fileContentManager = useFileContentManager(projectPath);
        const content = await fileContentManager.getContent(hash);
        
        // Send response back to main process
        window.electronAPI.send('snapshots-content-response', {
          success: !!content,
          content: content || null
        });
      } catch (error) {
        console.error('Failed to handle remote snapshot content:', error);
        window.electronAPI.send('snapshots-content-response', {
          success: false,
          error: error.message
        });
      }
    });
    
    // Handle remote snapshot getDiff requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-getDiff', async (event: any, data: any) => {
      try {
        const { hash, projectPath } = data;
        
        // Use desktop Electron API to get diff
        const result = await window.electronAPI.snapshots.getDiff({
          hash,
          projectPath
        });
        
        // Send response back to main process
        window.electronAPI.send('snapshots-getDiff-response', result);
      } catch (error) {
        console.error('Failed to handle remote snapshot getDiff:', error);
        window.electronAPI.send('snapshots-getDiff-response', {
          success: false,
          error: error.message
        });
      }
    });
    
    // Handle remote snapshot scanProjectFiles requests
    window.electronAPI.ipcRenderer.on('remote-snapshot-scanProjectFiles', async (event: any, data: any) => {
      try {
        const { projectPath } = data;
        
        // Use desktop Electron API to scan project files
        const result = await window.electronAPI.snapshots.scanProjectFiles({
          projectPath
        });
        
        // Send response back to main process
        window.electronAPI.send('snapshots-scanProjectFiles-response', result);
      } catch (error) {
        console.error('Failed to handle remote snapshot scanProjectFiles:', error);
        window.electronAPI.send('snapshots-scanProjectFiles-response', {
          success: false,
          error: error.message
        });
      }
    });
    
    // Handle remote worktree requests
    window.electronAPI.ipcRenderer.on('remote-worktree-list', async (event: any) => {
      try {
        const result = await window.electronAPI.worktree.list();
        window.electronAPI.send('worktree-list-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree list:', error);
        window.electronAPI.send('worktree-list-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-sessions', async (event: any) => {
      try {
        const result = await window.electronAPI.worktree.sessions();
        window.electronAPI.send('worktree-sessions-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree sessions:', error);
        window.electronAPI.send('worktree-sessions-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-switch', async (event: any, data: any) => {
      try {
        const { worktreePath } = data;
        
        // First switch the worktree
        const result = await window.electronAPI.worktree.switch(worktreePath);
        
        if (result.success) {
          // Then handle workspace switching
          await workspaceManager.switchWorktreeWithinWorkspace(worktreePath);
          await workspaceManager.refreshWorktreeStatus();
        }
        
        window.electronAPI.send('worktree-switch-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree switch:', error);
        window.electronAPI.send('worktree-switch-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-remove', async (event: any, data: any) => {
      try {
        const { worktreePath, force } = data;
        const result = await window.electronAPI.worktree.remove(worktreePath, force);
        window.electronAPI.send('worktree-remove-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree remove:', error);
        window.electronAPI.send('worktree-remove-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-lock', async (event: any, data: any) => {
      try {
        const { worktreePath, lock } = data;
        const result = await window.electronAPI.worktree.lock(worktreePath, lock);
        window.electronAPI.send('worktree-lock-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree lock:', error);
        window.electronAPI.send('worktree-lock-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-compare', async (event: any, data: any) => {
      try {
        const { path1, path2 } = data;
        const result = await window.electronAPI.worktree.compare(path1, path2);
        window.electronAPI.send('worktree-compare-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree compare:', error);
        window.electronAPI.send('worktree-compare-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-createSession', async (event: any, data: any) => {
      try {
        const { sessionData } = data;
        const result = await window.electronAPI.worktree.createSession(sessionData);
        window.electronAPI.send('worktree-createSession-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree createSession:', error);
        window.electronAPI.send('worktree-createSession-response', { success: false, error: error.message });
      }
    });
    
    window.electronAPI.ipcRenderer.on('remote-worktree-deleteSession', async (event: any, data: any) => {
      try {
        const { sessionId } = data;
        const result = await window.electronAPI.worktree.deleteSession(sessionId);
        window.electronAPI.send('worktree-deleteSession-response', result);
      } catch (error) {
        console.error('Failed to handle remote worktree deleteSession:', error);
        window.electronAPI.send('worktree-deleteSession-response', { success: false, error: error.message });
      }
    });
  }
});

onUnmounted(() => {
  if (removeGhostTextListener) {
    removeGhostTextListener();
  }
});
</script>