<template>
  <div v-if="isOpen" class="search-overlay" @click.self="close">
    <div class="search-modal">
      <div class="search-header">
        <div>
          <h3>Find in Files</h3>
          <div v-if="tasksStore.projectPath" class="workspace-info">
            Searching in: {{ workspaceName }}
          </div>
        </div>
        <button @click="close" class="close-button">
          <Icon name="mdi:close" />
        </button>
      </div>

      <div class="search-form">
        <div class="form-group">
          <label>Search</label>
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            placeholder="Search text..."
            @keyup.enter="performSearch"
            @keyup.escape="close"
          />
        </div>

        <div class="form-group">
          <label>Replace with (optional)</label>
          <input
            v-model="replaceQuery"
            type="text"
            placeholder="Replace text..."
            @keyup.enter="performSearch"
            @keyup.escape="close"
          />
        </div>

        <div class="form-options">
          <label>
            <input v-model="caseSensitive" type="checkbox" />
            Case sensitive
          </label>
          <label>
            <input v-model="wholeWord" type="checkbox" />
            Whole word
          </label>
          <label>
            <input v-model="useRegex" type="checkbox" />
            Regular expression
          </label>
        </div>

        <div class="form-group">
          <label>Include files</label>
          <input
            v-model="includePattern"
            type="text"
            placeholder="e.g., *.ts, *.vue (leave empty for all)"
          />
        </div>

        <div class="form-group">
          <label>Exclude files</label>
          <input
            v-model="excludePattern"
            type="text"
            placeholder="e.g., node_modules/**, dist/**"
          />
        </div>

        <div class="search-actions">
          <button @click="performSearch" class="primary-button" :disabled="!canSearch">
            <Icon name="mdi:magnify" />
            Search
          </button>
          <button v-if="searchResults.length > 0 && replaceQuery" @click="replaceAll" class="danger-button">
            <Icon name="mdi:find-replace" />
            Replace All
          </button>
        </div>
        
        <div v-if="searchQuery.length > 0 && searchQuery.length < 3" class="search-hint">
          Please enter at least 3 characters to search
        </div>
      </div>

      <div v-if="isSearching" class="search-status">
        <Icon name="mdi:loading" class="spinner" />
        Searching...
      </div>

      <div v-if="searchResults.length > 0" class="search-results">
        <div class="results-header">
          <span>{{ searchResults.length }} results in {{ fileCount }} files</span>
        </div>

        <div class="results-list">
          <div v-for="file in searchResults" :key="file.path" class="file-results">
            <div class="file-header" @click="toggleFile(file.path)">
              <Icon :name="expandedFiles.has(file.path) ? 'mdi:chevron-down' : 'mdi:chevron-right'" />
              <span class="file-path">{{ file.relativePath }}</span>
              <span class="match-count">({{ file.matches.length }})</span>
            </div>

            <div v-if="expandedFiles.has(file.path)" class="file-matches">
              <div
                v-for="(match, index) in file.matches"
                :key="`${file.path}-${index}`"
                class="match-item"
                @click="openFileAtLine(file.path, match.line)"
              >
                <span class="line-number">{{ match.line }}:</span>
                <span class="match-preview" v-html="highlightMatch(match.text, match.column, match.length)"></span>
                <button
                  v-if="replaceQuery"
                  @click.stop="replaceSingle(file.path, match)"
                  class="replace-button"
                  title="Replace this occurrence"
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="hasSearched && searchResults.length === 0" class="no-results">
        No results found
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';

interface SearchMatch {
  line: number;
  column: number;
  text: string;
  length: number;
}

interface FileResult {
  path: string;
  relativePath: string;
  matches: SearchMatch[];
}

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const editorStore = useEditorStore();
const tasksStore = useTasksStore();

const searchQuery = ref('');
const replaceQuery = ref('');
const caseSensitive = ref(false);
const wholeWord = ref(false);
const useRegex = ref(false);
const includePattern = ref('');
const excludePattern = ref('node_modules/**, dist/**, .git/**, .nuxt/**, .claude/**, .clode/** .claude-checkpoints/**, .worktrees/**, build/**, .output/**, coverage/**, .nyc_output/**, tmp/**, temp/**, .cache/**, .parcel-cache/**, .vscode/**, .idea/**, __pycache__/**, *.pyc, .DS_Store, *.log, *.min.js, *.map, package-lock.json, yarn.lock, *.bundle.js, vendor/**, .next/**, out/**');

const searchResults = ref<FileResult[]>([]);
const expandedFiles = ref(new Set<string>());
const isSearching = ref(false);
const hasSearched = ref(false);
const searchInput = ref<HTMLInputElement>();

const fileCount = computed(() => searchResults.value.length);
const workspaceName = computed(() => {
  if (!tasksStore.projectPath) return '';
  const parts = tasksStore.projectPath.split('/');
  return parts[parts.length - 1];
});

const canSearch = computed(() => {
  return searchQuery.value.length >= 3;
});

watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    await nextTick();
    searchInput.value?.focus();
    searchInput.value?.select();
  }
});

const close = () => {
  emit('close');
};

const toggleFile = (path: string) => {
  if (expandedFiles.value.has(path)) {
    expandedFiles.value.delete(path);
  } else {
    expandedFiles.value.add(path);
  }
};

const performSearch = async () => {
  if (!searchQuery.value || searchQuery.value.length < 3) return;



  // Check if search API is available
  if (!window.electronAPI?.search) {
    alert('Search API not available. Please restart the Electron app.');
    return;
  }

  isSearching.value = true;
  hasSearched.value = true;

  try {
    const workspacePath = tasksStore.projectPath;
    if (!workspacePath) {
      alert('Please select a workspace first!');
      return;
    }

    const searchParams = {
      query: searchQuery.value,
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
      useRegex: useRegex.value,
      includePattern: includePattern.value,
      excludePattern: excludePattern.value,
      workspacePath: workspacePath
    };

  
  
    
    const startTime = Date.now();
    
    let results;
    try {
      // Just await the search without a timeout - the backend already has a 2s timeout
      results = await window.electronAPI.search.findInFiles(searchParams);
      
      const searchTime = Date.now() - startTime;
    
    } catch (ipcError) {
      console.error('[GlobalSearch] IPC call failed:', ipcError);
      throw ipcError;
    }

  
    searchResults.value = results || [];
    expandedFiles.value.clear();

    // Expand first few files by default
    if (results && results.length > 0) {
      results.slice(0, 3).forEach(file => {
        expandedFiles.value.add(file.path);
      });
    }
  
  } catch (error: any) {
    console.error('[GlobalSearch] Search failed:', error);
    alert('Search failed: ' + (error?.message || 'Unknown error'));
  } finally {
  
    isSearching.value = false;
  }
};

const highlightMatch = (text: string, column: number, length: number) => {
  const before = text.substring(0, column);
  const match = text.substring(column, column + length);
  const after = text.substring(column + length);

  return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`;
};

const escapeHtml = (text: string) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const openFileAtLine = async (filePath: string, line: number) => {
  await editorStore.openFile(filePath, line);
};

const replaceSingle = async (filePath: string, match: SearchMatch) => {
  try {
    await window.electronAPI.search.replaceInFile({
      filePath,
      searchQuery: searchQuery.value,
      replaceQuery: replaceQuery.value,
      line: match.line,
      column: match.column,
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
      useRegex: useRegex.value
    });

    // Refresh search results
    await performSearch();
  } catch (error) {
    console.error('Replace failed:', error);
    alert('Replace failed: ' + error.message);
  }
};

const replaceAll = async () => {
  if (!confirm(`Replace all ${searchResults.value.reduce((sum, f) => sum + f.matches.length, 0)} occurrences?`)) {
    return;
  }

  try {
    for (const file of searchResults.value) {
      await window.electronAPI.search.replaceAllInFile({
        filePath: file.path,
        searchQuery: searchQuery.value,
        replaceQuery: replaceQuery.value,
        caseSensitive: caseSensitive.value,
        wholeWord: wholeWord.value,
        useRegex: useRegex.value
      });
    }

    // Refresh search results
    await performSearch();
    alert('Replace completed successfully!');
  } catch (error) {
    console.error('Replace all failed:', error);
    alert('Replace all failed: ' + error.message);
  }
};
</script>

<style scoped>
.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.search-modal {
  background: #252526;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.search-header h3 {
  margin: 0;
  font-size: 16px;
}

.workspace-info {
  font-size: 12px;
  color: #858585;
  margin-top: 4px;
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
  background: #3e3e42;
}

.search-form {
  padding: 20px;
  border-bottom: 1px solid #3e3e42;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: #cccccc;
}

.form-group input[type="text"] {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
}

.form-group input[type="text"]:focus {
  outline: none;
  border-color: #007acc;
}

.form-options {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
}

.form-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #cccccc;
  cursor: pointer;
}

.search-actions {
  display: flex;
  gap: 12px;
}

.primary-button, .danger-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
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

.danger-button {
  background: #f14c4c;
  color: white;
}

.danger-button:hover {
  background: #cd3131;
}

.search-status {
  padding: 20px;
  text-align: center;
  color: #cccccc;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.search-results {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.results-header {
  padding: 12px 20px;
  background: #2d2d30;
  font-size: 13px;
  color: #cccccc;
}

.results-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.file-results {
  margin-bottom: 8px;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #2d2d30;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.file-header:hover {
  background: #37373d;
}

.file-path {
  flex: 1;
  color: #cccccc;
}

.match-count {
  color: #858585;
  font-size: 12px;
}

.file-matches {
  margin-left: 20px;
  margin-top: 4px;
}

.match-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}

.match-item:hover {
  background: #2d2d30;
}

.line-number {
  color: #858585;
  min-width: 40px;
}

.match-preview {
  flex: 1;
  color: #d4d4d4;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-preview mark {
  background: #515c6a;
  color: #ffffff;
  border-radius: 2px;
  padding: 0 2px;
}

.replace-button {
  padding: 2px 8px;
  background: #3e3e42;
  border: none;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
  cursor: pointer;
}

.replace-button:hover {
  background: #4e4e52;
}

.no-results {
  padding: 40px;
  text-align: center;
  color: #858585;
}

.search-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #f14c4c;
  text-align: center;
}
</style>