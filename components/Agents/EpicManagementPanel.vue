<template>
  <div class="epic-management-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <h3>Epic Management</h3>
        <span class="badge">{{ epics.length }} Epics</span>
      </div>
      <div class="header-right">
        <button @click="showCreateEpic = true" class="btn-primary">
          <Icon name="mdi:plus" /> New Epic
        </button>
        <button @click="decomposeSelectedEpic" class="btn-secondary" :disabled="!selectedEpic">
          <Icon name="mdi:auto-fix" /> AI Decompose
        </button>
      </div>
    </div>

    <!-- Epic List -->
    <div class="panel-content">
      <div class="epic-list">
        <div 
          v-for="epic in epics" 
          :key="epic.id"
          class="epic-card"
          :class="{ selected: selectedEpic?.id === epic.id }"
          @click="selectEpic(epic)"
        >
          <div class="epic-header">
            <span class="epic-title">{{ epic.title }}</span>
            <span class="epic-status" :class="`status-${epic.status}`">
              {{ epic.status }}
            </span>
          </div>
          
          <div class="epic-meta">
            <span class="priority" :class="`priority-${epic.priority}`">
              <Icon name="mdi:flag" /> {{ epic.priority }}
            </span>
            <span class="story-count">
              <Icon name="mdi:book-open-variant" /> {{ epic.storyIds?.length || 0 }} stories
            </span>
          </div>
          
          <div class="epic-value">
            {{ epic.businessValue }}
          </div>
          
          <div class="epic-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${getEpicProgress(epic)}%` }"
              ></div>
            </div>
            <span class="progress-text">{{ getEpicProgress(epic) }}%</span>
          </div>
        </div>
      </div>

      <!-- Story Details -->
      <div v-if="selectedEpic" class="story-section">
        <div class="section-header">
          <h4>Stories for: {{ selectedEpic.title }}</h4>
          <button @click="showCreateStory = true" class="btn-small">
            <Icon name="mdi:plus" /> Add Story
          </button>
        </div>
        
        <div class="story-list">
          <div 
            v-for="story in getStoriesByEpic(selectedEpic.id)" 
            :key="story.id"
            class="story-card"
          >
            <div class="story-header">
              <span class="story-title">{{ story.title }}</span>
              <span class="story-status" :class="`status-${story.status}`">
                {{ story.status }}
              </span>
            </div>
            
            <div class="story-user">
              {{ story.userStory }}
            </div>
            
            <div class="story-meta">
              <span class="task-count">
                <Icon name="mdi:checkbox-marked" /> {{ story.taskIds?.length || 0 }} tasks
              </span>
              <button @click="createTasksForStory(story)" class="btn-tiny">
                <Icon name="mdi:plus" /> Add Tasks
              </button>
            </div>
            
            <!-- Story Tasks -->
            <div v-if="story.taskIds?.length > 0" class="story-tasks">
              <div 
                v-for="task in getTasksByStory(story.id)" 
                :key="task.id"
                class="task-item"
              >
                <Icon :name="getTaskIcon(task.status)" />
                <span class="task-content">{{ task.content }}</span>
                <span class="task-priority" :class="`priority-${task.priority}`">
                  {{ task.priority }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Epic Modal -->
    <Teleport to="body">
      <div v-if="showCreateEpic" class="modal-overlay" @click="showCreateEpic = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Create New Epic</h3>
            <button @click="showCreateEpic = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="form-group">
              <label>Epic Title</label>
              <input 
                v-model="newEpic.title" 
                type="text" 
                placeholder="e.g., User Authentication System"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Business Value</label>
              <textarea 
                v-model="newEpic.businessValue" 
                placeholder="Describe the business value this epic delivers..."
                class="form-textarea"
                rows="3"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label>Description</label>
              <textarea 
                v-model="newEpic.description" 
                placeholder="Detailed description of the epic..."
                class="form-textarea"
                rows="4"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label>Priority</label>
              <select v-model="newEpic.priority" class="form-select">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Acceptance Criteria</label>
              <textarea 
                v-model="acceptanceCriteriaText" 
                placeholder="Enter acceptance criteria (one per line)"
                class="form-textarea"
                rows="4"
              ></textarea>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showCreateEpic = false" class="btn-secondary">
              Cancel
            </button>
            <button @click="createEpic" class="btn-primary" :disabled="!newEpic.title">
              Create Epic
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Create Story Modal -->
    <Teleport to="body">
      <div v-if="showCreateStory" class="modal-overlay" @click="showCreateStory = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Create New Story</h3>
            <button @click="showCreateStory = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="form-group">
              <label>Story Title</label>
              <input 
                v-model="newStory.title" 
                type="text" 
                placeholder="e.g., User Registration"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>User Story</label>
              <textarea 
                v-model="newStory.userStory" 
                placeholder="As a [user], I want [feature], so that [benefit]"
                class="form-textarea"
                rows="2"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label>Description</label>
              <textarea 
                v-model="newStory.description" 
                placeholder="Detailed description..."
                class="form-textarea"
                rows="3"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label>Priority</label>
              <select v-model="newStory.priority" class="form-select">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Acceptance Criteria</label>
              <textarea 
                v-model="storyAcceptanceCriteriaText" 
                placeholder="Enter acceptance criteria (one per line)"
                class="form-textarea"
                rows="3"
              ></textarea>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showCreateStory = false" class="btn-secondary">
              Cancel
            </button>
            <button @click="createStory" class="btn-primary" :disabled="!newStory.title">
              Create Story
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useAgentOrchestrationStore } from '~/stores/agent-orchestration-client';

const tasksStore = useTasksStore();
const orchestrationStore = useAgentOrchestrationStore();

// State
const showCreateEpic = ref(false);
const showCreateStory = ref(false);
const selectedEpic = ref(null);
const acceptanceCriteriaText = ref('');
const storyAcceptanceCriteriaText = ref('');

const newEpic = ref({
  title: '',
  description: '',
  businessValue: '',
  priority: 'normal' as 'low' | 'normal' | 'high' | 'critical',
  status: 'backlog' as any
});

const newStory = ref({
  title: '',
  description: '',
  userStory: '',
  priority: 'normal' as 'low' | 'normal' | 'high' | 'critical',
  status: 'backlog' as any,
  dependencies: [] as string[]
});

// Computed
const epics = computed(() => tasksStore.epics);
const getStoriesByEpic = (epicId: string) => tasksStore.getStoriesByEpic(epicId);
const getTasksByStory = (storyId: string) => tasksStore.getTasksByStory(storyId);

// Methods
function selectEpic(epic: any) {
  selectedEpic.value = epic;
}

function getEpicProgress(epic: any): number {
  const stories = tasksStore.getStoriesByEpic(epic.id);
  if (stories.length === 0) return 0;
  
  const completedStories = stories.filter(s => s.status === 'done').length;
  return Math.round((completedStories / stories.length) * 100);
}

function getTaskIcon(status: string): string {
  switch (status) {
    case 'completed': return 'mdi:checkbox-marked-circle';
    case 'in_progress': return 'mdi:progress-clock';
    case 'pending': return 'mdi:checkbox-blank-circle-outline';
    default: return 'mdi:checkbox-blank-outline';
  }
}

async function createEpic() {
  if (!newEpic.value.title) return;
  
  const acceptanceCriteria = acceptanceCriteriaText.value
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.trim());
  
  const epic = tasksStore.createEpic({
    ...newEpic.value,
    acceptanceCriteria
  });
  
  // If agent orchestration is available, create in agent system too
  if (orchestrationStore.isInitialized && window.electronAPI?.agent) {
    try {
      await window.electronAPI.agent.executeTask('createEpic', {
        epic: {
          title: epic.title,
          description: epic.description,
          businessValue: epic.businessValue,
          acceptanceCriteria: epic.acceptanceCriteria,
          status: epic.status,
          priority: epic.priority
        }
      });
    } catch (error) {
      console.error('Failed to create epic in agent system:', error);
    }
  }
  
  // Reset form
  newEpic.value = {
    title: '',
    description: '',
    businessValue: '',
    priority: 'normal',
    status: 'backlog'
  };
  acceptanceCriteriaText.value = '';
  showCreateEpic.value = false;
  
  // Select the new epic
  selectedEpic.value = epic;
}

async function createStory() {
  if (!newStory.value.title || !selectedEpic.value) return;
  
  const acceptanceCriteria = storyAcceptanceCriteriaText.value
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.trim());
  
  const story = tasksStore.createStory({
    ...newStory.value,
    epicId: selectedEpic.value.id,
    acceptanceCriteria
  });
  
  // If agent orchestration is available, create in agent system too
  if (orchestrationStore.isInitialized && window.electronAPI?.agent) {
    try {
      await window.electronAPI.agent.executeTask('createStory', {
        epicId: selectedEpic.value.id,
        story: {
          title: story.title,
          description: story.description,
          userStory: story.userStory,
          acceptanceCriteria: story.acceptanceCriteria,
          status: story.status,
          priority: story.priority
        }
      });
    } catch (error) {
      console.error('Failed to create story in agent system:', error);
    }
  }
  
  // Reset form
  newStory.value = {
    title: '',
    description: '',
    userStory: '',
    priority: 'normal',
    status: 'backlog',
    dependencies: []
  };
  storyAcceptanceCriteriaText.value = '';
  showCreateStory.value = false;
}

async function decomposeSelectedEpic() {
  if (!selectedEpic.value) return;
  
  if (!orchestrationStore.isInitialized) {
    alert('Agent orchestration not initialized. Please wait...');
    return;
  }
  
  try {
    // Call agent system to decompose epic using AI
    const result = await window.electronAPI.agent.executeTask('decomposeEpic', {
      epicId: selectedEpic.value.id
    });
    
    if (result.success && result.decomposition) {
      // Create suggested stories
      for (const suggestedStory of result.decomposition.suggestedStories) {
        tasksStore.createStory({
          epicId: selectedEpic.value.id,
          title: suggestedStory.title,
          description: suggestedStory.description,
          userStory: suggestedStory.userStory,
          acceptanceCriteria: suggestedStory.acceptanceCriteria,
          status: 'backlog',
          priority: suggestedStory.priority,
          dependencies: suggestedStory.dependencies
        });
      }
      
      alert(`Created ${result.decomposition.suggestedStories.length} stories for epic "${selectedEpic.value.title}"`);
    }
  } catch (error) {
    console.error('Failed to decompose epic:', error);
    alert('Failed to decompose epic. Please try again.');
  }
}

function createTasksForStory(story: any) {
  // Navigate to Kanban board with story pre-selected
  // This would be implemented with router navigation
  alert(`Navigate to Kanban board to create tasks for story: ${story.title}`);
}

// Lifecycle
onMounted(async () => {
  // Connect to agent hierarchy if available
  await tasksStore.connectToHierarchy();
});
</script>

<style scoped>
.epic-management-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #181818;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.badge {
  padding: 2px 8px;
  background: #007acc;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.header-right {
  display: flex;
  gap: 8px;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  gap: 16px;
}

.epic-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 300px;
}

.epic-card {
  padding: 12px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.epic-card:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.epic-card.selected {
  border-color: #007acc;
  background: #2d2d30;
}

.epic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.epic-title {
  font-weight: 600;
  font-size: 13px;
  color: #ffffff;
}

.epic-status {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.status-backlog { background: #3c3c3c; color: #999; }
.status-ready { background: rgba(0, 122, 204, 0.2); color: #007acc; }
.status-in_progress { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
.status-done { background: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
.status-blocked { background: rgba(205, 49, 49, 0.2); color: #cd3131; }

.epic-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 11px;
}

.priority {
  display: flex;
  align-items: center;
  gap: 4px;
}

.priority-low { color: #999; }
.priority-normal { color: #cccccc; }
.priority-high { color: #ffc107; }
.priority-critical { color: #cd3131; }

.story-count {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #999;
}

.epic-value {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
  line-height: 1.4;
}

.epic-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: #3c3c3c;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #007acc;
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: #999;
  font-weight: 600;
}

.story-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 400px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h4 {
  margin: 0;
  font-size: 13px;
  color: #ffffff;
}

.story-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-card {
  padding: 12px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
}

.story-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.story-title {
  font-weight: 500;
  font-size: 13px;
  color: #cccccc;
}

.story-status {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.story-user {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
  font-style: italic;
}

.story-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.task-count {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #999;
}

.story-tasks {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: #1e1e1e;
  border-radius: 4px;
  font-size: 12px;
}

.task-content {
  flex: 1;
  color: #cccccc;
}

.task-priority {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

/* Button styles */
.btn-primary,
.btn-secondary,
.btn-small,
.btn-tiny,
.btn-icon {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #005a9e;
}

.btn-secondary {
  background: #3c3c3c;
  color: #cccccc;
}

.btn-secondary:hover:not(:disabled) {
  background: #4c4c4c;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-small {
  padding: 4px 8px;
  font-size: 11px;
}

.btn-tiny {
  padding: 2px 6px;
  font-size: 10px;
}

.btn-icon {
  padding: 4px;
  background: transparent;
  color: #cccccc;
}

.btn-icon:hover {
  background: #3c3c3c;
}

/* Modal styles */
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
}

.modal-content {
  background: #1e1e1e;
  border-radius: 6px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
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
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 12px;
  color: #cccccc;
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: #007acc;
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #181818;
  background: #252526;
}
</style>