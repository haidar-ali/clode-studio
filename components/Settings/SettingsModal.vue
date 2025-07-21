<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click="close">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2>Settings</h2>
            <button class="close-button" @click="close">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="settings-sections">
              <!-- Data Management Section -->
              <div class="settings-section">
                <h3>Data Management</h3>
                <div class="settings-group">
                  <div class="setting-item">
                    <div class="setting-info">
                      <h4>Clear Default Workspace</h4>
                      <p>Remove the saved workspace path and return to workspace selection</p>
                    </div>
                    <button class="action-button danger" @click="showClearWorkspaceDialog = true">
                      <Icon name="mdi:folder-remove" />
                      Clear Workspace
                    </button>
                  </div>
                  
                  <div class="setting-item">
                    <div class="setting-info">
                      <h4>Clear All Caches</h4>
                      <p>Remove all cached data including knowledge base, context, and file indexes</p>
                    </div>
                    <button class="action-button danger" @click="showClearCacheDialog = true">
                      <Icon name="mdi:delete-sweep" />
                      Clear Caches
                    </button>
                  </div>
                </div>
              </div>

              <!-- Future Features Section -->
              <div class="settings-section">
                <h3>Coming Soon</h3>
                <div class="future-features">
                  <p>Additional settings will be available in future updates:</p>
                  <ul>
                    <li>Theme customization</li>
                    <li>Editor preferences</li>
                    <li>Claude CLI configuration</li>
                    <li>Keyboard shortcuts</li>
                    <li>Extension management</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Clear Workspace Confirmation Dialog -->
    <Transition name="dialog">
      <div v-if="showClearWorkspaceDialog" class="dialog-overlay" @click="showClearWorkspaceDialog = false">
        <div class="dialog-container" @click.stop>
          <div class="dialog-header">
            <Icon name="mdi:alert" class="warning-icon" />
            <h3>Clear Default Workspace?</h3>
          </div>
          <div class="dialog-body">
            <p>This will remove your saved workspace path.</p>
            <p>You will need to select a workspace when you restart the application.</p>
          </div>
          <div class="dialog-actions">
            <button class="dialog-button cancel" @click="showClearWorkspaceDialog = false">
              Cancel
            </button>
            <button class="dialog-button confirm danger" @click="clearWorkspace">
              Clear Workspace
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Clear Cache Confirmation Dialog -->
    <Transition name="dialog">
      <div v-if="showClearCacheDialog" class="dialog-overlay" @click="showClearCacheDialog = false">
        <div class="dialog-container" @click.stop>
          <div class="dialog-header">
            <Icon name="mdi:alert" class="danger-icon" />
            <h3>Clear All Caches?</h3>
          </div>
          <div class="dialog-body">
            <p class="warning-text">⚠️ This action is NOT reversible!</p>
            <p>This will permanently delete:</p>
            <ul class="clear-list">
              <li>Knowledge base entries</li>
              <li>Context checkpoints</li>
              <li>File indexes</li>
              <li>Cached search results</li>
              <li>Session data</li>
            </ul>
          </div>
          <div class="dialog-actions">
            <button class="dialog-button cancel" @click="showClearCacheDialog = false">
              Cancel
            </button>
            <button class="dialog-button confirm danger" @click="clearAllCaches">
              Clear All Caches
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const isOpen = ref(false);
const showClearWorkspaceDialog = ref(false);
const showClearCacheDialog = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const handleOpenSettings = () => {
  open();
};

const clearWorkspace = async () => {
  try {
    // Clear the saved workspace path
    await window.electronAPI.store.delete('workspace.lastPath');
    await window.electronAPI.store.delete('workspacePath');
    
    // Close the dialogs
    showClearWorkspaceDialog.value = false;
    isOpen.value = false;
    
    // Reload the app to go back to startup loader
    window.location.reload();
  } catch (error) {
    console.error('Failed to clear workspace:', error);
    alert('Failed to clear workspace. Please try again.');
  }
};

const clearAllCaches = async () => {
  try {
    // Clear all caches
    const { useKnowledgeStore } = await import('~/stores/knowledge');
    const { useContextStore } = await import('~/stores/context');
    const { useKnowledgeLearningStore } = await import('~/stores/knowledge-learning');
    const { useKnowledgeAnalyticsStore } = await import('~/stores/knowledge-analytics');
    
    const knowledgeStore = useKnowledgeStore();
    const contextStore = useContextStore();
    const knowledgeLearningStore = useKnowledgeLearningStore();
    const knowledgeAnalyticsStore = useKnowledgeAnalyticsStore();
    
    // Clear knowledge entries
    await knowledgeStore.clearAllEntries();
    
    // Clear context checkpoints
    for (const checkpoint of contextStore.checkpoints) {
      await contextStore.deleteCheckpoint(checkpoint.id);
    }
    
    // Clear learning data
    knowledgeLearningStore.clearAllData();
    
    // Clear analytics
    knowledgeAnalyticsStore.clearAllMetrics();
    
    // Clear any file watcher caches
    await window.electronAPI.fileWatcher.stop('');
    
    // Clear knowledge cache
    const workspacePath = await window.electronAPI.store.get('workspace.lastPath');
    if (workspacePath) {
      await window.electronAPI.knowledgeCache.clear(workspacePath);
    }
    
    // Close the dialogs
    showClearCacheDialog.value = false;
    isOpen.value = false;
    
    alert('All caches have been cleared successfully.');
  } catch (error) {
    console.error('Failed to clear caches:', error);
    alert('Failed to clear all caches. Some data may remain.');
  }
};

onMounted(() => {
  window.addEventListener('open-settings', handleOpenSettings);
});

onUnmounted(() => {
  window.removeEventListener('open-settings', handleOpenSettings);
});
</script>

<style scoped>
.modal-overlay {
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
  color: #cccccc;
}

.modal-container {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #cccccc;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #454545;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: #ffffff;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.settings-sections {
  padding: 20px;
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.setting-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}

.setting-info p {
  margin: 0;
  font-size: 12px;
  color: #858585;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #2d2d30;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.action-button:hover {
  background: #3e3e42;
  color: #ffffff;
}

.action-button.danger {
  border-color: #5a1d1d;
  background: #3e1212;
  color: #f48771;
}

.action-button.danger:hover {
  background: #5a1d1d;
  color: #f48771;
}

.future-features {
  padding: 16px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.future-features p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #cccccc;
}

.future-features ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.future-features li {
  padding: 4px 0;
  font-size: 13px;
  color: #858585;
}

.future-features li::before {
  content: "• ";
  color: #007acc;
  font-weight: bold;
  margin-right: 8px;
}

/* Dialog Styles */
.dialog-overlay {
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

.dialog-container {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #cccccc;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid #3c3c3c;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.warning-icon {
  color: #f9c74f;
  font-size: 24px;
}

.danger-icon {
  color: #f48771;
  font-size: 24px;
}

.dialog-body {
  padding: 20px;
}

.dialog-body p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #cccccc;
}

.warning-text {
  color: #f9c74f;
  font-weight: 600;
}

.clear-list {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}

.clear-list li {
  padding: 4px 0 4px 20px;
  font-size: 13px;
  color: #858585;
  position: relative;
}

.clear-list li::before {
  content: "•";
  position: absolute;
  left: 8px;
  color: #f48771;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #3c3c3c;
}

.dialog-button {
  padding: 8px 16px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #2d2d30;
  color: #cccccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.dialog-button:hover {
  background: #3e3e42;
  color: #ffffff;
}

.dialog-button.cancel {
  background: transparent;
  border-color: #3c3c3c;
}

.dialog-button.danger {
  background: #5a1d1d;
  border-color: #5a1d1d;
  color: #f48771;
}

.dialog-button.danger:hover {
  background: #7a2d2d;
  color: #ffffff;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s;
}

.modal-enter-from .modal-container {
  transform: scale(0.95);
}

.modal-leave-to .modal-container {
  transform: scale(0.95);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.15s;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog-container,
.dialog-leave-active .dialog-container {
  transition: transform 0.15s;
}

.dialog-enter-from .dialog-container {
  transform: scale(0.9);
}

.dialog-leave-to .dialog-container {
  transform: scale(0.9);
}
</style>