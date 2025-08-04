<template>
  <div class="mobile-claude">
    <!-- Claude Header -->
    <div class="claude-header">
      <div class="header-left">
        <h3>Claude Assistant</h3>
        <PersonalitySelector 
          v-if="activeInstance"
          :instance-id="activeInstance.id"
          :current-personality-id="activeInstance.personalityId"
          @update="updatePersonality"
          class="mobile-personality"
        />
      </div>
      <div class="claude-actions">
        <button @click="createNewInstance" class="action-btn" title="New Claude">
          <Icon name="mdi:plus" />
        </button>
      </div>
    </div>
    
    <!-- Instance Tabs -->
    <div v-if="instances.length > 0" class="instance-tabs">
      <div class="tabs-container">
        <div 
          v-for="instance in instances" 
          :key="instance.id"
          :class="['instance-tab', { active: instance.id === activeInstanceId }]"
          @click="setActiveInstance(instance.id)"
        >
          <Icon 
            v-if="getPersonalityIcon(instance.personalityId)" 
            :name="getPersonalityIcon(instance.personalityId)" 
            class="tab-icon"
          />
          <span class="tab-name">{{ instance.name }}</span>
          <div class="tab-status" :class="`status-${instance.status}`"></div>
          <button
            v-if="instance.status === 'disconnected'"
            @click.stop="startClaude(instance.id)"
            class="tab-action start"
            title="Start"
          >
            <Icon name="mdi:play" />
          </button>
          <button
            v-else-if="instance.status === 'connected'"
            @click.stop="stopClaude(instance.id)"
            class="tab-action stop"
            title="Stop"
          >
            <Icon name="mdi:stop" />
          </button>
          <button
            v-if="instances.length > 1"
            @click.stop="removeInstance(instance.id)"
            class="tab-close"
            title="Close"
          >
            <Icon name="mdi:close" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Claude Terminal Container -->
    <div class="claude-container">
      <div v-if="instances.length === 0" class="empty-state">
        <Icon name="mdi:robot" />
        <p>No Claude instances active</p>
        <button @click="createNewInstance" class="create-btn">
          Start Claude Assistant
        </button>
      </div>
      
      <!-- Claude Terminal Sessions -->
      <div
        v-for="instance in instances"
        v-show="instance.id === activeInstanceId"
        :key="`session-${instance.id}`"
        :ref="el => terminalRefs[instance.id] = el"
        class="claude-session"
      />
    </div>
    
    <!-- Mobile Chat Input -->
    <div v-if="activeInstance" class="mobile-chat-input">
      <textarea
        v-model="chatInput"
        @keydown.enter.prevent="sendChatMessage"
        placeholder="Type a message..."
        class="chat-textarea"
        rows="3"
      />
      <button @click="sendChatMessage" class="send-btn" :disabled="!chatInput.trim()">
        <Icon name="mdi:send" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import 'xterm/css/xterm.css';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useServices } from '~/composables/useServices';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useMobileConnection } from '~/composables/useMobileConnection';
import PersonalitySelector from '~/components/Terminal/PersonalitySelector.vue';

interface ClaudeSession {
  id: string;
  instanceId: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  outputHandler?: () => void;
  errorHandler?: () => void;
  exitHandler?: () => void;
}

// Use mobile connection for mobile devices
const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const remoteConnection = isMobileDevice ? useMobileConnection() : useRemoteConnection();
const { connected } = remoteConnection;
const { services, initialize } = useServices();

const claudeStore = useClaudeInstancesStore();
const instances = computed(() => claudeStore.instancesList);
const activeInstanceId = ref<string>('');
const activeInstance = computed(() => 
  instances.value.find(i => i.id === activeInstanceId.value)
);

const claudeSessions = ref(new Map<string, ClaudeSession>());
const terminalRefs = ref<Record<string, any>>({});
const chatInput = ref('');

// Get personality icon
function getPersonalityIcon(personalityId?: string): string | undefined {
  if (!personalityId) return undefined;
  const personality = claudeStore.getPersonalityById(personalityId);
  return personality?.icon;
}

// Initialize services and load instances
onMounted(async () => {
  await initialize();
  await claudeStore.init();
  
  // Load existing Claude instances from desktop
  await loadClaudeInstances();
  
  // Listen for Claude instance updates from desktop
  const socket = (services.value as any)?.__socket;
  if (socket) {
    socket.on('claude:instances:updated', async () => {
      console.log('[MobileClaude] Received instances update notification');
      // Small delay to ensure desktop has saved the changes
      setTimeout(async () => {
        // Reload instances from storage to get desktop updates
        await claudeStore.reloadInstances();
        // Then load any desktop-specific information
        await loadClaudeInstances();
      }, 100);
    });
  }
});

// Load Claude instances from desktop
async function loadClaudeInstances() {
  if (!services.value) return;
  
  try {
    // Get desktop Claude instances
    const desktopInstances = await services.value.claude.listDesktopInstances();
    console.log('[MobileClaude] Desktop instances:', desktopInstances);
    
    // Update store with desktop instances
    for (const info of desktopInstances) {
      if (!info.isDesktop) continue; // Skip remote instances
      
      // Find or create instance in store
      let instance = claudeStore.instances.get(info.instanceId);
      if (!instance) {
        // Create instance in store if not exists
        instance = {
          id: info.instanceId,
          name: info.name || `Claude ${instances.value.length + 1}`,
          status: info.status || 'disconnected',
          personalityId: info.personalityId,
          workingDirectory: info.workingDirectory,
          createdAt: info.createdAt || new Date().toISOString(),
          lastActiveAt: info.lastActiveAt || new Date().toISOString(),
          color: info.color,
          pid: info.pid
        };
        claudeStore.instances.set(instance.id, instance);
      } else {
        // Update existing instance status
        instance.status = info.status || 'disconnected';
        instance.pid = info.pid;
        // Force reactivity update by replacing the instance in the store
        claudeStore.instances.set(instance.id, { ...instance });
      }
      
      // Initialize session for instance only if it doesn't exist
      if (!claudeSessions.value.has(instance.id)) {
        await initializeClaudeSession(instance);
      } else if (instance.status === 'connected') {
        // Session exists but instance just became connected - set up forwarding
        const session = claudeSessions.value.get(instance.id);
        if (session && services.value) {
          console.log('[MobileClaude] Setting up forwarding for newly connected instance:', instance.id);
          try {
            // Re-establish output handlers since they might have been lost
            if (session.outputHandler) {
              session.outputHandler(); // Remove old handler
            }
            session.outputHandler = services.value.claude.onOutput(instance.id, (data: string) => {
              console.log(`[MobileClaude] Output for ${instance.id}, length: ${data.length}`);
              session.terminal.write(data);
            });
            
            const result = await services.value.claude.spawn(
              instance.id,
              instance.workingDirectory,
              instance.name
            );
            console.log('[MobileClaude] Forwarding setup result:', result);
            
            // Optionally load buffer if needed
            const buffer = await services.value.claude.getClaudeBuffer(instance.id);
            if (buffer) {
              // Add delay to ensure terminal is ready
              setTimeout(() => {
                try {
                  session.terminal.clear();
                  // Write the buffer directly - SerializeAddon only has serialize, not deserialize
                  session.terminal.write(buffer);
                  console.log('[MobileClaude] Successfully restored Claude terminal buffer');
                } catch (e) {
                  console.error('[MobileClaude] Failed to restore Claude buffer:', e);
                  session.terminal.write(buffer);
                }
              }, 100);
            }
          } catch (error) {
            console.error('[MobileClaude] Failed to setup forwarding for existing session:', error);
          }
        }
      }
    }
    
    // Set first instance as active
    if (instances.value.length > 0 && !activeInstanceId.value) {
      setActiveInstance(instances.value[0].id);
    }
  } catch (error) {
    console.error('[MobileClaude] Failed to load instances:', error);
  }
}

// Initialize Claude session with xterm
async function initializeClaudeSession(instance: any) {
  if (claudeSessions.value.has(instance.id)) {
    console.log('[MobileClaude] Session already exists for:', instance.id);
    return;
  }
  
  console.log('[MobileClaude] Initializing NEW session for:', instance.id, 'name:', instance.name);
  
  // Create xterm instance with Claude theme
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
    scrollback: 5000 // More scrollback for Claude conversations
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);
  
  // Create session
  const session: ClaudeSession = {
    id: instance.id,
    instanceId: instance.id,
    terminal,
    fitAddon,
    serializeAddon
  };
  
  // Handle terminal input (for direct typing to Claude)
  terminal.onData((data: string) => {
    if (services.value) {
      services.value.claude.send(instance.id, data);
    }
  });
  
  try {
    // Set up output handler
    session.outputHandler = services.value!.claude.onOutput(instance.id, (data: string) => {
      console.log(`[MobileClaude] Output for ${instance.id}, length: ${data.length}`);
      terminal.write(data);
    });
    
    // Set up error handler
    session.errorHandler = services.value!.claude.onError(instance.id, (error: string) => {
      console.error(`[MobileClaude] Error for ${instance.id}:`, error);
      terminal.write(`\x1b[31mError: ${error}\x1b[0m\r\n`);
    });
    
    // Set up exit handler
    session.exitHandler = services.value!.claude.onExit(instance.id, (code: number | null) => {
      console.log(`[MobileClaude] Exit for ${instance.id}, code:`, code);
      terminal.write(`\r\n\x1b[33mClaude exited${code !== null ? ` with code ${code}` : ''}\x1b[0m\r\n`);
      // Update instance status
      const inst = claudeStore.instances.get(instance.id);
      if (inst) {
        inst.status = 'disconnected';
      }
    });
    
    // Store session
    claudeSessions.value.set(instance.id, session);
    claudeSessions.value = new Map(claudeSessions.value); // Force reactivity
    
    // Wait for DOM
    await nextTick();
    
    // Attach terminal if active
    if (instance.id === activeInstanceId.value) {
      attachTerminal(instance.id);
    }
    
    // Only start if user explicitly requests it
    // Desktop instances should already be running and we just connect to them
    if (instance.status === 'connected') {
      console.log('[MobileClaude] Instance already connected:', instance.id);
      terminal.write(`\x1b[32mConnected to ${instance.name}\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance ID: ${instance.id}\x1b[0m\r\n`);
      terminal.write(`\r\n`);
      
      // For already-connected desktop instances, we need to trigger the spawn
      // to set up forwarding on the server side
      try {
        console.log('[MobileClaude] Setting up forwarding for connected instance:', instance.id);
        
        // Re-establish output handlers for already connected instances
        // This is needed after page refresh to receive output from desktop
        if (session.outputHandler) {
          session.outputHandler(); // Remove old handler
        }
        session.outputHandler = services.value!.claude.onOutput(instance.id, (data: string) => {
          console.log(`[MobileClaude] Output for ${instance.id}, length: ${data.length}`);
          terminal.write(data);
        });
        
        const result = await services.value!.claude.spawn(
          instance.id,
          instance.workingDirectory,
          instance.name
        );
        console.log('[MobileClaude] Forwarding setup result:', result);
        
        // Store buffer info to load after terminal is attached
        (session as any).pendingBuffer = services.value!.claude.getClaudeBuffer(instance.id);
      } catch (error) {
        console.error('[MobileClaude] Failed to setup forwarding:', error);
      }
    } else {
      // Don't auto-start - show message to user
      terminal.write(`\x1b[33m${instance.name} is not running on desktop\x1b[0m\r\n`);
      terminal.write(`\x1b[90mStart it on desktop first to connect from mobile\x1b[0m\r\n`);
      terminal.write(`\r\n`);
    }
    
  } catch (error) {
    console.error('[MobileClaude] Failed to initialize session:', error);
    terminal.dispose();
    claudeSessions.value.delete(instance.id);
  }
}

// Attach terminal to DOM
function attachTerminal(instanceId: string) {
  const session = claudeSessions.value.get(instanceId);
  const container = terminalRefs.value[instanceId];
  
  if (!session || !container) return;
  
  // Clear container
  container.innerHTML = '';
  
  // Open terminal
  session.terminal.open(container);
  
  // Fit terminal
  nextTick(async () => {
    try {
      session.fitAddon.fit();
      
      // Load any pending buffer after terminal is attached
      if ((session as any).pendingBuffer) {
        try {
          const buffer = await (session as any).pendingBuffer;
          if (buffer) {
            // Add a small delay to ensure terminal is fully initialized
            setTimeout(() => {
              try {
                // Clear and restore the terminal
                session.terminal.clear();
                
                // The SerializeAddon doesn't have deserialize, we need to write the buffer directly
                // The buffer from the desktop is already serialized terminal content
                session.terminal.write(buffer);
                console.log('[MobileClaude] Successfully restored Claude terminal buffer after attach');
              } catch (e) {
                console.error('[MobileClaude] Failed to restore buffer:', e);
                // Fallback to writing as text
                session.terminal.write(buffer);
              }
            }, 100);
          }
          delete (session as any).pendingBuffer;
        } catch (e) {
          console.error('[MobileClaude] Failed to load pending buffer:', e);
          delete (session as any).pendingBuffer;
        }
      }
    } catch (e) {
      console.error('[MobileClaude] Failed to fit terminal:', e);
    }
  });
}

// Create new Claude instance
async function createNewInstance() {
  if (!services.value) return;
  
  try {
    const workspace = (window as any).__remoteWorkspace?.path || '/';
    const instanceNumber = instances.value.length + 1;
    const instanceName = `Claude ${instanceNumber}`;
    const instanceId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create instance in store
    const instance = {
      id: instanceId,
      name: instanceName,
      status: 'connecting' as const,
      workingDirectory: workspace,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };
    claudeStore.instances.set(instanceId, instance);
    
    // Initialize session
    await initializeClaudeSession(instance);
    
    // Make it active
    setActiveInstance(instanceId);
    
  } catch (error) {
    console.error('[MobileClaude] Failed to create instance:', error);
  }
}

// Start Claude instance
async function startClaude(instanceId: string) {
  if (!services.value) return;
  
  const instance = claudeStore.instances.get(instanceId);
  if (!instance) return;
  
  const session = claudeSessions.value.get(instanceId);
  if (!session) return;
  
  const { terminal } = session;
  
  // Check if already running
  if (instance.status === 'connected') {
    terminal.write('\x1b[33mClaude is already running\x1b[0m\r\n');
    return;
  }
  
  terminal.clear();
  terminal.write('\x1b[32mStarting Claude...\x1b[0m\r\n');
  
  try {
    // For desktop instances, spawn will trigger the desktop to start it
    const result = await services.value.claude.spawn(
      instance.id,
      instance.workingDirectory,
      instance.name
    );
    
    console.log('[MobileClaude] Started Claude:', result);
    
    // Update status
    instance.status = 'connected';
    instance.pid = result.pid || -1;
    
    // Check if instance was already running on desktop
    if ((result as any).alreadyRunning) {
      terminal.write(`\x1b[32mConnected to existing Claude instance on desktop\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance: ${instance.name} (${instance.id})\x1b[0m\r\n`);
      
      // Load current buffer from desktop
      try {
        const buffer = await services.value.claude.getClaudeBuffer(instance.id);
        if (buffer) {
          setTimeout(() => {
            terminal.clear();
            terminal.write(buffer);
            console.log('[MobileClaude] Loaded existing Claude buffer from desktop');
          }, 100);
        }
      } catch (e) {
        console.error('[MobileClaude] Failed to load buffer:', e);
      }
    } else if (result.pid === -1) {
      terminal.write(`\x1b[33mStarting Claude on desktop...\x1b[0m\r\n`);
      terminal.write(`\x1b[90mPlease wait a moment for Claude to initialize\x1b[0m\r\n`);
    } else {
      terminal.write(`\x1b[32mClaude started successfully!\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance: ${instance.name} (${instance.id})\x1b[0m\r\n`);
    }
    terminal.write('\r\n');
  } catch (error) {
    console.error('[MobileClaude] Failed to start Claude:', error);
    terminal.write(`\x1b[31mFailed to start Claude: ${error}\x1b[0m\r\n`);
    instance.status = 'disconnected';
  }
}

// Stop Claude instance
async function stopClaude(instanceId: string) {
  if (!services.value) return;
  
  const instance = claudeStore.instances.get(instanceId);
  if (!instance) return;
  
  const session = claudeSessions.value.get(instanceId);
  if (!session) return;
  
  const { terminal } = session;
  
  terminal.write('\r\n\x1b[33mStopping Claude...\x1b[0m\r\n');
  
  try {
    await services.value.claude.stop(instanceId);
    
    // Update status
    instance.status = 'disconnected';
    instance.pid = undefined;
    
    terminal.clear();
    terminal.write('\x1b[33mClaude stopped\x1b[0m\r\n');
    terminal.write('\x1b[90mClick the Start button to launch Claude again\x1b[0m\r\n');
  } catch (error) {
    console.error('[MobileClaude] Failed to stop Claude:', error);
    terminal.write(`\x1b[31mFailed to stop Claude: ${error}\x1b[0m\r\n`);
  }
}

// Remove Claude instance
async function removeInstance(instanceId: string) {
  if (!services.value || instances.value.length <= 1) return;
  
  try {
    // Stop Claude if running
    const instance = claudeStore.instances.get(instanceId);
    if (instance?.status === 'connected') {
      await services.value.claude.stop(instanceId);
    }
    
    // Clean up session
    const session = claudeSessions.value.get(instanceId);
    if (session) {
      if (session.outputHandler) session.outputHandler();
      if (session.errorHandler) session.errorHandler();
      if (session.exitHandler) session.exitHandler();
      session.terminal.dispose();
      claudeSessions.value.delete(instanceId);
      claudeSessions.value = new Map(claudeSessions.value);
    }
    
    // Remove from store
    claudeStore.instances.delete(instanceId);
    
    // Switch to another instance
    if (activeInstanceId.value === instanceId && instances.value.length > 0) {
      setActiveInstance(instances.value[0].id);
    }
    
  } catch (error) {
    console.error('[MobileClaude] Failed to remove instance:', error);
  }
}

// Set active instance
function setActiveInstance(instanceId: string) {
  activeInstanceId.value = instanceId;
  claudeStore.setActiveInstance(instanceId);
  
  nextTick(() => {
    attachTerminal(instanceId);
  });
}

// Update personality
async function updatePersonality(personalityId: string) {
  if (!activeInstance.value) return;
  
  const instance = claudeStore.instances.get(activeInstance.value.id);
  if (instance) {
    instance.personalityId = personalityId;
  }
}

// Send chat message
async function sendChatMessage() {
  if (!chatInput.value.trim() || !activeInstance.value || !services.value) return;
  
  const message = chatInput.value.trim();
  chatInput.value = '';
  
  // Send message to Claude
  await services.value.claude.send(activeInstance.value.id, message + '\n');
}

// Handle window resize
const resizeObserver = new ResizeObserver(() => {
  if (activeInstanceId.value) {
    const session = claudeSessions.value.get(activeInstanceId.value);
    if (session) {
      try {
        session.fitAddon.fit();
      } catch (e) {
        // Ignore fit errors
      }
    }
  }
});

// Watch for active instance changes
watch(activeInstanceId, (newId, oldId) => {
  if (oldId && terminalRefs.value[oldId]) {
    resizeObserver.unobserve(terminalRefs.value[oldId]);
  }
  
  if (newId && terminalRefs.value[newId]) {
    resizeObserver.observe(terminalRefs.value[newId]);
  }
});

// Cleanup
onUnmounted(() => {
  // Clean up all sessions
  for (const session of claudeSessions.value.values()) {
    if (session.outputHandler) session.outputHandler();
    if (session.errorHandler) session.errorHandler();
    if (session.exitHandler) session.exitHandler();
    session.terminal.dispose();
  }
  
  resizeObserver.disconnect();
});
</script>

<style scoped>
.mobile-claude {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0b0d;
}

/* Claude Header */
.claude-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(180deg, #1a1b1f 0%, #141518 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 12px;
  min-height: 48px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.claude-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.mobile-personality {
  font-size: 13px;
}

.claude-actions {
  display: flex;
  gap: 8px;
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

/* Instance Tabs */
.instance-tabs {
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.tabs-container {
  display: flex;
  gap: 2px;
  padding: 4px;
}

.instance-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  white-space: nowrap;
}

.instance-tab:hover {
  background: rgba(255, 255, 255, 0.05);
}

.instance-tab.active {
  background: rgba(92, 160, 242, 0.1);
  border-color: rgba(92, 160, 242, 0.3);
}

.tab-icon {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.instance-tab.active .tab-icon {
  color: #5CA0F2;
}

.tab-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.tab-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 4px;
}

.status-connected {
  background: #0dbc79;
}

.status-connecting {
  background: #e5e510;
  animation: pulse 1s infinite;
}

.status-disconnected {
  background: #cd3131;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.tab-action {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  margin-left: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.tab-action.start {
  color: #51cf66;
}

.tab-action.start:hover {
  background: rgba(81, 207, 102, 0.1);
}

.tab-action.stop {
  color: #ff6b6b;
}

.tab-action.stop:hover {
  background: rgba(255, 107, 107, 0.1);
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

/* Claude Container */
.claude-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.claude-session {
  height: 100%;
  width: 100%;
}

/* Empty State */
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

/* Mobile Chat Input */
.mobile-chat-input {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.chat-textarea {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  padding: 8px 12px;
  font-family: inherit;
  font-size: 14px;
  resize: none;
  outline: none;
  transition: all 0.2s;
}

.chat-textarea:focus {
  border-color: rgba(92, 160, 242, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

.chat-textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.send-btn {
  background: rgba(92, 160, 242, 0.2);
  border: 1px solid rgba(92, 160, 242, 0.3);
  color: #5CA0F2;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn:hover:not(:disabled) {
  background: rgba(92, 160, 242, 0.3);
  transform: translateY(-1px);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Scrollbar */
.instance-tabs::-webkit-scrollbar {
  height: 4px;
}

.instance-tabs::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
}

.instance-tabs::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* Override xterm styles */
:deep(.xterm) {
  padding: 8px;
  height: 100%;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>