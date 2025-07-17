<template>
  <div class="personality-selector" ref="selectorRef">
    <div class="dropdown-trigger" @click="toggleDropdown">
      <Icon :name="currentPersonality?.icon || 'mdi:account-outline'" size="16" />
      <span>{{ currentPersonality?.name || 'No Personality' }}</span>
      <Icon name="mdi:chevron-down" size="16" />
    </div>
    
    <Transition name="dropdown">
      <div v-if="showDropdown" class="dropdown-menu" @click.stop>
        <div class="dropdown-header">
          <h4>Select Personality</h4>
          <button @click="showCustomDialog = true" class="icon-button" title="Create custom personality">
            <Icon name="mdi:plus" size="16" />
          </button>
        </div>
        
        <div class="dropdown-item" @click="selectPersonality(undefined)">
          <Icon name="mdi:account-outline" size="16" />
          <div class="item-content">
            <div class="item-name">No Personality</div>
            <div class="item-description">Default Claude behavior</div>
          </div>
          <Icon v-if="!currentPersonalityId" name="mdi:check" size="16" class="check-icon" />
        </div>
        
        <div class="dropdown-divider"></div>
        
        <div
          v-for="personality in personalities"
          :key="personality.id"
          class="dropdown-item"
          @click="selectPersonality(personality.id)"
        >
          <Icon :name="personality.icon || 'mdi:account'" size="16" />
          <div class="item-content">
            <div class="item-name">{{ personality.name }}</div>
            <div class="item-description">{{ personality.description }}</div>
          </div>
          <Icon v-if="currentPersonalityId === personality.id" name="mdi:check" size="16" class="check-icon" />
        </div>
      </div>
    </Transition>
    
    <!-- Custom Personality Dialog -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showCustomDialog" class="modal-overlay" @click.self="closeCustomDialog">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Create Custom Personality</h3>
              <button @click="closeCustomDialog" class="icon-button">
                <Icon name="mdi:close" size="20" />
              </button>
            </div>
            
            <div class="modal-body">
              <div class="form-group">
                <label>Name</label>
                <input
                  v-model="customPersonality.name"
                  type="text"
                  placeholder="e.g., Frontend Expert"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Description</label>
                <input
                  v-model="customPersonality.description"
                  type="text"
                  placeholder="Brief description of this personality"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Instructions</label>
                <textarea
                  v-model="customPersonality.instructions"
                  placeholder="Detailed instructions for Claude to follow when using this personality..."
                  class="form-textarea"
                  rows="6"
                ></textarea>
              </div>
              
              <div class="form-group">
                <label>Icon (optional)</label>
                <div class="icon-picker">
                  <button
                    v-for="icon in iconOptions"
                    :key="icon"
                    @click="customPersonality.icon = icon"
                    :class="['icon-option', { selected: customPersonality.icon === icon }]"
                  >
                    <Icon :name="icon" size="20" />
                  </button>
                </div>
              </div>
            </div>
            
            <div class="modal-footer">
              <button @click="closeCustomDialog" class="button button-secondary">
                Cancel
              </button>
              <button @click="saveCustomPersonality" class="button button-primary" :disabled="!isValid">
                Create Personality
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { vClickOutside } from '~/directives/clickOutside';

const props = defineProps<{
  instanceId: string;
  currentPersonalityId?: string;
}>();

const emit = defineEmits<{
  update: [personalityId: string | undefined];
}>();

const instancesStore = useClaudeInstancesStore();

const showDropdown = ref(false);
const showCustomDialog = ref(false);

const customPersonality = ref({
  name: '',
  description: '',
  instructions: '',
  icon: 'mdi:account'
});

const iconOptions = [
  'mdi:account',
  'mdi:robot',
  'mdi:brain',
  'mdi:lightbulb-on-outline',
  'mdi:rocket-launch-outline',
  'mdi:palette-outline',
  'mdi:chart-line',
  'mdi:shield-check-outline',
  'mdi:book-open-page-variant-outline',
  'mdi:heart-outline'
];

const personalities = computed(() => instancesStore.personalitiesList);
const currentPersonality = computed(() => 
  props.currentPersonalityId ? instancesStore.getPersonalityById(props.currentPersonalityId) : null
);

const isValid = computed(() => 
  customPersonality.value.name.trim() && 
  customPersonality.value.description.trim() && 
  customPersonality.value.instructions.trim()
);

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value;
};

const selectPersonality = (personalityId: string | undefined) => {
  emit('update', personalityId);
  showDropdown.value = false;
};

const closeCustomDialog = () => {
  showCustomDialog.value = false;
  customPersonality.value = {
    name: '',
    description: '',
    instructions: '',
    icon: 'mdi:account'
  };
};

const saveCustomPersonality = async () => {
  if (!isValid.value) return;
  
  const id = await instancesStore.createCustomPersonality(customPersonality.value);
  selectPersonality(id);
  closeCustomDialog();
};

const selectorRef = ref<HTMLElement>();

const handleClickOutside = (event: MouseEvent) => {
  if (selectorRef.value && !selectorRef.value.contains(event.target as Node)) {
    showDropdown.value = false;
  }
};

onMounted(async () => {
  // Ensure store is initialized
  if (instancesStore.$state.personalities.size === 0) {
    await instancesStore.init();
  }
  
  // Add click outside listener
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.personality-selector {
  position: relative;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #383838;
  border: 1px solid #505050;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #cccccc;
  transition: all 0.2s;
  user-select: none;
}

.dropdown-trigger:hover {
  background: #404040;
  border-color: #606060;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #2d2d30;
  border: 1px solid #505050;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  min-width: 280px;
  max-width: 350px;
  z-index: 9999;
  overflow: visible;
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #404040;
}

.dropdown-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: #383838;
}

.item-content {
  flex: 1;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
}

.item-description {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.check-icon {
  color: #0dbc79;
}

.dropdown-divider {
  height: 1px;
  background: #404040;
  margin: 4px 0;
}

/* Modal Styles */
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
  z-index: 2000;
}

.modal-content {
  background: #2d2d30;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #404040;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #404040;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #505050;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #007acc;
  background: #252525;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}

.icon-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.icon-option {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #1e1e1e;
  border: 1px solid #505050;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-option:hover {
  background: #252525;
  border-color: #606060;
}

.icon-option.selected {
  background: #007acc;
  border-color: #007acc;
  color: white;
}

.button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.button-primary {
  background: #007acc;
  color: white;
}

.button-primary:hover:not(:disabled) {
  background: #0098ff;
}

.button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-secondary {
  background: #404040;
  color: #cccccc;
}

.button-secondary:hover {
  background: #505050;
}

/* Transitions */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9);
}
</style>