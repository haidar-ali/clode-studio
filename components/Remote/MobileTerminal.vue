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
          v-if="activeTerminalId && terminalSessions.has(activeTerminalId)"
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
        class="terminal-session"
      >
        <div class="terminal-content" :ref="el => terminalRefs[terminal.id] = el">
          <div class="terminal-output" :ref="el => outputRefs[terminal.id] = el">
            <div 
              v-for="(line, index) in getTerminalOutput(terminal.id)" 
              :key="`${terminal.id}-${index}`" 
              class="terminal-line"
            >
              <span :class="['line-content', line.type]" v-html="formatOutput(line.content)"></span>
            </div>
          </div>
          
          <div class="terminal-input-wrapper">
            <input
              v-model="terminalInputs[terminal.id]"
              @keydown.enter="executeCommand(terminal.id)"
              @keydown.up.prevent="navigateHistory(terminal.id, -1)"
              @keydown.down.prevent="navigateHistory(terminal.id, 1)"
              @keydown.tab.prevent="handleTab(terminal.id)"
              :ref="el => inputRefs[terminal.id] = el"
              class="terminal-input"
              placeholder="Type command..."
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch, reactive } from 'vue';
import { useServices } from '~/composables/useServices';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useMobileConnection } from '~/composables/useMobileConnection';

interface TerminalLine {
  type: 'command' | 'output' | 'error';
  content: string;
}

interface TerminalSession {
  id: string;
  terminalServiceId: string; // ID from the terminal service
  output: TerminalLine[];
  history: string[];
  historyIndex: number;
  dataHandler?: () => void;
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
const terminalInputs = reactive<Record<string, string>>({});

// Refs for DOM elements
const terminalRefs = ref<Record<string, any>>({});
const outputRefs = ref<Record<string, any>>({});
const inputRefs = ref<Record<string, any>>({});

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
async function initializeTerminalSession(terminal: any) {
  if (terminalSessions.value.has(terminal.id)) return;
  
  console.log('[MobileTerminal] Initializing session for terminal:', terminal.id);
  
  // Create session object
  const session: TerminalSession = {
    id: terminal.id,
    terminalServiceId: terminal.id,
    output: [],
    history: [],
    historyIndex: -1
  };
  
  // Initialize input
  terminalInputs[terminal.id] = '';
  
  try {
    // Skip saveTerminalState since it's not implemented on desktop yet
    console.log('[MobileTerminal] Skipping terminal state sync (not implemented)');
    
    // First set up data handler before storing session
    session.dataHandler = services.value!.terminal.onTerminalData(terminal.id, (data: string) => {
      console.log(`[MobileTerminal] Received data for terminal ${terminal.id}:`, data);
      if (data) {
        // Handle carriage returns by processing line overwrites
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.includes('\r')) {
            // Handle carriage return - overwrite the last line
            const parts = line.split('\r');
            const lastPart = parts[parts.length - 1];
            if (session.output.length > 0 && session.output[session.output.length - 1].type === 'output') {
              // Overwrite the last output line
              session.output[session.output.length - 1].content = lastPart;
            } else {
              session.output.push({
                type: 'output',
                content: lastPart
              });
            }
          } else if (line) {
            session.output.push({
              type: 'output',
              content: line
            });
          }
        }
        // Force reactivity update
        terminalSessions.value = new Map(terminalSessions.value);
        scrollToBottom(terminal.id);
      }
    });
    
    // Store session with handler already attached
    terminalSessions.value.set(terminal.id, session);
    terminalSessions.value = new Map(terminalSessions.value);
    
    // Small delay to ensure handler is registered before triggering prompt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send empty string to trigger initial prompt
    await services.value!.terminal.writeToTerminal(terminal.id, '');
    
  } catch (error) {
    console.error('[MobileTerminal] Failed to initialize terminal session:', error);
    session.output.push({
      type: 'error',
      content: `Failed to initialize terminal: ${error.message}`
    });
    terminalSessions.value.set(terminal.id, session);
    terminalSessions.value = new Map(terminalSessions.value);
  }
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
    if (session?.dataHandler) {
      session.dataHandler(); // Call to remove listener
    }
    terminalSessions.value.delete(terminalId);
    terminalSessions.value = new Map(terminalSessions.value);
    delete terminalInputs[terminalId];
    
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
  
  // Focus input after switching
  nextTick(() => {
    const input = inputRefs.value[terminalId];
    if (input) {
      input.focus();
    }
  });
}

// Get terminal output
function getTerminalOutput(terminalId: string): TerminalLine[] {
  const session = terminalSessions.value.get(terminalId);
  return session?.output || [];
}

// Execute command in a terminal
async function executeCommand(terminalId: string) {
  const session = terminalSessions.value.get(terminalId);
  const command = terminalInputs[terminalId]?.trim();
  
  if (!session || !command || !services.value) return;
  
  // Add to history
  session.history.push(command);
  session.historyIndex = -1;
  
  // Add command to output
  session.output.push({
    type: 'command',
    content: command
  });
  
  // Clear input
  terminalInputs[terminalId] = '';
  
  // Handle special commands locally
  if (command === 'clear') {
    session.output = [];
    return;
  }
  
  try {
    // Send command to terminal
    await services.value.terminal.writeToTerminal(terminalId, command + '\n');
  } catch (error) {
    session.output.push({
      type: 'error',
      content: `Error: ${error.message}`
    });
  }
  
  scrollToBottom(terminalId);
}

// Clear current terminal
function clearCurrentTerminal() {
  if (!activeTerminalId.value) return;
  const session = terminalSessions.value.get(activeTerminalId.value);
  if (session) {
    session.output = [];
  }
}

// Navigate command history
function navigateHistory(terminalId: string, direction: number) {
  const session = terminalSessions.value.get(terminalId);
  if (!session || session.history.length === 0) return;
  
  if (session.historyIndex === -1 && direction === -1) {
    session.historyIndex = session.history.length - 1;
  } else {
    session.historyIndex = Math.max(0, Math.min(session.history.length - 1, session.historyIndex + direction));
  }
  
  terminalInputs[terminalId] = session.history[session.historyIndex] || '';
}

// Handle tab completion (placeholder)
function handleTab(terminalId: string) {
  // Future enhancement: implement tab completion
}

// Scroll terminal to bottom
function scrollToBottom(terminalId: string) {
  nextTick(() => {
    const outputEl = outputRefs.value[terminalId];
    if (outputEl) {
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  });
}

// Format terminal output (strip ANSI codes and format for HTML)
function formatOutput(text: string): string {
  // Strip ANSI escape codes
  const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
  const cleanText = text.replace(ansiRegex, '');
  
  // Escape HTML and preserve whitespace
  return cleanText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/ /g, '&nbsp;')
    .replace(/\n/g, '<br>');
}

// Focus input when clicking on terminal
watch(activeTerminalId, (terminalId) => {
  if (terminalId) {
    nextTick(() => {
      const container = terminalRefs.value[terminalId];
      if (container) {
        container.addEventListener('click', () => {
          const input = inputRefs.value[terminalId];
          if (input) {
            input.focus();
          }
        });
      }
    });
  }
});

// Clean up on unmount
onUnmounted(() => {
  // Clear workspace check interval
  clearInterval(workspaceCheckInterval);
  
  // Clean up all data handlers
  for (const session of terminalSessions.value.values()) {
    if (session.dataHandler) {
      session.dataHandler();
    }
  }
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
}

.terminal-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.9);
  padding: 12px;
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 8px;
}

.terminal-line {
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: 4px;
}

.line-content {
  color: rgba(255, 255, 255, 0.9);
}

.line-content.error {
  color: #F87171;
}

.line-content.command {
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.terminal-input-wrapper {
  display: flex;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 8px;
}

.terminal-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.9);
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  padding: 0;
}

.terminal-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
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
.tabs-container::-webkit-scrollbar,
.terminal-output::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}

.tabs-container::-webkit-scrollbar-track,
.terminal-output::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
}

.tabs-container::-webkit-scrollbar-thumb,
.terminal-output::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.tabs-container::-webkit-scrollbar-thumb:hover,
.terminal-output::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>