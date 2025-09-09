<template>
  <div class="start-node">
    <div class="start-badge">
      <Icon name="mdi:flag-checkered" size="16" />
      <span>START</span>
    </div>
    <div class="start-body">
      <div class="start-title">Pipeline Start</div>
      <div class="start-note">Entry point</div>
    </div>
    <Handle type="source" :position="Position.Right" :id="`${id}-output`" />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import Icon from '~/components/Icon.vue';

defineProps<{ id: string }>();
</script>

<style scoped>
.start-node {
  position: relative;
  background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
  color: #0b1220;
  border-radius: 0.75rem;
  border: 2px solid #93c5fd;
  min-width: 200px;
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.3);
}

.start-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.85);
  color: #0b1220;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  position: absolute;
  top: -0.8rem;
  left: 50%;
  transform: translateX(-50%);
  font-weight: 700;
  font-size: 0.75rem;
  border: 2px solid #0b1220;
}

.start-body { 
  padding: 0.75rem 1rem;
  text-align: center;
}

.start-title {
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.start-note {
  font-size: 0.75rem;
  opacity: 0.9;
}

:deep(.vue-flow__handle-right) {
  right: -0.4rem;
}
</style>

