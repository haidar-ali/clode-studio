<template>
  <div v-if="isOpen" class="file-selector-overlay" @click.self="close">
    <div class="file-selector-modal">
      <div class="modal-header">
        <h3>Select Related Files</h3>
        <button @click="close" class="close-button">
          <Icon name="mdi:close" size="20" />
        </button>
      </div>
      
      <div class="search-section">
        <Icon name="mdi:magnify" size="18" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search files and knowledge entries..."
          class="search-input"
          @input="filterFiles"
        />
      </div>
      
      <div class="tabs">
        <button 
          @click="activeTab = 'files'"
          :class="{ active: activeTab === 'files' }"
          class="tab-button"
        >
          Project Files
        </button>
        <button 
          @click="activeTab = 'knowledge'"
          :class="{ active: activeTab === 'knowledge' }"
          class="tab-button"
        >
          Knowledge Base
        </button>
      </div>
      
      <div class="file-list" v-if="activeTab === 'files'">
        <div
          v-for="file in filteredFiles"
          :key="file.path"
          @click="toggleFile(file.path)"
          class="file-item"
          :class="{ selected: selectedFiles.includes(file.path) }"
        >
          <Icon name="mdi:checkbox-marked" v-if="selectedFiles.includes(file.path)" size="18" />
          <Icon name="mdi:checkbox-blank-outline" v-else size="18" />
          <Icon :name="getFileIcon(file.name)" size="16" />
          <span class="file-name">{{ file.name }}</span>
          <span class="file-path">{{ file.relativePath }}</span>
        </div>
      </div>
      
      <div class="file-list" v-else>
        <div
          v-for="entry in filteredKnowledgeEntries"
          :key="entry.path"
          @click="toggleFile(entry.path)"
          class="file-item"
          :class="{ selected: selectedFiles.includes(entry.path) }"
        >
          <Icon name="mdi:checkbox-marked" v-if="selectedFiles.includes(entry.path)" size="18" />
          <Icon name="mdi:checkbox-blank-outline" v-else size="18" />
          <Icon name="mdi:note-text" size="16" :style="{ color: getCategoryColor(entry.category) }" />
          <span class="file-name">{{ entry.name }}</span>
          <span class="file-path">{{ entry.category }}</span>
        </div>
      </div>
      
      <div class="modal-footer">
        <button @click="close" class="secondary-button">Cancel</button>
        <button @click="confirm" class="primary-button" :disabled="selectedFiles.length === 0">
          Add {{ selectedFiles.length }} file{{ selectedFiles.length !== 1 ? 's' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useTasksStore } from '~/stores/tasks';

interface FileItem {
  name: string;
  path: string;
  relativePath: string;
}

interface KnowledgeItem {
  name: string;
  path: string;
  category: string;
}

const knowledgeStore = useKnowledgeStore();
const tasksStore = useTasksStore();

const isOpen = ref(false);
const searchQuery = ref('');
const allFiles = ref<FileItem[]>([]);
const allKnowledgeEntries = ref<KnowledgeItem[]>([]);
const selectedFiles = ref<string[]>([]);
const onSelectCallback = ref<((files: string[]) => void) | null>(null);
const activeTab = ref<'files' | 'knowledge'>('files');

const filteredFiles = computed(() => {
  if (!searchQuery.value) return allFiles.value;
  
  const query = searchQuery.value.toLowerCase();
  return allFiles.value.filter(file =>
    file.name.toLowerCase().includes(query) ||
    file.relativePath.toLowerCase().includes(query)
  );
});

const filteredKnowledgeEntries = computed(() => {
  if (!searchQuery.value) return allKnowledgeEntries.value;
  
  const query = searchQuery.value.toLowerCase();
  return allKnowledgeEntries.value.filter(entry =>
    entry.name.toLowerCase().includes(query) ||
    entry.category.toLowerCase().includes(query)
  );
});

const open = async (workspacePath: string, currentSelection: string[] = []) => {
  isOpen.value = true;
  selectedFiles.value = [...currentSelection];
  allFiles.value = []; // Reset files
  allKnowledgeEntries.value = []; // Reset knowledge entries
  
  // Make sure we have the actual project workspace path, not a subfolder
  const actualWorkspacePath = tasksStore.projectPath || workspacePath;
  
  // Load workspace files
  try {
    console.log('Loading files from workspace:', actualWorkspacePath);
    const files = await loadWorkspaceFiles(actualWorkspacePath);
    console.log('Loaded files:', files.length);
    allFiles.value = files;
  } catch (error) {
    console.error('Failed to load workspace files:', error);
  }
  
  // Load knowledge entries
  loadKnowledgeEntries(actualWorkspacePath);
};

const loadWorkspaceFiles = async (workspacePath: string): Promise<FileItem[]> => {
  const files: FileItem[] = [];
  
  const walkDirectory = async (dir: string, baseDir: string, depth: number = 0) => {
    // Limit depth to prevent excessive recursion
    if (depth > 5) return;
    
    try {
      const result = await window.electronAPI.fs.readDir(dir);
      if (!result.success || !result.files) {
        console.error('Failed to read directory:', dir, result.error);
        return;
      }
      
      for (const file of result.files) {
        // Use file.path instead of constructing it
        const relativePath = file.path.replace(baseDir + '/', '');
        
        // Skip certain directories
        if (file.isDirectory) {
          if (!file.name.startsWith('.') && 
              file.name !== 'node_modules' && 
              file.name !== 'dist' && 
              file.name !== '.nuxt' &&
              file.name !== '.output' &&
              !file.path.includes('/.claude/')) {  // Skip .claude directory anywhere in path
            await walkDirectory(file.path, baseDir, depth + 1);
          }
        } else if (!file.name.startsWith('.')) {
          // Skip certain file types
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext && !['lock', 'log', 'cache'].includes(ext)) {
            files.push({
              name: file.name,
              path: file.path,
              relativePath
            });
          }
        }
      }
    } catch (error) {
      console.error('Error reading directory:', dir, error);
    }
  };
  
  await walkDirectory(workspacePath, workspacePath);
  return files;
};

const loadKnowledgeEntries = (workspacePath: string) => {
  // Get knowledge entries from the store
  const entries = knowledgeStore.entries.map(entry => ({
    name: entry.title,
    path: `${workspacePath}/.claude/knowledge/${entry.id}.md`,
    category: entry.metadata.category
  }));
  allKnowledgeEntries.value = entries;
};

const getCategoryColor = (category: string): string => {
  const cat = knowledgeStore.categories.find(c => c.id === category);
  return cat?.color || '#858585';
};

const close = () => {
  isOpen.value = false;
  searchQuery.value = '';
  selectedFiles.value = [];
  onSelectCallback.value = null;
};

const toggleFile = (path: string) => {
  const index = selectedFiles.value.indexOf(path);
  if (index > -1) {
    selectedFiles.value.splice(index, 1);
  } else {
    selectedFiles.value.push(path);
  }
};

const confirm = () => {
  if (onSelectCallback.value) {
    onSelectCallback.value(selectedFiles.value);
  }
  close();
};

const filterFiles = () => {
  // Filtering is handled by computed property
};

const getFileIcon = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    js: 'mdi:language-javascript',
    ts: 'mdi:language-typescript',
    vue: 'mdi:vuejs',
    py: 'mdi:language-python',
    md: 'mdi:language-markdown',
    json: 'mdi:code-json',
    html: 'mdi:language-html5',
    css: 'mdi:language-css3',
    scss: 'mdi:sass',
    yml: 'mdi:file-code',
    yaml: 'mdi:file-code'
  };
  return iconMap[ext || ''] || 'mdi:file';
};

// Event listener
const handleShowFileSelector = (event: CustomEvent) => {
  if (event.detail) {
    onSelectCallback.value = event.detail.onSelect;
    const workspacePath = event.detail.workspacePath;
    const currentSelection = event.detail.currentSelection || [];
    
    if (workspacePath) {
      open(workspacePath, currentSelection);
    }
  }
};

onMounted(() => {
  window.addEventListener('show-file-selector', handleShowFileSelector as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('show-file-selector', handleShowFileSelector as EventListener);
});
</script>

<style scoped>
.file-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.file-selector-modal {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.close-button:hover {
  background: #2d2d30;
}

.search-section {
  position: relative;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
}

.search-icon {
  position: absolute;
  left: 28px;
  top: 50%;
  transform: translateY(-50%);
  color: #858585;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 8px 36px;
  background: #3c3c3c;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: #007acc;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #2d2d30;
  padding: 0 16px;
}

.tab-button {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #858585;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.tab-button:hover {
  color: #cccccc;
}

.tab-button.active {
  color: #cccccc;
  border-bottom-color: #007acc;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
  padding: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.file-item:hover {
  background: #2d2d30;
}

.file-item.selected {
  background: #094771;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
}

.file-path {
  flex: 1;
  font-size: 11px;
  color: #858585;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #2d2d30;
}

.primary-button,
.secondary-button {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.primary-button {
  background: #007acc;
  color: white;
}

.primary-button:hover:not(:disabled) {
  background: #005a9e;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-button {
  background: #3c3c3c;
  color: #cccccc;
}

.secondary-button:hover {
  background: #4a4a4a;
}
</style>