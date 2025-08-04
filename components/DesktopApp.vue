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
});

onUnmounted(() => {
  if (removeGhostTextListener) {
    removeGhostTextListener();
  }
});
</script>