<template>
  <div class="checkpoint-panel">
    <CheckpointTimeline />
  </div>
</template>

<script setup lang="ts">
import CheckpointTimeline from './CheckpointTimeline.vue';
</script>

<style scoped>
.checkpoint-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
}
</style>