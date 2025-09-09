<template>
  <div class="agent-node" :class="[data.status, { 'entry-point': isEntryPoint, 'unreachable': isUnreachable, 'in-cycle': inCycle }]">
    <!-- Entry Point Badge -->
    <div v-if="isEntryPoint" class="entry-badge">
      <Icon name="mdi:location-enter" size="12" />
      <span>ENTRY</span>
    </div>
    
    <!-- Order/Level Badge -->
    <div v-if="orderLabel !== ''" class="order-badge" :title="'Pipeline level: ' + orderLabel">
      {{ orderLabel }}
    </div>
    
    <!-- Agent Avatar -->
    <div class="agent-avatar" :style="{ background: data.color }">
      <Icon :name="data.icon" size="20" />
    </div>
    
    <!-- Agent Info -->
    <div class="agent-content">
      <div class="agent-name">{{ data.name }}</div>
      <div class="agent-type">{{ data.type }}</div>
      <div class="agent-status">
        <span class="status-dot" :class="data.status"></span>
        <span>{{ data.status || 'idle' }}</span>
      </div>
    </div>
    
    <!-- Connection Handles -->
    <Handle type="target" :position="Position.Left" :id="`${id}-input`" />
    <Handle type="source" :position="Position.Right" :id="`${id}-output`" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Icon from '~/components/Icon.vue';

interface AgentNodeData {
  name: string;
  type: string;
  icon: string;
  color: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  instanceType: 'claude' | 'codex';
  personalityId?: string;
  customInstructions?: string;
  isEntry?: boolean;
  order?: number;
}

const props = defineProps<{
  id: string;
  data: AgentNodeData;
  sourceEdges?: any[];
}>();

// Node is entry point only if explicitly marked (set by flow)
const isEntryPoint = computed(() => {
  return (props.data as any)?.isEntry === true;
});

const orderLabel = computed(() => {
  const ord = (props.data as any)?.order;
  return typeof ord === 'number' && ord >= 0 ? String(ord) : '';
});

const isUnreachable = computed(() => Boolean((props.data as any)?.validation?.unreachable));
const inCycle = computed(() => Boolean((props.data as any)?.validation?.inCycle));
</script>

<style scoped>
.agent-node {
  position: relative;
  background-color: #1f2937;
  border-radius: 0.5rem;
  padding: 0.75rem;
  border: 2px solid #374151;
  min-width: 180px;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.agent-node:hover {
  border-color: #3b82f6;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
}

.agent-node.running {
  border-color: #10b981;
  animation: pulse 2s infinite;
}

.agent-node.error {
  border-color: #ef4444;
}

.agent-node.completed {
  border-color: #059669;
}

.agent-node.entry-point {
  border-color: #4ade80;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.3);
}

.agent-node.unreachable {
  border-color: #f59e0b;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}

.agent-node.in-cycle {
  border-color: #ef4444;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.25);
}

.order-badge {
  position: absolute;
  top: -0.6rem;
  right: -0.6rem;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 9999px;
  background: #3b82f6;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  border: 2px solid #0b1220;
  z-index: 12;
}

.entry-badge {
  position: absolute;
  top: -0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background-color: #10b981;
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  z-index: 10;
}

.agent-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.agent-content {
  text-align: center;
}

.agent-name {
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.agent-type {
  color: #9ca3af;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}

.agent-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #9ca3af;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: #4b5563;
}

.status-dot.idle {
  background-color: #4b5563;
}

.status-dot.running {
  background-color: #10b981;
  animation: pulse 1s infinite;
}

.status-dot.completed {
  background-color: #059669;
}

.status-dot.error {
  background-color: #ef4444;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Vue Flow Handle Styles */
:deep(.vue-flow__handle) {
  width: 0.75rem;
  height: 0.75rem;
  background-color: #3b82f6;
  border: 2px solid #111827;
}

:deep(.vue-flow__handle-left) {
  left: -0.375rem;
}

:deep(.vue-flow__handle-right) {
  right: -0.375rem;
}

:deep(.vue-flow__handle:hover) {
  background-color: #60a5fa;
  transform: scale(1.25);
}
</style>
