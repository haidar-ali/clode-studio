<template>
  <div class="simple-file-explorer">
    <div class="explorer-header">
      <h3>Files: {{ currentPath || '/' }}</h3>
      <button v-if="currentPath" @click="goUp" class="up-button">
        <Icon name="mdi:arrow-up" /> Up
      </button>
    </div>
    
    <div v-if="pending" class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading files...</p>
    </div>
    
    <div v-else-if="error" class="error-state">
      <Icon name="mdi:alert" />
      <p>{{ error }}</p>
    </div>
    
    <div v-else-if="files.length === 0" class="empty-state">
      <Icon name="mdi:folder-open" />
      <p>Empty directory</p>
    </div>
    
    <div v-else class="file-list">
      <div 
        v-for="file in files" 
        :key="file.path"
        class="file-entry"
        :class="{ 'is-directory': file.isDirectory }"
        @click="handleClick(file)"
      >
        <Icon :name="getIcon(file)" class="entry-icon" />
        <span class="entry-name">{{ file.name }}</span>
        <span v-if="!file.isDirectory && file.size" class="entry-size">
          {{ formatSize(file.size) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

const route = useRoute();
const router = useRouter();

// Get current path from route
const currentPath = computed(() => (route.query.path as string) || '');

// Fetch files for current path
const { data, pending, error, refresh } = await useFetch('/api/files/list', {
  query: {
    path: currentPath
  }
});

const files = computed(() => data.value?.entries || []);

const emit = defineEmits<{
  'file-open': [file: FileEntry];
}>();

function handleClick(file: FileEntry) {
  if (file.isDirectory) {
    // Navigate to directory
    router.push({
      query: { path: file.path }
    });
  } else {
    // Emit event to open file
    emit('file-open', file);
  }
}

function goUp() {
  const parts = currentPath.value.split('/').filter(Boolean);
  parts.pop();
  router.push({
    query: { path: parts.join('/') }
  });
}

function getIcon(entry: FileEntry): string {
  if (entry.isDirectory) {
    return 'mdi:folder';
  }
  
  const ext = entry.name.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    ts: 'vscode-icons:file-type-typescript',
    tsx: 'vscode-icons:file-type-typescript',
    js: 'vscode-icons:file-type-js',
    jsx: 'vscode-icons:file-type-js',
    vue: 'vscode-icons:file-type-vue',
    json: 'vscode-icons:file-type-json',
    md: 'vscode-icons:file-type-markdown',
    css: 'vscode-icons:file-type-css',
    scss: 'vscode-icons:file-type-scss',
    html: 'vscode-icons:file-type-html',
    py: 'vscode-icons:file-type-python',
    yaml: 'vscode-icons:file-type-yaml',
    yml: 'vscode-icons:file-type-yaml',
    txt: 'mdi:file-document-outline'
  };
  
  return iconMap[ext || ''] || 'mdi:file';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Watch for path changes
watch(currentPath, () => {
  refresh();
});
</script>

<style scoped>
.simple-file-explorer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.up-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.up-button:hover {
  background: var(--color-background-hover);
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.file-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
  font-size: 13px;
  color: var(--color-text);
}

.file-entry:hover {
  background-color: var(--color-background-hover);
}

.entry-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.entry-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-size {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-left: auto;
}

.is-directory .entry-name {
  font-weight: 500;
}

.loading-state,
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

.loading-state svg,
.error-state svg,
.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>