<template>
  <div 
    class="group-node" 
    :class="{ 'entry-point': isEntryPoint, 'unreachable': isUnreachable, 'in-cycle': inCycle }"
    @dblclick="onEdit"
  >
    <!-- Group Header -->
    <div class="group-header">
      <div class="group-info">
        <Icon name="mdi:group" size="16" />
        <span class="group-name">{{ data.name }}</span>
        <span class="agent-count">({{ data.agentCount || 0 }} agents)</span>
      </div>
      <div class="group-actions">
        <button @click.stop="onEdit" class="action-btn" title="Edit Group (or double-click)">
          <Icon name="mdi:pencil" size="14" />
        </button>
      </div>
    </div>
    
    <!-- Order/Level Badge -->
    <div v-if="orderLabel !== ''" class="order-badge" :title="'Pipeline level: ' + orderLabel">
      {{ orderLabel }}
    </div>
    
    <!-- Entry Point Badge -->
    <div v-if="isEntryPoint" class="entry-badge">
      <Icon name="mdi:location-enter" size="12" />
      <span>ENTRY</span>
    </div>
    
    <!-- Group Content Preview -->
    <div class="group-content">
      <div class="group-status">
        <span class="status-dot" :class="data.status"></span>
        <span>{{ data.status || 'idle' }}</span>
      </div>
      
      <!-- Mini Agent Preview -->
      <div v-if="data.agents && data.agents.length > 0" class="agents-preview">
        <div v-for="(agent, idx) in data.agents.slice(0, 3)" :key="idx" class="mini-agent">
          <div class="mini-avatar" :style="{ background: agent.color }">
            <Icon :name="agent.icon" size="12" />
          </div>
        </div>
        <div v-if="data.agents.length > 3" class="more-agents">
          +{{ data.agents.length - 3 }}
        </div>
      </div>
      
      <!-- Internal Entry/Exit Points -->
      <div class="internal-points">
        <div class="entry-point-info" v-if="data.entryAgents?.length">
          <Icon name="mdi:location-enter" size="12" />
          <span>{{ data.entryAgents.length }}</span>
        </div>
        <div class="exit-point-info" v-if="data.exitAgents?.length">
          <Icon name="mdi:location-exit" size="12" />
          <span>{{ data.exitAgents.length }}</span>
        </div>
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

interface GroupNodeData {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  agentCount: number;
  agents?: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
  }>;
  entryAgents?: string[];
  exitAgents?: string[];
  color: string;
  isEntry?: boolean;
  order?: number;
}

const props = defineProps<{
  id: string;
  data: GroupNodeData;
  sourceEdges?: any[];
}>();

const emit = defineEmits<{
  edit: [id: string];
}>();

// Entry point only when explicitly marked
const isEntryPoint = computed(() => {
  return (props.data as any)?.isEntry === true;
});

const isUnreachable = computed(() => Boolean((props.data as any)?.validation?.unreachable));
const inCycle = computed(() => Boolean((props.data as any)?.validation?.inCycle));

const orderLabel = computed(() => {
  const ord = (props.data as any)?.order;
  return typeof ord === 'number' && ord >= 0 ? String(ord) : '';
});

function onEdit() {
  emit('edit', props.id);
}
</script>

<style scoped>
.group-node {
  position: relative;
  background-color: #111827;
  border-radius: 0.5rem;
  border: 2px solid #9333ea;
  min-width: 220px;
  transition: all 0.2s;
  box-shadow: 0 4px 8px rgba(147, 51, 234, 0.2);
}

.group-node:hover {
  border-color: #a855f7;
  box-shadow: 0 6px 16px rgba(147, 51, 234, 0.3);
}

.group-node.entry-point {
  border-color: #4ade80;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.3);
}

.group-node.unreachable {
  border-color: #f59e0b;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}

.group-node.in-cycle {
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

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid #374151;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
}

.group-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.agent-count {
  font-size: 0.75rem;
  color: #9ca3af;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.action-btn {
  padding: 0.25rem;
  border-radius: 0.25rem;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #374151;
  color: white;
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

.group-content {
  padding: 0.75rem;
}

.group-status {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 0.75rem;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
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

.agents-preview {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.mini-agent {
  position: relative;
}

.mini-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.more-agents {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-left: 0.5rem;
}

.internal-points {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #9ca3af;
}

.entry-point-info,
.exit-point-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.entry-point-info {
  color: #4ade80;
}

.exit-point-info {
  color: #f87171;
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
  background-color: #a855f7;
  border: 2px solid #111827;
}

:deep(.vue-flow__handle-left) {
  left: -0.375rem;
}

:deep(.vue-flow__handle-right) {
  right: -0.375rem;
}

:deep(.vue-flow__handle:hover) {
  background-color: #c084fc;
  transform: scale(1.25);
}
</style>
