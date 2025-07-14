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
      
      <Icon :name="getFileIcon(node)" class="file-icon" />
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

const getFileIcon = (node: FileNodeType): string => {
  if (node.isDirectory) {
    return node.expanded ? 'mdi:folder-open' : 'mdi:folder';
  }
  
  return 'mdi:file';
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