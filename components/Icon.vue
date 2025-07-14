<template>
  <ClientOnly>
    <IconifyIcon 
      :icon="name" 
      :width="sizeValue" 
      :height="sizeValue"
      :class="className"
    />
    <template #fallback>
      <span :style="{ width: sizeValue + 'px', height: sizeValue + 'px' }" class="icon-placeholder"></span>
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon as IconifyIcon } from '@iconify/vue';

const props = defineProps<{
  name: string;
  size?: number | string;
  className?: string;
}>();

const sizeValue = computed(() => {
  return typeof props.size === 'string' ? parseInt(props.size) : (props.size || 16);
});
</script>

<style scoped>
.icon-placeholder {
  display: inline-block;
  background: currentColor;
  opacity: 0.2;
  border-radius: 2px;
}
</style>