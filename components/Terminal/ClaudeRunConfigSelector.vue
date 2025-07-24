<template>
  <div class="run-config-selector" ref="selectorRef">
    <div class="dropdown-trigger" @click="toggleDropdown">
      <Icon name="mdi:console" size="16" />
      <span>{{ activeConfig?.name || 'Default' }}</span>
      <Icon name="mdi:chevron-down" size="16" />
    </div>
    
    <Transition name="dropdown">
      <div v-if="showDropdown" class="dropdown-menu" @click.stop>
        <div class="dropdown-header">
          <h4>Run Configuration</h4>
          <button @click="openManager" class="icon-button" title="Manage configurations">
            <Icon name="mdi:cog" size="16" />
          </button>
        </div>
        
        <div
          v-for="config in configs"
          :key="config.id"
          class="dropdown-item"
          @click="selectConfig(config.id)"
        >
          <Icon name="mdi:console" size="16" />
          <div class="item-content">
            <div class="item-name">{{ config.name }}</div>
            <div class="item-description">{{ getCommandString(config) }}</div>
          </div>
          <Icon v-if="selectedConfigId === config.id" name="mdi:check" size="16" class="check-icon" />
        </div>
      </div>
    </Transition>

    <!-- Configuration Manager Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showManager" class="modal-overlay" @click.self="closeManager">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Manage Run Configurations</h3>
              <button @click="closeManager" class="icon-button">
                <Icon name="mdi:close" size="20" />
              </button>
            </div>

            <div class="modal-body">
              <!-- Configuration List -->
              <div class="config-list">
                <div 
                  v-for="config in configs" 
                  :key="config.id" 
                  class="config-item"
                  :class="{ active: config.id === selectedConfigId, default: config.isDefault, clickable: true }"
                  @click="handleConfigClick(config)"
                >
                  <div class="config-info">
                    <div class="config-name">
                      {{ config.name }}
                      <span v-if="config.isDefault" class="default-badge">Default</span>
                    </div>
                    <div class="config-command">{{ getCommandString(config) }}</div>
                  </div>
                  <div class="config-actions">
                    <button 
                      v-if="!config.isHardcoded"
                      @click.stop="deleteConfig(config.id)" 
                      class="icon-btn delete"
                      :disabled="configs.length === 1"
                      title="Delete"
                    >
                      <Icon name="mdi:delete" size="16" />
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Add Configuration Button -->
              <div v-if="!showForm" class="add-config-button-container">
                <button @click="showAddForm" class="add-config-button" type="button">
                  <Icon name="mdi:plus" size="20" />
                  Add Configuration
                </button>
              </div>

              <!-- Add/Edit Form -->
              <div v-if="showForm" class="config-form">
            <h4>{{ editingConfig?.isHardcoded ? 'Configuration Settings' : (editingConfig ? 'Edit Configuration' : 'Add Configuration') }}</h4>
            <form @submit.prevent="saveConfig">
              <div class="form-group">
                <label>Name</label>
                <input 
                  v-model="formData.name" 
                  type="text" 
                  required 
                  placeholder="e.g., Development Mode"
                  :readonly="editingConfig?.isHardcoded"
                  :class="{ readonly: editingConfig?.isHardcoded }"
                />
              </div>

              <div class="form-group">
                <label>Command</label>
                <input 
                  v-model="formData.command" 
                  type="text" 
                  required 
                  placeholder="claude"
                  :readonly="editingConfig?.isHardcoded"
                  :class="{ readonly: editingConfig?.isHardcoded }"
                />
              </div>

              <div class="form-group">
                <label>Arguments (one per line)</label>
                <textarea 
                  v-model="argsText" 
                  :placeholder="editingConfig?.isHardcoded ? '' : '--dangerously-skip-permissions\n--debug'"
                  rows="3"
                  :readonly="editingConfig?.isHardcoded"
                  :class="{ readonly: editingConfig?.isHardcoded }"
                ></textarea>
              </div>

              <div class="form-group checkbox">
                <label>
                  <input 
                    v-model="formData.isDefault" 
                    type="checkbox"
                  />
                  Set as default configuration
                </label>
              </div>

              <div class="form-actions">
                <button type="submit" class="save-btn">
                  {{ editingConfig?.isHardcoded ? 'Save Settings' : (editingConfig ? 'Update' : 'Add') }}
                </button>
                <button type="button" @click="resetForm" class="cancel-btn">
                  Cancel
                </button>
              </div>
            </form>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue';
import { useClaudeRunConfigsStore } from '~/stores/claude-run-configs';
import type { ClaudeRunConfig } from '~/stores/claude-run-configs';

const emit = defineEmits<{
  'config-changed': [config: ClaudeRunConfig]
}>();

const configStore = useClaudeRunConfigsStore();
const showDropdown = ref(false);
const showManager = ref(false);
const editingConfig = ref<ClaudeRunConfig | null>(null);
const showForm = ref(false);
const selectorRef = ref<HTMLElement>();


const formData = ref({
  name: '',
  command: 'claude',
  args: [] as string[],
  isDefault: false
});

const argsText = computed({
  get: () => formData.value.args.join('\n'),
  set: (value: string) => {
    formData.value.args = value
      .split('\n')
      .map(arg => arg.trim())
      .filter(arg => arg.length > 0);
  }
});

const configs = computed(() => configStore.allConfigs);
const selectedConfigId = computed({
  get: () => configStore.activeConfigId || '',
  set: (value: string) => configStore.setActiveConfig(value)
});
const activeConfig = computed(() => configStore.activeConfig);

const getCommandString = (config: ClaudeRunConfig) => {
  return configStore.getCommandString(config);
};

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value;
};

const selectConfig = (configId: string) => {
  configStore.setActiveConfig(configId);
  const config = configStore.activeConfig;
  if (config) {
    emit('config-changed', config);
  }
  showDropdown.value = false;
};

const openManager = () => {
  showDropdown.value = false;
  showManager.value = true;
};

const closeManager = () => {
  showManager.value = false;
  resetForm();
};

const showAddForm = () => {
  showForm.value = true;
  editingConfig.value = null;
  formData.value = {
    name: '',
    command: 'claude',
    args: [],
    isDefault: false
  };
};

const handleConfigClick = (config: ClaudeRunConfig) => {
  if (config.isHardcoded) {
    // For hardcoded configs, only allow setting as default
    editingConfig.value = config;
    formData.value = {
      name: config.name,
      command: config.command,
      args: [...config.args],
      isDefault: config.isDefault
    };
    showForm.value = true;
  } else {
    // For custom configs, allow full editing
    editConfig(config);
  }
};

const editConfig = (config: ClaudeRunConfig) => {
  // Prevent editing hardcoded configs
  if (config.isHardcoded) {
    return;
  }
  
  editingConfig.value = config;
  formData.value = {
    name: config.name,
    command: config.command,
    args: [...config.args],
    isDefault: config.isDefault
  };
  showForm.value = true;
};

const deleteConfig = async (id: string) => {
  if (configs.value.length <= 1) return;
  
  const config = configStore.getConfigById(id);
  if (config?.isHardcoded) {
    return;
  }
  
  if (confirm('Are you sure you want to delete this configuration?')) {
    await configStore.deleteConfig(id);
  }
};

const saveConfig = async () => {
  try {
    if (editingConfig.value?.isHardcoded) {
      // For hardcoded configs, only update the isDefault flag
      await configStore.updateConfig(editingConfig.value.id, { isDefault: formData.value.isDefault });
    } else if (editingConfig.value) {
      await configStore.updateConfig(editingConfig.value.id, formData.value);
    } else {
      await configStore.addConfig(formData.value);
    }
    resetForm();
    showForm.value = false;
  } catch (error) {
    alert('Failed to save configuration. Please try again.');
  }
};

const resetForm = () => {
  editingConfig.value = null;
  formData.value = {
    name: '',
    command: 'claude',
    args: [],
    isDefault: false
  };
  showForm.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (selectorRef.value && !selectorRef.value.contains(event.target as Node)) {
    showDropdown.value = false;
  }
};

onMounted(async () => {
  // Get the working directory from the parent component
  const workingDirectory = inject<string>('workingDirectory');
  await configStore.initialize(workingDirectory);
  // Emit initial config
  if (configStore.activeConfig) {
    emit('config-changed', configStore.activeConfig);
  }
  // Add click outside listener
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.run-config-selector {
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
  font-family: 'Consolas', 'Monaco', monospace;
}

.check-icon {
  color: #0dbc79;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button:hover {
  background: #404040;
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
  max-width: 600px;
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

/* Configuration List */
.config-list {
  margin-bottom: 24px;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 8px;
  background: #2d2d30;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.config-item.clickable {
  cursor: pointer;
}

.config-item:hover {
  background: #37373d;
  border-color: #505050;
}

.config-item.active {
  border-color: #007acc;
}

.config-info {
  flex: 1;
}

.config-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.default-badge {
  font-size: 11px;
  background: #007acc;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
}

.config-command {
  font-size: 12px;
  color: #858585;
  font-family: 'Consolas', 'Monaco', monospace;
}

.config-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.icon-btn:hover {
  background: #3e3e42;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn.delete:hover:not(:disabled) {
  background: #5a1d1d;
  color: #f14c4c;
}

/* Add Configuration Button */
.add-config-button-container {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #3e3e42;
}

.add-config-button {
  width: 100%;
  padding: 10px 16px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.add-config-button:hover {
  background: #005a9e;
}

/* Form Styles */
.config-form {
  border-top: 1px solid #3e3e42;
  padding-top: 20px;
}

.config-form h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
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

.form-group input[type="text"],
.form-group textarea {
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

.form-group input[type="text"]:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #007acc;
  background: #252525;
}

.form-group input.readonly,
.form-group textarea.readonly {
  background: #1a1a1a;
  color: #808080;
  cursor: not-allowed;
  opacity: 0.7;
}

.form-group input.readonly:focus,
.form-group textarea.readonly:focus {
  border-color: #505050;
  background: #1a1a1a;
}

.form-group textarea {
  font-family: 'Consolas', 'Monaco', monospace;
  resize: vertical;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.save-btn,
.cancel-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn {
  background: #007acc;
  color: white;
}

.save-btn:hover {
  background: #005a9e;
}

.cancel-btn {
  background: #3c3c3c;
  color: #cccccc;
}

.cancel-btn:hover {
  background: #4e4e52;
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