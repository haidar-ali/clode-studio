<template>
  <div class="quick-access-toolbar">
    <button 
      class="toolbar-button"
      @click="openCommandPalette"
      title="Command Palette (Cmd+K)"
    >
      <Icon name="mdi:console" size="16" />
      <span class="toolbar-label">Commands</span>
    </button>
    
    <button 
      class="toolbar-button"
      @click="openMemoryEditor"
      title="Memory Editor (Cmd+M)"
    >
      <Icon name="mdi:brain" size="16" />
      <span class="toolbar-label">Memory</span>
    </button>
    
    <button 
      class="toolbar-button"
      @click="openHookManager"
      title="Hook Management"
    >
      <Icon name="mdi:hook" size="16" />
      <span class="toolbar-label">Hooks</span>
    </button>
    
    <button 
      class="toolbar-button"
      @click="openGlobalSearch"
      title="Global Search (Cmd+Shift+F)"
    >
      <Icon name="mdi:magnify" size="16" />
      <span class="toolbar-label">Search</span>
    </button>
    
    <button 
      class="toolbar-button"
      @click="openMCPManager"
      title="MCP Connections"
    >
      <Icon name="mdi:server-network" size="16" />
      <span class="toolbar-label">MCP</span>
      <span v-if="mcpStore.connectedCount > 0" class="badge">{{ mcpStore.connectedCount }}</span>
    </button>
    
    <button 
      class="toolbar-button"
      @click="openSlashCommands"
      title="Slash Command Studio"
    >
      <Icon name="mdi:slash-forward" size="16" />
      <span class="toolbar-label">Commands</span>
    </button>
    
    <button 
      class="toolbar-button"
      @click="openSettings"
      title="Settings"
    >
      <Icon name="mdi:cog" size="16" />
      <span class="toolbar-label">Settings</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useCommandsStore } from '~/stores/commands';
import { useMCPStore } from '~/stores/mcp';

const commandsStore = useCommandsStore();
const mcpStore = useMCPStore();

const openCommandPalette = () => {
  commandsStore.openCommandPalette();
};

const openMemoryEditor = () => {
  window.dispatchEvent(new CustomEvent('open-memory-editor'));
};

const openHookManager = () => {
  window.dispatchEvent(new CustomEvent('show-hook-manager'));
};

const openGlobalSearch = () => {
  window.dispatchEvent(new CustomEvent('open-global-search'));
};

const openSettings = () => {
  window.dispatchEvent(new CustomEvent('open-settings'));
};

const openMCPManager = () => {
  window.dispatchEvent(new CustomEvent('open-mcp-manager'));
};

const openSlashCommands = () => {
  window.dispatchEvent(new CustomEvent('open-slash-commands'));
};
</script>

<style scoped>
.quick-access-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
}

.toolbar-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  transition: all 0.2s;
  white-space: nowrap;
  position: relative;
}

.toolbar-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.toolbar-button:active {
  background: rgba(255, 255, 255, 0.15);
}

.toolbar-label {
  display: none;
}

/* Show labels on hover */
.toolbar-button:hover .toolbar-label {
  display: inline;
}

/* Always show labels on larger screens */
@media (min-width: 1400px) {
  .toolbar-label {
    display: inline;
  }
}

.badge {
  background: #28a745;
  color: white;
  padding: 1px 5px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  margin-left: 2px;
  min-width: 16px;
  text-align: center;
  line-height: 1.2;
}
</style>