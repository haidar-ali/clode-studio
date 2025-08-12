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
              <!-- Remote Access Section -->
              <div class="settings-section">
                <h3>Remote Access</h3>
                <div class="settings-group">
                  <div class="setting-item">
                    <div class="setting-info">
                      <h4>Hybrid Mode</h4>
                      <p>Enable remote access to your desktop Clode Studio from any device</p>
                      <div v-if="hybridModeEnabled" class="connection-info">
                        <p v-if="relayUrl" class="relay-url">
                          <Icon name="mdi:link" size="14" />
                          <span>{{ relayUrl }}</span>
                        </p>
                        <p v-else class="connecting">
                          <Icon name="mdi:loading" class="spin" size="14" />
                          Connecting to relay server...
                        </p>
                      </div>
                    </div>
                    <button 
                      class="toggle-button"
                      :class="{ active: hybridModeEnabled }"
                      @click="toggleHybridMode"
                      :disabled="isToggling"
                    >
                      <span class="toggle-switch" :class="{ active: hybridModeEnabled }"></span>
                      <span class="toggle-label">{{ hybridModeEnabled ? 'Enabled' : 'Disabled' }}</span>
                    </button>
                  </div>
                  
                  <div v-if="hybridModeEnabled" class="setting-item">
                    <div class="setting-info">
                      <h4>Relay Type</h4>
                      <p>Choose how to expose your local app to the internet</p>
                    </div>
                    <div class="relay-type-selector">
                      <label 
                        v-for="type in relayTypes" 
                        :key="type.value"
                        class="relay-type-option"
                        :class="{ active: selectedRelayType === type.value }"
                      >
                        <input 
                          type="radio" 
                          :value="type.value" 
                          v-model="selectedRelayType"
                          @change="onRelayTypeChange"
                          :disabled="isChangingRelayType"
                        />
                        <div class="relay-type-content">
                          <span class="relay-type-label">{{ type.label }}</span>
                          <span class="relay-type-description">{{ type.description }}</span>
                        </div>
                      </label>
                    </div>
                    
                    <div v-if="selectedRelayType === 'CLODE'" class="custom-relay-input">
                      <label class="input-label">Custom Relay URL (optional)</label>
                      <input 
                        v-model="customRelayUrl" 
                        type="text" 
                        placeholder="wss://my-relay.example.com"
                        class="relay-url-input"
                      />
                      <p class="input-hint">Leave empty to use default relay.clode.studio</p>
                    </div>
                    
                    <div v-if="selectedRelayType === 'CUSTOM'" class="custom-relay-info">
                      <p class="info-text">
                        <Icon name="mdi:information" size="14" />
                        Run one of these commands in a separate terminal:
                      </p>
                      <div class="command-examples">
                        <code>npx tunnelmole@latest 3000</code>
                        <code>npx localtunnel --port 3000</code>
                        <code>ngrok http 3000</code>
                        <code>ssh -R 80:localhost:3000 serveo.net</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
import { ref, onMounted, onUnmounted, watchEffect } from 'vue';

const isOpen = ref(false);
const showClearWorkspaceDialog = ref(false);
const showClearCacheDialog = ref(false);
const hybridModeEnabled = ref(false);
const isToggling = ref(false);
const relayUrl = ref('');
const selectedRelayType = ref('CLODE');
const isChangingRelayType = ref(false);
const customRelayUrl = ref('');

const relayTypes = [
  {
    value: 'CLODE',
    label: 'Clode Relay',
    description: 'Managed relay server with automatic subdomain'
  },
  {
    value: 'CLOUDFLARE',
    label: 'Cloudflare Tunnel',
    description: 'Free tunnel service (requires cloudflared)'
  },
  {
    value: 'CUSTOM',
    label: 'Custom Tunnel',
    description: 'Use your own tunnel (ngrok, localtunnel, etc.)'
  },
  {
    value: 'NONE',
    label: 'Local Network Only',
    description: 'No external access, LAN only'
  }
];

const open = () => {
  isOpen.value = true;
  checkHybridModeStatus();
};

const close = () => {
  isOpen.value = false;
};

const handleOpenSettings = () => {
  open();
};

const checkHybridModeStatus = async () => {
  try {
    const status = await window.electronAPI.remote.getModeStatus();
    hybridModeEnabled.value = status.isHybrid && status.serverRunning;
    
    // Get current relay type and custom URL from settings
    const currentRelayType = await window.electronAPI.store.get('relayType') || 'CLODE';
    selectedRelayType.value = currentRelayType;
    const savedCustomUrl = await window.electronAPI.store.get('customRelayUrl') || '';
    customRelayUrl.value = savedCustomUrl;
    
    // Get relay URL if hybrid mode is enabled
    if (hybridModeEnabled.value) {
      // Check relay type to get appropriate URL
      if (selectedRelayType.value === 'CLOUDFLARE') {
        // Get Cloudflare tunnel info
        const tunnelInfo = await window.electronAPI.tunnel.getInfo();
        if (tunnelInfo && tunnelInfo.url) {
          relayUrl.value = tunnelInfo.url;
        } else {
          relayUrl.value = 'Starting Cloudflare tunnel...';
        }
      } else if (selectedRelayType.value === 'CLODE') {
        // Get Clode relay info
        const relayInfo = await window.electronAPI.relay.getInfo();
        if (relayInfo && relayInfo.url) {
          relayUrl.value = relayInfo.url;
        } else {
          relayUrl.value = 'Connecting to relay...';
        }
      } else if (selectedRelayType.value === 'CUSTOM') {
        relayUrl.value = 'Custom tunnel (user-provided)';
      } else if (selectedRelayType.value === 'NONE') {
        relayUrl.value = 'http://localhost:3000 (Local Network)';
      }
    }
  } catch (error) {
    console.error('Failed to check hybrid mode status:', error);
  }
};

const toggleHybridMode = async () => {
  if (isToggling.value) return;
  
  isToggling.value = true;
  try {
    let result;
    if (hybridModeEnabled.value) {
      // Disable hybrid mode
      result = await window.electronAPI.remote.disableHybridMode();
      if (result.success) {
        hybridModeEnabled.value = false;
        relayUrl.value = '';
        // Save the disabled state to workspace
        await window.electronAPI.store.set('hybridModeEnabled', false);
      }
    } else {
      // Enable hybrid mode with selected relay type
      // Save the relay type, custom URL, and enabled state before enabling
      await window.electronAPI.store.set('relayType', selectedRelayType.value);
      if (selectedRelayType.value === 'CLODE' && customRelayUrl.value) {
        await window.electronAPI.store.set('customRelayUrl', customRelayUrl.value);
      }
      await window.electronAPI.store.set('hybridModeEnabled', true);
      
      // Pass both relay type and custom URL
      const options: any = { relayType: selectedRelayType.value };
      if (selectedRelayType.value === 'CLODE' && customRelayUrl.value) {
        options.customUrl = customRelayUrl.value;
      }
      result = await window.electronAPI.remote.enableHybridMode(options);
      if (result.success) {
        hybridModeEnabled.value = true;
        // Wait a bit for relay to connect, then check status
        setTimeout(async () => {
          await checkHybridModeStatus();
        }, 2000);
      } else {
        // If enabling failed, revert the saved state
        await window.electronAPI.store.set('hybridModeEnabled', false);
      }
    }
    
    if (!result.success) {
      alert(`Failed to ${hybridModeEnabled.value ? 'disable' : 'enable'} hybrid mode: ${result.error || 'Unknown error'}`);
      // Revert the toggle if it failed
      await checkHybridModeStatus();
    }
  } catch (error) {
    console.error('Failed to toggle hybrid mode:', error);
    alert('Failed to toggle hybrid mode. Please try again.');
    // Revert the toggle
    await checkHybridModeStatus();
  } finally {
    isToggling.value = false;
  }
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

// Handle relay type change
const onRelayTypeChange = async () => {
  if (isChangingRelayType.value) return;
  
  isChangingRelayType.value = true;
  try {
    // Save the new relay type and custom URL if applicable
    await window.electronAPI.store.set('relayType', selectedRelayType.value);
    if (selectedRelayType.value === 'CLODE' && customRelayUrl.value) {
      await window.electronAPI.store.set('customRelayUrl', customRelayUrl.value);
    }
    
    // Restart hybrid mode with new relay type
    if (hybridModeEnabled.value) {
      // Disable first
      await window.electronAPI.remote.disableHybridMode();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Re-enable with new type and options
      const options: any = { relayType: selectedRelayType.value };
      if (selectedRelayType.value === 'CLODE' && customRelayUrl.value) {
        options.customUrl = customRelayUrl.value;
      }
      const result = await window.electronAPI.remote.enableHybridMode(options);
      if (result.success) {
        // Wait for connection and update status
        setTimeout(async () => {
          await checkHybridModeStatus();
        }, 2000);
      } else {
        alert(`Failed to switch relay type: ${result.error || 'Unknown error'}`);
        // Revert selection
        const previousType = await window.electronAPI.store.get('relayType') || 'CLODE';
        selectedRelayType.value = previousType;
      }
    }
  } catch (error) {
    console.error('Failed to change relay type:', error);
    alert('Failed to change relay type. Please try again.');
  } finally {
    isChangingRelayType.value = false;
  }
};

// Listen for relay connection events
const handleRelayConnected = async (event: CustomEvent) => {
  if (hybridModeEnabled.value) {
    // Update the relay URL when connected
    await checkHybridModeStatus();
  }
};

onMounted(() => {
  window.addEventListener('open-settings', handleOpenSettings);
  // Listen for relay connection events
  window.addEventListener('relay:connected', handleRelayConnected as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('open-settings', handleOpenSettings);
  window.removeEventListener('relay:connected', handleRelayConnected as EventListener);
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

/* Toggle Button Styles */
.toggle-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 100px;
}

.toggle-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-button.active {
  background: #007acc;
  border-color: #007acc;
}

.toggle-switch {
  width: 32px;
  height: 32px;
  background: #858585;
  border-radius: 50%;
  transition: all 0.3s;
  display: block;
}

.toggle-switch.active {
  background: #ffffff;
  transform: translateX(32px);
}

.toggle-label {
  font-size: 13px;
  color: #cccccc;
  padding: 0 8px;
  min-width: 60px;
  text-align: center;
}

.connection-info {
  margin-top: 8px;
  padding: 8px;
  background: rgba(0, 122, 204, 0.1);
  border: 1px solid rgba(0, 122, 204, 0.3);
  border-radius: 4px;
}

.connection-info p {
  margin: 0;
  font-size: 12px;
  color: #007acc;
  display: flex;
  align-items: center;
  gap: 6px;
}

.relay-url {
  word-break: break-all;
}

.connecting {
  color: #f9c74f;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spin {
  animation: spin 1s linear infinite;
}

/* Relay Type Selector Styles */
.relay-type-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.relay-type-option {
  display: flex;
  align-items: center;
  padding: 12px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.relay-type-option:hover {
  background: #3e3e42;
  border-color: #4a4a4a;
}

.relay-type-option.active {
  background: rgba(0, 122, 204, 0.1);
  border-color: #007acc;
}

.relay-type-option input[type="radio"] {
  margin-right: 12px;
  cursor: pointer;
}

.relay-type-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.relay-type-label {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}

.relay-type-description {
  font-size: 12px;
  color: #858585;
}

.custom-relay-info {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 122, 204, 0.1);
  border: 1px solid rgba(0, 122, 204, 0.3);
  border-radius: 6px;
}

.info-text {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #007acc;
}

.command-examples {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.command-examples code {
  padding: 8px;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #d4d4d4;
  user-select: all;
}

.command-examples code:hover {
  background: #252526;
  border-color: #007acc;
}

.custom-relay-input {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 122, 204, 0.05);
  border: 1px solid rgba(0, 122, 204, 0.2);
  border-radius: 6px;
}

.input-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
}

.relay-url-input {
  width: 100%;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  transition: all 0.2s;
}

.relay-url-input:focus {
  outline: none;
  border-color: #007acc;
  background: #252526;
}

.relay-url-input::placeholder {
  color: #585858;
}

.input-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: #858585;
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