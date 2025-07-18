<template>
  <div v-if="isKnowledgeFile" class="knowledge-metadata-bar">
    <div class="metadata-container">
      <div class="metadata-item">
        <label>Category:</label>
        <select v-model="category" @change="updateMetadata">
          <option v-for="cat in knowledgeStore.categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
      </div>
      
      <div class="metadata-item">
        <label>Priority:</label>
        <select v-model="priority" @change="updateMetadata">
          <option value="">None</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div class="metadata-item tags-input">
        <label>Tags:</label>
        <div class="tags-wrapper">
          <span
            v-for="tag in tags"
            :key="tag"
            class="tag-badge"
          >
            {{ tag }}
            <Icon name="mdi:close" size="14" @click="removeTag(tag)" />
          </span>
          <input
            v-model="newTag"
            @keydown.enter="addTag"
            @keydown.comma.prevent="addTag"
            placeholder="Add tag..."
            class="tag-input"
          />
        </div>
      </div>
      
      <div class="metadata-item related-files">
        <label>Related Files:</label>
        <button @click="showFileSelector" class="add-file-button">
          <Icon name="mdi:file-link" size="16" />
          Add
        </button>
        <span v-if="relatedFiles.length > 0" class="file-count">
          {{ relatedFiles.length }} linked
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useTasksStore } from '~/stores/tasks';
import matter from 'gray-matter';

const editorStore = useEditorStore();
const knowledgeStore = useKnowledgeStore();

// State
const category = ref('notes');
const priority = ref<'high' | 'medium' | 'low' | ''>('');
const tags = ref<string[]>([]);
const newTag = ref('');
const relatedFiles = ref<string[]>([]);
const title = ref('');

// Computed
const activeTab = computed(() => editorStore.activeTab);
const isKnowledgeFile = computed(() => {
  if (!activeTab.value) return false;
  return activeTab.value.path.includes('/.claude/knowledge/');
});

// Parse frontmatter from active file content
const parseFrontmatter = () => {
  if (!activeTab.value || !isKnowledgeFile.value) return;
  
  try {
    const { data } = matter(activeTab.value.content);
    title.value = data.title || '';
    category.value = data.category || 'notes';
    priority.value = data.priority || '';
    tags.value = data.tags || [];
    relatedFiles.value = data.relatedFiles || [];
  } catch (error) {
    console.error('Failed to parse frontmatter:', error);
  }
};

// Update the file content with new frontmatter
const updateMetadata = async () => {
  if (!activeTab.value || !isKnowledgeFile.value) return;
  
  try {
    const { content, data } = matter(activeTab.value.content);
    
    // Update frontmatter data
    const updatedData: any = {
      ...data,
      category: category.value,
      tags: tags.value,
      updated: new Date().toISOString()
    };
    
    // Only add priority if it has a value
    if (priority.value) {
      updatedData.priority = priority.value;
    } else {
      delete updatedData.priority;
    }
    
    if (relatedFiles.value.length > 0) {
      updatedData.relatedFiles = relatedFiles.value;
    } else {
      delete updatedData.relatedFiles;
    }
    
    // Create new markdown with updated frontmatter
    const newContent = matter.stringify(content, updatedData);
    
    // Update editor content
    editorStore.updateTabContent(activeTab.value.id, newContent);
    
    // Save the file
    await editorStore.saveTab(activeTab.value.id);
    
    // Refresh knowledge entries to reflect changes
    await knowledgeStore.refreshEntries();
  } catch (error) {
    console.error('Failed to update metadata:', error);
  }
};

const addTag = () => {
  if (newTag.value.trim()) {
    const tag = newTag.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tags.value.includes(tag)) {
      tags.value.push(tag);
      updateMetadata();
    }
    newTag.value = '';
  }
};

const removeTag = (tag: string) => {
  const index = tags.value.indexOf(tag);
  if (index > -1) {
    tags.value.splice(index, 1);
    updateMetadata();
  }
};

const showFileSelector = () => {
  // Get workspace path from tasks store
  const tasksStore = useTasksStore();
  const workspacePath = tasksStore.projectPath;
  
  if (!workspacePath) {
    console.error('No workspace path available for file selection');
    return;
  }
  
  // Emit event to show file selector
  window.dispatchEvent(new CustomEvent('show-file-selector', {
    detail: {
      workspacePath,
      currentSelection: relatedFiles.value,
      onSelect: (files: string[]) => {
        relatedFiles.value = [...new Set([...relatedFiles.value, ...files])];
        updateMetadata();
      }
    }
  }));
};

// Watch for active tab changes
watch(activeTab, () => {
  if (isKnowledgeFile.value) {
    parseFrontmatter();
  }
});

// Watch for content changes to re-parse frontmatter
watch(() => activeTab.value?.content, (newContent, oldContent) => {
  if (isKnowledgeFile.value && newContent !== oldContent) {
    const oldTitle = title.value;
    parseFrontmatter();
    
    // If title changed, refresh knowledge entries
    if (title.value !== oldTitle && title.value) {
      knowledgeStore.refreshEntries();
    }
  }
});

// Initialize
onMounted(() => {
  if (isKnowledgeFile.value) {
    parseFrontmatter();
  }
});
</script>

<style scoped>
.knowledge-metadata-bar {
  background: #252526;
  border-bottom: 1px solid #2d2d30;
  padding: 8px 16px;
}

.metadata-container {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.metadata-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metadata-item label {
  font-size: 12px;
  color: #858585;
  white-space: nowrap;
}

.metadata-item select {
  padding: 4px 8px;
  background: #3c3c3c;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
  min-width: 100px;
}

.metadata-item select:focus {
  outline: none;
  border-color: #007acc;
}

.tags-input {
  flex: 1;
  min-width: 200px;
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
  min-height: 28px;
  flex: 1;
}

.tag-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #094771;
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
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
  min-width: 80px;
}

.tag-input:focus {
  outline: none;
}

.related-files {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-file-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #3c3c3c;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
  cursor: pointer;
}

.add-file-button:hover {
  background: #4a4a4a;
  border-color: #4a4a4a;
}

.file-count {
  font-size: 11px;
  color: #858585;
}
</style>