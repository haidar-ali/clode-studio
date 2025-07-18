<template>
  <div class="import-node">
    <div class="node-content" @click="$emit('open', node.path)">
      <Icon 
        :name="node.exists ? 'mdi:file-check' : 'mdi:file-alert'" 
        size="14" 
        :class="{ error: !node.exists }"
      />
      <span class="node-path">{{ node.path }}</span>
      <span v-if="!node.exists" class="error-text">(not found)</span>
    </div>
    <div v-if="node.children.length > 0" class="node-children">
      <ImportNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        @open="$emit('open', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface ImportNode {
  path: string;
  exists: boolean;
  children: ImportNode[];
}

defineProps<{
  node: ImportNode;
}>();

defineEmits<{
  open: [path: string];
}>();
</script>

<style scoped>
.import-node {
  margin-left: 0;
}

.node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  transition: background 0.2s;
}

.node-content:hover {
  background: #2d2d30;
}

.node-path {
  color: #cccccc;
  font-family: 'Consolas', 'Monaco', monospace;
}

.error {
  color: #f48771;
}

.error-text {
  color: #f48771;
  font-size: 11px;
  margin-left: 4px;
}

.node-children {
  margin-left: 20px;
}
</style>