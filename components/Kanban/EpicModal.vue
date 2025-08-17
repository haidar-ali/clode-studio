<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ editing ? 'Edit Epic' : 'Create New Epic' }}</h3>
          <button @click="closeModal" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>
        
        <form @submit.prevent="saveEpic" class="modal-form">
          <!-- Epic Title -->
          <div class="form-group">
            <label for="epic-title">Epic Title *</label>
            <input
              id="epic-title"
              v-model="form.title"
              type="text"
              required
              placeholder="e.g., User Authentication System"
              class="form-input"
            />
          </div>
          
          <!-- Epic Description -->
          <div class="form-group">
            <label for="epic-description">Description</label>
            <textarea
              id="epic-description"
              v-model="form.description"
              rows="3"
              placeholder="Detailed description of the epic..."
              class="form-textarea"
            ></textarea>
          </div>
          
          <!-- Business Value -->
          <div class="form-group">
            <label for="epic-business-value">Business Value *</label>
            <textarea
              id="epic-business-value"
              v-model="form.businessValue"
              rows="2"
              required
              placeholder="Describe the business value this epic delivers..."
              class="form-textarea"
            ></textarea>
          </div>
          
          <!-- Priority and Status -->
          <div class="form-row">
            <div class="form-group">
              <label for="epic-priority">Priority</label>
              <select id="epic-priority" v-model="form.priority" class="form-select">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="epic-status">Status</label>
              <select id="epic-status" v-model="form.status" class="form-select">
                <option value="backlog">Backlog</option>
                <option value="ready">Ready</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          
          <!-- Acceptance Criteria -->
          <div class="form-group">
            <label for="epic-acceptance-criteria">Acceptance Criteria</label>
            <div class="criteria-editor">
              <textarea
                id="epic-acceptance-criteria"
                v-model="acceptanceCriteriaText"
                rows="4"
                placeholder="Enter acceptance criteria (one per line)&#10;- Users can register with email and password&#10;- Password reset functionality works&#10;- Two-factor authentication is available"
                class="form-textarea"
              ></textarea>
              <small class="field-hint">Enter each criterion on a new line</small>
            </div>
          </div>
          
          <!-- Tags -->
          <div class="form-group">
            <label for="epic-tags">Tags</label>
            <div class="tags-input">
              <div class="tags-list">
                <span 
                  v-for="(tag, index) in form.tags" 
                  :key="index"
                  class="tag"
                >
                  {{ tag }}
                  <button 
                    type="button" 
                    @click="removeTag(index)"
                    class="tag-remove"
                  >
                    <Icon name="mdi:close" size="12" />
                  </button>
                </span>
              </div>
              <input
                v-model="newTag"
                @keydown.enter.prevent="addTag"
                @keydown.comma.prevent="addTag"
                placeholder="Add tags (press Enter or comma)"
                class="tag-input"
              />
            </div>
          </div>
          
          <!-- Estimation -->
          <div class="form-row">
            <div class="form-group">
              <label for="epic-story-points">Estimated Story Points</label>
              <input
                id="epic-story-points"
                v-model.number="form.estimatedStoryPoints"
                type="number"
                min="0"
                placeholder="e.g., 50"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label for="epic-timeline">Target Timeline</label>
              <input
                id="epic-timeline"
                v-model="form.targetTimeline"
                type="text"
                placeholder="e.g., 2-3 sprints, Q1 2025"
                class="form-input"
              />
            </div>
          </div>
          
          <!-- Dependencies -->
          <div class="form-group">
            <label>Dependencies</label>
            <div class="dependencies-section">
              <button 
                type="button" 
                @click="showDependencySelector = true" 
                class="add-dependency-button"
              >
                <Icon name="mdi:plus" />
                Add Dependency
              </button>
              
              <div v-if="form.dependencies.length > 0" class="dependencies-list">
                <div 
                  v-for="(dep, index) in form.dependencies" 
                  :key="index"
                  class="dependency-item"
                >
                  <Icon name="mdi:arrow-right" />
                  <span class="dependency-name">{{ dep }}</span>
                  <button 
                    type="button" 
                    @click="removeDependency(index)" 
                    class="remove-dependency"
                  >
                    <Icon name="mdi:close" size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Form Actions -->
          <div class="form-actions">
            <button type="button" @click="closeModal" class="cancel-button">
              Cancel
            </button>
            <button 
              type="submit" 
              class="save-button"
              :disabled="!form.title || !form.businessValue"
            >
              {{ editing ? 'Update Epic' : 'Create Epic' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';

interface Epic {
  id?: string;
  title: string;
  description: string;
  businessValue: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
  acceptanceCriteria: string[];
  tags?: string[];
  estimatedStoryPoints?: number;
  targetTimeline?: string;
  dependencies: string[];
}

const props = defineProps<{
  isOpen: boolean;
  epic?: Epic | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [epic: Epic];
}>();

const editing = computed(() => props.epic !== null);

const form = ref<Epic>({
  title: '',
  description: '',
  businessValue: '',
  priority: 'normal',
  status: 'backlog',
  acceptanceCriteria: [],
  tags: [],
  estimatedStoryPoints: undefined,
  targetTimeline: '',
  dependencies: []
});

const acceptanceCriteriaText = ref('');
const newTag = ref('');
const showDependencySelector = ref(false);

// Watch for epic prop changes to populate form
watch(() => props.epic, (epic) => {
  if (epic) {
    form.value = {
      ...epic,
      tags: epic.tags || [],
      dependencies: epic.dependencies || []
    };
    acceptanceCriteriaText.value = epic.acceptanceCriteria.join('\n');
  } else {
    resetForm();
  }
}, { immediate: true });

// Watch for modal open/close to reset form
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen && !editing.value) {
    resetForm();
  }
});

const resetForm = () => {
  form.value = {
    title: '',
    description: '',
    businessValue: '',
    priority: 'normal',
    status: 'backlog',
    acceptanceCriteria: [],
    tags: [],
    estimatedStoryPoints: undefined,
    targetTimeline: '',
    dependencies: []
  };
  acceptanceCriteriaText.value = '';
  newTag.value = '';
};

const closeModal = () => {
  emit('close');
};

const saveEpic = () => {
  if (!form.value.title || !form.value.businessValue) return;
  
  // Parse acceptance criteria from text
  const criteria = acceptanceCriteriaText.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^[-*]\s*/, '')); // Remove leading bullets
  
  const epic: Epic = {
    ...form.value,
    acceptanceCriteria: criteria
  };
  
  emit('save', epic);
  closeModal();
};

const addTag = () => {
  const tag = newTag.value.trim().replace(',', '');
  if (tag && !form.value.tags!.includes(tag)) {
    form.value.tags!.push(tag);
    newTag.value = '';
  }
};

const removeTag = (index: number) => {
  form.value.tags!.splice(index, 1);
};

const removeDependency = (index: number) => {
  form.value.dependencies.splice(index, 1);
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

.modal-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 13px;
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
  font-size: 14px;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.form-textarea {
  resize: vertical;
  line-height: 1.4;
}

.field-hint {
  font-size: 11px;
  color: #858585;
  margin-top: 4px;
  display: block;
}

.criteria-editor {
  position: relative;
}

.tags-input {
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  background: #3c3c3c;
  padding: 8px;
  min-height: 40px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tags-input:focus-within {
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #007acc;
  color: #ffffff;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.tag-remove {
  background: none;
  border: none;
  color: #ffffff;
  cursor: pointer;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tag-remove:hover {
  opacity: 0.7;
}

.tag-input {
  background: none;
  border: none;
  outline: none;
  color: #d4d4d4;
  font-size: 14px;
  flex: 1;
  min-width: 120px;
}

.tag-input::placeholder {
  color: #858585;
}

.dependencies-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-dependency-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #3e3e42;
  border: 1px dashed #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  align-self: flex-start;
}

.add-dependency-button:hover {
  background: #4e4e52;
  border-style: solid;
}

.dependencies-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dependency-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  font-size: 13px;
}

.dependency-name {
  flex: 1;
  color: #d4d4d4;
}

.remove-dependency {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  transition: all 0.2s;
}

.remove-dependency:hover {
  background: #f14c4c33;
  color: #f14c4c;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #181818;
}

.cancel-button,
.save-button {
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

.save-button {
  background: #007acc;
  color: white;
}

.save-button:hover:not(:disabled) {
  background: #005a9e;
}

.save-button:disabled {
  background: #3e3e42;
  color: #858585;
  cursor: not-allowed;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .modal-overlay {
    padding: 10px;
  }
  
  .modal-content {
    max-width: 100%;
    max-height: 95vh;
  }
  
  .modal-header {
    padding: 12px 16px;
  }
  
  .modal-header h3 {
    font-size: 15px;
  }
  
  .modal-form {
    padding: 16px;
  }
  
  .form-group {
    margin-bottom: 14px;
  }
  
  .form-row {
    flex-direction: column;
    gap: 14px;
    margin-bottom: 14px;
  }
  
  .form-group label {
    font-size: 12px;
  }
  
  .form-input,
  .form-textarea,
  .form-select {
    font-size: 13px;
    padding: 6px 10px;
  }
  
  .field-hint {
    font-size: 10px;
  }
  
  .tags-input {
    padding: 6px;
    min-height: 36px;
  }
  
  .tag {
    font-size: 11px;
    padding: 3px 6px;
  }
  
  .tag-input {
    font-size: 13px;
    min-width: 100px;
  }
  
  .dependencies-section {
    gap: 10px;
  }
  
  .add-dependency-button {
    padding: 6px 12px;
    font-size: 12px;
  }
  
  .dependency-item {
    padding: 6px 10px;
    font-size: 12px;
  }
  
  .form-actions {
    margin-top: 20px;
    padding-top: 14px;
    flex-direction: column;
    gap: 8px;
  }
  
  .cancel-button,
  .save-button {
    font-size: 13px;
    padding: 6px 14px;
  }
}

@media (max-width: 480px) {
  .modal-overlay {
    padding: 5px;
  }
  
  .modal-content {
    max-height: 98vh;
  }
  
  .modal-header {
    padding: 10px 12px;
  }
  
  .modal-header h3 {
    font-size: 14px;
  }
  
  .modal-form {
    padding: 12px;
  }
  
  .form-group {
    margin-bottom: 12px;
  }
  
  .form-row {
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .form-group label {
    font-size: 11px;
  }
  
  .form-input,
  .form-textarea,
  .form-select {
    font-size: 12px;
    padding: 5px 8px;
  }
  
  .field-hint {
    font-size: 9px;
  }
  
  .tags-input {
    padding: 5px;
    min-height: 32px;
  }
  
  .tag {
    font-size: 10px;
    padding: 2px 5px;
  }
  
  .tag-input {
    font-size: 12px;
    min-width: 80px;
  }
  
  .add-dependency-button {
    padding: 5px 10px;
    font-size: 11px;
  }
  
  .dependency-item {
    padding: 5px 8px;
    font-size: 11px;
  }
  
  .form-actions {
    margin-top: 16px;
    padding-top: 12px;
  }
  
  .cancel-button,
  .save-button {
    font-size: 12px;
    padding: 5px 12px;
  }
}
</style>