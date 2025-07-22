<template>
  <div class="resource-selector">
    <!-- Resource type tabs -->
    <div class="resource-tabs">
      <button 
        v-for="tab in resourceTabs" 
        :key="tab.type"
        :class="['tab', { active: activeTab === tab.type }]"
        @click="activeTab = tab.type"
      >
        <Icon :name="tab.icon" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Resource content -->
    <div class="resource-content">
      <!-- Project Files -->
      <div v-if="activeTab === 'file'" class="file-list">
        <div class="search-box">
          <Icon name="heroicons:magnifying-glass" />
          <input 
            v-model="fileSearch" 
            type="text" 
            placeholder="Search files..."
          >
        </div>
        <div v-if="isLoadingFiles" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <span>Loading project files...</span>
        </div>
        <div v-else-if="allFiles.length === 0" class="empty-state">
          <Icon name="heroicons:folder-open" />
          <span>No files found</span>
          <span class="hint">Make sure you have a project open</span>
        </div>
        <div v-else class="file-tree">
          <div 
            v-for="file in filteredFiles" 
            :key="file.path"
            class="resource-item"
            @click="selectFile(file)"
          >
            <Icon :name="getFileIcon(file.name)" />
            <span>{{ file.name }}</span>
            <span class="file-path">{{ file.relativePath }}</span>
          </div>
        </div>
      </div>

      <!-- Knowledge Base -->
      <div v-else-if="activeTab === 'knowledge'" class="knowledge-list">
        <div class="search-box">
          <Icon name="heroicons:magnifying-glass" />
          <input 
            v-model="knowledgeSearch" 
            type="text" 
            placeholder="Search knowledge..."
          >
        </div>
        <div v-if="knowledgeStore.isLoading" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <span>Loading knowledge entries...</span>
        </div>
        <div v-else-if="filteredKnowledge.length === 0" class="empty-state">
          <Icon name="heroicons:book-open" />
          <span>No knowledge entries found</span>
          <span class="hint">Create knowledge entries in the Knowledge panel</span>
        </div>
        <div 
          v-else
          v-for="entry in filteredKnowledge" 
          :key="entry.id"
          class="resource-item"
          @click="selectKnowledge(entry)"
        >
          <Icon :name="getCategoryIcon(entry.metadata.category)" />
          <div class="knowledge-info">
            <span class="knowledge-title">{{ entry.title }}</span>
            <span class="knowledge-meta">{{ entry.metadata.category }} • {{ entry.metadata.tags.join(', ') }}</span>
          </div>
        </div>
      </div>

      <!-- Hooks -->
      <div v-else-if="activeTab === 'hook'" class="hook-list">
        <div v-if="hooksStore.isLoading" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <span>Loading hooks...</span>
        </div>
        <div v-else-if="availableHooks.length === 0" class="empty-state">
          <Icon name="heroicons:bolt" />
          <span>No hooks available</span>
          <span class="hint">Configure hooks in Claude settings</span>
        </div>
        <div 
          v-else
          v-for="hook in availableHooks" 
          :key="hook.id"
          class="resource-item"
          @click="selectHook(hook)"
        >
          <Icon name="heroicons:bolt" />
          <div class="hook-info">
            <span class="hook-name">{{ hook.name }}</span>
            <span class="hook-event">{{ hook.event }}</span>
          </div>
        </div>
      </div>

      <!-- MCP Tools -->
      <div v-else-if="activeTab === 'mcp'" class="mcp-list">
        <div v-if="mcpStore.isLoading" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <span>Loading MCP servers...</span>
        </div>
        <div v-else-if="connectedServers.length === 0" class="empty-state">
          <Icon name="heroicons:server" />
          <span>No connected MCP servers</span>
          <span class="hint">Configure MCP servers in the MCP panel</span>
        </div>
        <div v-else class="mcp-server-list">
          <div 
            v-for="server in connectedServers" 
            :key="server.name"
            class="resource-item"
            @click="selectMCPServer(server)"
          >
            <Icon name="heroicons:server" />
            <div class="server-info">
              <span class="server-name">{{ server.name }}</span>
              <span class="server-status">Connected</span>
            </div>
          </div>
          <div class="mcp-note">
            <Icon name="heroicons:information-circle" />
            <span>MCP tools are managed by Claude CLI</span>
          </div>
        </div>
      </div>

      <!-- Commands -->
      <div v-else-if="activeTab === 'command'" class="command-list">
        <div v-if="commandsStore.isLoading" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <span>Loading commands...</span>
        </div>
        <div v-else-if="availableCommands.length === 0" class="empty-state">
          <Icon name="heroicons:command-line" />
          <span>No commands available</span>
          <span class="hint">Commands will appear once loaded</span>
        </div>
        <div 
          v-else
          v-for="command in availableCommands" 
          :key="command.name"
          class="resource-item"
          @click="selectCommand(command)"
        >
          <Icon name="heroicons:command-line" />
          <div class="command-info">
            <span class="command-name">/{{ command.name }}</span>
            <span class="command-desc">{{ command.description }}</span>
          </div>
        </div>
      </div>

      <!-- Tasks -->
      <div v-else-if="activeTab === 'task'" class="task-list">
        <div class="search-box">
          <Icon name="heroicons:magnifying-glass" />
          <input 
            v-model="taskSearch" 
            type="text" 
            placeholder="Search tasks..."
          >
        </div>
        <div v-if="tasksStore.isInitialized === false" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <span>Loading tasks...</span>
        </div>
        <div v-else-if="filteredTasks.length === 0" class="empty-state">
          <Icon name="heroicons:check-circle" />
          <span>No tasks found</span>
          <span class="hint">Create tasks in the Kanban board</span>
        </div>
        <div v-else class="task-sections">
          <div v-for="section in taskSections" :key="section.status" class="task-section">
            <div v-if="section.tasks.length > 0" class="section-header">
              <span class="section-title">{{ section.title }}</span>
              <span class="section-count">({{ section.tasks.length }})</span>
            </div>
            <div 
              v-for="task in section.tasks" 
              :key="task.id"
              class="resource-item task-item"
              @click="selectTask(task)"
            >
              <Icon :name="getTaskIcon(task)" />
              <div class="task-info">
                <span class="task-title">{{ task.content }}</span>
                <div class="task-meta">
                  <span v-if="task.identifier" class="task-id">{{ task.identifier }}</span>
                  <span class="task-priority" :class="`priority-${task.priority}`">{{ task.priority }}</span>
                  <span class="task-type">{{ task.type || 'feature' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useMCPStore } from '~/stores/mcp';
import { useClaudeCommandsStore } from '~/stores/claude-commands';
import { useHooksStore } from '~/stores/hooks';
import { useProjectContextStore } from '~/stores/project-context';
import { useTasksStore } from '~/stores/tasks';
import type { ResourceReference } from '~/stores/prompt-engineering';

const emit = defineEmits<{
  add: [resource: ResourceReference];
}>();

const editorStore = useEditorStore();
const knowledgeStore = useKnowledgeStore();
const mcpStore = useMCPStore();
const commandsStore = useClaudeCommandsStore();
const hooksStore = useHooksStore();
const contextStore = useProjectContextStore();
const tasksStore = useTasksStore();

const activeTab = ref<'file' | 'knowledge' | 'hook' | 'mcp' | 'command' | 'task'>('file');
const fileSearch = ref('');
const knowledgeSearch = ref('');
const taskSearch = ref('');

const allFiles = ref<Array<{name: string; path: string; relativePath: string}>>([]);
const isLoadingFiles = ref(false);

// Load all files from workspace
const loadWorkspaceFiles = async (workspacePath: string) => {
  const files: Array<{name: string; path: string; relativePath: string}> = [];
  
  const walkDirectory = async (dir: string, baseDir: string, depth: number = 0) => {
    // Limit depth to prevent excessive recursion
    if (depth > 5) return;
    
    try {
      if (depth === 0) {
        console.log('ResourceSelector: Starting directory walk at:', dir);
      }
      
      const result = await window.electronAPI.fs.readDir(dir);
      
      if (!result || !result.success || !result.files) {
        console.warn(`Failed to read directory: ${dir}`, result?.error);
        return;
      }
      
      const entries = result.files;
      if (depth === 0) {
        console.log('ResourceSelector: Found', entries.length, 'entries in root directory');
      }
      
      for (const entry of entries) {
        const fullPath = `${dir}/${entry.name}`;
        const relativePath = fullPath.replace(baseDir + '/', '');
        
        // Skip common ignore patterns
        if (entry.name === 'node_modules' || 
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === '.git' ||
            entry.name === '.nuxt' ||
            entry.name === 'coverage' ||
            entry.name === '.output') {
          continue;
        }
        
        if (entry.isDirectory) {
          await walkDirectory(fullPath, baseDir, depth + 1);
        } else if (!entry.isDirectory) {
          // Only include common code files
          const ext = entry.name.split('.').pop()?.toLowerCase();
          if (ext && ['ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'json', 'md', 'yaml', 'yml'].includes(ext)) {
            files.push({
              name: entry.name,
              path: fullPath,
              relativePath
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to read directory ${dir}:`, error);
    }
  };
  
  await walkDirectory(workspacePath, workspacePath);
  return files;
};

const resourceTabs = [
  { type: 'file', label: 'Files', icon: 'heroicons:document' },
  { type: 'knowledge', label: 'Knowledge', icon: 'heroicons:book-open' },
  { type: 'task', label: 'Tasks', icon: 'heroicons:check-circle' },
  { type: 'hook', label: 'Hooks', icon: 'heroicons:bolt' },
  { type: 'mcp', label: 'MCP Tools', icon: 'heroicons:server' },
  { type: 'command', label: 'Commands', icon: 'heroicons:command-line' }
];

// Get files from the loaded workspace
const filteredFiles = computed(() => {
  if (!fileSearch.value) return allFiles.value.slice(0, 50); // Show more files
  
  const query = fileSearch.value.toLowerCase();
  return allFiles.value.filter(file => 
    file.name.toLowerCase().includes(query) ||
    file.relativePath.toLowerCase().includes(query)
  ).slice(0, 50);
});

const filteredKnowledge = computed(() => {
  if (!knowledgeSearch.value) return knowledgeStore.entries || [];
  
  const search = knowledgeSearch.value.toLowerCase();
  return (knowledgeStore.entries || []).filter(entry => 
    entry.title.toLowerCase().includes(search) ||
    entry.content.toLowerCase().includes(search) ||
    entry.metadata.tags.some(tag => tag.toLowerCase().includes(search))
  );
});

const availableHooks = computed(() => {
  const hooks = hooksStore.hooks || [];
  if (!Array.isArray(hooks)) return [];
  
  return hooks.map(hook => ({
    id: hook.id,
    name: hook.description || hook.command.slice(0, 30) + '...',
    event: hook.event,
    matcher: hook.matcher,
    command: hook.command,
    disabled: hook.disabled
  })).filter(hook => !hook.disabled);
});

const connectedServers = computed(() => {
  const servers = mcpStore.servers || [];
  if (!Array.isArray(servers)) return [];
  
  // In Claude Code IDE, MCP servers are managed by the CLI
  // We don't have direct access to tools, so we'll show servers only
  return servers
    .filter(server => server.status === 'connected')
    .map(server => ({
      name: server.name,
      tools: [] // Tools are not exposed via Claude CLI
    }));
});

const availableCommands = computed(() => {
  return commandsStore.allCommands || [];
});

const filteredTasks = computed(() => {
  if (!taskSearch.value) return tasksStore.tasks || [];
  
  const search = taskSearch.value.toLowerCase();
  return (tasksStore.tasks || []).filter(task => 
    task.content.toLowerCase().includes(search) ||
    task.identifier?.toLowerCase().includes(search) ||
    task.description?.toLowerCase().includes(search) ||
    task.type?.toLowerCase().includes(search)
  );
});

const taskSections = computed(() => {
  return [
    {
      status: 'in_progress',
      title: 'In Progress',
      tasks: filteredTasks.value.filter(t => t.status === 'in_progress')
    },
    {
      status: 'pending',
      title: 'To Do',
      tasks: filteredTasks.value.filter(t => t.status === 'pending')
    },
    {
      status: 'backlog',
      title: 'Backlog',
      tasks: filteredTasks.value.filter(t => t.status === 'backlog')
    },
    {
      status: 'completed',
      title: 'Completed',
      tasks: filteredTasks.value.filter(t => t.status === 'completed').slice(0, 10) // Limit completed tasks
    }
  ];
});

function selectFile(file: any) {
  emit('add', {
    type: 'file',
    id: file.path,
    path: file.path,
    name: file.name
  });
}

function selectKnowledge(entry: any) {
  emit('add', {
    type: 'knowledge',
    id: entry.id,
    name: entry.title,
    metadata: {
      category: entry.category,
      tags: entry.tags
    }
  });
}

function selectHook(hook: any) {
  emit('add', {
    type: 'hook',
    id: hook.id,
    name: hook.name,
    metadata: {
      event: hook.event
    }
  });
}

function selectTool(serverName: string, tool: any) {
  emit('add', {
    type: 'mcp',
    id: `${serverName}:${tool.name}`,
    name: `${tool.name} (${serverName})`,
    metadata: {
      server: serverName,
      tool: tool.name
    }
  });
}

function selectCommand(command: any) {
  emit('add', {
    type: 'command',
    id: command.name,
    name: `/${command.name}`,
    metadata: {
      description: command.description
    }
  });
}

function selectMCPServer(server: any) {
  emit('add', {
    type: 'mcp',
    id: server.name,
    name: server.name,
    metadata: {
      server: server.name
    }
  });
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const icons: Record<string, string> = {
    ts: 'vscode-icons:file-type-typescript',
    js: 'vscode-icons:file-type-js',
    vue: 'vscode-icons:file-type-vue',
    json: 'vscode-icons:file-type-json',
    md: 'vscode-icons:file-type-markdown'
  };
  return icons[ext || ''] || 'heroicons:document';
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    architecture: 'heroicons:cube',
    feature: 'heroicons:sparkles',
    api: 'heroicons:cloud',
    troubleshooting: 'heroicons:wrench',
    reference: 'heroicons:book-open'
  };
  return icons[category] || 'heroicons:document';
}

function selectTask(task: any) {
  emit('add', {
    type: 'task',
    id: task.id,
    name: task.identifier ? `[${task.identifier}] ${task.content}` : task.content,
    metadata: {
      status: task.status,
      priority: task.priority,
      type: task.type,
      identifier: task.identifier
    }
  });
}

function getTaskIcon(task: any): string {
  if (task.status === 'completed') return 'heroicons:check-circle';
  if (task.status === 'in_progress') return 'heroicons:clock';
  if (task.priority === 'high') return 'heroicons:exclamation-circle';
  return 'heroicons:circle';
}

// Function to initialize and load data
const initializeData = async () => {
  // Initialize tasks store to get project path
  if (!tasksStore.isInitialized) {
    await tasksStore.initialize();
  }
  
  // Get workspace path from various sources
  let workspace = tasksStore.projectPath || contextStore.currentWorkspace || '';
  
  // If no workspace found, try to get it from storage
  if (!workspace) {
    console.log('ResourceSelector: No workspace in stores, checking storage...');
    try {
      workspace = await window.electronAPI.store.get('workspacePath') || '';
      if (workspace) {
        console.log('ResourceSelector: Found workspace in storage:', workspace);
        // Initialize the tasks store with this path
        await tasksStore.initialize(workspace);
      }
    } catch (err) {
      console.error('Failed to get workspace from storage:', err);
    }
  }
  
  console.log('ResourceSelector: Loading files from workspace:', workspace);
  console.log('ResourceSelector: tasksStore.projectPath:', tasksStore.projectPath);
  console.log('ResourceSelector: contextStore.currentWorkspace:', contextStore.currentWorkspace);
  console.log('ResourceSelector: contextStore.isInitialized:', contextStore.isInitialized);
  
  // Check if the workspace exists
  if (workspace) {
    const exists = await window.electronAPI.fs.exists(workspace);
    console.log('ResourceSelector: Workspace exists:', exists);
    
    if (exists) {
      // Load all workspace files
      isLoadingFiles.value = true;
      try {
        const files = await loadWorkspaceFiles(workspace);
        console.log('ResourceSelector: Loaded', files.length, 'files');
        console.log('ResourceSelector: Sample files:', files.slice(0, 5).map(f => f.relativePath));
        allFiles.value = files;
      } catch (error) {
        console.error('Failed to load workspace files:', error);
      } finally {
        isLoadingFiles.value = false;
      }
    }
  } else {
    console.warn('ResourceSelector: No workspace path available');
  }
};

// Load data on mount
onMounted(async () => {
  try {
    await initializeData();
    
    // Get the workspace path after initialization
    const workspace = tasksStore.projectPath || contextStore.currentWorkspace || '';
    
    // Load hooks if not already loaded (hooks are global, not project-specific)
    console.log('ResourceSelector: Loading hooks...');
    if (!hooksStore.hooks || hooksStore.hooks.length === 0) {
      await hooksStore.loadHooks();
      console.log('ResourceSelector: Loaded hooks:', hooksStore.hooks.length);
    } else {
      console.log('ResourceSelector: Hooks already loaded:', hooksStore.hooks.length);
    }
    
    // Initialize context search to get files
    if (contextStore.currentWorkspace && !contextStore.isInitialized) {
      await contextStore.initialize(contextStore.currentWorkspace);
    }
    
    // Load knowledge entries if not already loaded
    console.log('ResourceSelector: Loading knowledge entries...');
    if (!knowledgeStore.entries || knowledgeStore.entries.length === 0) {
      if (workspace) {
        await knowledgeStore.initialize(workspace);
        await knowledgeStore.loadEntries();
        console.log('ResourceSelector: Loaded knowledge entries:', knowledgeStore.entries.length);
      } else {
        console.log('ResourceSelector: No workspace for knowledge entries');
      }
    } else {
      console.log('ResourceSelector: Knowledge entries already loaded:', knowledgeStore.entries.length);
    }
    
    // Load MCP servers if needed (MCP is global, not project-specific)
    console.log('ResourceSelector: Loading MCP servers...');
    if (!mcpStore.servers || mcpStore.servers.length === 0) {
      await mcpStore.loadServers();
      console.log('ResourceSelector: Loaded MCP servers:', mcpStore.servers.length);
    } else {
      console.log('ResourceSelector: MCP servers already loaded:', mcpStore.servers.length);
    }
    
    // Load commands if not already loaded
    console.log('ResourceSelector: Loading commands...');
    if (!commandsStore.allCommands || commandsStore.allCommands.length === 0) {
      if (workspace) {
        await commandsStore.initialize(workspace);
        console.log('ResourceSelector: Loaded commands:', commandsStore.allCommands?.length || 0);
      } else {
        console.log('ResourceSelector: No workspace for commands');
      }
    } else {
      console.log('ResourceSelector: Commands already loaded:', commandsStore.allCommands.length);
    }
  } catch (error) {
    console.error('Error loading resource data:', error);
  }
});

// Watch for workspace changes
watch([() => tasksStore.projectPath, () => contextStore.currentWorkspace], async ([newTasksPath, newContextPath]) => {
  const workspace = newTasksPath || newContextPath || '';
  
  if (workspace && workspace !== loadedWorkspacePath.value) {
    console.log('ResourceSelector: Workspace changed, reloading files:', workspace);
    loadedWorkspacePath.value = workspace;
    
    // Reload files
    isLoadingFiles.value = true;
    try {
      const files = await loadWorkspaceFiles(workspace);
      console.log('ResourceSelector: Reloaded', files.length, 'files for new workspace');
      allFiles.value = files;
    } catch (error) {
      console.error('Failed to reload workspace files:', error);
    } finally {
      isLoadingFiles.value = false;
    }
  }
});

// Track loaded workspace to avoid duplicate loads
const loadedWorkspacePath = ref<string>('');

// Also update the loaded workspace path when we successfully load files
watch(() => allFiles.value.length, (newLength) => {
  if (newLength > 0) {
    const workspace = tasksStore.projectPath || contextStore.currentWorkspace || '';
    if (workspace) {
      loadedWorkspacePath.value = workspace;
    }
  }
});
</script>

<style scoped>
.resource-selector {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #252526;
}

.resource-tabs {
  display: flex;
  gap: 4px;
  padding: 8px;
  background-color: #2d2d30;
  border-bottom: 1px solid #2d2d30;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: none;
  color: #858585;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  transition: all 0.2s;
}

.tab:hover {
  background-color: #383838;
  color: #cccccc;
}

.tab.active {
  background-color: #094771;
  color: white;
}

.resource-content {
  flex: 1;
  overflow-y: auto;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #1e1e1e;
  border-bottom: 1px solid #2d2d30;
}

.search-box input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background-color: #3c3c3c;
  color: #cccccc;
  font-size: 13px;
}

.search-box input:focus {
  outline: none;
  border-color: #007acc;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 13px;
  color: #cccccc;
}

.resource-item:hover {
  background-color: #2a2d2e;
}

.file-path {
  font-size: 11px;
  color: #858585;
  margin-left: auto;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-info,
.hook-info,
.command-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.knowledge-title,
.hook-name,
.command-name {
  font-weight: 500;
  color: #cccccc;
}

.knowledge-meta,
.hook-event,
.command-desc {
  font-size: 11px;
  color: #858585;
}

.mcp-server {
  border-bottom: 1px solid var(--color-border);
}

.server-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #2d2d30;
  font-weight: 500;
  font-size: 13px;
  color: #cccccc;
}

.tool-list {
  padding: 4px 0;
}

.tool-item {
  padding-left: 32px;
}

/* MCP Server styles */
.mcp-server-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.server-name {
  font-weight: 500;
}

.server-status {
  font-size: 11px;
  color: #4ec9b0;
}

.mcp-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin: 8px;
  background: #2d2d30;
  border-radius: 4px;
  font-size: 12px;
  color: #858585;
}

.mcp-note svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Loading and empty states */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: #858585;
}

.loading-state svg {
  width: 24px;
  height: 24px;
}

.empty-state svg {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 12px;
  color: #6e6e6e;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* Scrollbar styling */
.resource-content::-webkit-scrollbar {
  width: 8px;
}

.resource-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.resource-content::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

.resource-content::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}

/* Task specific styles */
.task-sections {
  padding: 8px 0;
}

.task-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #858585;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-count {
  color: #6e6e6e;
}

.task-item {
  padding: 10px 12px;
}

.task-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-title {
  font-weight: 500;
  color: #cccccc;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.task-id {
  color: #858585;
  font-family: 'Consolas', 'Monaco', monospace;
}

.task-priority {
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
  text-transform: uppercase;
}

.task-priority.priority-high {
  background: #f14c4c33;
  color: #f14c4c;
}

.task-priority.priority-medium {
  background: #d4af3733;
  color: #d4af37;
}

.task-priority.priority-low {
  background: #4ec9b033;
  color: #4ec9b0;
}

.task-type {
  color: #858585;
}
</style>