<template>
  <div class="mobile-terminal">
    <!-- Terminal Tabs Header -->
    <div class="terminal-tabs-header">
      <div class="tabs-container">
        <div
          v-for="terminal in terminals"
          :key="terminal.id"
          :class="['terminal-tab', { active: terminal.id === activeTerminalId }]"
          @click="setActiveTerminal(terminal.id)"
        >
          <Icon name="mdi:console" class="tab-icon" />
          <span class="tab-name">{{ terminal.name || 'Terminal' }}</span>
          <button
            v-if="terminals.length > 1"
            @click.stop="removeTerminal(terminal.id)"
            class="tab-close"
            title="Close terminal"
          >
            <Icon name="mdi:close" />
          </button>
        </div>
        <button
          @click="createNewTerminal"
          class="tab-add"
          title="New Terminal"
        >
          <Icon name="mdi:plus" />
        </button>
      </div>
      
      <div class="terminal-actions">
        <button 
          @click="clearCurrentTerminal" 
          v-if="activeTerminalId"
          class="action-btn" 
          title="Clear"
        >
          <Icon name="mdi:broom" />
        </button>
      </div>
    </div>
    
    <!-- Terminal Content Area -->
    <div class="terminal-container">
      <div v-if="!isTerminalAvailable" class="empty-state">
        <Icon name="mdi:console-network-outline" />
        <p>Terminal Unavailable</p>
        <p class="hint">Connect to desktop to use terminal</p>
      </div>
      
      <div v-else-if="terminals.length === 0" class="empty-state">
        <Icon name="mdi:console" />
        <p>No terminals open</p>
        <button @click="createNewTerminal" class="create-btn">
          Create Terminal
        </button>
      </div>
      
      <!-- Terminal Sessions -->
      <div
        v-for="terminal in terminals"
        v-show="terminal.id === activeTerminalId"
        :key="`session-${terminal.id}`"
        :ref="el => terminalRefs[terminal.id] = el"
        class="terminal-session"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import 'xterm/css/xterm.css';
import { useServices } from '~/composables/useServices';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useMobileConnection } from '~/composables/useMobileConnection';

interface TerminalSession {
  id: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  dataHandler?: () => void;
  inputBuffer: string;
}

// Use mobile connection for mobile devices
const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const remoteConnection = isMobileDevice ? useMobileConnection() : useRemoteConnection();
const { connected } = remoteConnection;
const { services, initialize } = useServices();

// Terminal state
const terminals = ref<any[]>([]);
const activeTerminalId = ref<string | null>(null);
const terminalSessions = ref(new Map<string, TerminalSession>());
const terminalRefs = ref<Record<string, any>>({});

// Loading state
const isInitializing = ref(false);

// Computed property to check if terminal is available
const isTerminalAvailable = computed(() => {
  const hasServices = !!services.value;
  const serviceConnected = services.value?.isConnected?.() ?? false;
  return hasServices && (serviceConnected || connected.value);
});

// Initialize services on mount
onMounted(async () => {
  await initialize();
  if (isTerminalAvailable.value) {
    await loadTerminals();
  }
});

// Watch for terminal availability
watch(isTerminalAvailable, async (available) => {
  if (available && terminals.value.length === 0) {
    await loadTerminals();
  }
});

// Watch for workspace changes
let lastWorkspace = (window as any).__remoteWorkspace?.path;
const workspaceCheckInterval = setInterval(async () => {
  const currentWorkspace = (window as any).__remoteWorkspace?.path;
  if (currentWorkspace && currentWorkspace !== lastWorkspace) {
    console.log('[MobileTerminal] Workspace changed from', lastWorkspace, 'to', currentWorkspace);
    lastWorkspace = currentWorkspace;
    
    // Clear existing sessions
    for (const session of terminalSessions.value.values()) {
      if (session.dataHandler) {
        session.dataHandler();
      }
      session.terminal.dispose();
    }
    terminalSessions.value.clear();
    
    // Reload terminals for new workspace
    await loadTerminals();
  }
}, 1000);

// Load existing terminals from the service
async function loadTerminals() {
  if (!services.value || isInitializing.value) return;
  
  try {
    isInitializing.value = true;
    console.log('[MobileTerminal] Loading terminals...');
    
    // Get all active terminals from desktop
    const activeTerminals = await services.value.terminal.listActiveTerminals();
    console.log('[MobileTerminal] Active terminals:', activeTerminals);
    
    if (activeTerminals && activeTerminals.length > 0) {
      // Filter terminals for current workspace
      const workspace = (window as any).__remoteWorkspace?.path || '/';
      const workspaceTerminals = activeTerminals.filter(t => 
        t.workingDirectory === workspace || 
        // Also include terminals without explicit workspace (legacy)
        (!t.workingDirectory && activeTerminals.length === 1)
      );
      
      console.log('[MobileTerminal] Workspace terminals:', workspaceTerminals);
      terminals.value = workspaceTerminals;
      
      // Initialize sessions for each terminal
      for (const terminal of workspaceTerminals) {
        await initializeTerminalSession(terminal);
      }
      
      // Set the first terminal as active if none is set
      if (!activeTerminalId.value && workspaceTerminals.length > 0) {
        setActiveTerminal(workspaceTerminals[0].id);
      }
    } else {
      // No terminals exist on desktop
      terminals.value = [];
    }
    
  } catch (error) {
    console.error('[MobileTerminal] Failed to load terminals:', error);
    terminals.value = [];
  } finally {
    isInitializing.value = false;
  }
}

// Initialize a terminal session
async function initializeTerminalSession(terminalInfo: any) {
  if (terminalSessions.value.has(terminalInfo.id)) return;
  
  console.log('[MobileTerminal] Initializing session for terminal:', terminalInfo.id);
  
  // Create xterm instance
  const terminal = new Terminal({
    theme: {
      background: '#0a0b0d',
      foreground: '#e0e0e0',
      cursor: '#5CA0F2',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff'
    },
    fontFamily: '"SF Mono", Monaco, "Cascadia Code", monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    allowTransparency: true,
    scrollback: 1000
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);
  
  // Create session object
  const session: TerminalSession = {
    id: terminalInfo.id,
    terminal,
    fitAddon,
    serializeAddon,
    inputBuffer: ''
  };
  
  // Set up terminal input handler
  terminal.onData((data: string) => {
    // Send input to remote terminal
    if (services.value) {
      services.value.terminal.writeToTerminal(terminalInfo.id, data);
    }
  });
  
  try {
    // Set up data handler from remote terminal
    session.dataHandler = services.value!.terminal.onTerminalData(terminalInfo.id, (data: string) => {
      console.log(`[MobileTerminal] Received data for terminal ${terminalInfo.id}, length: ${data.length}`);
      terminal.write(data);
    });
    
    // Store session
    terminalSessions.value.set(terminalInfo.id, session);
    terminalSessions.value = new Map(terminalSessions.value); // Force reactivity
    
    // Wait for next tick to ensure DOM is ready
    await nextTick();
    
    // Attach terminal to DOM if this is the active terminal
    if (terminalInfo.id === activeTerminalId.value) {
      attachTerminal(terminalInfo.id);
    }
    
    // Restore terminal buffer if available
    if (terminalInfo.currentBuffer) {
      console.log(`[MobileTerminal] Restoring terminal buffer for ${terminalInfo.id}`);
      // Wait a bit for terminal to be fully ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check if deserialize method exists
      if (serializeAddon && typeof serializeAddon.deserialize === 'function') {
        try {
          // Use deserialize to restore the terminal state
          serializeAddon.deserialize(terminalInfo.currentBuffer);
          console.log('[MobileTerminal] Successfully restored terminal state');
        } catch (e) {
          console.error('[MobileTerminal] Failed to deserialize terminal buffer:', e);
          // Fall back to writing raw content
          terminal.write(terminalInfo.currentBuffer);
        }
      } else {
        // SerializeAddon might not support deserialize, just write the content
        console.log('[MobileTerminal] SerializeAddon.deserialize not available, writing content directly');
        try {
          terminal.write(terminalInfo.currentBuffer);
        } catch (e) {
          console.error('[MobileTerminal] Failed to write terminal buffer:', e);
        }
      }
    } else {
      // Send empty string to trigger initial prompt only if no buffer
      await services.value!.terminal.writeToTerminal(terminalInfo.id, '');
    }
    
  } catch (error) {
    console.error('[MobileTerminal] Failed to initialize terminal session:', error);
    terminal.dispose();
    terminalSessions.value.delete(terminalInfo.id);
  }
}

// Attach terminal to DOM
function attachTerminal(terminalId: string) {
  const session = terminalSessions.value.get(terminalId);
  const container = terminalRefs.value[terminalId];
  
  if (!session || !container) {
    console.error('[MobileTerminal] Cannot attach terminal - missing session or container');
    return;
  }
  
  // Clear container
  container.innerHTML = '';
  
  // Open terminal in container
  session.terminal.open(container);
  
  // Fit terminal to container
  nextTick(() => {
    try {
      session.fitAddon.fit();
    } catch (e) {
      console.error('[MobileTerminal] Failed to fit terminal:', e);
    }
  });
}

// Create a new terminal
async function createNewTerminal() {
  if (!services.value) return;
  
  try {
    const workspace = (window as any).__remoteWorkspace?.path || '/';
    const terminalNumber = terminals.value.length + 1;
    const terminalName = `Terminal ${terminalNumber}`;
    
    // Create terminal through service with name
    const terminalId = await services.value.terminal.createTerminal({
      cwd: workspace,
      cols: 80,
      rows: 24,
      name: terminalName
    });
    
    console.log('[MobileTerminal] Created new terminal:', terminalId);
    
    // Create terminal info object matching desktop format
    const newTerminal = {
      id: terminalId,
      name: terminalName,
      workingDirectory: workspace,
      createdAt: new Date().toISOString()
    };
    
    terminals.value.push(newTerminal);
    
    // Initialize session
    await initializeTerminalSession(newTerminal);
    
    // Make it active
    setActiveTerminal(terminalId);
    
  } catch (error) {
    console.error('[MobileTerminal] Failed to create terminal:', error);
  }
}

// Remove a terminal
async function removeTerminal(terminalId: string) {
  if (!services.value || terminals.value.length <= 1) return;
  
  try {
    // Clean up session
    const session = terminalSessions.value.get(terminalId);
    if (session) {
      if (session.dataHandler) {
        session.dataHandler(); // Call to remove listener
      }
      session.terminal.dispose();
      terminalSessions.value.delete(terminalId);
      terminalSessions.value = new Map(terminalSessions.value); // Force reactivity
    }
    
    // Remove from list
    const index = terminals.value.findIndex(t => t.id === terminalId);
    if (index > -1) {
      terminals.value.splice(index, 1);
    }
    
    // Switch to another terminal if this was active
    if (activeTerminalId.value === terminalId && terminals.value.length > 0) {
      setActiveTerminal(terminals.value[0].id);
    }
    
    // Note: We don't destroy the terminal on the service side
    // because it might still be used on desktop
    
  } catch (error) {
    console.error('[MobileTerminal] Failed to remove terminal:', error);
  }
}

// Set active terminal
function setActiveTerminal(terminalId: string) {
  activeTerminalId.value = terminalId;
  
  // Attach the terminal after DOM update
  nextTick(() => {
    attachTerminal(terminalId);
  });
}

// Clear current terminal
function clearCurrentTerminal() {
  if (!activeTerminalId.value) return;
  const session = terminalSessions.value.get(activeTerminalId.value);
  if (session) {
    session.terminal.clear();
  }
}

// Handle window resize
const resizeObserver = new ResizeObserver(() => {
  if (activeTerminalId.value) {
    const session = terminalSessions.value.get(activeTerminalId.value);
    if (session) {
      try {
        session.fitAddon.fit();
      } catch (e) {
        // Ignore fit errors during resize
      }
    }
  }
});

// Watch for active terminal changes
watch(activeTerminalId, (newId, oldId) => {
  if (oldId && terminalRefs.value[oldId]) {
    // Clean up old terminal container
    const oldContainer = terminalRefs.value[oldId];
    if (oldContainer) {
      resizeObserver.unobserve(oldContainer);
    }
  }
  
  if (newId && terminalRefs.value[newId]) {
    // Observe new terminal container
    const newContainer = terminalRefs.value[newId];
    if (newContainer) {
      resizeObserver.observe(newContainer);
    }
  }
});

// Clean up on unmount
onUnmounted(() => {
  // Clear workspace check interval
  clearInterval(workspaceCheckInterval);
  
  // Clean up all sessions
  for (const session of terminalSessions.value.values()) {
    if (session.dataHandler) {
      session.dataHandler();
    }
    session.terminal.dispose();
  }
  
  // Disconnect resize observer
  resizeObserver.disconnect();
});
</script>

<style scoped>
.mobile-terminal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0b0d;
}

/* Terminal Tabs Header */
.terminal-tabs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(180deg, #1a1b1f 0%, #141518 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 44px;
  padding: 0 8px;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  white-space: nowrap;
  min-width: 0;
}

.terminal-tab:hover {
  background: rgba(255, 255, 255, 0.05);
}

.terminal-tab.active {
  background: rgba(92, 160, 242, 0.1);
  border-color: rgba(92, 160, 242, 0.3);
}

.tab-icon {
  font-size: 14px;
  opacity: 0.8;
  color: rgba(255, 255, 255, 0.6);
}

.terminal-tab.active .tab-icon {
  color: #5CA0F2;
}

.tab-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 2px;
  margin-left: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 6px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.tab-add:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

.terminal-actions {
  display: flex;
  gap: 8px;
  margin-left: 8px;
}

.action-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 6px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* Terminal Container */
.terminal-container {
  flex: 1;
  overflow: hidden;
  background: #0a0b0d;
  position: relative;
}

.terminal-session {
  height: 100%;
  width: 100%;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.4);
  gap: 12px;
  padding: 20px;
  text-align: center;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.3;
  color: #5CA0F2;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.empty-state .hint {
  font-size: 14px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
}

.create-btn {
  padding: 8px 16px;
  background: rgba(92, 160, 242, 0.1);
  color: #5CA0F2;
  border: 1px solid rgba(92, 160, 242, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.create-btn:hover {
  background: rgba(92, 160, 242, 0.2);
  transform: translateY(-1px);
}

/* Scrollbar styling */
.tabs-container::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}

.tabs-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
}

.tabs-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.tabs-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Override xterm.js styles for mobile */
:deep(.xterm) {
  padding: 8px;
  height: 100%;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}

:deep(.xterm-screen) {
  height: 100% !important;
}
</style>