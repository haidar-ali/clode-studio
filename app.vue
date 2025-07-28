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
import { ref } from 'vue';
import FileSelector from '~/components/Knowledge/FileSelector.vue';
import StartupLoader from '~/components/Layout/StartupLoader.vue';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

const workspaceReady = ref(false);
const workspaceManager = useWorkspaceManager();

async function onWorkspaceReady(workspace: string) {
  try {
    console.log('[App] onWorkspaceReady called with workspace:', workspace);
    
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
      console.log('[App] Cleared PIDs from general instances storage');
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
          console.log('[App] Cleared PIDs from worktree config:', key);
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
</script>