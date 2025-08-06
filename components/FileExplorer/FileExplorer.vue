<template>
  <div class="file-explorer-server">
    <div class="explorer-header">
      <h3>{{ currentPath || 'Workspace' }}</h3>
    </div>
    
    <div v-if="error" class="error-state">
      <Icon name="mdi:alert" />
      <p>{{ error }}</p>
    </div>
    
    <div v-else-if="entries.length === 0" class="empty-state">
      <Icon name="mdi:folder-open" />
      <p>Empty directory</p>
    </div>
    
    <div v-else class="file-list">
      <FileTree 
        :entries="entries" 
        :currentPath="currentPath"
        client-only
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// Since we're in SPA mode (ssr: false), we'll use useFetch instead
const props = defineProps<{
  path?: string;
}>();

const { data: explorerData } = await useFetch('/api/files/list', {
  query: {
    path: props.path || ''
  }
});

const entries = computed(() => explorerData.value?.entries || []);
const error = computed(() => explorerData.value?.error || null);
const currentPath = computed(() => props.path || '');
</script>

<style scoped>
.file-explorer-server {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.explorer-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
}

.explorer-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.file-list {
  flex: 1;
  overflow-y: auto;
}

.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-text-secondary);
  gap: 8px;
}

.error-state {
  color: var(--color-error);
}

.error-state svg,
.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}
</style>