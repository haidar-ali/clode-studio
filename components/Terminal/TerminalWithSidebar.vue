<template>
  <div class="terminal-with-sidebar">
    <div class="terminal-main">
      <Terminal
        v-for="instance in instances"
        v-show="instance.id === activeInstanceId"
        :key="instance.id"
        :ref="(el) => { if (el) terminalRefs[`terminal-${instance.id}`] = el }"
        :instance-id="instance.id"
        :project-path="instance.workingDirectory"
        :existing-pty-id="instance.ptyProcessId"
        @pty-created="(ptyId) => updateInstancePtyProcess(instance.id, ptyId)"
        @pty-destroyed="() => updateInstancePtyProcess(instance.id, undefined)"
      />
    </div>
    
    <div class="terminal-sidebar">
      <div class="sidebar-header">
        <h3>Terminals</h3>
        <button @click="createNewInstance" class="add-btn" title="New Terminal">
          <Icon name="mdi:plus" size="16" />
        </button>
      </div>
      
      <div class="terminal-list">
        <div
          v-for="instance in instances"
          :key="instance.id"
          :class="['terminal-item', { active: instance.id === activeInstanceId }]"
          @click="setActiveInstance(instance.id)"
          @contextmenu.prevent="showContextMenu($event, instance)"
        >
          <Icon name="mdi:console" size="16" class="terminal-icon" />
          <input
            v-if="editingInstanceId === instance.id"
            v-model="editingName"
            type="text"
            class="name-input"
            @blur="saveInstanceName(instance.id)"
            @keyup.enter="saveInstanceName(instance.id)"
            @keyup.escape="cancelEdit"
            @click.stop
            :ref="el => { if (editingInstanceId === instance.id) nextTick(() => (el as HTMLInputElement)?.focus()) }"
          />
          <span 
            v-else
            class="terminal-name"
            @dblclick.stop="startEditName(instance)"
            :title="'Double-click to rename'"
          >{{ instance.name }}</span>
          <button
            v-if="instances.length > 1"
            @click.stop="removeInstance(instance.id)"
            class="close-btn"
            title="Close terminal"
          >
            <Icon name="mdi:close" size="14" />
          </button>
        </div>
      </div>
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
        <div class="context-menu-item" @click="renameFromMenu">
          Rename
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="closeTerminal">
          Close Terminal
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useTerminalInstancesStore } from '~/stores/terminal-instances';
import Terminal from './Terminal.vue';

interface Props {
  projectPath?: string;
}

const props = defineProps<Props>();
const terminalStore = useTerminalInstancesStore();

// Use project path for worktree-specific instances
const worktreePath = computed(() => props.projectPath || '/');

// Filter instances by worktree
const instances = computed(() => {
  return terminalStore.getInstancesForWorktree(worktreePath.value);
});

// Active instance for this worktree
const activeInstanceId = computed(() => {
  const worktreeActive = terminalStore.getActiveInstanceForWorktree(worktreePath.value);
  if (worktreeActive) {
    return worktreeActive.id;
  }
  // If no active instance for this worktree, use the first one
  return instances.value.length > 0 ? instances.value[0].id : null;
});

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

const createNewInstance = async () => {
  const count = instances.value.length + 1;
  const instanceName = `Terminal ${count}`;
  await terminalStore.createInstance(instanceName, worktreePath.value);
};

// Keep track of terminal refs
const terminalRefs = ref<Record<string, any>>({});

const removeInstance = async (id: string) => {
  if (instances.value.length > 1) {
    // First destroy the PTY process through the terminal component
    const terminalRef = terminalRefs.value[`terminal-${id}`];
    if (terminalRef && terminalRef.destroyPty) {
      await terminalRef.destroyPty();
    }
    
    // Then remove from store
    await terminalStore.removeInstance(id);
  }
};

const setActiveInstance = (id: string) => {
  terminalStore.setActiveInstance(id);
};

const updateInstancePtyProcess = (id: string, ptyId: string | undefined) => {
  terminalStore.updateInstancePtyProcess(id, ptyId);
};

// Name editing functions
const startEditName = (instance: any) => {
  editingInstanceId.value = instance.id;
  editingName.value = instance.name;
};

const saveInstanceName = (instanceId: string) => {
  const trimmedName = editingName.value.trim();
  if (trimmedName && trimmedName !== terminalStore.instances.get(instanceId)?.name) {
    terminalStore.updateInstanceName(instanceId, trimmedName);
  }
  cancelEdit();
};

const cancelEdit = () => {
  editingInstanceId.value = null;
  editingName.value = '';
};

// Context menu methods
const showContextMenu = (event: MouseEvent, instance: any) => {
  const menuWidth = 150;
  const menuHeight = 100;
  const padding = 8;
  
  let x = event.clientX;
  let y = event.clientY;
  
  // Adjust position to keep menu in viewport
  if (x + menuWidth > window.innerWidth - padding) {
    x = window.innerWidth - menuWidth - padding;
  }
  if (y + menuHeight > window.innerHeight - padding) {
    y = window.innerHeight - menuHeight - padding;
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

const renameFromMenu = () => {
  if (contextMenu.value.targetInstance) {
    startEditName(contextMenu.value.targetInstance);
  }
  hideContextMenu();
};

const closeTerminal = async () => {
  if (contextMenu.value.targetInstance && instances.value.length > 1) {
    await removeInstance(contextMenu.value.targetInstance.id);
  }
  hideContextMenu();
};

// Handle clicks outside context menu
const handleClickOutside = (e: MouseEvent) => {
  if (contextMenu.value.visible && contextMenuRef.value && !contextMenuRef.value.contains(e.target as Node)) {
    hideContextMenu();
  }
};

onMounted(async () => {
  // Initialize the store
  await terminalStore.init();
  
  // Load workspace configuration
  await terminalStore.loadWorkspaceConfiguration(worktreePath.value);
  
  // If no instances exist for this worktree, create one
  if (instances.value.length === 0) {
    await createNewInstance();
  }
  
  // Add event listeners
  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.terminal-with-sidebar {
  display: flex;
  height: 100%;
  background: #1e1e1e;
}

.terminal-main {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.terminal-sidebar {
  width: 200px;
  background: #252526;
  border-left: 1px solid #383838;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #383838;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #cccccc;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: none;
  border-radius: 3px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #383838;
  color: #ffffff;
}

.terminal-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.terminal-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2px;
  position: relative;
}

.terminal-item:hover {
  background: #2a2d2e;
}

.terminal-item.active {
  background: #094771;
  color: #ffffff;
}

.terminal-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.terminal-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.name-input {
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #007acc;
  border-radius: 2px;
  color: #d4d4d4;
  padding: 2px 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  border-radius: 3px;
  color: #999;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
}

.terminal-item:hover .close-btn {
  opacity: 1;
}

.close-btn:hover {
  background: #505050;
  color: #fff;
}

/* Context Menu */
.context-menu {
  position: fixed;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 9999;
  min-width: 150px;
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

.context-menu-item:hover {
  background: #094771;
  color: #ffffff;
}

.context-menu-separator {
  height: 1px;
  background: #3e3e42;
  margin: 4px 0;
}

/* Scrollbar styling */
.terminal-list::-webkit-scrollbar {
  width: 10px;
}

.terminal-list::-webkit-scrollbar-track {
  background: transparent;
}

.terminal-list::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 5px;
}

.terminal-list::-webkit-scrollbar-thumb:hover {
  background: #4e4e4e;
}
</style>