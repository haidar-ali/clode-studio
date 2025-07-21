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

const workspaceReady = ref(false);
const workspaceManager = useWorkspaceManager();

async function onWorkspaceReady(workspace: string) {
  try {
    // Use the workspace manager to properly set up the workspace
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