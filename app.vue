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
  const urlParams = new URLSearchParams(window.location.search);
  const deviceToken = urlParams.get('token');
  const deviceId = urlParams.get('deviceId');
  
  isRemoteClient.value = !!(deviceToken && deviceId) || 
                         window.location.pathname.includes('/remote');
  
  console.log('App component selection - isRemoteClient:', isRemoteClient.value);
}
</script>

<style>
#app {
  min-height: 100vh;
  background: var(--color-bg-primary, #1e1e1e);
  color: var(--color-text-primary, #ffffff);
}
</style>