<template>
  <div class="knowledge-panel" :class="{ 'full-ide-mode': layoutStore.isFullIdeMode }">
    <!-- Full IDE Mode: Just show list/search (no editor) -->
    <div v-if="layoutStore.isFullIdeMode" class="knowledge-full-ide">
      <div class="knowledge-header">
        <h3>Knowledge Base</h3>
        <div class="header-actions">
          <button @click="createNewEntry" class="primary-button" title="Create new entry (Cmd+N)">
            <Icon name="mdi:plus" size="16" />
            New
          </button>
        </div>
      </div>

      <div class="search-section">
        <div class="search-input-wrapper">
          <Icon name="mdi:magnify" size="18" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search knowledge base..."
            class="search-input"
            @input="performSearch"
          />
          <button 
            v-if="searchQuery"
            @click="clearSearch"
            class="clear-button"
          >
            <Icon name="mdi:close" size="16" />
          </button>
        </div>
        
        <div class="filter-chips">
          <button
            v-for="tag in popularTags"
            :key="tag"
            @click="toggleTagFilter(tag)"
            class="tag-chip"
            :class="{ active: selectedTags.includes(tag) }"
          >
            #{{ tag }}
          </button>
        </div>
      </div>

      <div class="knowledge-list full-height">
        <div class="category-section" v-for="category in categoriesWithEntries" :key="category.id">
          <div class="category-header" @click="toggleCategory(category.id)">
            <Icon 
              :name="expandedCategories.includes(category.id) ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
              size="18" 
            />
            <Icon :name="category.icon" size="16" :style="{ color: category.color }" />
            <span class="category-name">{{ category.name }}</span>
            <span class="category-count">{{ category.entries.length }}</span>
          </div>
          
          <div v-if="expandedCategories.includes(category.id)" class="category-entries">
            <div
              v-for="entry in category.entries"
              :key="entry.id"
              @click="openInMainEditor(entry)"
              class="knowledge-entry"
              :class="{ active: selectedEntry?.id === entry.id }"
            >
              <div class="entry-header">
                <input
                  v-if="editingEntryId === entry.id"
                  v-model="editingTitle"
                  @blur="saveTitle(entry)"
                  @keydown.enter="saveTitle(entry)"
                  @keydown.escape="cancelEdit"
                  @click.stop
                  class="title-edit-input"
                  :ref="el => { if (editingEntryId === entry.id) nextTick(() => (el as HTMLInputElement)?.focus()) }"
                />
                <span
                  v-else
                  class="entry-title"
                  @dblclick.stop="startEditTitle(entry)"
                  :title="'Double-click to edit'"
                >
                  {{ entry.title }}
                </span>
                <Icon 
                  v-if="entry.metadata.priority === 'high'" 
                  name="mdi:star" 
                  size="14" 
                  class="priority-icon"
                />
              </div>
              <div class="entry-meta">
                <span class="entry-date">{{ formatDate(entry.metadata.updated) }}</span>
                <div class="entry-tags">
                  <span v-for="tag in entry.metadata.tags.slice(0, 3)" :key="tag" class="mini-tag">
                    #{{ tag }}
                  </span>
                  <span v-if="entry.metadata.tags.length > 3" class="more-tags">
                    +{{ entry.metadata.tags.length - 3 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredEntries.length === 0" class="empty-state">
          <Icon name="mdi:magnify-close" size="48" />
          <p>No entries found</p>
        </div>
      </div>
    </div>

    <!-- Other Modes: Just show the list (no embedded editor) -->
    <div v-else class="knowledge-simple">
      <div class="knowledge-header">
        <h3>Knowledge Base</h3>
        <div class="header-actions">
          <button @click="createNewEntry" class="primary-button" title="Create new entry (Cmd+N)">
            <Icon name="mdi:plus" size="16" />
            New
          </button>
        </div>
      </div>

      <div class="search-section">
        <div class="search-input-wrapper">
          <Icon name="mdi:magnify" size="18" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search knowledge base..."
            class="search-input"
            @input="performSearch"
          />
          <button 
            v-if="searchQuery"
            @click="clearSearch"
            class="clear-button"
          >
            <Icon name="mdi:close" size="16" />
          </button>
        </div>
        
        <div class="filter-chips">
          <button
            v-for="tag in popularTags"
            :key="tag"
            @click="toggleTagFilter(tag)"
            class="tag-chip"
            :class="{ active: selectedTags.includes(tag) }"
          >
            #{{ tag }}
          </button>
        </div>
      </div>

      <div class="knowledge-list full-height">
        <div class="category-section" v-for="category in categoriesWithEntries" :key="category.id">
          <div class="category-header" @click="toggleCategory(category.id)">
            <Icon 
              :name="expandedCategories.includes(category.id) ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
              size="18" 
            />
            <Icon :name="category.icon" size="16" :style="{ color: category.color }" />
            <span class="category-name">{{ category.name }}</span>
            <span class="category-count">{{ category.entries.length }}</span>
          </div>
          
          <div v-if="expandedCategories.includes(category.id)" class="category-entries">
            <div
              v-for="entry in category.entries"
              :key="entry.id"
              @click.stop="selectEntry(entry)"
              class="knowledge-entry"
              :class="{ active: selectedEntry?.id === entry.id }"
            >
              <div class="entry-header">
                <input
                  v-if="editingEntryId === entry.id"
                  v-model="editingTitle"
                  @blur="saveTitle(entry)"
                  @keydown.enter="saveTitle(entry)"
                  @keydown.escape="cancelEdit"
                  @click.stop
                  class="title-edit-input"
                  :ref="el => { if (editingEntryId === entry.id) nextTick(() => (el as HTMLInputElement)?.focus()) }"
                />
                <span
                  v-else
                  class="entry-title"
                  @dblclick.stop="startEditTitle(entry)"
                  :title="'Double-click to edit'"
                >
                  {{ entry.title }}
                </span>
                <Icon 
                  v-if="entry.metadata.priority === 'high'" 
                  name="mdi:star" 
                  size="14" 
                  class="priority-icon"
                />
              </div>
              <div class="entry-meta">
                <span class="entry-date">{{ formatDate(entry.metadata.updated) }}</span>
                <div class="entry-tags">
                  <span v-for="tag in entry.metadata.tags.slice(0, 3)" :key="tag" class="mini-tag">
                    #{{ tag }}
                  </span>
                  <span v-if="entry.metadata.tags.length > 3" class="more-tags">
                    +{{ entry.metadata.tags.length - 3 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredEntries.length === 0" class="empty-state">
          <Icon name="mdi:magnify-close" size="48" />
          <p>No entries found</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useEditorStore } from '~/stores/editor';
import { useLayoutStore } from '~/stores/layout';
import { useTasksStore } from '~/stores/tasks';
import type { KnowledgeEntry } from '~/stores/knowledge';

const knowledgeStore = useKnowledgeStore();
const editorStore = useEditorStore();
const layoutStore = useLayoutStore();
const tasksStore = useTasksStore();

// State
const searchQuery = ref('');
const selectedTags = ref<string[]>([]);
const expandedCategories = ref<string[]>(['notes', 'api', 'architecture']);
const selectedEntry = ref<KnowledgeEntry | null>(null);
const editingEntryId = ref<string | null>(null);
const editingTitle = ref('');

// Computed
const filteredEntries = computed(() => {
  let entries = knowledgeStore.entries;

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    entries = entries.filter(entry =>
      entry.title.toLowerCase().includes(query) ||
      entry.content.toLowerCase().includes(query) ||
      entry.metadata.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }

  // Filter by selected tags
  if (selectedTags.value.length > 0) {
    entries = entries.filter(entry =>
      selectedTags.value.every(tag => entry.metadata.tags.includes(tag))
    );
  }

  return entries;
});

const categoriesWithEntries = computed(() => {
  const grouped = knowledgeStore.categories.map(category => ({
    ...category,
    entries: filteredEntries.value.filter(entry => 
      entry.metadata.category === category.id
    )
  }));

  return grouped.filter(cat => cat.entries.length > 0);
});

const popularTags = computed(() => {
  const tagCounts: Record<string, number> = {};
  knowledgeStore.entries.forEach(entry => {
    entry.metadata.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);
});


// Methods
const performSearch = () => {
  // Search is reactive through computed properties
};

const clearSearch = () => {
  searchQuery.value = '';
  selectedTags.value = [];
};

const toggleTagFilter = (tag: string) => {
  const index = selectedTags.value.indexOf(tag);
  if (index > -1) {
    selectedTags.value.splice(index, 1);
  } else {
    selectedTags.value.push(tag);
  }
};

const toggleCategory = (categoryId: string) => {
  const index = expandedCategories.value.indexOf(categoryId);
  if (index > -1) {
    expandedCategories.value.splice(index, 1);
  } else {
    expandedCategories.value.push(categoryId);
  }
};

const selectEntry = async (entry: KnowledgeEntry) => {
  // Prevent event from bubbling to splitpanes
  selectedEntry.value = entry;
  
  // Switch to explorer-editor module in the left dock
  layoutStore.setActiveModule('explorer-editor');
  
  // Give a small delay for the layout to update
  await nextTick();
  setTimeout(() => {
    openInMainEditor(entry);
  }, 50);
};

const openInMainEditor = async (entry: KnowledgeEntry) => {
  // In Full IDE mode, open the knowledge file in the main editor
  const workspacePath = tasksStore.projectPath || knowledgeStore.workspacePath;
  if (!workspacePath) {
    console.error('No workspace path available');
    return;
  }
  
  const filePath = `${workspacePath}/.claude/knowledge/${entry.id}.md`;
  try {
    await editorStore.openFile(filePath);
    selectedEntry.value = entry;
    knowledgeStore.selectEntry(entry.id);
  } catch (error) {
    console.error('Failed to open knowledge file in editor:', error);
    // If there's an error, try again after a short delay
    await new Promise(resolve => setTimeout(resolve, 200));
    try {
      await editorStore.openFile(filePath);
      selectedEntry.value = entry;
      knowledgeStore.selectEntry(entry.id);
    } catch (retryError) {
      console.error('Retry also failed:', retryError);
    }
  }
};

const createNewEntry = async () => {
  const entry = await knowledgeStore.createEntry({
    title: 'New Entry',
    content: '# New Entry\n\nStart writing your knowledge here...',
    tags: [],
    category: 'notes'
  });
  
  // Switch to explorer-editor module in the left dock
  layoutStore.setActiveModule('explorer-editor');
  
  // Give a small delay for the layout to update
  await nextTick();
  setTimeout(() => {
    openInMainEditor(entry);
  }, 50);
};


const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  
  return new Date(date).toLocaleDateString();
};

const startEditTitle = (entry: KnowledgeEntry) => {
  editingEntryId.value = entry.id;
  editingTitle.value = entry.title;
};

const cancelEdit = () => {
  editingEntryId.value = null;
  editingTitle.value = '';
};

const saveTitle = async (entry: KnowledgeEntry) => {
  if (editingTitle.value.trim() && editingTitle.value !== entry.title) {
    try {
      await knowledgeStore.updateEntry(entry.id, {
        title: editingTitle.value.trim()
      });
      // Refresh entries to reflect the change
      await knowledgeStore.refreshEntries();
    } catch (error) {
      console.error('Failed to update entry title:', error);
    }
  }
  cancelEdit();
};


// Initialize
onMounted(async () => {
  const workspacePath = tasksStore.projectPath;
  if (workspacePath) {
    await knowledgeStore.initialize(workspacePath);
  }
  
  // Listen for knowledge events
  const handleKnowledgeSearch = (event: CustomEvent) => {
    if (event.detail?.query) {
      searchQuery.value = event.detail.query;
      performSearch();
    }
  };
  
  const handleKnowledgeCreate = async (event: CustomEvent) => {
    if (event.detail?.title) {
      const entry = await knowledgeStore.createEntry({
        title: event.detail.title,
        content: `# ${event.detail.title}\n\n`,
        tags: [],
        category: 'notes'
      });
      
      await selectEntry(entry);
    }
  };
  
  const handleShowKnowledgePanel = () => {
    // Switch to knowledge tab in bottom panel
    const bottomPanelEvent = new CustomEvent('switch-bottom-tab', { detail: { tab: 'knowledge' } });
    window.dispatchEvent(bottomPanelEvent);
  };
  
  window.addEventListener('knowledge-search', handleKnowledgeSearch as EventListener);
  window.addEventListener('knowledge-create', handleKnowledgeCreate as EventListener);
  window.addEventListener('show-knowledge-panel', handleShowKnowledgePanel);
});

// Cleanup event listeners
onUnmounted(() => {
  // Event handlers need to be stored to properly remove them
  const handleKnowledgeSearch = (event: CustomEvent) => {
    if (event.detail?.query) {
      searchQuery.value = event.detail.query;
      performSearch();
    }
  };
  
  const handleKnowledgeCreate = async (event: CustomEvent) => {
    if (event.detail?.title) {
      const entry = await knowledgeStore.createEntry({
        title: event.detail.title,
        content: `# ${event.detail.title}\n\n`,
        tags: [],
        category: 'notes'
      });
      
      // Switch to explorer-editor module in the left dock
      layoutStore.setActiveModule('explorer-editor');
      await nextTick();
      setTimeout(() => {
        openInMainEditor(entry);
      }, 50);
    }
  };
  
  const handleShowKnowledgePanel = () => {
    const bottomPanelEvent = new CustomEvent('switch-bottom-tab', { detail: { tab: 'knowledge' } });
    window.dispatchEvent(bottomPanelEvent);
  };
  
  window.removeEventListener('knowledge-search', handleKnowledgeSearch as EventListener);
  window.removeEventListener('knowledge-create', handleKnowledgeCreate as EventListener);
  window.removeEventListener('show-knowledge-panel', handleShowKnowledgePanel);
});

// Keyboard shortcuts
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + N: New entry
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      createNewEntry();
    }
    
    // Cmd/Ctrl + K: Focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) {
      e.preventDefault();
      const searchInput = document.querySelector('.search-input') as HTMLInputElement;
      searchInput?.focus();
    }
  };

  document.addEventListener('keydown', handleKeydown);
  return () => document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.knowledge-panel {
  height: 100%;
  background: #1e1e1e;
  color: #cccccc;
  overflow: hidden;
}

/* Fix splitpanes background */
.knowledge-panel :deep(.splitpanes__pane) {
  background: #1e1e1e;
}

.knowledge-list-pane,
.knowledge-editor-pane {
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
}

/* Full IDE Mode Specific */
.knowledge-full-ide {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.knowledge-full-ide .knowledge-list.full-height {
  flex: 1;
  overflow-y: auto;
}

/* Simple Mode (non-Full IDE) */
.knowledge-simple {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.knowledge-simple .knowledge-list.full-height {
  flex: 1;
  overflow-y: auto;
}

/* Header */
.knowledge-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
}

.knowledge-header h3 {
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

/* Search Section */
.search-section {
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
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

.clear-button {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
}

.clear-button:hover {
  background: #4a4a4a;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.tag-chip {
  padding: 4px 8px;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 12px;
  color: #cccccc;
  font-size: 12px;
  cursor: pointer;
}

.tag-chip:hover {
  background: #3e3e42;
}

.tag-chip.active {
  background: #094771;
  border-color: #007acc;
}

/* Knowledge List */
.knowledge-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: #1e1e1e;
}

.category-section {
  margin-bottom: 8px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
}

.category-header:hover {
  background: #2d2d30;
}

.category-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.category-count {
  font-size: 11px;
  color: #858585;
  background: #2d2d30;
  padding: 2px 6px;
  border-radius: 10px;
}

.category-entries {
  margin-left: 20px;
  margin-top: 4px;
}

.knowledge-entry {
  padding: 8px 12px;
  margin-bottom: 2px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
}

.knowledge-entry:hover {
  background: #2d2d30;
}

.knowledge-entry.active {
  background: #094771;
  border-color: #007acc;
}

.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.entry-title {
  font-size: 13px;
  font-weight: 500;
}

.priority-icon {
  color: #dcdcaa;
}

.title-edit-input {
  background: transparent;
  border: 1px solid #007acc;
  border-radius: 2px;
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
  padding: 2px 4px;
  width: 100%;
  max-width: 200px;
}

.title-edit-input:focus {
  outline: none;
  background: #2d2d30;
}

.entry-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #858585;
}

.entry-tags {
  display: flex;
  gap: 4px;
}

.mini-tag {
  background: #2d2d30;
  padding: 1px 4px;
  border-radius: 3px;
}

.more-tags {
  color: #007acc;
}

/* Editor Section */
.editor-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
  gap: 12px;
}

.title-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 18px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
}

.title-input:hover {
  background: #2d2d30;
}

.title-input:focus {
  outline: none;
  background: #2d2d30;
}

.editor-actions {
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
}

.icon-button:hover {
  background: #2d2d30;
}

.icon-button.danger:hover {
  background: #5a1d1d;
  color: #f48771;
}

/* Metadata */
.editor-metadata {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d30;
  background: #252526;
}

.metadata-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metadata-item label {
  font-size: 12px;
  color: #858585;
}

.metadata-item select {
  padding: 4px 8px;
  background: #3c3c3c;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
}

.metadata-item select:focus {
  outline: none;
  border-color: #007acc;
}

.tags-input {
  flex: 1;
}

.tags-wrapper {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 8px;
  background: #3c3c3c;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  min-height: 32px;
}

.tag-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #094771;
  border-radius: 12px;
  font-size: 12px;
}

.tag-badge svg {
  cursor: pointer;
}

.tag-badge svg:hover {
  color: #f48771;
}

.tag-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 12px;
  min-width: 100px;
}

.tag-input:focus {
  outline: none;
}

/* Editor Container */
.editor-container {
  flex: 1;
  overflow: hidden;
}

.preview-container {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.markdown-preview {
  max-width: 800px;
  margin: 0 auto;
}

/* Empty States */
.empty-state,
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
  margin: 0 0 16px;
  font-size: 14px;
}

/* Markdown Preview Styles */
.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview h4,
.markdown-preview h5,
.markdown-preview h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-preview h1 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #3e3e42;
}

.markdown-preview h2 {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #3e3e42;
}

.markdown-preview h3 {
  font-size: 1.25em;
}

.markdown-preview p {
  margin-bottom: 16px;
  line-height: 1.6;
}

.markdown-preview code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: #3c3c3c;
  border-radius: 3px;
}

.markdown-preview pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background-color: #1e1e1e;
  border-radius: 6px;
  border: 1px solid #3e3e42;
}

.markdown-preview pre code {
  display: inline;
  padding: 0;
  margin: 0;
  overflow: visible;
  line-height: inherit;
  word-wrap: normal;
  background-color: transparent;
  border: 0;
}

.markdown-preview ul,
.markdown-preview ol {
  padding-left: 2em;
  margin-bottom: 16px;
}

.markdown-preview li {
  margin-bottom: 4px;
}

.markdown-preview blockquote {
  padding: 0 1em;
  color: #858585;
  border-left: 0.25em solid #3e3e42;
  margin: 0 0 16px;
}

.markdown-preview table {
  display: block;
  width: 100%;
  overflow: auto;
  margin-bottom: 16px;
  border-spacing: 0;
  border-collapse: collapse;
}

.markdown-preview table th,
.markdown-preview table td {
  padding: 6px 13px;
  border: 1px solid #3e3e42;
}

.markdown-preview table th {
  font-weight: 600;
  background-color: #252526;
}

.markdown-preview table tr:nth-child(2n) {
  background-color: #252526;
}

.markdown-preview a {
  color: #40a9ff;
  text-decoration: none;
}

.markdown-preview a:hover {
  text-decoration: underline;
}
</style>