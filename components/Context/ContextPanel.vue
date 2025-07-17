<template>
  <div class="context-panel">
    <div class="panel-header">
      <h3>Project Context</h3>
      <div class="header-actions">
        <div class="watching-indicator" v-if="isReady">
          <Icon 
            :name="watchingEnabled ? 'mdi:eye' : 'mdi:eye-off'" 
            size="16" 
            :class="{ active: watchingEnabled }"
          />
          <span class="watching-text">{{ watchingEnabled ? 'Live' : 'Static' }}</span>
        </div>
        <button 
          @click="refreshWorkspace" 
          :disabled="isScanning"
          class="icon-button"
          title="Refresh workspace"
        >
          <Icon :name="isScanning ? 'mdi:loading' : 'mdi:refresh'" size="16" />
        </button>
      </div>
    </div>

    <div class="panel-content">
      <!-- Not Ready State -->  
      <div v-if="!isReady && !isScanning" class="not-ready-state">
        <Icon name="mdi:folder-search" size="48" />
        <h4>No Workspace Context</h4>
        <p>Open a workspace to enable smart context features.</p>
      </div>
      
      <!-- Scanning Progress -->
      <div v-if="isScanning" class="scanning-progress">
        <Icon name="mdi:loading" size="24" />
        <p>Scanning workspace...</p>
      </div>

      <!-- Project Statistics -->
      <div v-if="isReady" class="project-stats">
        <div class="stat-item">
          <Icon name="mdi:file-document" size="16" />
          <span>{{ statistics.totalFiles }} files</span>
        </div>
        <div class="stat-item" v-if="projectInfo?.type">
          <Icon name="mdi:application" size="16" />
          <span>{{ projectInfo.type }} project</span>
        </div>
        <div class="stat-item" v-if="projectInfo?.framework">
          <Icon name="mdi:framework" size="16" />
          <span>{{ projectInfo.framework }}</span>
        </div>
      </div>

      <!-- Search Section -->
      <div v-if="isReady" class="search-section">
        <div class="search-input-container">
          <input
            v-model="searchQuery"
            placeholder="Search files..."
            class="search-input"
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="clear-button">
            <Icon name="mdi:close" size="16" />
          </button>
        </div>
      </div>

      <!-- Search Results -->
      <div v-if="hasResults" class="search-results">
        <h4>Files ({{ searchResults.length }})</h4>
        <div class="results-list">
          <div 
            v-for="file in searchResults" 
            :key="file.path"
            class="result-item"
            @click="openFile(file.path)"
          >
            <div class="result-header">
              <Icon :name="getFileIcon(file.language)" size="16" />
              <span class="result-name">{{ file.name }}</span>
              <span class="result-score" v-if="file.relevanceScore">{{ file.relevanceScore }}</span>
            </div>
            <div class="result-path">{{ getRelativePath(file.path) }}</div>
          </div>
        </div>
      </div>

      <!-- Recent Files -->
      <div v-if="isReady && recentFiles.length > 0" class="recent-files">
        <h4>Recent Files</h4>
        <div class="files-list">
          <div 
            v-for="file in recentFiles.slice(0, 10)" 
            :key="file.path"
            class="file-item"
            @click="openFile(file.path)"
          >
            <Icon :name="getFileIcon(file.language)" size="16" />
            <span class="file-name">{{ file.name }}</span>
            <span class="file-time">{{ formatTime(file.lastModified) }}</span>
          </div>
        </div>
      </div>

      <!-- Language Distribution -->
      <div v-if="isReady && Object.keys(statistics.languageDistribution).length > 0" class="language-distribution">
        <h4>Languages</h4>
        <div class="language-list">
          <div 
            v-for="(count, language) in statistics.languageDistribution" 
            :key="language"
            class="language-item"
          >
            <Icon :name="getFileIcon(language)" size="16" />
            <span class="language-name">{{ language }}</span>
            <span class="language-count">{{ count }}</span>
          </div>
        </div>
      </div>

      <!-- Working Files -->
      <div v-if="workingFiles.length > 0" class="working-files">
        <h4>Working Files</h4>
        <div class="files-list">
          <div 
            v-for="filePath in workingFiles" 
            :key="filePath"
            class="working-file-item"
          >
            <Icon name="mdi:file-edit" size="16" />
            <span class="file-name">{{ getFileName(filePath) }}</span>
            <button @click="removeWorkingFile(filePath)" class="remove-button">
              <Icon name="mdi:close" size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useContextManager } from '~/composables/useContextManager';
import { useProjectContextStore } from '~/stores/project-context';
import { useEditorStore } from '~/stores/editor';

const contextManager = useContextManager();
const contextStore = useProjectContextStore();
const editorStore = useEditorStore();

// Reactive state from composable
const {
  isReady,
  isScanning,
  isSearching,
  searchQuery,
  searchResults,
  statistics,
  hasResults,
  recentFiles,
  refreshWorkspace
} = contextManager;

// Additional computed properties
const projectInfo = computed(() => contextStore.projectInfo);
const workingFiles = computed(() => contextStore.workingFiles);
const watchingEnabled = computed(() => contextStore.watchingEnabled);

// Methods
const openFile = async (filePath: string) => {
  try {
    await editorStore.openFile(filePath);
    contextStore.addWorkingFile(filePath);
  } catch (error) {
    console.error('Failed to open file:', error);
  }
};

const removeWorkingFile = (filePath: string) => {
  contextStore.removeWorkingFile(filePath);
};

const getFileIcon = (language: string): string => {
  const iconMap: Record<string, string> = {
    typescript: 'mdi:language-typescript',
    javascript: 'mdi:language-javascript',
    vue: 'mdi:vuejs',
    python: 'mdi:language-python',
    java: 'mdi:language-java',
    cpp: 'mdi:language-cpp',
    c: 'mdi:language-c',
    csharp: 'mdi:language-csharp',
    php: 'mdi:language-php',
    ruby: 'mdi:language-ruby',
    go: 'mdi:language-go',
    rust: 'mdi:language-rust',
    swift: 'mdi:language-swift',
    kotlin: 'mdi:language-kotlin',
    scala: 'mdi:language-scala',
    elixir: 'mdi:language-elixir',
    al: 'mdi:microsoft',
    html: 'mdi:language-html5',
    css: 'mdi:language-css3',
    json: 'mdi:code-json',
    markdown: 'mdi:language-markdown',
    yaml: 'mdi:code-braces',
    xml: 'mdi:xml',
    sql: 'mdi:database'
  };
  
  return iconMap[language] || 'mdi:file-code';
};

const getRelativePath = (fullPath: string): string => {
  if (!contextStore.currentWorkspace) return fullPath;
  
  const workspacePath = contextStore.currentWorkspace;
  if (fullPath.startsWith(workspacePath)) {
    return fullPath.substring(workspacePath.length + 1);
  }
  return fullPath;
};

const getFileName = (fullPath: string): string => {
  return fullPath.split('/').pop() || fullPath;
};

const formatTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
};
</script>

<style scoped>
.context-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border-left: 1px solid #333;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #333;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
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
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: #3e3e42;
  color: #ffffff;
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panel-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.not-ready-state, .scanning-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  color: #cccccc;
}

.not-ready-state h4 {
  margin: 16px 0 8px 0;
  color: #ffffff;
  font-size: 16px;
}

.not-ready-state p {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.5;
}

.scanning-progress {
  gap: 12px;
}

.project-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: #252526;
  border-radius: 6px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cccccc;
  font-size: 12px;
}

.search-section {
  margin-bottom: 16px;
}

.search-input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  padding-right: 32px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: #007acc;
}

.clear-button {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}

.clear-button:hover {
  color: #ffffff;
}

.search-results, .recent-files, .language-distribution, .working-files {
  margin-bottom: 16px;
}

.search-results h4, .recent-files h4, .language-distribution h4, .working-files h4 {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #ffffff;
}

.results-list, .files-list, .language-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item, .file-item, .language-item, .working-file-item {
  padding: 8px 12px;
  background: #252526;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.result-item:hover, .file-item:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.language-item, .working-file-item {
  cursor: default;
}

.working-file-item {
  cursor: pointer;
}

.result-header, .file-item, .language-item, .working-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-name, .file-name, .language-name {
  flex: 1;
  font-size: 12px;
  color: #cccccc;
  font-family: monospace;
}

.result-score {
  font-size: 11px;
  color: #007acc;
  font-weight: 600;
}

.result-path {
  font-size: 11px;
  color: #999999;
  margin-top: 4px;
  margin-left: 24px;
  font-family: monospace;
}

.file-time, .language-count {
  font-size: 11px;
  color: #007acc;
  font-weight: 600;
}

.remove-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-button:hover {
  background: #cd3131;
  color: white;
}

.watching-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #cccccc;
  background: #3c3c3c;
  padding: 4px 8px;
  border-radius: 12px;
  border: 1px solid #6c6c6c;
}

.watching-indicator .active {
  color: #4ec9b0;
}

.watching-text {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>