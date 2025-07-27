<template>
  <div class="claude-terminal-tabs">
    <div class="tabs-header">
      <div class="tabs-container">
        <div
          v-for="instance in instances"
          :key="instance.id"
          :class="['tab', { active: instance.id === activeInstanceId }]"
          :style="instance.color ? { 
            borderTopColor: instance.color, 
            borderTopWidth: '4px',
            backgroundColor: instance.color + '10'  
          } : {}"
          @click="setActiveInstance(instance.id)"
          @contextmenu.prevent="showContextMenu($event, instance)"
        >
          <Icon 
            v-if="getInstancePersonality(instance.id)?.icon" 
            :name="getInstancePersonality(instance.id)!.icon" 
            size="14" 
            class="tab-icon"
          />
          <input
            v-if="editingInstanceId === instance.id"
            v-model="editingName"
            type="text"
            class="tab-name-input"
            @blur="saveInstanceName(instance.id)"
            @keyup.enter="saveInstanceName(instance.id)"
            @keyup.escape="cancelEdit"
            @click.stop
            :ref="el => { if (editingInstanceId === instance.id) nextTick(() => (el as HTMLInputElement)?.focus()) }"
          />
          <span 
            v-else
            class="tab-name"
            @dblclick.stop="startEditName(instance)"
            :title="'Double-click to rename'"
          >{{ instance.name }}</span>
          <div class="tab-status" :class="`status-${instance.status}`"></div>
          <button
            v-if="instances.length > 1"
            @click.stop="removeInstance(instance.id)"
            class="tab-close"
            title="Close terminal"
          >
            <Icon name="mdi:close" size="14" />
          </button>
        </div>
        <button
          @click="createNewInstance"
          class="tab-add"
          title="New Claude terminal"
        >
          <Icon name="mdi:plus" size="16" />
        </button>
      </div>
      
      <div class="header-actions">
        <!-- Personality selector moved to individual terminal headers -->
      </div>
    </div>
    
    <div class="terminals-container">
      <ClaudeTerminalTab
        v-for="instance in instances"
        :key="instance.id"
        v-show="instance.id === activeInstanceId"
        :instance="instance"
        @status-change="(status, pid) => updateInstanceStatus(instance.id, status, pid)"
      />
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuRef"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="context-menu-item" @click="renameTabFromMenu">
          Rename tab
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-colors">
          <div 
            v-for="color in tabColors" 
            :key="color"
            class="color-dot" 
            :style="{ backgroundColor: color }"
            @click="setTabColor(color)"
            :title="`Set tab color to ${color}`"
          ></div>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="closeTab">
          Close tab
        </div>
        <div class="context-menu-item" @click="closeOtherTabs" :class="{ disabled: instances.length <= 1 }">
          Close other tabs
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import ClaudeTerminalTab from './ClaudeTerminalTab.vue';

const instancesStore = useClaudeInstancesStore();

// Editing state
const editingInstanceId = ref<string | null>(null);
const editingName = ref('');

// Context menu state
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  targetInstance: null as any
});
const contextMenuRef = ref<HTMLElement | null>(null);

const instances = computed(() => instancesStore.instancesList);
const activeInstanceId = computed(() => instancesStore.activeInstanceId);
const activeInstance = computed(() => instancesStore.activeInstance);

// Tab colors (matching Warp's color palette)
const tabColors = ['#f87171', '#a3e635', '#fbbf24', '#60a5fa', '#f472b6', '#34d399'];

// Context menu computed properties
const canMoveLeft = computed(() => {
  if (!contextMenu.value.targetInstance) return false;
  const index = instances.value.findIndex(i => i.id === contextMenu.value.targetInstance.id);
  return index > 0;
});

const canMoveRight = computed(() => {
  if (!contextMenu.value.targetInstance) return false;
  const index = instances.value.findIndex(i => i.id === contextMenu.value.targetInstance.id);
  return index < instances.value.length - 1;
});

const getInstancePersonality = (instanceId: string) => {
  return instancesStore.getInstancePersonality(instanceId);
};

const setActiveInstance = (id: string) => {
  instancesStore.setActiveInstance(id);
};

const createNewInstance = async () => {
  const count = instances.value.length + 1;
  await instancesStore.createInstance(`Claude ${count}`);
};

const removeInstance = async (id: string) => {
  if (confirm('Are you sure you want to close this Claude terminal?')) {
    await instancesStore.removeInstance(id);
  }
};

const updateInstanceStatus = (id: string, status: any, pid?: number) => {
  instancesStore.updateInstanceStatus(id, status, pid);
};

const updateInstancePersonality = (id: string, personalityId: string | undefined) => {
  instancesStore.updateInstancePersonality(id, personalityId);
};

// Name editing functions
const startEditName = (instance: any) => {
  editingInstanceId.value = instance.id;
  editingName.value = instance.name;
};

const saveInstanceName = async (instanceId: string) => {
  const trimmedName = editingName.value.trim();
  if (trimmedName && trimmedName !== instancesStore.instances.get(instanceId)?.name) {
    await instancesStore.updateInstanceName(instanceId, trimmedName);
  }
  cancelEdit();
};

const cancelEdit = () => {
  editingInstanceId.value = null;
  editingName.value = '';
};

// Context menu methods
const showContextMenu = (event: MouseEvent, instance: any) => {
  // Calculate position to keep menu within viewport
  const menuWidth = 180; // Approximate width of context menu
  const menuHeight = 200; // Approximate height of context menu
  const padding = 8; // Padding from edge
  
  let x = event.clientX;
  let y = event.clientY;
  
  // Check if menu would go off right edge
  if (x + menuWidth > window.innerWidth - padding) {
    x = window.innerWidth - menuWidth - padding;
  }
  
  // Check if menu would go off bottom edge
  if (y + menuHeight > window.innerHeight - padding) {
    y = window.innerHeight - menuHeight - padding;
  }
  
  // Check if menu would go off left edge (unlikely but safe)
  if (x < padding) {
    x = padding;
  }
  
  // Check if menu would go off top edge (unlikely but safe)
  if (y < padding) {
    y = padding;
  }
  
  contextMenu.value = {
    visible: true,
    x,
    y,
    targetInstance: instance
  };
};

const hideContextMenu = () => {
  contextMenu.value.visible = false;
  contextMenu.value.targetInstance = null;
};

const renameTabFromMenu = () => {
  if (contextMenu.value.targetInstance) {
    startEditName(contextMenu.value.targetInstance);
  }
  hideContextMenu();
};

const setTabColor = async (color: string) => {
  if (contextMenu.value.targetInstance) {
    const instance = instancesStore.instances.get(contextMenu.value.targetInstance.id);
    if (instance) {
      instance.color = color;
      // Use nextTick to prevent component conflicts
      await nextTick();
      await instancesStore.saveInstances();
    }
  }
  hideContextMenu();
};

const moveTabLeft = () => {
  if (!canMoveLeft.value || !contextMenu.value.targetInstance) return;
  
  const currentIndex = instances.value.findIndex(i => i.id === contextMenu.value.targetInstance.id);
  if (currentIndex > 0) {
    // Use nextTick to ensure DOM updates don't conflict
    nextTick(() => {
      const instancesArray = Array.from(instancesStore.instances.values());
      const [movedInstance] = instancesArray.splice(currentIndex, 1);
      instancesArray.splice(currentIndex - 1, 0, movedInstance);
      
      // Rebuild the Map with new order using proper reactivity
      const newMap = new Map();
      instancesArray.forEach(instance => {
        newMap.set(instance.id, instance);
      });
      instancesStore.instances = newMap;
      
      instancesStore.saveInstances();
    });
  }
  hideContextMenu();
};

const moveTabRight = () => {
  if (!canMoveRight.value || !contextMenu.value.targetInstance) return;
  
  const currentIndex = instances.value.findIndex(i => i.id === contextMenu.value.targetInstance.id);
  if (currentIndex < instances.value.length - 1) {
    // Use nextTick to ensure DOM updates don't conflict
    nextTick(() => {
      const instancesArray = Array.from(instancesStore.instances.values());
      const [movedInstance] = instancesArray.splice(currentIndex, 1);
      instancesArray.splice(currentIndex + 1, 0, movedInstance);
      
      // Rebuild the Map with new order using proper reactivity
      const newMap = new Map();
      instancesArray.forEach(instance => {
        newMap.set(instance.id, instance);
      });
      instancesStore.instances = newMap;
      
      instancesStore.saveInstances();
    });
  }
  hideContextMenu();
};

const closeTab = async () => {
  if (contextMenu.value.targetInstance) {
    if (instances.value.length > 1) {
      await removeInstance(contextMenu.value.targetInstance.id);
    }
  }
  hideContextMenu();
};

const closeOtherTabs = async () => {
  if (!contextMenu.value.targetInstance || instances.value.length <= 1) return;
  
  const targetId = contextMenu.value.targetInstance.id;
  const instancesToClose = instances.value.filter(i => i.id !== targetId);
  
  for (const instance of instancesToClose) {
    await removeInstance(instance.id);
  }
  
  hideContextMenu();
};

// Handle tab switching with keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  // Hide context menu on Escape
  if (e.key === 'Escape') {
    hideContextMenu();
    return;
  }
  
  // Ctrl+Tab: Next tab
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    const currentIndex = instances.value.findIndex(i => i.id === activeInstanceId.value);
    const nextIndex = (currentIndex + 1) % instances.value.length;
    if (instances.value[nextIndex]) {
      setActiveInstance(instances.value[nextIndex].id);
    }
  }
  // Ctrl+Shift+Tab: Previous tab
  else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
    e.preventDefault();
    const currentIndex = instances.value.findIndex(i => i.id === activeInstanceId.value);
    const prevIndex = currentIndex === 0 ? instances.value.length - 1 : currentIndex - 1;
    if (instances.value[prevIndex]) {
      setActiveInstance(instances.value[prevIndex].id);
    }
  }
};

// Handle clicks outside context menu
const handleClickOutside = (e: MouseEvent) => {
  if (contextMenu.value.visible && contextMenuRef.value && !contextMenuRef.value.contains(e.target as Node)) {
    hideContextMenu();
  }
};

onMounted(async () => {
  // Only initialize in client/electron context
  if (typeof window !== 'undefined' && window.electronAPI) {
    await instancesStore.init();
    
    // Load workspace configuration if workspace is set
    const { useWorkspaceManager } = await import('~/composables/useWorkspaceManager');
    const { currentWorkspacePath } = useWorkspaceManager();
    
    if (currentWorkspacePath.value) {
      await instancesStore.loadWorkspaceConfiguration(currentWorkspacePath.value);
    }
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
  } else {
    console.warn('ClaudeTerminalTabs: Electron API not available');
  }
});

onUnmounted(() => {
  // Clean up event listeners
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('click', handleClickOutside);
  }
});
</script>

<style scoped>
.claude-terminal-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.tabs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  padding: 0 8px;
  min-height: 38px;
  position: relative;
  z-index: 10;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.tabs-container::-webkit-scrollbar {
  height: 3px;
}

.tabs-container::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: #505050;
  border-radius: 3px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-top: 4px solid transparent;
  border-bottom: none;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  position: relative;
  white-space: nowrap;
  font-size: 13px;
}

.tab:hover {
  background: #383838;
}

.tab.active {
  background: #1e1e1e;
  border-color: #181818;
  border-bottom-color: #1e1e1e;
}

.tab-icon {
  opacity: 0.8;
}

.tab-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.tab-name-input {
  max-width: 120px;
  background: #3c3c3c;
  border: 1px solid #007acc;
  border-radius: 2px;
  color: #d4d4d4;
  padding: 2px 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.tab-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 4px;
}

.status-connected {
  background: #0dbc79;
}

.status-connecting {
  background: #e5e510;
  animation: pulse 1.5s ease-in-out infinite;
}

.status-disconnected {
  background: #666;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 2px;
  margin-left: 4px;
  border-radius: 3px;
  opacity: 0;
  transition: all 0.2s;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: #505050;
  color: #fff;
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 3px;
  transition: all 0.2s;
}

.tab-add:hover {
  background: #383838;
  color: #fff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.terminals-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* Context Menu Styles */
.context-menu {
  position: fixed;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 9999;
  min-width: 160px;
  padding: 4px 0;
  font-size: 13px;
  color: #cccccc;
}

.context-menu-item {
  padding: 6px 20px;
  cursor: pointer;
  transition: background-color 0.1s ease;
  user-select: none;
}

.context-menu-item:hover:not(.disabled) {
  background: #094771;
  color: #ffffff;
}

.context-menu-item.disabled {
  color: #5a5a5a;
  cursor: not-allowed;
}

.context-menu-separator {
  height: 1px;
  background: #3e3e42;
  margin: 4px 0;
}

.context-menu-colors {
  display: flex;
  gap: 8px;
  padding: 8px 20px;
  justify-content: center;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s ease;
}

.color-dot:hover {
  border-color: #cccccc;
  transform: scale(1.1);
}
</style>