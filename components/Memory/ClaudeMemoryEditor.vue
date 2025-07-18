<template>
  <div class="memory-editor">
    <div class="memory-header">
      <h2>CLAUDE.md Editor</h2>
      <div class="header-actions">
        <button @click="refreshMemory" class="icon-button" title="Refresh">
          <Icon name="mdi:refresh" size="16" />
        </button>
        <button @click="saveAll" class="icon-button primary" :disabled="!hasChanges" title="Save All">
          <Icon name="mdi:content-save-all" size="16" />
          Save All
        </button>
      </div>
    </div>

    <div class="memory-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <Icon :name="tab.icon" size="14" />
        {{ tab.name }}
        <span v-if="tab.hasChanges" class="unsaved-indicator">•</span>
      </button>
    </div>

    <div class="memory-content">
      <!-- Project Memory Tab -->
      <div v-if="activeTab === 'project'" class="tab-content">
        <div class="memory-path">{{ projectMemoryPath }}</div>
        <ClientOnly>
          <CodeMirrorSimple
            v-model="projectMemory"
            language="markdown"
            @change="markProjectChanged"
          />
          <template #fallback>
            <textarea
              v-model="projectMemory"
              class="fallback-editor"
              @input="markProjectChanged"
              placeholder="# Project Instructions&#10;&#10;Add project-specific instructions for Claude here..."
            />
          </template>
        </ClientOnly>
      </div>

      <!-- User Memory Tab -->
      <div v-if="activeTab === 'user'" class="tab-content">
        <div class="memory-path">{{ userMemoryPath }}</div>
        <ClientOnly>
          <CodeMirrorSimple
            v-model="userMemory"
            language="markdown"
            @change="markUserChanged"
          />
          <template #fallback>
            <textarea
              v-model="userMemory"
              class="fallback-editor"
              @input="markUserChanged"
              placeholder="# User Preferences&#10;&#10;Add your personal preferences and instructions here..."
            />
          </template>
        </ClientOnly>
      </div>

      <!-- Imports Tab -->
      <div v-if="activeTab === 'imports'" class="tab-content">
        <div class="imports-info">
          <p>CLAUDE.md files support importing other memory files using:</p>
          <code>@path/to/file.md</code>
        </div>
        
        <div class="import-tree">
          <h3>Import Hierarchy</h3>
          <div v-if="importTree.length === 0" class="no-imports">
            No imports detected in current memory files.
          </div>
          <div v-else class="tree">
            <ImportNode
              v-for="node in importTree"
              :key="node.path"
              :node="node"
              @open="openImportedFile"
            />
          </div>
        </div>

        <div class="import-actions">
          <button @click="addImport" class="action-button">
            <Icon name="mdi:plus" size="16" />
            Add Import
          </button>
          <button @click="validateImports" class="action-button">
            <Icon name="mdi:check-all" size="16" />
            Validate Imports
          </button>
        </div>
      </div>

      <!-- Templates Tab -->
      <div v-if="activeTab === 'templates'" class="tab-content">
        <div class="templates-grid">
          <div
            v-for="template in memoryTemplates"
            :key="template.id"
            class="template-card"
            @click="applyTemplate(template)"
          >
            <Icon :name="template.icon" size="24" />
            <h4>{{ template.name }}</h4>
            <p>{{ template.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Add Section -->
    <div class="quick-add">
      <h3>Quick Add Memory</h3>
      <div class="quick-add-input">
        <input
          v-model="quickAddText"
          type="text"
          placeholder="Add a quick memory instruction..."
          @keydown.enter="quickAddMemory"
        />
        <button @click="quickAddMemory" :disabled="!quickAddText.trim()">
          <Icon name="mdi:plus" size="16" />
        </button>
      </div>
      <div class="quick-suggestions">
        <button
          v-for="suggestion in quickSuggestions"
          :key="suggestion"
          class="suggestion-chip"
          @click="quickAddText = suggestion"
        >
          {{ suggestion }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import CodeMirrorSimple from '~/components/Editor/CodeMirrorSimple.vue';

const tasksStore = useTasksStore();

interface MemoryTab {
  id: string;
  name: string;
  icon: string;
  hasChanges: boolean;
}

interface ImportNode {
  path: string;
  exists: boolean;
  children: ImportNode[];
}

interface MemoryTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
}

const activeTab = ref<string>('project');
const projectMemory = ref('');
const userMemory = ref('');
const projectMemoryChanged = ref(false);
const userMemoryChanged = ref(false);
const importTree = ref<ImportNode[]>([]);
const quickAddText = ref('');
const userHomePath = ref<string>('');

// Computed paths
const projectMemoryPath = computed(() => {
  return tasksStore.projectPath ? `${tasksStore.projectPath}/CLAUDE.md` : './CLAUDE.md';
});

const userMemoryPath = computed(() => {
  return userHomePath.value ? `${userHomePath.value}/.claude/CLAUDE.md` : '';
});

// Tabs configuration
const tabs = computed((): MemoryTab[] => [
  {
    id: 'project',
    name: 'Project Memory',
    icon: 'mdi:folder-outline',
    hasChanges: projectMemoryChanged.value
  },
  {
    id: 'user',
    name: 'User Memory',
    icon: 'mdi:account-outline',
    hasChanges: userMemoryChanged.value
  },
  {
    id: 'imports',
    name: 'Imports',
    icon: 'mdi:import',
    hasChanges: false
  },
  {
    id: 'templates',
    name: 'Templates',
    icon: 'mdi:file-document-multiple-outline',
    hasChanges: false
  }
]);

const hasChanges = computed(() => projectMemoryChanged.value || userMemoryChanged.value);

// Memory templates
const memoryTemplates: MemoryTemplate[] = [
  {
    id: 'architecture',
    name: 'Architecture Guide',
    description: 'Document your project architecture and design decisions',
    icon: 'mdi:city',
    content: `# Architecture

## Overview
[Describe your project's high-level architecture]

## Design Principles
- Principle 1: [Description]
- Principle 2: [Description]

## Key Components
- Component A: [Purpose and responsibility]
- Component B: [Purpose and responsibility]

## Data Flow
[Describe how data flows through your system]

## Technology Stack
- Frontend: [Technologies]
- Backend: [Technologies]
- Database: [Technologies]
`
  },
  {
    id: 'conventions',
    name: 'Coding Conventions',
    description: 'Define coding standards and conventions',
    icon: 'mdi:format-list-checks',
    content: `# Coding Conventions

## Naming Conventions
- Variables: camelCase
- Functions: camelCase
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case

## Code Style
- Indentation: 2 spaces
- Line length: 100 characters max
- Always use semicolons
- Prefer const over let

## Git Workflow
- Branch naming: feature/*, bugfix/*, hotfix/*
- Commit messages: Use conventional commits
- PR reviews required before merge

## Testing Requirements
- Unit tests for all business logic
- Integration tests for API endpoints
- Minimum 80% code coverage
`
  },
  {
    id: 'patterns',
    name: 'Design Patterns',
    description: 'Document common patterns used in the project',
    icon: 'mdi:puzzle',
    content: `# Design Patterns

## Patterns in Use

### Repository Pattern
- Used for data access layer
- Abstracts database operations
- Location: src/repositories/*

### Factory Pattern
- Used for creating complex objects
- Location: src/factories/*

### Observer Pattern
- Used for event handling
- Implementation: EventEmitter

## Anti-Patterns to Avoid
- God objects
- Spaghetti code
- Copy-paste programming

## Best Practices
- Keep functions small and focused
- Use dependency injection
- Favor composition over inheritance
`
  },
  {
    id: 'workflow',
    name: 'Development Workflow',
    description: 'Define development processes and workflows',
    icon: 'mdi:source-branch',
    content: `# Development Workflow

## Getting Started
1. Clone the repository
2. Install dependencies: npm install
3. Copy .env.example to .env
4. Run development server: npm run dev

## Development Process
1. Pick a ticket from the backlog
2. Create a feature branch
3. Implement the feature
4. Write/update tests
5. Create a pull request
6. Address review feedback
7. Merge when approved

## Commands
- npm run dev - Start development server
- npm test - Run tests
- npm run build - Build for production
- npm run lint - Run linter

## Deployment
- Staging: Automatic on develop branch
- Production: Manual trigger from main branch
`
  }
];

// Quick suggestions
const quickSuggestions = [
  'Use TypeScript strict mode',
  'Prefer functional components',
  'Always handle errors gracefully',
  'Write tests for new features',
  'Document complex logic'
];

// Load memory files
const loadMemory = async () => {
  // Load project memory
  if (tasksStore.projectPath) {
    const projectResult = await window.electronAPI.fs.readFile(projectMemoryPath.value);
    if (projectResult.success) {
      projectMemory.value = projectResult.content;
    } else {
      // Create default project memory if it doesn't exist
      projectMemory.value = '# Project Instructions\n\n';
    }
  }

  // Load user memory - ensure the directory exists first
  try {
    const userDir = userMemoryPath.value.substring(0, userMemoryPath.value.lastIndexOf('/'));
    await window.electronAPI.fs.ensureDir(userDir);
    
    const userResult = await window.electronAPI.fs.readFile(userMemoryPath.value);
    if (userResult.success) {
      userMemory.value = userResult.content;
    } else {
      // Create default user memory if it doesn't exist
      userMemory.value = '# User Preferences\n\n';
    }
  } catch (error) {
    console.error('Failed to load user memory:', error);
    userMemory.value = '# User Preferences\n\n';
  }

  // Parse imports
  parseImports();
};

// Parse import statements
const parseImports = () => {
  const imports: ImportNode[] = [];
  
  const parseFileImports = (content: string, basePath: string) => {
    const importRegex = /@([^\s]+\.md)/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      imports.push({
        path: importPath,
        exists: true, // Would need to check this
        children: []
      });
    }
  };

  parseFileImports(projectMemory.value, projectMemoryPath.value);
  parseFileImports(userMemory.value, userMemoryPath.value);
  
  importTree.value = imports;
};

// Save functions
const saveProjectMemory = async () => {
  if (!tasksStore.projectPath) return;
  
  const result = await window.electronAPI.fs.writeFile(
    projectMemoryPath.value,
    projectMemory.value
  );
  
  if (result.success) {
    projectMemoryChanged.value = false;
  }
};

const saveUserMemory = async () => {
  if (!userMemoryPath.value) return;
  
  try {
    // Ensure the directory exists
    const userDir = userMemoryPath.value.substring(0, userMemoryPath.value.lastIndexOf('/'));
    await window.electronAPI.fs.ensureDir(userDir);
    
    const result = await window.electronAPI.fs.writeFile(
      userMemoryPath.value,
      userMemory.value
    );
    
    if (result.success) {
      userMemoryChanged.value = false;
    }
  } catch (error) {
    console.error('Failed to save user memory:', error);
  }
};

const saveAll = async () => {
  if (projectMemoryChanged.value) {
    await saveProjectMemory();
  }
  if (userMemoryChanged.value) {
    await saveUserMemory();
  }
};

// Change tracking
const markProjectChanged = () => {
  projectMemoryChanged.value = true;
};

const markUserChanged = () => {
  userMemoryChanged.value = true;
};

// Quick add memory
const quickAddMemory = () => {
  if (!quickAddText.value.trim()) return;
  
  const addition = `\n- ${quickAddText.value}`;
  
  // Determine which memory to update based on current tab
  const useProjectMemory = activeTab.value === 'project' || 
                          activeTab.value === 'imports' || 
                          activeTab.value === 'templates';
  
  if (useProjectMemory) {
    projectMemory.value = projectMemory.value.trim() 
      ? projectMemory.value + addition 
      : `# Project Instructions${addition}`;
    markProjectChanged();
  } else {
    userMemory.value = userMemory.value.trim() 
      ? userMemory.value + addition 
      : `# User Preferences${addition}`;
    markUserChanged();
  }
  
  quickAddText.value = '';
};

// Template application
const applyTemplate = (template: MemoryTemplate) => {
  const targetTab = activeTab.value === 'templates' ? 'project' : activeTab.value;
  const isUserMemory = targetTab === 'user';
  const currentContent = isUserMemory ? userMemory.value : projectMemory.value;
  
  // Show different message based on whether content exists
  const message = currentContent.trim() 
    ? `Append "${template.name}" template to ${isUserMemory ? 'user' : 'project'} memory?\n\nThis will add to the existing content.`
    : `Apply "${template.name}" template to ${isUserMemory ? 'user' : 'project'} memory?`;
  
  const confirmed = confirm(message);
  
  if (confirmed) {
    const newContent = currentContent.trim() 
      ? currentContent + '\n\n' + template.content 
      : template.content;
    
    if (isUserMemory) {
      userMemory.value = newContent;
      markUserChanged();
    } else {
      projectMemory.value = newContent;
      markProjectChanged();
    }
    
    // Switch to the appropriate tab
    activeTab.value = isUserMemory ? 'user' : 'project';
  }
};

// Other functions
const refreshMemory = () => {
  loadMemory();
};

const openImportedFile = async (path: string) => {
  // These imports are from the CLAUDE.md files which use @ syntax
  // They are always relative to the .claude directory
  let fullPath = path;
  
  // Parse imports found in the current memory files
  const projectImports = extractImports(projectMemory.value);
  const userImports = extractImports(userMemory.value);
  
  // Determine which memory file contains this import
  const isUserImport = userImports.includes(path);
  
  // If it's a relative path, resolve it
  if (!path.startsWith('/')) {
    if (isUserImport) {
      // User imports are relative to ~/.claude/
      fullPath = `${userHomePath.value}/.claude/${path}`;
    } else {
      // Project imports could be in project/.claude/ or project root
      const projectClaudePath = `${tasksStore.projectPath}/.claude/${path}`;
      const projectRootPath = `${tasksStore.projectPath}/${path}`;
      
      // Check if file exists in .claude directory first
      const claudeFileExists = await window.electronAPI.fs.exists(projectClaudePath);
      fullPath = claudeFileExists ? projectClaudePath : projectRootPath;
    }
  }
  
  // Use the editor store to open the file
  const { useEditorStore } = await import('~/stores/editor');
  const editorStore = useEditorStore();
  await editorStore.openFile(fullPath);
  
  // Close the memory editor modal
  window.dispatchEvent(new CustomEvent('close-memory-editor'));
};

// Helper function to extract imports from content
const extractImports = (content: string): string[] => {
  const imports: string[] = [];
  const importRegex = /@([^\s]+\.md)/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
};

const addImport = () => {
  // Implement import addition logic
  console.log('Add import');
};

const validateImports = () => {
  // Implement import validation logic
  console.log('Validate imports');
};

// Watch for project path changes
watch(() => tasksStore.projectPath, () => {
  loadMemory();
});

// Watch for home path changes
watch(userHomePath, (newPath) => {
  if (newPath) {
    loadMemory();
  }
});

onMounted(async () => {
  // Get home path first
  try {
    userHomePath.value = await window.electronAPI.store.getHomePath();
  } catch (error) {
    console.error('Failed to get home path:', error);
  }
  
  // Then load memory files
  loadMemory();
});
</script>

<style scoped>
.memory-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.memory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
}

.memory-header h2 {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  transition: background 0.2s;
}

.icon-button:hover {
  background: #3e3e42;
}

.icon-button.primary {
  background: #007acc;
  color: white;
}

.icon-button.primary:hover {
  background: #005a9e;
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.memory-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #181818;
}

.tab {
  background: none;
  border: none;
  color: #858585;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  position: relative;
}

.tab:hover {
  color: #cccccc;
  background: #2d2d30;
}

.tab.active {
  color: #ffffff;
  border-bottom-color: #007acc;
}

.unsaved-indicator {
  color: #f48771;
  font-size: 20px;
  line-height: 1;
  position: absolute;
  top: 4px;
  right: 4px;
}

.memory-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.memory-path {
  padding: 8px 16px;
  font-size: 11px;
  color: #858585;
  background: #252526;
  font-family: 'Consolas', 'Monaco', monospace;
}

.fallback-editor {
  flex: 1;
  background: #1e1e1e;
  color: #cccccc;
  border: none;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  resize: none;
  outline: none;
}

.imports-info {
  padding: 16px;
  background: #252526;
  margin-bottom: 16px;
}

.imports-info p {
  margin: 0 0 8px;
  font-size: 13px;
  color: #cccccc;
}

.imports-info code {
  background: #1e1e1e;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.import-tree {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.import-tree h3 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
}

.no-imports {
  color: #858585;
  font-style: italic;
  text-align: center;
  padding: 32px;
}

.import-actions {
  padding: 16px;
  border-top: 1px solid #181818;
  display: flex;
  gap: 8px;
}

.action-button {
  background: #2d2d30;
  border: 1px solid #454545;
  color: #cccccc;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.action-button:hover {
  background: #3e3e42;
  border-color: #5a5a5a;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  padding: 16px;
}

.template-card {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.template-card:hover {
  background: #2d2d30;
  border-color: #007acc;
  transform: translateY(-2px);
}

.template-card h4 {
  font-size: 14px;
  font-weight: 500;
  margin: 8px 0 4px;
}

.template-card p {
  font-size: 12px;
  color: #858585;
  margin: 0;
}

.quick-add {
  border-top: 1px solid #181818;
  padding: 16px;
  background: #252526;
}

.quick-add h3 {
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #858585;
}

.quick-add-input {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.quick-add-input input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #454545;
  color: #cccccc;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.quick-add-input input:focus {
  border-color: #007acc;
}

.quick-add-input button {
  background: #007acc;
  border: none;
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background 0.2s;
}

.quick-add-input button:hover:not(:disabled) {
  background: #005a9e;
}

.quick-add-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.suggestion-chip {
  background: #2d2d30;
  border: 1px solid #454545;
  color: #cccccc;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.suggestion-chip:hover {
  background: #3e3e42;
  border-color: #5a5a5a;
}

/* CodeMirror wrapper styles */
:deep(.cm-editor) {
  flex: 1;
  font-size: 13px;
}

:deep(.cm-content) {
  padding: 16px;
}
</style>