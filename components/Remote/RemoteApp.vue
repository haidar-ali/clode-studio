<template>
  <div class="remote-app" :class="deviceClass">
    <!-- Mobile Header -->
    <header class="remote-header" v-if="!isDesktop">
      <ConnectionStatus />
      <h1>Clode Studio</h1>
      <div class="header-actions">
        <button @click="showDebugPanel = !showDebugPanel" class="debug-btn" title="Debug Info">
          <Icon name="mdi:bug" />
        </button>
        <button @click="showMenu = true" class="menu-btn">
          <Icon name="mdi:menu" />
        </button>
      </div>
    </header>
    
    <!-- Desktop Layout -->
    <IDELayout v-if="isDesktop" />
    
    <!-- Mobile/Tablet Layout -->
    <div v-else class="mobile-layout">
      <!-- Active Panel - Now takes full height -->
      <component 
        :is="activePanel.component" 
        v-bind="activePanel.props || {}"
        class="active-panel"
        @file-opened="handleFileOpened"
      />
    </div>
    
    <!-- Connection Modal -->
    <RemoteConnectionModal 
      v-if="!connected" 
      :show="true"
      @connected="onConnected"
    />
    
    <!-- Debug Panel Drawer -->
    <Teleport to="body" v-if="showDebugPanel && !isDesktop">
      <div class="debug-drawer-overlay" @click="showDebugPanel = false">
        <div class="debug-drawer" @click.stop>
          <div class="debug-drawer-header">
            <h3>Debug Information</h3>
            <button @click="showDebugPanel = false" class="close-btn">
              <Icon name="mdi:close" />
            </button>
          </div>
          <div class="debug-drawer-content">
            <DebugPanel />
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- Mobile Menu Drawer -->
    <MobileMenuDrawer
      v-if="!isDesktop"
      :show="showMenu"
      :menu-items="panels"
      :active-panel="activePanelId"
      @close="showMenu = false"
      @select-panel="activePanelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useMobileConnection } from '~/composables/useMobileConnection';
import { useResponsive } from '~/composables/useResponsive';
import IDELayout from '~/components/Layout/IDELayout.vue';
import ConnectionStatus from '~/components/Layout/ConnectionStatus.vue';
// Import mobile wrapper components
import MobileExplorer from './MobileExplorer.vue';
import MobileEditor from './MobileEditor.vue';
import MobileTerminal from './MobileTerminalXterm.vue';
import MobileClaude from './MobileClaudeXterm.vue';
import RemoteConnectionModal from './RemoteConnectionModal.vue';
import MobileMenuDrawer from './MobileMenuDrawer.vue';
import DebugPanel from './DebugPanel.vue';

const { isPhone, isTablet, isDesktop, deviceClass } = useResponsive();

// Use mobile-optimized connection for phones, regular for others
const isMobileDevice = isPhone.value || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const remoteConnection = isMobileDevice ? useMobileConnection() : useRemoteConnection();
const { connected, connect } = remoteConnection;

const showMenu = ref(false);
const showDebugPanel = ref(false);

const panels = computed(() => [
  { id: 'explorer', label: 'Files', icon: 'mdi:folder', component: MobileExplorer },
  { 
    id: 'editor', 
    label: 'Code', 
    icon: 'mdi:code-braces', 
    component: MobileEditor,
    props: { fileData: openedFile.value }
  },
  { id: 'terminal', label: 'Terminal', icon: 'mdi:console', component: MobileTerminal },
  { id: 'claude', label: 'Claude', icon: 'mdi:robot', component: MobileClaude }
]);

const activePanelId = ref('explorer');
const activePanel = computed(() => 
  panels.value.find(p => p.id === activePanelId.value) || panels.value[0]
);

// Store for opened file data
const openedFile = ref<{ path: string; content: string; name: string } | null>(null);

async function onConnected() {
  // Connected successfully, modal will close
}

function handleFileOpened(fileData: { path: string; content: string; name: string }) {
  console.log('File opened in RemoteApp:', fileData.path);
  console.log('File content length:', fileData.content?.length || 0);
  // Store the file data
  openedFile.value = fileData;
  // Switch to editor panel
  activePanelId.value = 'editor';
  
  // Log the active panel after switch
  setTimeout(() => {
    console.log('Active panel after switch:', activePanelId.value);
    console.log('Active panel props:', activePanel.value?.props);
  }, 100);
}

onMounted(async () => {
  console.log('[RemoteApp] Component mounted');
  // Auto-connect using URL params
  const urlParams = new URLSearchParams(window.location.search);
  const deviceToken = urlParams.get('token');
  const deviceId = urlParams.get('deviceId');
  
  console.log('[RemoteApp] URL params:', { deviceToken: !!deviceToken, deviceId: !!deviceId });
  
  if (deviceToken && deviceId) {
    console.log('[RemoteApp] Attempting to connect with credentials');
    try {
      await connect({ deviceToken, deviceId });
    } catch (err) {
      console.error('[RemoteApp] Connection failed:', err);
    }
  } else {
    console.log('[RemoteApp] Missing credentials, not connecting');
  }
});
</script>

<style scoped>
.remote-app {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

/* Mobile Header */
.remote-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(180deg, #1a1b1f 0%, #141518 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}

.remote-header h1 {
  font-size: 18px;
  margin: 0;
  flex: 1;
  text-align: center;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.02em;
}

.menu-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.menu-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* Mobile Layout */
.mobile-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.active-panel {
  flex: 1;
  overflow: auto;
  /* Take full height now that bottom nav is gone */
  height: 100%;
}

/* Mobile Navigation - Removed, now using menu drawer */

/* Header Actions */
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.debug-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
}

.debug-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* Debug Drawer */
.debug-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  animation: fadeIn 0.2s;
}

.debug-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-primary);
  border-top: 1px solid var(--color-border);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;
}

.debug-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.debug-drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-hover);
}

.debug-drawer-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* Responsive utilities */
.phone {
  --panel-padding: 12px;
}

.tablet {
  --panel-padding: 16px;
}

.desktop {
  --panel-padding: 20px;
}
</style>