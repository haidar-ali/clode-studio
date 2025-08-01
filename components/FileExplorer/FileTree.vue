<template>
  <div class="file-tree">
    <div class="file-tree-header">
      <button @click="handleWorkspaceSelect" class="workspace-button icon-only" title="Select Workspace">
        <Icon name="mdi:folder-open" />
      </button>
      <div class="header-actions">
        <button @click="createNewFileInRoot" class="action-button" title="New File" :disabled="!hasWorkspace">
          <Icon name="mdi:file-plus" />
        </button>
        <button @click="createNewFolderInRoot" class="action-button" title="New Folder" :disabled="!hasWorkspace">
          <Icon name="mdi:folder-plus" />
        </button>
        <button @click="openGlobalSearch" class="action-button" title="Search in Files (Cmd+Shift+F)" :disabled="!hasWorkspace">
          <Icon name="mdi:magnify" />
        </button>
      </div>
    </div>
    
    <div v-if="hasWorkspace" class="workspace-info">
      <div class="workspace-path">
        <Icon name="mdi:folder" />
        <span v-if="activeWorktreePath && activeWorktreePath !== currentWorkspacePath">
          {{ workspaceName }} / {{ activeWorktreePath.split('/').pop() }}
        </span>
        <span v-else>
          {{ workspaceName }}
        </span>
      </div>
    </div>
    
    <div class="tree-content">
      <div v-if="isLoading" class="loading">
        <Icon name="mdi:loading" class="spin" />
        Loading...
      </div>
      
      <div v-else-if="!hasWorkspace" class="empty-workspace">
        <Icon name="mdi:folder-open-outline" size="32" />
        <p>No workspace selected</p>
        <small>Select a folder to start browsing files</small>
      </div>
      
      <div v-else-if="fileTree.length === 0" class="empty-folder">
        <Icon name="mdi:file-outline" size="32" />
        <p>Empty folder</p>
      </div>
      
      <FileNode
        v-for="node in fileTree"
        :key="node.path"
        :node="node"
        :level="0"
        @select="onFileSelect"
        @toggle="onNodeToggle"
        @contextMenu="onContextMenu"
      />
    </div>
    
    <!-- Context Menu -->
    <div 
      v-if="showContextMenu" 
      class="context-menu"
      :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
      @click.stop
    >
      <div v-if="contextNode?.isDirectory" class="menu-item" @click.stop="createNewFile">
        <Icon name="mdi:file-plus" />
        New File
      </div>
      <div v-if="contextNode?.isDirectory" class="menu-item" @click.stop="createNewFolder">
        <Icon name="mdi:folder-plus" />
        New Folder
      </div>
      <div class="menu-item" @click.stop="renameItem">
        <Icon name="mdi:pencil" />
        Rename
      </div>
      <div class="menu-item delete" @click.stop="deleteItem">
        <Icon name="mdi:delete" />
        Delete
      </div>
    </div>
    
    <!-- Rename Modal -->
    <div v-if="showRenameModal" class="modal-overlay" @click="cancelRename">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>{{ getModalTitle() }}</h3>
        </div>
        <div class="modal-body">
          <input
            ref="renameInput"
            v-model="newName"
            type="text"
            placeholder="Enter new name"
            @keyup.enter="confirmRename"
            @keyup.escape="cancelRename"
          />
        </div>
        <div class="modal-actions">
          <button @click="cancelRename" class="cancel-btn">Cancel</button>
          <button @click="confirmRename" class="confirm-btn">{{ getActionButtonText() }}</button>
        </div>
      </div>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click="cancelDelete">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Delete {{ contextNode?.isDirectory ? 'Folder' : 'File' }}</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete "{{ contextNode?.name }}"?</p>
          <p v-if="contextNode?.isDirectory" class="warning">This will delete all contents inside the folder.</p>
        </div>
        <div class="modal-actions">
          <button @click="cancelDelete" class="cancel-btn">Cancel</button>
          <button @click="confirmDelete" class="delete-btn">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import type { FileNode } from '~/shared/types';

const editorStore = useEditorStore();
const tasksStore = useTasksStore();
const workspaceManager = useWorkspaceManager();

const fileTree = ref<FileNode[]>([]);
const isLoading = ref(false);

// Context menu state
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextNode = ref<FileNode | null>(null);

// Modal state
const showRenameModal = ref(false);
const showDeleteModal = ref(false);
const newName = ref('');
const renameInput = ref<HTMLInputElement>();
const modalMode = ref<'rename' | 'newFile' | 'newFolder'>('rename');

// Use workspace manager's computed properties
const { currentWorkspacePath, workspaceName, hasWorkspace, isChangingWorkspace, selectWorkspace, activeWorktreePath } = workspaceManager;

// Use active worktree path if available, otherwise use workspace path
const explorerPath = computed(() => activeWorktreePath.value || currentWorkspacePath.value);

const handleWorkspaceSelect = async () => {
  try {
    isLoading.value = true;
    await selectWorkspace();
    // After workspace change, reload the directory
    if (explorerPath.value) {
      await loadDirectory(explorerPath.value);
    }
  } catch (error) {
    alert(`Failed to load workspace: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isLoading.value = false;
  }
};

const loadDirectory = async (dirPath: string): Promise<FileNode[]> => {
  const result = await window.electronAPI.fs.readDir(dirPath);
  if (!result.success) {
    throw new Error(result.error);
  }
  
  const nodes: FileNode[] = result.files
    .sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    })
    .map(file => ({
      name: file.name,
      path: file.path,
      isDirectory: file.isDirectory,
      expanded: false,
      children: file.isDirectory ? [] : undefined
    }));
  
  if (dirPath === explorerPath.value) {
    fileTree.value = nodes;
  }
  
  return nodes;
};

const onFileSelect = async (node: FileNode) => {
  if (node.isDirectory) {
    await onNodeToggle(node);
  } else {
    try {
      await editorStore.openFile(node.path);
    } catch (error) {
      alert(`Failed to open file: ${error.message}`);
    }
  }
};

const onNodeToggle = async (node: FileNode) => {
  if (!node.isDirectory) return;
  
  node.expanded = !node.expanded;
  
  if (node.expanded) {
    if (!node.children || node.children.length === 0) {
      try {
        isLoading.value = true;
        node.children = await loadDirectory(node.path);
      } catch (error) {
        console.error('Failed to load directory:', error);
        node.expanded = false;
      } finally {
        isLoading.value = false;
      }
    }
    // Start watching this directory when expanded
    await window.electronAPI.fs.watchDirectory(node.path);
  } else {
    // Stop watching when collapsed
    await window.electronAPI.fs.unwatchDirectory(node.path);
  }
};

const openGlobalSearch = () => {
  // Emit event to parent to open global search
  const event = new CustomEvent('open-global-search');
  window.dispatchEvent(event);
};

const getModalTitle = () => {
  switch (modalMode.value) {
    case 'newFile': return 'Create New File';
    case 'newFolder': return 'Create New Folder';
    case 'rename': return `Rename ${contextNode.value?.isDirectory ? 'Folder' : 'File'}`;
    default: return 'Rename';
  }
};

const getActionButtonText = () => {
  switch (modalMode.value) {
    case 'newFile': return 'Create File';
    case 'newFolder': return 'Create Folder';
    case 'rename': return 'Rename';
    default: return 'Rename';
  }
};

// Context menu functions
const onContextMenu = (event: MouseEvent, node: FileNode) => {
  event.preventDefault();
  event.stopPropagation();
  
  
  contextNode.value = node;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  showContextMenu.value = true;
};

const hideContextMenu = () => {
  showContextMenu.value = false;
  // Don't reset contextNode here - keep it for modal operations
};

const createNewFileInRoot = () => {
  if (!currentWorkspacePath.value) return;
  
  // Create a virtual root node for the workspace
  contextNode.value = {
    name: '',
    path: currentWorkspacePath.value,
    isDirectory: true,
    expanded: true
  };
  
  modalMode.value = 'newFile';
  newName.value = 'new-file.txt';
  showRenameModal.value = true;
  
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
};

const createNewFolderInRoot = () => {
  if (!currentWorkspacePath.value) return;
  
  // Create a virtual root node for the workspace
  contextNode.value = {
    name: '',
    path: currentWorkspacePath.value,
    isDirectory: true,
    expanded: true
  };
  
  modalMode.value = 'newFolder';
  newName.value = 'new-folder';
  showRenameModal.value = true;
  
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
};

const createNewFile = async () => {
  hideContextMenu();
  modalMode.value = 'newFile';
  newName.value = 'new-file.txt';
  showRenameModal.value = true;
  
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
};

const createNewFolder = async () => {
  hideContextMenu();
  modalMode.value = 'newFolder';
  newName.value = 'new-folder';
  showRenameModal.value = true;
  
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
};

const renameItem = () => {
  hideContextMenu();
  modalMode.value = 'rename';
  newName.value = contextNode.value?.name || '';
  showRenameModal.value = true;
  
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
};

const deleteItem = () => {
  hideContextMenu();
  showDeleteModal.value = true;
};

const confirmRename = async () => {
  if (!newName.value.trim() || !contextNode.value) {
    return;
  }
  
  try {
    if (modalMode.value === 'newFile') {
      // Create new file
      const newPath = `${contextNode.value.path}/${newName.value}`;
      const result = await window.electronAPI.fs.writeFile(newPath, '');
      if (!result.success) {
        throw new Error(result.error);
      }
    } else if (modalMode.value === 'newFolder') {
      // Create new folder
      const newPath = `${contextNode.value.path}/${newName.value}`;
      const result = await window.electronAPI.fs.ensureDir(newPath);
      if (!result.success) {
        throw new Error(result.error);
      }
    } else if (modalMode.value === 'rename') {
      // Rename existing file/folder
      const oldPath = contextNode.value.path;
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${parentDir}/${newName.value}`;
      const result = await window.electronAPI.fs.rename(oldPath, newPath);
      if (!result.success) {
        throw new Error(result.error);
      }
    }
    
    // Refresh the directory
    await loadDirectory(explorerPath.value);
    
  } catch (error) {
    console.error('Failed to perform operation:', error);
    const operation = modalMode.value === 'rename' ? 'rename' : 'create';
    alert(`Failed to ${operation}: ${error.message || error}`);
  }
  
  cancelRename();
};

const cancelRename = () => {
  showRenameModal.value = false;
  newName.value = '';
  contextNode.value = null;
  modalMode.value = 'rename';
};

const confirmDelete = async () => {
  if (!contextNode.value) return;
  
  try {
    const result = await window.electronAPI.fs.delete(contextNode.value.path);
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Refresh the directory
    await loadDirectory(explorerPath.value);
    
  } catch (error) {
    console.error('Failed to delete:', error);
    alert(`Failed to delete: ${error.message || error}`);
  }
  
  cancelDelete();
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  contextNode.value = null;
};

// saveWorkspace is now handled by the workspace manager

const loadSavedWorkspace = async () => {
  const savedPath = await workspaceManager.loadWorkspaceFromStorage();
  if (savedPath) {
    try {
      // Use explorer path which will be the active worktree or workspace
      await loadDirectory(explorerPath.value);
      // Watching is handled by workspace manager
    } catch (error) {
      console.error('Failed to load saved workspace:', error);
    }
  }
};

// Watch for active worktree changes
watch(explorerPath, async (newPath, oldPath) => {
  if (newPath && newPath !== oldPath) {
    
    isLoading.value = true;
    try {
      await loadDirectory(newPath);
    } catch (error) {
      console.error('Failed to load worktree directory:', error);
    } finally {
      isLoading.value = false;
    }
  }
});

// Handle directory changes
const handleDirectoryChange = async (data: { path: string; eventType: string; filename: string }) => {
  
  // If it's the root workspace or active worktree
  if (data.path === explorerPath.value) {
    await loadDirectory(data.path);
    return;
  }
  
  // Find the node that represents this directory and refresh it
  const findAndRefreshNode = async (nodes: FileNode[], targetPath: string): Promise<boolean> => {
    for (const node of nodes) {
      if (node.path === targetPath && node.isDirectory && node.expanded) {
        // Reload this directory's children
        node.children = await loadDirectory(targetPath);
        return true;
      }
      if (node.children && node.expanded) {
        if (await findAndRefreshNode(node.children, targetPath)) {
          return true;
        }
      }
    }
    return false;
  };
  
  await findAndRefreshNode(fileTree.value, data.path);
};

onMounted(() => {
  loadSavedWorkspace();
  
  // Listen for directory changes
  window.electronAPI.fs.onDirectoryChanged(handleDirectoryChange);
  
  // Add global click listener to hide context menu
  document.addEventListener('click', () => {
    if (showContextMenu.value) {
      hideContextMenu();
    }
  });
});

onUnmounted(() => {
  // Clean up listeners and watchers
  window.electronAPI.fs.removeDirectoryChangeListener();
  
  // Stop watching all directories
  if (currentWorkspacePath.value) {
    window.electronAPI.fs.unwatchDirectory(currentWorkspacePath.value);
  }
});
</script>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
}

.file-tree-header {
  padding: 8px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.workspace-button {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #37373d;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
}

.workspace-button.icon-only {
  flex: 0;
  padding: 8px;
  min-width: 36px;
  height: 36px;
  justify-content: center;
}

.workspace-button:hover {
  background: #464647;
  border-color: #858585;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: #37373d;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 36px;
}

.action-button:hover {
  background: #464647;
  border-color: #858585;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-info {
  padding: 8px 12px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
}

.workspace-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #858585;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 32px 0; /* Added more bottom padding for last file visibility */
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: #858585;
  font-size: 13px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-workspace,
.empty-folder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #858585;
  text-align: center;
}

.empty-workspace p,
.empty-folder p {
  margin: 12px 0 4px 0;
  font-size: 14px;
}

.empty-workspace small {
  font-size: 12px;
  color: #6c6c6c;
}

/* Context Menu */
.context-menu {
  position: fixed;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 160px;
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.15s ease;
}

.menu-item:hover {
  background: #37373d;
}

.menu-item.delete {
  color: #f48771;
}

.menu-item.delete:hover {
  background: rgba(244, 135, 113, 0.1);
}

/* Modal Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  min-width: 320px;
  max-width: 500px;
}

.modal-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 16px 20px;
}

.modal-body p {
  margin: 0 0 12px;
  color: #cccccc;
  font-size: 14px;
  line-height: 1.4;
}

.modal-body p.warning {
  color: #f48771;
  font-size: 13px;
}

.modal-body input {
  width: 100%;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #ffffff;
  font-size: 14px;
}

.modal-body input:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
}

.modal-actions {
  padding: 12px 20px 16px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.modal-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cancel-btn {
  background: #3e3e42;
  color: #cccccc;
}

.cancel-btn:hover {
  background: #4a4a4f;
}

.confirm-btn {
  background: #007acc;
  color: #ffffff;
}

.confirm-btn:hover {
  background: #006bb3;
}

.delete-btn {
  background: #f48771;
  color: #ffffff;
}

.delete-btn:hover {
  background: #e57052;
}
</style>