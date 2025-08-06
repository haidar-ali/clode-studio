<template>
  <div class="test-explorer-page">
    <h1>Server Component File Explorer Test</h1>
    
    <div class="explorer-container">
      <!-- Simple file explorer with server-side data fetching -->
      <SimpleFileExplorer @file-open="handleFileOpen" />
    </div>
    
    <div v-if="selectedFile" class="file-preview">
      <h2>Selected File: {{ selectedFile.name }}</h2>
      <pre>{{ selectedFile }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import SimpleFileExplorer from '~/components/FileExplorer/SimpleFileExplorer.vue';

const selectedFile = ref(null);

function handleFileOpen(file) {
  selectedFile.value = file;
  console.log('File selected:', file);
}
</script>

<style scoped>
.test-explorer-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  color: var(--color-text);
}

h1 {
  padding: 16px;
  margin: 0;
  font-size: 18px;
  border-bottom: 1px solid var(--color-border);
}

.explorer-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.file-preview {
  width: 400px;
  padding: 16px;
  border-left: 1px solid var(--color-border);
  overflow: auto;
}

.file-preview h2 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.file-preview pre {
  font-size: 12px;
  white-space: pre-wrap;
}
</style>