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
      
      <!-- Connection URL -->
      <div class="connection-url-container">
        <p class="url-label">Connection URL:</p>
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
const copied = ref(false);
const urlCopied = ref(false);
const isGenerating = ref(false);
const urlInput = ref<HTMLInputElement>();

// Copy timeout
let copyTimeout: NodeJS.Timeout;

// Generate connection info on mount
onMounted(async () => {
  await generateConnectionInfo();
});

// Cleanup
onUnmounted(() => {
  if (copyTimeout) {
    clearTimeout(copyTimeout);
  }
});

/**
 * Generate new connection info including QR code
 */
async function generateConnectionInfo() {
  if (isGenerating.value) return;
  
  isGenerating.value = true;
  try {
    // Get server URL from app status
    const serverUrl = appStatus.serverUrl.value || `http://localhost:3001`;
    
    // Generate device auth token
    const deviceAuth = await DeviceAuthService.generateDeviceToken();
    
    // Generate connection info
    const connectionInfo = await DeviceAuthService.generateConnectionInfo(
      serverUrl,
      deviceAuth
    );
    
    // Update state
    connectionUrl.value = connectionInfo.url;
    pairingCode.value = connectionInfo.pairingCode;
    deviceToken.value = deviceAuth.token;
    
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