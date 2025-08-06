<template>
  <div class="file-tree">
    <div 
      v-for="entry in entries" 
      :key="entry.path"
      class="file-entry"
      :class="{ 'is-directory': entry.isDirectory }"
      @click="handleClick(entry)"
    >
      <Icon :name="getIcon(entry)" class="entry-icon" />
      <span class="entry-name">{{ entry.name }}</span>
      <span v-if="!entry.isDirectory && entry.size" class="entry-size">
        {{ formatSize(entry.size) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

const props = defineProps<{
  entries: FileEntry[];
}>();

const emit = defineEmits<{
  select: [entry: FileEntry];
}>();

const router = useRouter();

const handleClick = (entry: FileEntry) => {
  emit('select', entry);
};

const getIcon = (entry: FileEntry) => {
  if (entry.isDirectory) {
    return 'mdi:folder';
  }
  
  const ext = entry.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return 'mdi:language-javascript';
    case 'vue':
      return 'mdi:vuejs';
    case 'json':
      return 'mdi:code-json';
    case 'md':
      return 'mdi:language-markdown';
    case 'css':
    case 'scss':
    case 'sass':
      return 'mdi:language-css3';
    case 'html':
      return 'mdi:language-html5';
    case 'yml':
    case 'yaml':
      return 'mdi:file-code';
    default:
      return 'mdi:file-document-outline';
  }
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
</script>

<style scoped>
.file-tree {
  padding: 8px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 13px;
  color: #cccccc;
  background: #252526;
  height: 100%;
  overflow-y: auto;
}

.file-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.file-entry:hover {
  background: #2a2d2e;
}

.file-entry.is-directory {
  font-weight: 500;
}

.entry-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.entry-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-size {
  font-size: 11px;
  color: #858585;
}
</style>