<template>
  <div class="quick-connect-section">
    <h4>Quick Connect</h4>
    
    <div class="connect-options">
      <!-- QR Code Display -->
      <div class="qr-code-container" v-if="qrCodeDataUrl">
        <div class="qr-code">
          <img :src="qrCodeDataUrl" alt="QR Code for connection" />
        </div>
        <p class="qr-instructions">
          Scan with your mobile device to connect instantly
        </p>
      </div>
      
      <!-- Manual Pairing Code -->
      <div class="pairing-code-container">
        <p class="pairing-label">Or enter this code:</p>
        <div class="pairing-code">
          <code>{{ pairingCode }}</code>
          <button 
            class="copy-btn" 
            @click="copyPairingCode"
            :title="copied ? 'Copied!' : 'Copy code'"
          >
            <Icon :name="copied ? 'mdi:check' : 'mdi:content-copy'" />
          </button>
        </div>
      </div>
      
      <!-- Connection URLs -->
      <div class="connection-url-container">
        <p class="url-label">Full Connection URL (with authentication):</p>
        <div class="connection-url">
          <input 
            type="text" 
            :value="connectionUrl" 
            readonly
            @click="selectUrl"
            ref="urlInput"
          />
          <button 
            class="copy-btn" 
            @click="copyUrl"
            :title="urlCopied ? 'Copied!' : 'Copy URL'"
          >
            <Icon :name="urlCopied ? 'mdi:check' : 'mdi:content-copy'" />
          </button>
        </div>
        <!-- Hide Cloudflare tunnel message for now -->
        <p class="url-note" v-if="false && tunnelUrl">
          <Icon name="mdi:cloud" />
          Using Cloudflare tunnel for global access
        </p>
        
        <!-- Local Network URL -->
        <p class="url-label" style="margin-top: 12px;">Local Network URL:</p>
        <div class="connection-url">
          <input 
            type="text" 
            :value="localNetworkUrl" 
            readonly
            @click="selectLocalUrl"
            ref="localUrlInput"
          />
          <button 
            class="copy-btn" 
            @click="copyLocalUrl"
            :title="localUrlCopied ? 'Copied!' : 'Copy URL'"
          >
            <Icon :name="localUrlCopied ? 'mdi:check' : 'mdi:content-copy'" />
          </button>
        </div>
        <p class="url-note">
          <Icon name="mdi:lan" />
          For devices on the same network
        </p>
      </div>
      
      <!-- Device Token Info -->
      <div class="token-info">
        <Icon name="mdi:shield-check" />
        <span>This connection is secured with a device token</span>
      </div>
      
      <!-- Regenerate Button -->
      <button 
        class="regenerate-btn"
        @click="regenerateConnection"
        :disabled="isGenerating"
      >
        <Icon name="mdi:refresh" :class="{ 'spin': isGenerating }" />
        Generate New Connection
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import QRCode from 'qrcode';
import { DeviceAuthService } from '~/services/device-auth';
import { useAppStatus } from '~/composables/useAppStatus';

const appStatus = useAppStatus();

// State
const qrCodeDataUrl = ref<string>('');
const pairingCode = ref<string>('');
const connectionUrl = ref<string>('');
const deviceToken = ref<string>('');
const tunnelUrl = ref<string>('');
const localNetworkUrl = ref<string>('');
const copied = ref(false);
const urlCopied = ref(false);
const localUrlCopied = ref(false);
const isGenerating = ref(false);
const urlInput = ref<HTMLInputElement>();
const localUrlInput = ref<HTMLInputElement>();

// Copy timeout
let copyTimeout: NodeJS.Timeout;

// Tunnel check interval
let tunnelCheckInterval: NodeJS.Timer;

// Generate connection info on mount
onMounted(async () => {
  // First try to load existing persisted token
  if (await loadPersistedToken()) {
    
  } else {
    // Generate new if no persisted token
    await generateConnectionInfo();
  }
  
  // Check for relay/tunnel availability periodically
  tunnelCheckInterval = setInterval(async () => {
    if (!tunnelUrl.value) {
      // Check relay first
      if (window.electronAPI?.relay?.getInfo) {
        const relayInfo = await window.electronAPI.relay.getInfo();
        if (relayInfo?.url) {
          
          await generateConnectionInfo();
          return;
        }
      }
      
      // Then check tunnel
      if (window.electronAPI?.tunnel?.getInfo) {
        const tunnelInfo = await window.electronAPI.tunnel.getInfo();
        if (tunnelInfo?.url && tunnelInfo.status === 'ready') {
          
          await generateConnectionInfo();
        }
      }
    }
  }, 5000);
});

// Cleanup
onUnmounted(() => {
  if (copyTimeout) {
    clearTimeout(copyTimeout);
  }
  if (tunnelCheckInterval) {
    clearInterval(tunnelCheckInterval);
  }
});

/**
 * Generate new connection info including QR code
 */
async function generateConnectionInfo() {
  if (isGenerating.value) return;
  
  isGenerating.value = true;
  try {
    // Check if we have a relay or tunnel URL available
    let baseUrl: string;
    
    // Check relay first (preferred)
    const relayInfo = await window.electronAPI?.relay?.getInfo?.();
    
    
    if (relayInfo?.url) {
      // Use relay URL if available (subdomain-based now)
      // The relay server will return the subdomain URL
      baseUrl = relayInfo.url;
      tunnelUrl.value = relayInfo.url;
      
    } else {
      // Fall back to tunnel info
      const tunnelInfo = await window.electronAPI?.tunnel?.getInfo?.();
      
      
      if (tunnelInfo?.url && tunnelInfo.status === 'ready') {
        // Use tunnel URL if available
        baseUrl = tunnelInfo.url;
        tunnelUrl.value = tunnelInfo.url;
        
      } else {
        // Fall back to local URL
        const socketUrl = appStatus.serverUrl.value || `http://localhost:3789`;
        // Convert to web UI URL (change port from 3789 to 3000)
        baseUrl = socketUrl.replace(':3789', ':3000');
        tunnelUrl.value = '';
        
      }
    }
    
    // Generate device auth token
    const deviceAuth = await DeviceAuthService.generateDeviceToken();
    
    // Generate connection info with the chosen URL
    const connectionInfo = await DeviceAuthService.generateConnectionInfo(
      baseUrl,
      deviceAuth
    );
    
    // Update state
    connectionUrl.value = connectionInfo.url;
    pairingCode.value = connectionInfo.pairingCode;
    deviceToken.value = deviceAuth.token;
    
    // Set local network URL with same auth params as the main connection URL
    const socketUrl = appStatus.serverUrl.value || `http://localhost:3789`;
    const localBaseUrl = socketUrl.replace(':3789', ':3000');
    
    // Build local URL with the SAME pairing code from the main connection
    const localUrl = new URL(localBaseUrl);
    localUrl.searchParams.set('deviceId', deviceAuth.deviceId);
    localUrl.searchParams.set('token', deviceAuth.token);
    localUrl.searchParams.set('pairing', connectionInfo.pairingCode);  // Use same pairing code
    
    
    
    localNetworkUrl.value = localUrl.toString();
    
    // Store token on server for validation (only in Electron)
    if (typeof window !== 'undefined' && window.electronAPI?.remote?.storeToken) {
      try {
        await window.electronAPI.remote.storeToken({
          token: deviceAuth.token,
          deviceId: deviceAuth.deviceId,
          deviceName: deviceAuth.name,
          pairingCode: connectionInfo.pairingCode,
          expiresAt: deviceAuth.expiresAt
        });
        
      } catch (error) {
        console.error('[QuickConnect] Failed to store token:', error);
      }
    } else {
      // In browser mode, we can't store tokens server-side
      // The remote server will need to handle this differently
      
    }
    
    // Persist token data to workspace for reuse
    if (window.electronAPI?.remote?.persistToken) {
      try {
        await window.electronAPI.remote.persistToken({
          token: deviceAuth.token,
          deviceId: deviceAuth.deviceId,
          deviceName: deviceAuth.name,
          pairingCode: connectionInfo.pairingCode,
          connectionUrl: connectionInfo.url,
          expiresAt: deviceAuth.expiresAt
        });
        
      } catch (error) {
        console.error('[QuickConnect] Failed to persist token:', error);
      }
    }
    
    // Generate QR code
    try {
      qrCodeDataUrl.value = await QRCode.toDataURL(connectionInfo.url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#333333',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  } finally {
    isGenerating.value = false;
  }
}

/**
 * Load persisted token from workspace
 */
async function loadPersistedToken(): Promise<boolean> {
  if (!window.electronAPI?.remote?.loadPersistedToken) {
    return false;
  }
  
  try {
    const tokenData = await window.electronAPI.remote.loadPersistedToken();
    if (tokenData && tokenData.token) {
      // Check if token is still valid (not expired)
      const expiresAt = new Date(tokenData.expiresAt);
      if (expiresAt > new Date()) {
        // Use the persisted token
        connectionUrl.value = tokenData.connectionUrl;
        pairingCode.value = tokenData.pairingCode;
        deviceToken.value = tokenData.token;
        
        // Store it on server for validation
        if (window.electronAPI?.remote?.storeToken) {
          await window.electronAPI.remote.storeToken({
            token: tokenData.token,
            deviceId: tokenData.deviceId,
            deviceName: tokenData.deviceName,
            pairingCode: tokenData.pairingCode,
            expiresAt: expiresAt
          });
        }
        
        // Generate QR code
        try {
          qrCodeDataUrl.value = await QRCode.toDataURL(tokenData.connectionUrl, {
            width: 256,
            margin: 2,
            color: {
              dark: '#333333',
              light: '#FFFFFF'
            }
          });
        } catch (err) {
          console.error('Failed to generate QR code:', err);
        }
        
        return true;
      }
    }
  } catch (error) {
    console.error('[QuickConnect] Failed to load persisted token:', error);
  }
  
  return false;
}

/**
 * Regenerate connection info
 */
async function regenerateConnection() {
  await generateConnectionInfo();
}

/**
 * Copy pairing code to clipboard
 */
async function copyPairingCode() {
  try {
    await navigator.clipboard.writeText(pairingCode.value);
    copied.value = true;
    
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Copy connection URL to clipboard
 */
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(connectionUrl.value);
    urlCopied.value = true;
    
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      urlCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Select URL text when clicked
 */
function selectUrl() {
  if (urlInput.value) {
    urlInput.value.select();
  }
}

/**
 * Copy local network URL to clipboard
 */
async function copyLocalUrl() {
  try {
    await navigator.clipboard.writeText(localNetworkUrl.value);
    localUrlCopied.value = true;
    
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      localUrlCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Select local URL text when clicked
 */
function selectLocalUrl() {
  if (localUrlInput.value) {
    localUrlInput.value.select();
  }
}
</script>

<style scoped>
.quick-connect-section {
  margin-bottom: 24px;
  padding: 16px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
}

.quick-connect-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.connect-options {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* QR Code */
.qr-code-container {
  text-align: center;
}

.qr-code {
  display: inline-block;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.qr-code img {
  display: block;
  width: 200px;
  height: 200px;
}

.qr-instructions {
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Pairing Code */
.pairing-code-container {
  text-align: center;
}

.pairing-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0 0 8px 0;
}

.pairing-code {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.pairing-code code {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--color-primary);
  font-family: var(--font-mono);
}

/* Connection URL */
.connection-url-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.url-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 0;
}

.connection-url {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-url input {
  flex: 1;
  padding: 8px 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-primary);
  cursor: text;
}

.connection-url input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.url-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.url-note .icon {
  width: 14px;
  height: 14px;
}

/* Copy Button */
.copy-btn {
  padding: 8px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.copy-btn:hover {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-primary);
}

.copy-btn .icon {
  font-size: 16px;
  color: var(--color-text-secondary);
}

.copy-btn:hover .icon {
  color: var(--color-primary);
}

/* Token Info */
.token-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background-color: var(--color-success-bg);
  color: var(--color-success);
  border-radius: 6px;
  font-size: 13px;
}

.token-info .icon {
  font-size: 16px;
}

/* Regenerate Button */
.regenerate-btn {
  padding: 10px 16px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.regenerate-btn:hover:not(:disabled) {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.regenerate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.regenerate-btn .icon {
  font-size: 18px;
}

/* Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .qr-code {
    background: #f5f5f5;
  }
  
  .quick-connect-section {
    background-color: #222;
  }
  
  .pairing-code,
  .connection-url input,
  .copy-btn,
  .regenerate-btn {
    background-color: #333;
  }
}
</style>