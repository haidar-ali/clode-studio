<template>
  <div v-if="isHybridMode && tunnelInfo" class="tunnel-status">
    <!-- Tunnel Status Indicator -->
    <div class="tunnel-indicator" :class="tunnelInfo.status">
      <Icon 
        :name="getStatusIcon()" 
        :class="['status-icon', tunnelInfo.status]"
      />
      <span class="status-text">{{ getStatusText() }}</span>
    </div>

    <!-- Tunnel URL Display -->
    <div v-if="tunnelInfo.status === 'ready' && tunnelInfo.url" class="tunnel-url-section">
      <div class="tunnel-url-header">
        <Icon name="globe" />
        <span>Remote Access URL</span>
        <button @click="copyUrl" class="copy-btn" title="Copy URL">
          <Icon name="copy" />
        </button>
      </div>
      
      <div class="tunnel-url">
        <input 
          :value="tunnelInfo.url" 
          readonly 
          class="url-input"
          @click="$event.target.select()"
        />
      </div>

      <!-- QR Code -->
      <div class="qr-section">
        <div class="qr-header">
          <Icon name="qr-code" />
          <span>Scan to access from mobile</span>
        </div>
        <div class="qr-code" ref="qrContainer"></div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="tunnelInfo.status === 'error' && tunnelInfo.error" class="tunnel-error">
      <Icon name="alert-triangle" />
      <span>{{ tunnelInfo.error }}</span>
      <button @click="retryTunnel" class="retry-btn">
        <Icon name="refresh-cw" />
        Retry
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Icon from '../Icon.vue'
import QRCode from 'qrcode'

// Reactive state
const isHybridMode = ref(false)
const tunnelInfo = ref(null)
const qrContainer = ref(null)

// Get app status and tunnel info
async function updateStatus() {
  try {
    const status = await window.electronAPI.app.getStatus()
    isHybridMode.value = status.mode === 'hybrid'
    tunnelInfo.value = status.tunnel
  } catch (error) {
    console.error('Failed to get app status:', error)
  }
}

// Generate QR code
async function generateQR() {
  if (!tunnelInfo.value?.url || !qrContainer.value) return
  
  try {
    // Clear previous QR code
    qrContainer.value.innerHTML = ''
    
    // Generate new QR code
    const qrCanvas = document.createElement('canvas')
    await QRCode.toCanvas(qrCanvas, tunnelInfo.value.url, {
      width: 200,
      margin: 2,
      color: {
        dark: '#1f2937',
        light: '#ffffff'
      }
    })
    
    qrContainer.value.appendChild(qrCanvas)
  } catch (error) {
    console.error('Failed to generate QR code:', error)
  }
}

// Status helpers
function getStatusIcon() {
  switch (tunnelInfo.value?.status) {
    case 'starting': return 'loader'
    case 'ready': return 'check-circle'
    case 'error': return 'alert-triangle'
    default: return 'circle'
  }
}

function getStatusText() {
  switch (tunnelInfo.value?.status) {
    case 'starting': return 'Starting tunnel...'
    case 'ready': return 'Tunnel active'
    case 'error': return 'Tunnel failed'
    default: return 'Tunnel inactive'
  }
}

// Actions
async function copyUrl() {
  if (!tunnelInfo.value?.url) return
  
  try {
    await navigator.clipboard.writeText(tunnelInfo.value.url)
    // Could show a toast notification here
    console.log('URL copied to clipboard')
  } catch (error) {
    console.error('Failed to copy URL:', error)
  }
}

async function retryTunnel() {
  try {
    await window.electronAPI.tunnel.start()
  } catch (error) {
    console.error('Failed to retry tunnel:', error)
  }
}

// Listen for tunnel status updates
function handleTunnelStatusUpdate(event, newTunnelInfo) {
  tunnelInfo.value = newTunnelInfo
}

// Watch for tunnel URL changes to regenerate QR code
watch(() => tunnelInfo.value?.url, (newUrl) => {
  if (newUrl && tunnelInfo.value?.status === 'ready') {
    nextTick(() => {
      generateQR()
    })
  }
}, { immediate: true })

onMounted(() => {
  // Initial status update
  updateStatus()
  
  // Listen for tunnel status updates from main process
  window.electronAPI.ipcRenderer.on('tunnel:status-updated', handleTunnelStatusUpdate)
  
  // Periodic status updates as backup
  const interval = setInterval(updateStatus, 5000)
  
  onUnmounted(() => {
    clearInterval(interval)
    window.electronAPI.ipcRenderer.removeListener('tunnel:status-updated', handleTunnelStatusUpdate)
  })
})
</script>

<style scoped>
.tunnel-status {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 16px;
  background: white;
}

.tunnel-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.status-icon {
  width: 16px;
  height: 16px;
}

.status-icon.starting {
  color: #f59e0b;
  animation: spin 1s linear infinite;
}

.status-icon.ready {
  color: #10b981;
}

.status-icon.error {
  color: #ef4444;
}

.tunnel-url-section {
  margin-top: 16px;
}

.tunnel-url-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 500;
}

.copy-btn {
  margin-left: auto;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: #f3f4f6;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.copy-btn:hover {
  background: #e5e7eb;
}

.tunnel-url {
  margin-bottom: 16px;
}

.url-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  font-family: monospace;
  font-size: 14px;
}

.qr-section {
  text-align: center;
}

.qr-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #6b7280;
}

.qr-code {
  display: flex;
  justify-content: center;
}

.tunnel-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
}

.retry-btn {
  margin-left: auto;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: #dc2626;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.retry-btn:hover {
  background: #b91c1c;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>