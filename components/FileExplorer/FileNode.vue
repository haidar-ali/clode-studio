<template>
  <div class="file-node">
    <div
      class="node-item"
      :class="{ 'is-directory': node.isDirectory, 'is-expanded': node.expanded }"
      :style="{ paddingLeft: `${8 + level * 16}px` }"
      @click="handleClick"
      @contextmenu="handleRightClick"
    >
      <Icon
        v-if="node.isDirectory"
        :name="node.expanded ? 'mdi:chevron-down' : 'mdi:chevron-right'"
        class="expand-icon"
      />
      <div v-else class="file-spacer"></div>
      
      <span class="file-icon" :style="{ color: getFileIconColor(node) }">
        <Icon :name="getFileIcon(node)" />
      </span>
      <span class="file-name">{{ node.name }}</span>
    </div>
    
    <div v-if="node.isDirectory && node.expanded && node.children" class="children">
      <FileNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :level="level + 1"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
        @contextMenu="(event, node) => $emit('contextMenu', event, node)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileNode as FileNodeType } from '~/shared/types';

const props = defineProps<{
  node: FileNodeType;
  level: number;
}>();

const emit = defineEmits<{
  select: [node: FileNodeType];
  toggle: [node: FileNodeType];
  contextMenu: [event: MouseEvent, node: FileNodeType];
}>();

const handleClick = () => {
  emit('select', props.node);
};

const handleRightClick = (event: MouseEvent) => {
  event.preventDefault();
  emit('contextMenu', event, props.node);
};

const getFileIconColor = (node: FileNodeType): string => {
  if (node.isDirectory) {
    return '#dcb67a';
  }
  
  const ext = node.name.split('.').pop()?.toLowerCase();
  
  // Return color based on file type
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return '#f7df1e';
    case 'ts':
    case 'tsx':
      return '#3178c6';
    case 'jsx':
      return '#61dafb';
    case 'vue':
      return '#4fc08d';
    case 'html':
    case 'htm':
      return '#e34c26';
    case 'css':
      return '#1572b6';
    case 'scss':
    case 'sass':
      return '#cc6699';
    case 'json':
    case 'jsonc':
      return '#cbcb41';
    case 'md':
    case 'mdx':
      return '#519aba';
    case 'py':
      return '#3776ab';
    case 'yaml':
    case 'yml':
      return '#cb171e';
    case 'xml':
      return '#ff6600';
    case 'git':
    case 'gitignore':
      return '#f05032';
    default:
      // Special file names
      if (node.name === 'package.json') return '#cb3837';
      if (node.name === 'Dockerfile' || node.name.includes('docker')) return '#2496ed';
      return '#9cdcfe'; // Default file color
  }
};

const getFileIcon = (node: FileNodeType): string => {
  if (node.isDirectory) {
    return node.expanded ? 'mdi:folder-open' : 'mdi:folder';
  }
  
  // Get file extension
  const ext = node.name.split('.').pop()?.toLowerCase();
  
  // Return appropriate icon based on file type
  switch (ext) {
    // JavaScript/TypeScript
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'mdi:language-javascript';
    case 'ts':
    case 'tsx':
      return 'mdi:language-typescript';
    case 'jsx':
      return 'mdi:react';
      
    // Frameworks
    case 'vue':
      return 'mdi:vuejs';
    case 'svelte':
      return 'mdi:svelte';
      
    // Web
    case 'html':
    case 'htm':
      return 'mdi:language-html5';
    case 'css':
      return 'mdi:language-css3';
    case 'scss':
    case 'sass':
      return 'mdi:sass';
    case 'less':
      return 'mdi:less';
      
    // Data
    case 'json':
    case 'jsonc':
      return 'mdi:code-json';
    case 'xml':
      return 'mdi:xml';
    case 'yaml':
    case 'yml':
      return 'mdi:file-code';
    case 'toml':
      return 'mdi:file-settings';
      
    // Documentation
    case 'md':
    case 'mdx':
      return 'mdi:language-markdown';
    case 'txt':
      return 'mdi:text';
    case 'pdf':
      return 'mdi:file-pdf-box';
      
    // Programming Languages
    case 'py':
      return 'mdi:language-python';
    case 'java':
      return 'mdi:language-java';
    case 'c':
      return 'mdi:language-c';
    case 'cpp':
    case 'cc':
    case 'cxx':
      return 'mdi:language-cpp';
    case 'cs':
      return 'mdi:language-csharp';
    case 'go':
      return 'mdi:language-go';
    case 'rs':
      return 'mdi:language-rust';
    case 'php':
      return 'mdi:language-php';
    case 'rb':
      return 'mdi:language-ruby';
    case 'swift':
      return 'mdi:language-swift';
    case 'kt':
      return 'mdi:language-kotlin';
      
    // Shell/Config
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return 'mdi:console';
    case 'ps1':
      return 'mdi:powershell';
      
    // Images
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return 'mdi:image';
      
    // Git
    case 'gitignore':
    case 'gitattributes':
      return 'mdi:git';
      
    // Package files
    case 'lock':
      if (node.name.includes('package-lock')) return 'mdi:npm';
      if (node.name.includes('yarn')) return 'mdi:yarn';
      return 'mdi:lock';
      
    // Environment
    case 'env':
      return 'mdi:key-variant';
      
    // Default
    default:
      // Special file names
      if (node.name === 'package.json') return 'mdi:npm';
      if (node.name === 'tsconfig.json') return 'mdi:language-typescript';
      if (node.name === 'vite.config.ts' || node.name === 'vite.config.js') return 'mdi:lightning-bolt';
      if (node.name === 'webpack.config.js') return 'mdi:webpack';
      if (node.name === 'Dockerfile') return 'mdi:docker';
      if (node.name === 'docker-compose.yml' || node.name === 'docker-compose.yaml') return 'mdi:docker';
      if (node.name === 'README.md' || node.name === 'readme.md') return 'mdi:book-open-page-variant';
      if (node.name === 'LICENSE' || node.name === 'LICENSE.md') return 'mdi:certificate';
      
      return 'mdi:file-document-outline';
  }
};
</script>

<style scoped>
.node-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 13px;
  color: #cccccc;
  border-radius: 4px;
  margin: 1px 4px;
  min-height: 22px;
}

.node-item:hover {
  background: #37373d;
}

.node-item.is-directory {
  font-weight: 500;
}

.expand-icon {
  width: 16px;
  height: 16px;
  color: #858585;
  transition: transform 0.2s;
}

.file-spacer {
  width: 16px;
  height: 16px;
}

.file-icon {
  display: inline-flex;
  align-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.children {
  overflow: hidden;
}
</style>