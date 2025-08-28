<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ title || 'Select a Story' }}</h3>
          <button @click="closeModal" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>
        
        <div class="modal-body">
          <div v-if="availableStories.length === 0" class="no-stories">
            <Icon name="mdi:information-outline" size="32" />
            <p>No stories available</p>
            <p class="hint">Create a story first to assign tasks to it</p>
          </div>
          
          <div v-else class="stories-list">
            <div class="filter-section">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search stories..."
                class="search-input"
              />
              
              <select v-model="filterEpic" class="filter-select">
                <option value="">All Epics</option>
                <option v-for="epic in epics" :key="epic.id" :value="epic.id">
                  {{ epic.title }}
                </option>
              </select>
            </div>
            
            <div class="stories-container">
              <div
                v-for="story in filteredStories"
                :key="story.id"
                class="story-item"
                :class="{ selected: selectedStoryId === story.id }"
                @click="selectStory(story)"
              >
                <div class="story-info">
                  <div class="story-header">
                    <h4 class="story-title">{{ story.title }}</h4>
                    <span class="story-status" :class="`status-${story.status}`">
                      {{ story.status }}
                    </span>
                  </div>
                  
                  <p v-if="story.description" class="story-description">
                    {{ story.description }}
                  </p>
                  
                  <div class="story-meta">
                    <span v-if="story.epicId" class="story-epic">
                      <Icon name="mdi:folder" size="12" />
                      {{ getEpicTitle(story.epicId) }}
                    </span>
                    <span class="story-tasks">
                      <Icon name="mdi:checkbox-marked-circle" size="12" />
                      {{ story.taskIds?.length || 0 }} tasks
                    </span>
                    <span v-if="story.storyPoints" class="story-points">
                      <Icon name="mdi:gauge" size="12" />
                      {{ story.storyPoints }} points
                    </span>
                  </div>
                </div>
                
                <div class="story-select">
                  <Icon 
                    :name="selectedStoryId === story.id ? 'mdi:radiobox-marked' : 'mdi:radiobox-blank'"
                    size="20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button @click="closeModal" class="cancel-button">
            Cancel
          </button>
          <button 
            @click="confirmSelection"
            :disabled="!selectedStoryId"
            class="confirm-button"
          >
            Assign to Story
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTasksStore } from '~/stores/tasks';

interface Story {
  id: string;
  title: string;
  description?: string;
  epicId?: string;
  status: string;
  taskIds?: string[];
  storyPoints?: number;
}

interface Epic {
  id: string;
  title: string;
}

const props = defineProps<{
  isOpen: boolean;
  title?: string;
  task?: any;
}>();

const emit = defineEmits<{
  close: [];
  select: [storyId: string];
}>();

const tasksStore = useTasksStore();

const searchQuery = ref('');
const filterEpic = ref('');
const selectedStoryId = ref<string | null>(null);

const availableStories = computed(() => tasksStore.stories || []);
const epics = computed(() => tasksStore.epics || []);

const filteredStories = computed(() => {
  let stories = availableStories.value;
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    stories = stories.filter(story => 
      story.title.toLowerCase().includes(query) ||
      story.description?.toLowerCase().includes(query)
    );
  }
  
  if (filterEpic.value) {
    stories = stories.filter(story => story.epicId === filterEpic.value);
  }
  
  return stories;
});

const getEpicTitle = (epicId: string) => {
  const epic = epics.value.find(e => e.id === epicId);
  return epic?.title || 'Unknown Epic';
};

const selectStory = (story: Story) => {
  selectedStoryId.value = story.id;
};

const confirmSelection = () => {
  if (selectedStoryId.value) {
    emit('select', selectedStoryId.value);
    closeModal();
  }
};

const closeModal = () => {
  selectedStoryId.value = null;
  searchQuery.value = '';
  filterEpic.value = '';
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 8px;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #181818;
  background: #252526;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.no-stories {
  text-align: center;
  padding: 40px 20px;
  color: #858585;
}

.no-stories p {
  margin: 8px 0;
}

.no-stories .hint {
  font-size: 12px;
  color: #6c6c6c;
}

.filter-section {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.filter-select {
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
  min-width: 150px;
}

.filter-select:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.stories-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.story-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.story-item:hover {
  background: #2d2d30;
  border-color: #4e4e52;
}

.story-item.selected {
  background: #094771;
  border-color: #007acc;
}

.story-info {
  flex: 1;
}

.story-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.story-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #d4d4d4;
}

.story-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: #3e3e42;
  color: #858585;
}

.story-status.status-in_progress {
  background: #094771;
  color: #75beff;
}

.story-status.status-done {
  background: #0e5a0e;
  color: #89d185;
}

.story-description {
  margin: 4px 0;
  font-size: 12px;
  color: #858585;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.story-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: #6c6c6c;
}

.story-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.story-select {
  color: #007acc;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #181818;
  background: #252526;
}

.cancel-button,
.confirm-button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.cancel-button {
  background: #3e3e42;
  color: #cccccc;
}

.cancel-button:hover {
  background: #4e4e52;
}

.confirm-button {
  background: #007acc;
  color: white;
}

.confirm-button:hover:not(:disabled) {
  background: #005a9e;
}

.confirm-button:disabled {
  background: #3e3e42;
  color: #858585;
  cursor: not-allowed;
}
</style>