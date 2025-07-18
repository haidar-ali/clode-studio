<template>
  <div class="command-studio">
    <div class="studio-header">
      <h3>Slash Command Studio</h3>
      <div class="header-actions">
        <button @click="createNewCommand" class="primary-button" title="Create new command">
          <Icon name="mdi:plus" size="16" />
          New Command
        </button>
        <button @click="refreshCommands" class="icon-button" title="Refresh">
          <Icon name="mdi:refresh" size="20" />
        </button>
      </div>
    </div>

    <div class="studio-content">
      <!-- Commands List -->
      <div class="commands-sidebar">
        <div class="search-section">
          <Icon name="mdi:magnify" size="18" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search commands..."
            class="search-input"
          />
        </div>

        <div class="command-tabs">
          <button
            @click="activeTab = 'project'"
            :class="{ active: activeTab === 'project' }"
            class="tab-button"
          >
            Project
            <span class="count">{{ projectCommands.length }}</span>
          </button>
          <button
            @click="activeTab = 'personal'"
            :class="{ active: activeTab === 'personal' }"
            class="tab-button"
          >
            Personal
            <span class="count">{{ personalCommands.length }}</span>
          </button>
        </div>

        <div class="commands-list">
          <div v-if="filteredCommands.length === 0" class="empty-state">
            <Icon name="mdi:slash-forward" size="48" />
            <p>{{ searchQuery ? 'No commands found' : 'No commands yet' }}</p>
            <button v-if="!searchQuery && activeTab === 'personal'" @click="createExamples" class="link-button">
              Create example commands
            </button>
          </div>

          <div v-else class="command-groups">
            <div v-for="(commands, category) in groupedCommands" :key="category" class="command-group">
              <div class="group-header">
                <Icon name="mdi:folder" size="16" />
                <span>{{ category || 'Uncategorized' }}</span>
                <span class="count">{{ commands.length }}</span>
              </div>
              <div
                v-for="command in commands"
                :key="command.id"
                @click="selectCommand(command)"
                class="command-item"
                :class="{ active: selectedCommand?.id === command.id }"
              >
                <div class="command-name">
                  <span class="slash">/</span>{{ command.name }}
                </div>
                <div class="command-meta">
                  {{ command.description || 'No description' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Command Editor -->
      <div class="command-editor">
        <div v-if="!selectedCommand" class="no-selection">
          <Icon name="mdi:code-tags" size="64" />
          <h3>Select a command to edit</h3>
          <p>Choose a command from the list or create a new one</p>
        </div>

        <div v-else class="editor-content">
          <div class="editor-header">
            <input
              v-model="editingCommand.name"
              class="command-name-input"
              placeholder="Command name"
              @blur="updateCommandName"
            />
            <div class="editor-actions">
              <button @click="saveCommand" class="save-button" :disabled="!hasChanges">
                <Icon name="mdi:content-save" size="16" />
                Save
              </button>
              <button @click="deleteCommand" class="icon-button danger">
                <Icon name="mdi:delete" size="16" />
              </button>
            </div>
          </div>

          <div class="command-metadata">
            <div class="metadata-item">
              <label>Description</label>
              <input
                v-model="editingCommand.description"
                placeholder="Brief description of what this command does"
                class="metadata-input"
              />
            </div>

            <div class="metadata-item">
              <label>Argument Hint</label>
              <input
                v-model="editingCommand.argumentHint"
                placeholder="e.g., <file> or [options]"
                class="metadata-input"
              />
            </div>

            <div class="metadata-item">
              <label>Allowed Tools</label>
              <div class="tools-selector">
                <label v-for="tool in availableTools" :key="tool" class="tool-checkbox">
                  <input
                    type="checkbox"
                    :checked="editingCommand.allowedTools?.includes(tool)"
                    @change="toggleTool(tool)"
                  />
                  {{ tool }}
                </label>
              </div>
            </div>

            <div class="metadata-item">
              <label>Category</label>
              <input
                v-model="editingCommand.category"
                placeholder="e.g., dev, testing, documentation"
                class="metadata-input"
              />
            </div>
          </div>

          <div class="command-content">
            <label>Command Template</label>
            <div class="template-help">
              <p>Use these placeholders in your template:</p>
              <ul>
                <li><code v-text="'{{ args }}'"></code> - All arguments passed to the command</li>
                <li><code v-text="'{{ arg1 }}'"></code>, <code v-text="'{{ arg2 }}'"></code> - Individual arguments</li>
                <li><code>!command</code> - Execute bash command and include output</li>
                <li><code>@file.txt</code> - Include contents of a file</li>
              </ul>
            </div>
            <textarea
              v-model="editingCommand.content"
              class="content-editor"
              placeholder="Enter the command template..."
              spellcheck="false"
            />
          </div>

          <div class="command-preview">
            <h4>Preview</h4>
            <div class="preview-content">
              <div class="preview-command">
                <span class="slash">/</span>{{ editingCommand.name }}
                <span v-if="editingCommand.argumentHint" class="arg-hint">
                  {{ editingCommand.argumentHint }}
                </span>
              </div>
              <div class="preview-description">
                {{ editingCommand.description || 'No description' }}
              </div>
              <div v-if="editingCommand.allowedTools?.length" class="preview-tools">
                <span class="label">Tools:</span>
                <span v-for="tool in editingCommand.allowedTools" :key="tool" class="tool-badge">
                  {{ tool }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useClaudeCommandsStore } from '~/stores/claude-commands';
import { useTasksStore } from '~/stores/tasks';
import type { ClaudeSlashCommand } from '~/stores/claude-commands';

const commandsStore = useClaudeCommandsStore();
const tasksStore = useTasksStore();

// State
const searchQuery = ref('');
const activeTab = ref<'project' | 'personal'>('project');
const selectedCommand = ref<ClaudeSlashCommand | null>(null);
const editingCommand = ref<Partial<ClaudeSlashCommand>>({});
const hasChanges = ref(false);

// Available tools based on Claude Code documentation
const availableTools = [
  'read_file',
  'write_file',
  'list_files',
  'search_files',
  'run_bash_command',
  'create_directory',
  'delete_file',
  'rename_file',
  'copy_file',
  'move_file'
];

// Computed
const projectCommands = computed(() => commandsStore.projectCommands);
const personalCommands = computed(() => commandsStore.personalCommands);

const filteredCommands = computed(() => {
  const commands = activeTab.value === 'project' ? projectCommands.value : personalCommands.value;
  
  if (!searchQuery.value) return commands;
  
  const query = searchQuery.value.toLowerCase();
  return commands.filter(cmd =>
    cmd.name.toLowerCase().includes(query) ||
    (cmd.description && cmd.description.toLowerCase().includes(query)) ||
    (cmd.category && cmd.category.toLowerCase().includes(query))
  );
});

const groupedCommands = computed(() => {
  const grouped: Record<string, ClaudeSlashCommand[]> = {};
  
  filteredCommands.value.forEach(cmd => {
    const category = cmd.category || '';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(cmd);
  });
  
  return grouped;
});

// Methods
const selectCommand = (command: ClaudeSlashCommand) => {
  selectedCommand.value = command;
  editingCommand.value = {
    ...command,
    allowedTools: [...(command.allowedTools || [])]
  };
  hasChanges.value = false;
};

const createNewCommand = () => {
  const newCommand: Partial<ClaudeSlashCommand> = {
    id: `new-${Date.now()}`,
    name: 'new-command',
    description: '',
    argumentHint: '',
    allowedTools: [],
    content: '',
    source: activeTab.value,
    category: ''
  };
  
  // Don't add to store yet, just select for editing
  selectedCommand.value = newCommand as ClaudeSlashCommand;
  editingCommand.value = { ...newCommand };
  hasChanges.value = true;
};

const updateCommandName = () => {
  if (editingCommand.value.name) {
    editingCommand.value.name = editingCommand.value.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  hasChanges.value = true;
};

const toggleTool = (tool: string) => {
  if (!editingCommand.value.allowedTools) {
    editingCommand.value.allowedTools = [];
  }
  
  const index = editingCommand.value.allowedTools.indexOf(tool);
  if (index > -1) {
    editingCommand.value.allowedTools.splice(index, 1);
  } else {
    editingCommand.value.allowedTools.push(tool);
  }
  hasChanges.value = true;
};

const saveCommand = async () => {
  if (!editingCommand.value.name || !editingCommand.value.content) {
    alert('Command name and content are required');
    return;
  }

  try {
    if (selectedCommand.value?.id?.startsWith('new-')) {
      // Create new command
      await commandsStore.createCommand({
        name: editingCommand.value.name!,
        description: editingCommand.value.description,
        argumentHint: editingCommand.value.argumentHint,
        allowedTools: editingCommand.value.allowedTools,
        content: editingCommand.value.content!,
        source: editingCommand.value.source as 'project' | 'personal',
        category: editingCommand.value.category
      });
    } else {
      // Update existing command
      await commandsStore.updateCommand(selectedCommand.value!.id, {
        description: editingCommand.value.description,
        argumentHint: editingCommand.value.argumentHint,
        allowedTools: editingCommand.value.allowedTools,
        content: editingCommand.value.content
      });
    }
    
    hasChanges.value = false;
    // Reload to get the updated command
    await commandsStore.loadCommands();
    
    // Re-select the command if it was new
    if (selectedCommand.value?.id?.startsWith('new-')) {
      const newCmd = commandsStore.allCommands.find(c => 
        c.name === editingCommand.value.name && 
        c.source === editingCommand.value.source
      );
      if (newCmd) selectCommand(newCmd);
    }
  } catch (error) {
    console.error('Failed to save command:', error);
    alert(`Failed to save command: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const deleteCommand = async () => {
  if (!selectedCommand.value || selectedCommand.value.id.startsWith('new-')) return;
  
  if (!confirm(`Are you sure you want to delete the command "/${selectedCommand.value.name}"?`)) {
    return;
  }

  try {
    await commandsStore.deleteCommand(selectedCommand.value.id);
    selectedCommand.value = null;
    editingCommand.value = {};
    hasChanges.value = false;
  } catch (error) {
    console.error('Failed to delete command:', error);
    alert(`Failed to delete command: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const refreshCommands = async () => {
  await commandsStore.loadCommands();
};

const createExamples = async () => {
  if (confirm('Create example slash commands in your personal commands folder?')) {
    await commandsStore.createExampleCommands();
  }
};

// Watch for changes
watch(editingCommand, () => {
  if (selectedCommand.value && !selectedCommand.value.id.startsWith('new-')) {
    hasChanges.value = true;
  }
}, { deep: true });

// Initialize
onMounted(async () => {
  const projectPath = tasksStore.projectPath;
  if (projectPath) {
    await commandsStore.initialize(projectPath);
  }
});
</script>

<style scoped>
.command-studio {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
}

.studio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
}

.studio-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.primary-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.primary-button:hover {
  background: #005a9e;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
}

.icon-button:hover {
  background: #2d2d30;
}

.icon-button.danger:hover {
  background: #5a1d1d;
  color: #f48771;
}

.studio-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Commands Sidebar */
.commands-sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #2d2d30;
}

.search-section {
  position: relative;
  padding: 12px;
}

.search-icon {
  position: absolute;
  left: 24px;
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

.command-tabs {
  display: flex;
  border-bottom: 1px solid #2d2d30;
}

.tab-button {
  flex: 1;
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #858585;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tab-button:hover {
  color: #cccccc;
}

.tab-button.active {
  color: #cccccc;
  border-bottom-color: #007acc;
}

.count {
  font-size: 11px;
  background: #2d2d30;
  padding: 2px 6px;
  border-radius: 10px;
}

.commands-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  gap: 12px;
  text-align: center;
}

.link-button {
  background: none;
  border: none;
  color: #007acc;
  cursor: pointer;
  text-decoration: underline;
}

.command-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-group {
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  color: #858585;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.group-header .count {
  margin-left: auto;
}

.command-item {
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 2px;
}

.command-item:hover {
  background: #2d2d30;
}

.command-item.active {
  background: #094771;
  border: 1px solid #007acc;
}

.command-name {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
}

.slash {
  color: #007acc;
  margin-right: 2px;
}

.command-meta {
  font-size: 11px;
  color: #858585;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Command Editor */
.command-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  gap: 12px;
}

.no-selection h3 {
  margin: 0;
  font-size: 18px;
  color: #cccccc;
}

.no-selection p {
  margin: 0;
  font-size: 14px;
}

.editor-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.editor-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
  gap: 12px;
}

.command-name-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 20px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
}

.command-name-input:hover {
  background: #2d2d30;
}

.command-name-input:focus {
  outline: none;
  background: #2d2d30;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.save-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.save-button:hover:not(:disabled) {
  background: #005a9e;
}

.save-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.command-metadata {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-bottom: 1px solid #2d2d30;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metadata-item label {
  font-size: 12px;
  color: #858585;
  font-weight: 500;
  text-transform: uppercase;
}

.metadata-input {
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 13px;
}

.metadata-input:focus {
  outline: none;
  border-color: #007acc;
}

.tools-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tool-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.tool-checkbox input {
  cursor: pointer;
}

.command-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.command-content label {
  font-size: 12px;
  color: #858585;
  font-weight: 500;
  text-transform: uppercase;
}

.template-help {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
}

.template-help p {
  margin: 0 0 8px;
}

.template-help ul {
  margin: 0;
  padding-left: 20px;
}

.template-help li {
  margin-bottom: 4px;
}

.template-help code {
  background: #1e1e1e;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
}

.content-editor {
  flex: 1;
  min-height: 200px;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
}

.content-editor:focus {
  outline: none;
  border-color: #007acc;
}

.command-preview {
  padding: 16px;
  background: #252526;
  border-top: 1px solid #2d2d30;
}

.command-preview h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
}

.preview-content {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  font-size: 13px;
}

.preview-command {
  font-weight: 500;
  margin-bottom: 4px;
}

.arg-hint {
  color: #858585;
  font-weight: normal;
  margin-left: 8px;
}

.preview-description {
  color: #858585;
  margin-bottom: 8px;
}

.preview-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-tools .label {
  color: #858585;
  font-size: 12px;
}

.tool-badge {
  background: #094771;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
}
</style>