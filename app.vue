<template>
  <div id="app">
    <RemoteApp v-if="isRemoteClient" />
    <DesktopApp v-else />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RemoteApp from '~/components/Remote/RemoteApp.vue';
import DesktopApp from '~/components/DesktopApp.vue';

// Check if we're in remote mode immediately
const isRemoteClient = ref(false);
if (typeof window !== 'undefined') {
  // If we have electronAPI, we're in desktop mode
  if (window.electronAPI) {
    isRemoteClient.value = false;
  } else {
    // No electronAPI means we're in a browser (remote mode)
    isRemoteClient.value = true;
  }
  
  console.log('App mode detection:', {
    hasElectronAPI: !!window.electronAPI,
    isRemoteClient: isRemoteClient.value
  });
}
</script>

<style>
#app {
  min-height: 100vh;
  background: var(--color-bg-primary, #1e1e1e);
  color: var(--color-text-primary, #ffffff);
}
</style>