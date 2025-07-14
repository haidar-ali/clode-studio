<template>
  <div class="file-tree">
    <div class="file-tree-header">
      <button @click="selectWorkspace" class="workspace-button">
        <Icon name="mdi:folder-open" />
        Select Workspace
      </button>
      <div class="header-actions">
        <button @click="createNewFileInRoot" class="action-button" title="New File" :disabled="!workspacePath">
          <Icon name="mdi:file-plus" />
        </button>
        <button @click="createNewFolderInRoot" class="action-button" title="New Folder" :disabled="!workspacePath">
          <Icon name="mdi:folder-plus" />
        </button>
        <button @click="openGlobalSearch" class="action-button" title="Search in Files (Cmd+Shift+F)" :disabled="!workspacePath">
          <Icon name="mdi:magnify" />
        </button>
      </div>
    </div>
    
    <div v-if="workspacePath" class="workspace-info">
      <div class="workspace-path">
        <Icon name="mdi:folder" />
        {{ workspaceName }}
      </div>
    </div>
    
    <div class="tree-content">
      <div v-if="isLoading" class="loading">
        <Icon name="mdi:loading" class="spin" />
        Loading...
      </div>
      
      <div v-else-if="!workspacePath" class="empty-workspace">
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useTasksStore } from '~/stores/tasks';
import type { FileNode } from '~/shared/types';

const editorStore = useEditorStore();
const chatStore = useChatStore();
const tasksStore = useTasksStore();

const workspacePath = ref<string>('');
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

const workspaceName = computed(() => {
  if (!workspacePath.value) return '';
  return workspacePath.value.split('/').pop() || 'Workspace';
});

const selectWorkspace = async () => {
  try {
    const result = await window.electronAPI.dialog.selectFolder();
    
    if (!result.success || result.canceled) {
      return;
    }
    
    const path = result.path;
    if (!path) return;
    
    // Stop watching the old workspace
    if (workspacePath.value) {
      await window.electronAPI.fs.unwatchDirectory(workspacePath.value);
    }
    
    isLoading.value = true;
    
    // 1. Close all editor tabs and reset terminals to avoid confusion
    editorStore.closeAllTabs();
    
    // 2. Stop and clear Claude terminal for clean slate
    await chatStore.stopClaude();
    chatStore.clearMessages();
    
    // 3. Update workspace path and load directory structure
    workspacePath.value = path;
    await loadDirectory(path);
    await saveWorkspace();
    
    // 4. Start watching the new workspace
    await window.electronAPI.fs.watchDirectory(path);
    
    // 5. Update chat store with new workspace path
    await chatStore.updateWorkingDirectory(path);
    
    // 6. Set project path FIRST, then load existing tasks (don't clear until after loading)
    tasksStore.setProjectPath(path);
    
    // 7. Try to load existing TASKS.md from the new workspace
    const tasksPath = `${path}/TASKS.md`;
    const tasksResult = await window.electronAPI.fs.readFile(tasksPath);
    
    if (tasksResult.success) {
      // TASKS.md exists - load it WITHOUT clearing first
      console.log('Loading existing TASKS.md from new workspace');
      await tasksStore.loadTasksFromProject();
    } else {
      // No TASKS.md exists - NOW we can safely clear and create new
      console.log('No TASKS.md found, creating new one for workspace');
      tasksStore.clearAll();
      await tasksStore.updateTasksMarkdown();
    }
  } catch (error) {
    alert(`Failed to load workspace: ${error instanceof Error ? error.message : String(error)}`);
    workspacePath.value = '';
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
  
  if (dirPath === workspacePath.value) {
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
  
  console.log('Context menu triggered for:', node.name, node.path);
  
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
  if (!workspacePath.value) return;
  
  // Create a virtual root node for the workspace
  contextNode.value = {
    name: '',
    path: workspacePath.value,
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
  if (!workspacePath.value) return;
  
  // Create a virtual root node for the workspace
  contextNode.value = {
    name: '',
    path: workspacePath.value,
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
  console.log('createNewFile called, contextNode:', contextNode.value);
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
  console.log('renameItem called, contextNode:', contextNode.value);
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
  console.log('deleteItem called, contextNode:', contextNode.value);
  hideContextMenu();
  showDeleteModal.value = true;
};

const confirmRename = async () => {
  console.log('confirmRename called');
  console.log('modalMode:', modalMode.value);
  console.log('contextNode:', contextNode.value);
  console.log('newName:', newName.value);
  
  if (!newName.value.trim() || !contextNode.value) {
    console.log('Early return: missing newName or contextNode');
    return;
  }
  
  try {
    if (modalMode.value === 'newFile') {
      // Create new file
      const newPath = `${contextNode.value.path}/${newName.value}`;
      console.log('Creating file at:', newPath);
      const result = await window.electronAPI.fs.writeFile(newPath, '');
      console.log('Create file result:', result);
      if (!result.success) {
        throw new Error(result.error);
      }
    } else if (modalMode.value === 'newFolder') {
      // Create new folder
      const newPath = `${contextNode.value.path}/${newName.value}`;
      console.log('Creating folder at:', newPath);
      const result = await window.electronAPI.fs.ensureDir(newPath);
      console.log('Create folder result:', result);
      if (!result.success) {
        throw new Error(result.error);
      }
    } else if (modalMode.value === 'rename') {
      // Rename existing file/folder
      const oldPath = contextNode.value.path;
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${parentDir}/${newName.value}`;
      console.log('Renaming from:', oldPath, 'to:', newPath);
      const result = await window.electronAPI.fs.rename(oldPath, newPath);
      console.log('Rename result:', result);
      if (!result.success) {
        throw new Error(result.error);
      }
    }
    
    // Refresh the directory
    console.log('Refreshing directory:', workspacePath.value);
    await loadDirectory(workspacePath.value);
    
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
    await loadDirectory(workspacePath.value);
    
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

const saveWorkspace = async () => {
  if (workspacePath.value) {
    await window.electronAPI.store.set('workspacePath', workspacePath.value);
  }
};

const loadSavedWorkspace = async () => {
  const savedPath = await window.electronAPI.store.get('workspacePath');
  if (savedPath && typeof savedPath === 'string') {
    try {
      workspacePath.value = savedPath;
      await loadDirectory(savedPath);
      // Start watching the saved workspace
      await window.electronAPI.fs.watchDirectory(savedPath);
      
      // Load tasks for the saved workspace
      tasksStore.setProjectPath(savedPath);
      await tasksStore.loadTasksFromProject();
    } catch (error) {
      console.error('Failed to load saved workspace:', error);
    }
  }
};

// Handle directory changes
const handleDirectoryChange = async (data: { path: string; eventType: string; filename: string }) => {
  console.log('Directory change detected:', data);
  
  // If it's the root workspace
  if (data.path === workspacePath.value) {
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
  if (workspacePath.value) {
    window.electronAPI.fs.unwatchDirectory(workspacePath.value);
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