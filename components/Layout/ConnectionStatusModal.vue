<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="connection-modal-overlay" @click="emit('close')">
        <div class="connection-modal" @click.stop>
          <div class="modal-header">
            <h3>Connection Status</h3>
            <button class="modal-close" @click="emit('close')">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-content">
            <!-- Status Section -->
            <div class="status-section">
              <div class="status-item main-status">
                <Icon :name="statusIcon" :class="['status-icon', statusClass]" />
                <div class="status-info">
                  <div class="status-label">Connection</div>
                  <div class="status-value">{{ statusText }}</div>
                </div>
              </div>
              
              <div v-if="error" class="error-message">
                <Icon name="mdi:alert-circle" />
                <span>{{ error }}</span>
              </div>
            </div>
            
            <!-- Remote Server Status (for hybrid mode) -->
            <div v-if="appStatus.isHybridMode.value" class="server-status-section">
              <h4>Remote Server</h4>
              <div class="server-info">
                <div class="info-item">
                  <Icon 
                    :name="appStatus.isRemoteServerRunning.value ? 'mdi:server-network' : 'mdi:server-network-off'" 
                    :class="['server-icon', { running: appStatus.isRemoteServerRunning.value }]"
                  />
                  <div class="info-content">
                    <div class="info-label">Status</div>
                    <div class="info-value">
                      {{ appStatus.isRemoteServerRunning.value ? 'Running' : 'Stopped' }}
                    </div>
                  </div>
                </div>
                
                <div v-if="appStatus.isRemoteServerRunning.value" class="info-item">
                  <Icon name="mdi:connection" />
                  <div class="info-content">
                    <div class="info-label">Active Connections</div>
                    <div class="info-value">{{ appStatus.remoteConnectionCount.value }}</div>
                  </div>
                </div>
                
                <div v-if="appStatus.serverUrl.value" class="info-item">
                  <Icon name="mdi:web" />
                  <div class="info-content">
                    <div class="info-label">Server URL</div>
                    <div class="info-value mono">{{ appStatus.serverUrl.value }}</div>
                  </div>
                </div>
                
                <div v-if="appStatus.isRemoteServerRunning.value" class="info-item">
                  <Icon name="mdi:shield-check" />
                  <div class="info-content">
                    <div class="info-label">Authentication</div>
                    <div class="info-value">
                      {{ appStatus.appStatus.value?.config.authRequired ? 'Required' : 'Disabled' }}
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="server-help">
                <Icon name="mdi:information" />
                <span>Other devices can connect to this server to access your Clode Studio environment</span>
              </div>
            </div>
            
            <!-- Quick Connect Section (for hybrid mode with running server) -->
            <QuickConnectSection v-if="appStatus.isHybridMode.value && appStatus.isRemoteServerRunning.value" />
            
            <!-- Performance Metrics -->
            <!-- TODO: Re-enable when performance metrics are properly implemented and tracked -->
            <!-- <div v-if="isConnected" class="metrics-section">
              <h4>Performance Metrics</h4>
              <div class="metrics-grid">
                <div class="metric-item">
                  <Icon name="mdi:speedometer" />
                  <div class="metric-info">
                    <div class="metric-label">Latency</div>
                    <div class="metric-value">{{ latency }}ms</div>
                  </div>
                </div>
                
                <div class="metric-item">
                  <Icon name="mdi:cached" />
                  <div class="metric-info">
                    <div class="metric-label">Cache Hit Rate</div>
                    <div class="metric-value">{{ cacheHitRate }}%</div>
                  </div>
                </div>
                
                <div class="metric-item">
                  <Icon name="mdi:content-save" />
                  <div class="metric-info">
                    <div class="metric-label">Bandwidth Saved</div>
                    <div class="metric-value">{{ formatBytes(bandwidthSaved) }}</div>
                  </div>
                </div>
                
                <div class="metric-item">
                  <Icon name="mdi:sync" />
                  <div class="metric-info">
                    <div class="metric-label">Last Sync</div>
                    <div class="metric-value">{{ lastSyncText }}</div>
                  </div>
                </div>
              </div>
            </div> -->
            
            <!-- Connected Devices -->
            <div v-if="connectedDevices.length > 0" class="devices-section">
              <h4>Connected Devices</h4>
              <div class="devices-list">
                <div 
                  v-for="device in connectedDevices" 
                  :key="device.id"
                  class="device-item"
                  :class="{ current: device.isCurrent }"
                >
                  <Icon :name="getDeviceIcon(device.type)" />
                  <div class="device-info">
                    <div class="device-name">{{ device.name }}</div>
                    <div class="device-active">{{ formatLastActive(device.lastActive) }}</div>
                  </div>
                  <div v-if="device.isCurrent" class="current-badge">Current</div>
                  <button 
                    v-else 
                    class="switch-btn"
                    @click="switchToDevice(device.id)"
                    :disabled="isSwitching"
                  >
                    <Icon name="mdi:swap-horizontal" />
                    Switch
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="actions-section">
              <button 
                v-if="!isConnected && canConnect" 
                class="action-btn primary"
                @click="connectionManager.connect()"
              >
                <Icon name="mdi:connection" />
                Connect to Server
              </button>
              
              <button 
                v-if="isConnected" 
                class="action-btn"
                @click="connectionManager.syncNow()"
                :disabled="isSyncing"
              >
                <Icon name="mdi:sync" :class="{ 'spin': isSyncing }" />
                {{ isSyncing ? 'Syncing...' : 'Sync Now' }}
              </button>
              
              <button 
                v-if="isConnected" 
                class="action-btn danger"
                @click="connectionManager.disconnect()"
              >
                <Icon name="mdi:connection" />
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useConnectionManager } from '~/composables/useConnectionManager';
import { usePerformanceCache } from '~/composables/usePerformanceCache';
import { useAppStatus } from '~/composables/useAppStatus';
import { formatBytes } from '~/utils/format';
import QuickConnectSection from './QuickConnectSection.vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

// Composables
const connectionManager = useConnectionManager();
const performanceCache = usePerformanceCache();
const appStatus = useAppStatus();

// Connection state
const state = computed(() => connectionManager.state.value);
const error = computed(() => connectionManager.error.value);
const latency = computed(() => connectionManager.latency.value);
const lastSync = computed(() => connectionManager.lastSync.value);
const connectedDevices = computed(() => connectionManager.connectedDevices.value);

// Performance metrics
const cacheHitRate = computed(() => Math.round(performanceCache.hitRate.value * 100));
const bandwidthSaved = computed(() => performanceCache.bandwidthSaved.value);

// Device switching state
const isSwitching = ref(false);

// Computed states
const isConnected = computed(() => 
  ['connected', 'syncing', 'synchronized'].includes(state.value)
);

const isSyncing = computed(() => state.value === 'syncing');

const canConnect = computed(() => 
  ['offline', 'disconnected', 'error'].includes(state.value)
);

const statusClass = computed(() => {
  const statusClasses: Record<string, string> = {
    offline: 'offline',
    connecting: 'connecting',
    connected: 'connected',
    syncing: 'syncing',
    synchronized: 'synchronized',
    error: 'error',
    disconnected: 'error'
  };
  return statusClasses[state.value] || 'offline';
});

const statusIcon = computed(() => {
  const icons: Record<string, string> = {
    offline: 'mdi:wifi-off',
    connecting: 'mdi:loading',
    connected: 'mdi:wifi',
    syncing: 'mdi:sync',
    synchronized: 'mdi:check-network',
    error: 'mdi:alert-circle',
    disconnected: 'mdi:wifi-off'
  };
  return icons[state.value] || 'mdi:help-circle';
});

const statusText = computed(() => {
  const texts: Record<string, string> = {
    offline: 'Offline - Performance Cache Active',
    connecting: 'Connecting to server...',
    connected: 'Connected',
    syncing: 'Syncing changes...',
    synchronized: 'Fully synchronized',
    error: 'Connection error',
    disconnected: 'Disconnected'
  };
  return texts[state.value] || 'Unknown';
});

const lastSyncText = computed(() => {
  if (!lastSync.value) return 'Never';
  return formatRelativeTime(lastSync.value);
});

// Helpers
function getDeviceIcon(type: string): string {
  const icons: Record<string, string> = {
    desktop: 'mdi:desktop-tower',
    laptop: 'mdi:laptop',
    tablet: 'mdi:tablet',
    phone: 'mdi:cellphone'
  };
  return icons[type] || 'mdi:devices';
}

function formatLastActive(date: Date): string {
  return formatRelativeTime(date);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// Device switching
async function switchToDevice(deviceId: string) {
  if (isSwitching.value) return;
  
  isSwitching.value = true;
  try {
    await connectionManager.switchToDevice(deviceId);
  } finally {
    isSwitching.value = false;
  }
}
</script>

<style scoped>
.connection-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}

.connection-modal {
  background: var(--color-bg-primary);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.modal-close:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.modal-content {
  padding: 20px;
  overflow-y: auto;
}

/* Status Section */
.status-section {
  margin-bottom: 24px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-icon {
  font-size: 36px;
  transition: color 0.3s;
}

.status-icon.offline { color: var(--color-text-secondary); }
.status-icon.connecting { 
  color: var(--color-warning); 
  animation: pulse 1.5s infinite;
}
.status-icon.connected,
.status-icon.synchronized { color: var(--color-success); }
.status-icon.syncing { 
  color: var(--color-info);
  animation: spin 1s linear infinite;
}
.status-icon.error { color: var(--color-error); }

.status-info {
  flex: 1;
}

.status-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-top: 2px;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  background-color: var(--color-error-bg);
  color: var(--color-error);
  border-radius: 8px;
  font-size: 14px;
}

/* Server Status Section */
.server-status-section {
  margin-bottom: 24px;
  padding: 16px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
}

.server-status-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.server-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-item .icon {
  font-size: 20px;
  color: var(--color-text-secondary);
}

.server-icon.running {
  color: var(--color-success);
}

.info-content {
  flex: 1;
}

.info-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-top: 2px;
}

.info-value.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}

.server-help {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background-color: var(--color-info-bg);
  color: var(--color-info);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.server-help .icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* Metrics Section */
.metrics-section {
  margin-bottom: 24px;
}

.metrics-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.metric-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
}

.metric-item .icon {
  font-size: 24px;
  color: var(--color-primary);
}

.metric-info {
  flex: 1;
}

.metric-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-top: 2px;
}

/* Devices Section */
.devices-section {
  margin-bottom: 24px;
}

.devices-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.devices-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
  position: relative;
}

.device-item.current {
  background-color: var(--color-primary-bg);
  border: 1px solid var(--color-primary);
}

.device-item .icon {
  font-size: 24px;
  color: var(--color-text-secondary);
}

.device-item.current .icon {
  color: var(--color-primary);
}

.device-info {
  flex: 1;
}

.device-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.device-active {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.current-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  background-color: var(--color-primary);
  color: white;
  border-radius: 12px;
  font-weight: 600;
}

.switch-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.switch-btn:hover:not(:disabled) {
  background-color: var(--color-primary);
  color: white;
  transform: translateY(-1px);
}

.switch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.switch-btn .icon {
  font-size: 14px;
}

/* Actions Section */
.actions-section {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-btn {
  flex: 1;
  min-width: 120px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.action-btn:hover:not(:disabled) {
  background-color: var(--color-bg-tertiary);
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background-color: var(--color-primary);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.action-btn.danger {
  background-color: var(--color-error-bg);
  color: var(--color-error);
}

.action-btn.danger:hover:not(:disabled) {
  background-color: var(--color-error);
  color: white;
}

/* Animations */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

/* Modal Transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .connection-modal,
.modal-fade-leave-active .connection-modal {
  transition: transform 0.3s ease;
}

.modal-fade-enter-from .connection-modal {
  transform: scale(0.9);
}

.modal-fade-leave-to .connection-modal {
  transform: scale(0.9);
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .connection-modal {
    background: #1a1a1a;
  }
  
  .modal-header {
    border-bottom-color: #333;
  }
  
  .metric-item,
  .device-item {
    background-color: #222;
  }
  
  .device-item.current {
    background-color: rgba(66, 153, 225, 0.1);
  }
  
  .action-btn {
    background-color: #333;
  }
  
  .action-btn:hover:not(:disabled) {
    background-color: #444;
  }
}
</style>