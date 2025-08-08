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
                
                <div v-if="appStatus.isRemoteServerRunning.value" class="info-item">
                  <Icon name="mdi:shield-check" />
                  <div class="info-content">
                    <div class="info-label">Authentication</div>
                    <div class="info-value">
                       Enabled
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="server-help">
                <Icon name="mdi:information" />
                <span>Other devices can connect to this server to access your Clode Studio environment</span>
              </div>
            </div>

            <!-- Cloudflare Tunnel Status (for hybrid mode) - Hidden for now -->
            <div v-if="false && appStatus.isHybridMode.value" class="tunnel-status-section">
              <h4>Remote Access Options</h4>
              <div class="tunnel-info">
                <div class="info-item">
                  <Icon 
                    :name="getTunnelStatusIcon()" 
                    :class="['tunnel-icon', tunnelStatus?.status || 'stopped']"
                  />
                  <div class="info-content">
                    <div class="info-label">Tunnel Status</div>
                    <div class="info-value">{{ getTunnelStatusText() }}</div>
                  </div>
                </div>
                
                <div v-if="tunnelStatus?.url" class="info-item">
                  <Icon name="mdi:cloud" />
                  <div class="info-content">
                    <div class="info-label">Public URL (via Cloudflare)</div>
                    <div class="info-value mono">
                      <a :href="tunnelStatus.url" target="_blank" class="tunnel-url">
                        {{ tunnelStatus.url }}
                      </a>
                      <button @click="copyTunnelUrl" class="copy-btn" title="Copy URL">
                        <Icon name="mdi:content-copy" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div class="info-item">
                  <Icon name="mdi:lan" />
                  <div class="info-content">
                    <div class="info-label">Local Network URL</div>
                    <div class="info-value mono">
                      {{ getLocalUrl() }}
                      <button @click="copyLocalUrl" class="copy-btn" title="Copy URL">
                        <Icon name="mdi:content-copy" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div v-if="tunnelStatus?.error" class="error-item">
                  <Icon name="mdi:alert-circle" class="error-icon" />
                  <div class="error-content">
                    <div class="error-label">Error</div>
                    <div class="error-message">{{ tunnelStatus.error }}</div>
                  </div>
                </div>
              </div>
              
              <div class="tunnel-help">
                <Icon name="mdi:information" />
                <span>Use the public URL for access from anywhere, or the local URL when on the same network</span>
              </div>
            </div>
            
            <!-- Active Remote Connections -->
            <div v-if="appStatus.isRemoteServerRunning.value && remoteConnections.length > 0" class="connections-section">
              <h4>Active Remote Connections</h4>
              <div class="connections-list">
                <div v-for="conn in remoteConnections" :key="conn.sessionId" class="connection-item">
                  <Icon name="mdi:devices" class="device-icon" />
                  <div class="connection-info">
                    <div class="connection-name">{{ conn.deviceName }}</div>
                    <div class="connection-details">
                      <span class="connection-id">ID: {{ conn.deviceId.substring(0, 8) }}...</span>
                      <span class="connection-token" v-if="conn.token">Token: {{ conn.token.substring(0, 8) }}...</span>
                      <span class="connection-time">Connected {{ formatTimeSince(conn.connectedAt) }}</span>
                      <span class="connection-status" :class="{ active: conn.isActive }">
                        {{ conn.isActive ? 'Active' : 'Idle' }}
                      </span>
                    </div>
                  </div>
                  <button 
                    class="revoke-btn" 
                    @click="revokeConnection(conn)"
                    title="Revoke this device's access"
                  >
                    <Icon name="mdi:close-circle" />
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Token Management Section -->
            <div v-if="appStatus.isRemoteServerRunning.value" class="token-section">
              <h4>Device Tokens (Local Network)</h4>
              <div v-if="activeTokens.length > 0" class="token-list">
                <div v-for="token in activeTokens" :key="token.token" class="token-item">
                  <div class="token-info">
                    <div class="token-device">{{ token.deviceName }}</div>
                    <div class="token-details">
                      <span class="token-id">Token: {{ token.token.substring(0, 12) }}...</span>
                      <span class="token-created">Created: {{ formatDate(token.createdAt) }}</span>
                      <span class="token-expires">Expires: {{ formatDate(token.expiresAt) }}</span>
                      <span class="token-usage">Used {{ token.connectionCount }} times</span>
                      <span v-if="token.lastUsed" class="token-last-used">
                        Last used: {{ formatTimeSince(token.lastUsed) }}
                      </span>
                    </div>
                  </div>
                  <button 
                    class="revoke-token-btn" 
                    @click="revokeToken(token.token)"
                    title="Revoke this token"
                  >
                    <Icon name="mdi:delete" />
                  </button>
                </div>
              </div>
              <div v-if="activeTokens.length === 0" class="no-tokens">
                No active local tokens. Generate a QR code to create one.
              </div>
              <div class="token-note">
                <Icon name="mdi:information" />
                <span>Connections through relay server are managed separately and not shown here.</span>
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
            
            <!-- Actions 
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
            </div> -->
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
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

// Remote connections
const remoteConnections = ref<Array<{
  sessionId: string;
  deviceName: string;
  deviceId: string;
  token?: string;
  connectedAt: Date;
  lastActivity: Date;
  isActive: boolean;
}>>([]);

// Active tokens
const activeTokens = ref<Array<{
  token: string;
  deviceId: string;
  deviceName: string;
  pairingCode: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsed?: Date;
  connectionCount: number;
}>>([]);

// Tunnel status
const tunnelStatus = ref<{
  url: string;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  error?: string;
} | null>(null);

// QR container ref
const qrContainer = ref<HTMLElement | null>(null);

// Update interval
let updateInterval: NodeJS.Timeout | null = null;

// Fetch remote connections
async function fetchRemoteConnections() {
  if (window.electronAPI?.remote?.getConnections && appStatus.isRemoteServerRunning.value) {
    try {
      const connections = await window.electronAPI.remote.getConnections();
      remoteConnections.value = connections.map((c: any) => ({
        ...c,
        connectedAt: new Date(c.connectedAt),
        lastActivity: new Date(c.lastActivity)
      }));
    } catch (error) {
      console.error('Failed to fetch remote connections:', error);
    }
  }
}

// Fetch active tokens
async function fetchActiveTokens() {
  if (window.electronAPI?.remote?.getActiveTokens && appStatus.isRemoteServerRunning.value) {
    try {
      const tokens = await window.electronAPI.remote.getActiveTokens();
      activeTokens.value = tokens.map((t: any) => ({
        ...t,
        createdAt: new Date(t.createdAt),
        expiresAt: new Date(t.expiresAt),
        lastUsed: t.lastUsed ? new Date(t.lastUsed) : undefined
      }));
    } catch (error) {
      console.error('Failed to fetch active tokens:', error);
    }
  }
}

// Fetch tunnel status
async function fetchTunnelStatus() {
  if (window.electronAPI?.tunnel?.getInfo && appStatus.isHybridMode.value) {
    try {
      const info = await window.electronAPI.tunnel.getInfo();
      tunnelStatus.value = info;
      
      // Generate QR code if tunnel is ready and has URL
      if (info.status === 'ready' && info.url && qrContainer.value) {
        await generateQRCode(info.url);
      }
    } catch (error) {
      console.error('Failed to fetch tunnel status:', error);
    }
  }
}

// Generate QR code
async function generateQRCode(url: string) {
  if (!qrContainer.value) return;
  
  try {
    // Import QRCode dynamically to avoid SSR issues
    const QRCode = await import('qrcode');
    
    // Clear previous QR code
    qrContainer.value.innerHTML = '';
    
    // Generate new QR code
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, url, {
      width: 150,
      margin: 2,
      color: {
        dark: '#1f2937',
        light: '#ffffff'
      }
    });
    
    qrContainer.value.appendChild(qrCanvas);
  } catch (error) {
    console.error('Failed to generate QR code:', error);
  }
}

// Copy tunnel URL to clipboard
async function copyTunnelUrl() {
  if (!tunnelStatus.value?.url) return;
  
  try {
    await navigator.clipboard.writeText(tunnelStatus.value.url);
    // You could show a toast notification here
    console.log('Tunnel URL copied to clipboard');
  } catch (error) {
    console.error('Failed to copy tunnel URL:', error);
  }
}

// Get tunnel status icon
function getTunnelStatusIcon() {
  switch (tunnelStatus.value?.status) {
    case 'starting': return 'mdi:loading';
    case 'ready': return 'mdi:check-circle';
    case 'error': return 'mdi:alert-circle';
    default: return 'mdi:circle-outline';
  }
}

// Get tunnel status text
function getTunnelStatusText() {
  switch (tunnelStatus.value?.status) {
    case 'starting': return 'Starting tunnel...';
    case 'ready': return 'Tunnel active';
    case 'error': return 'Tunnel failed';
    default: return 'Tunnel inactive';
  }
}

// Get local URL
function getLocalUrl() {
  // Get local IP address from network interfaces
  const hostname = window.location.hostname === 'localhost' 
    ? 'localhost' 
    : (appStatus.serverUrl.value?.split('//')[1]?.split(':')[0] || window.location.hostname);
  return `http://${hostname}:3000`;
}

// Copy local URL to clipboard
async function copyLocalUrl() {
  try {
    await navigator.clipboard.writeText(getLocalUrl());
    console.log('Local URL copied to clipboard');
  } catch (error) {
    console.error('Failed to copy local URL:', error);
  }
}

// Handle tunnel status updates from main process
function handleTunnelStatusUpdate(event: any, newTunnelInfo: any) {
  tunnelStatus.value = newTunnelInfo;
  
  // Generate QR code if tunnel is ready
  if (newTunnelInfo.status === 'ready' && newTunnelInfo.url && qrContainer.value) {
    generateQRCode(newTunnelInfo.url);
  }
}

// Revoke a connection
async function revokeConnection(conn: any) {
  if (window.electronAPI?.remote?.disconnectDevice) {
    try {
      await window.electronAPI.remote.disconnectDevice(conn.sessionId);
      // If connection has a token, revoke it too
      if (conn.token) {
        await revokeToken(conn.token);
      }
      await fetchRemoteConnections();
    } catch (error) {
      console.error('Failed to revoke connection:', error);
    }
  }
}

// Revoke a token
async function revokeToken(token: string) {
  if (window.electronAPI?.remote?.revokeToken) {
    try {
      await window.electronAPI.remote.revokeToken(token);
      await fetchActiveTokens();
      await fetchRemoteConnections();
    } catch (error) {
      console.error('Failed to revoke token:', error);
    }
  }
}

// Format date
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// Format time since connection
function formatTimeSince(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

onMounted(() => {
  // Fetch connections, tokens, and tunnel status immediately
  fetchRemoteConnections();
  fetchActiveTokens();
  fetchTunnelStatus();
  
  // Listen for tunnel status updates
  if (window.electronAPI?.ipcRenderer?.on) {
    window.electronAPI.ipcRenderer.on('tunnel:status-updated', handleTunnelStatusUpdate);
  }
  
  // Update every 5 seconds
  updateInterval = setInterval(() => {
    fetchRemoteConnections();
    fetchActiveTokens();
    fetchTunnelStatus();
  }, 5000);
});

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Remove tunnel status listener
  if (window.electronAPI?.ipcRenderer?.removeListener) {
    window.electronAPI.ipcRenderer.removeListener('tunnel:status-updated', handleTunnelStatusUpdate);
  }
});

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

/* Active Connections Section */
.connections-section {
  margin-bottom: 24px;
  padding: 16px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
}

.connections-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--color-bg-primary);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.connection-item .device-icon {
  font-size: 24px;
  color: var(--color-primary);
}

.connection-info {
  flex: 1;
}

.connection-name {
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.connection-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.connection-id {
  font-family: var(--font-mono);
}

.connection-status {
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.connection-status.active {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

/* Token Management Styles */
.token-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.token-section h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-text-primary);
}

.token-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.token-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
}

.token-info {
  flex: 1;
}

.token-device {
  font-weight: 500;
  margin-bottom: 4px;
}

.token-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.token-details span {
  padding: 2px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: 4px;
}

.token-id,
.connection-token {
  font-family: var(--font-mono);
  font-size: 11px;
}

.revoke-btn,
.revoke-token-btn {
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--color-danger);
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.revoke-btn:hover,
.revoke-token-btn:hover {
  background-color: var(--color-danger-bg);
}

.no-tokens {
  padding: 20px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.token-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.token-note .icon {
  flex-shrink: 0;
  font-size: 16px;
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