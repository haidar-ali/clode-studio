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
    
    <!-- Mobile Chat Input - Fixed overlay at bottom -->
    <div v-if="activeInstance" class="mobile-chat-input-overlay">
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
  bufferRestored?: boolean;
  spawned?: boolean;
  isAtBottom: boolean;
  lastDataTime: number;
  pendingPromptScroll: boolean;
  isInThinkingMode?: boolean;
  lastOutputTime: number; // Track when we last received output
  lastUserInputTime: number; // Track when user last typed
  lastBufferHash?: string; // Track buffer content hash
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

// Move these inside the component to ensure they're fresh on each mount
const continuousRefreshIntervals = new Map<string, NodeJS.Timer>();
const lastInputTime = new Map<string, number>();

// Auto-refresh timeout (per session)
const refreshTimeouts = new Map<string, NodeJS.Timeout>();

// Restore serialized buffer to terminal
function restoreSerializedBuffer(terminal: any, serializedBuffer: string) {
  try {
    // The xterm-addon-serialize doesn't have a deserialize method
    // We need to manually recreate the terminal content
    // For now, just write the raw content if it's not a JSON object
    if (serializedBuffer.startsWith('{')) {
      // This might be a custom serialization format
      const data = JSON.parse(serializedBuffer);
      if (data.data && Array.isArray(data.data)) {
        // Write each line
        data.data.forEach((line: any, index: number) => {
          if (line) {
            if (index < data.data.length - 1) {
              terminal.writeln(line);
            } else {
              terminal.write(line); // Last line without newline
            }
          }
        });
      }
    } else {
      // Raw terminal content
      terminal.write(serializedBuffer);
    }
  } catch (e) {
    console.error('[MobileClaude] Failed to restore serialized buffer:', e);
    // Fallback: write as raw
    terminal.write(serializedBuffer);
  }
}

// Scroll to cursor position only if needed
function scrollToCursor(terminal: any) {
  const cursorY = terminal.buffer.active.cursorY;
  const viewportY = terminal.buffer.active.viewportY;
  const rows = terminal.rows;
  
  // Only scroll if cursor is outside the viewport
  if (cursorY < viewportY) {
    // Cursor is above viewport - scroll up to show it
    terminal.scrollLines(cursorY - viewportY);
  } else if (cursorY >= viewportY + rows) {
    // Cursor is below viewport - scroll down to show it
    terminal.scrollLines(cursorY - viewportY - rows + 1);
  }
  // If cursor is already visible, don't scroll
}

// Simple auto-scroll helper matching desktop behavior
function autoScrollIfNeeded(session: ClaudeSession) {
  if (session.isAtBottom) {
    // Scroll to bottom when user was already at bottom
    session.terminal.scrollToBottom();
  }
}

// Get personality icon
function getPersonalityIcon(personalityId?: string): string | undefined {
  if (!personalityId) return undefined;
  const personality = claudeStore.getPersonalityById(personalityId);
  return personality?.icon;
}

// Retry loading instances with exponential backoff
async function loadClaudeInstancesWithRetry(maxRetries = 2, delay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await loadClaudeInstances();
      return; // Success, exit retry loop
    } catch (error) {
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Gentler exponential backoff
      }
    }
  }
  console.error('[MobileClaude] Failed to load instances after all retries');
}

// Set up socket event listeners (defined outside for reuse)
const setupSocketListeners = async () => {
    // Try multiple ways to get the socket
    let socket = (services.value as any)?.getSocket?.() || (services.value as any)?.__socket;
    
    // If not found through services, try the singleton directly
    if (!socket) {
      try {
        const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
        socket = remoteConnection.getSocket();
      } catch (e) {
        
      }
    }
    
    if (socket) {
      
      
      // Add connection listener to retry loading instances when connected
      socket.on('connect', async () => {
        
        setTimeout(async () => {
          await loadClaudeInstancesWithRetry();
        }, 500);
      });
      
      // If socket is already connected, load instances
      if (socket.connected) {
        
        setTimeout(async () => {
          await loadClaudeInstancesWithRetry();
        }, 500);
      }
      
      return true;
    }
    return false;
};

// Handler for connection ready event
const onConnectionReady = async () => {
  
  // Wait a bit for services to update
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const hasSocket = await setupSocketListeners();
  if (hasSocket) {
    // Also reload instances after connection is ready
    await loadClaudeInstancesWithRetry();
  }
};

// Setup cleanup before any async operations
onUnmounted(() => {
  // Clean up event listeners
  if (typeof window !== 'undefined') {
    window.removeEventListener('remote-connection-ready', onConnectionReady);
  }
});

// Initialize services and load instances
onMounted(async () => {
  await initialize();
  await claudeStore.init();
  
  // Try to load existing Claude instances
  await loadClaudeInstancesWithRetry();
  
  // Try to set up socket listeners immediately
  const hasSocket = await setupSocketListeners();
  if (!hasSocket) {
    
  }
  
  // Listen for remote connection ready event
  window.addEventListener('remote-connection-ready', onConnectionReady);
  
  // Setup claude instance update listener
  const setupInstanceUpdateListener = () => {
    const socket = (services.value as any)?.getSocket?.() || (services.value as any)?.__socket;
    if (socket) {
      // Remove any existing listener first to avoid duplicates
      socket.off('claude:instances:updated');
      
      socket.on('claude:instances:updated', async (data: any) => {
        
        
        // If we have specific instance status update, handle it directly
        if (data && data.instanceId && data.status) {
          
          // Update the specific instance status in the store
          claudeStore.updateInstanceStatus(data.instanceId, data.status);
        }
        
        // Add a small delay to ensure backend state is updated
        setTimeout(async () => {
          await claudeStore.reloadInstances();
          // Force reload all instances and their terminal sessions
          await loadClaudeInstances();
          
          // If we have an active instance that's now connected, re-setup its handlers
          if (activeInstance.value && activeInstance.value.status === 'connected') {
            const session = claudeSessions.value.get(activeInstance.value.id);
            if (session && services.value) {
              // Re-setup terminal input handler when instance becomes connected
              // Dispose of existing data handler if it exists
              if ((session as any).dataHandler) {
                (session as any).dataHandler.dispose();
              }
              
              (session as any).dataHandler = session.terminal.onData((data: string) => {
                session.lastUserInputTime = Date.now();
                if (services.value && activeInstance.value.status === 'connected') {
                  
                  services.value.claude.send(activeInstance.value.id, data);
                  
                  // Only start refresh for actual character input, not control sequences
                  if (data && data.length > 0 && data.charCodeAt(0) >= 32) {
                    // Start continuous refresh for immediate feedback
                    //startContinuousRefresh(activeInstance.value.id);
                  }
                }
              });
              
              // Ensure output handler is set up
              if (!session.outputHandler) {
                session.outputHandler = services.value.claude.onOutput(activeInstance.value.id, (data: string | any) => {
                  if (session.terminal) {
                    session.lastDataTime = Date.now();
                    session.lastOutputTime = Date.now();
                    
                    if (data.includes('\x1b[2J') || data.includes('\x1b[H')) {
                      session.terminal.clear();
                    }
                    
                    session.terminal.write(data);
                    //startRefreshWithDebounce(activeInstance.value.id);
                    // Don't schedule auto-refresh here - continuous refresh handles it better
                  }
                });
              }
              
              if (!session.spawned) {
                try {
                  const result = await services.value.claude.spawn(
                    activeInstance.value.id,
                    activeInstance.value.workingDirectory,
                    activeInstance.value.name
                  );
                  session.spawned = true;
                  
                  // Get the current buffer to show existing content
                  const buffer = await services.value.claude.getClaudeBuffer(activeInstance.value.id);
                  if (buffer) {
                    session.terminal.clear();
                    restoreSerializedBuffer(session.terminal, buffer);
                    session.terminal.scrollToBottom();
                  }
                } catch (error) {
                  console.error('[MobileClaude] Failed to setup instance after update:', error);
                }
              }
            }
          }
        }, 200);
      });
      return true;
    }
    return false;
  };
  
  setupInstanceUpdateListener();
});

// Load Claude instances from desktop
async function loadClaudeInstances() {
  if (!services.value) return;
  
  // Check if connected before attempting to load instances
  const socket = (services.value as any)?.getSocket?.() || (services.value as any)?.__socket;
  if (!socket?.connected) {
    
    return;
  }
  
  try {
    const desktopInstances = await services.value.claude.listDesktopInstances();
   
    
    for (const info of desktopInstances) {
      if (!info.isDesktop) continue;
      
      let instance = claudeStore.instances.get(info.instanceId);
      if (!instance) {
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
        instance.status = info.status || 'disconnected';
        instance.pid = info.pid;
        claudeStore.instances.set(instance.id, { ...instance });
      }
      
      if (!claudeSessions.value.has(instance.id)) {
        await initializeClaudeSession(instance);
      } else if (instance.status === 'connected') {
        const session = claudeSessions.value.get(instance.id);
        if (session && services.value) {
         
          try {
            // Re-enable terminal input in case it was disabled
            session.terminal.options.disableStdin = false;
            
            // Don't set up output handler again - it's already set up in initializeClaudeSession
            // Just ensure spawning if needed
            if (!session.spawned) {
              try {
                const result = await services.value.claude.spawn(
                  instance.id,
                  instance.workingDirectory,
                  instance.name
                );
                session.spawned = true;
              } catch (spawnError: any) {
                // If instance already exists, that's fine - mark as spawned
                if (spawnError?.message?.includes('already exists')) {
                  
                  session.spawned = true;
                } else {
                  console.error('[MobileClaude] Failed to spawn:', spawnError);
                }
              }
            }
          } catch (error) {
            console.error('[MobileClaude] Unexpected error:', error);
          }
        }
      }
    }
    
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
   
    // Make sure we're not setting up duplicate handlers
    const existingSession = claudeSessions.value.get(instance.id);
    if (existingSession && instance.status === 'connected' && !existingSession.spawned && services.value) {
      // Just ensure spawning if needed
      try {
        const result = await services.value.claude.spawn(
          instance.id,
          instance.workingDirectory,
          instance.name
        );
       
        existingSession.spawned = true;
      } catch (error) {
        console.error('[MobileClaude] Failed to spawn for existing session:', error);
      }
    }
    return;
  }
  
 
  
  // Create terminal matching desktop configuration
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
    cursorBlink: false, // Disable blinking
    cursorStyle: 'block', // Keep block style but we'll hide it via CSS
    cursorInactiveStyle: 'none', // Hide cursor when inactive
    scrollback: 10000,
    convertEol: true, // Match desktop - handles \r\n and \r properly
    disableStdin: false,
    smoothScrollDuration: 0,
    fastScrollModifier: 'shift',
    fastScrollSensitivity: 5,
    windowsMode: false
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);
  
  // Track scroll position like desktop
  let isAtBottom = true;
  terminal.onScroll(() => {
    const buffer = terminal.buffer.active;
    const scrollbackSize = buffer.length - terminal.rows;
    const scrollOffset = buffer.viewportY;
    isAtBottom = scrollOffset >= scrollbackSize - 5;
  });
  
  // Create session
  const session: ClaudeSession = {
    id: instance.id,
    instanceId: instance.id,
    terminal,
    fitAddon,
    serializeAddon,
    isAtBottom: true,
    lastDataTime: 0,
    pendingPromptScroll: false,
    lastOutputTime: Date.now(), // Initialize with current time
    lastUserInputTime: 0,
    lastBufferHash: undefined
  };
  
  // Update session's isAtBottom when terminal scrolls
  terminal.onScroll(() => {
    session.isAtBottom = isAtBottom;
  });
  
  // Handle terminal input
  (session as any).dataHandler = terminal.onData((data: string) => {
    // Track user input time
    session.lastUserInputTime = Date.now();
    
    if (services.value && instance.status === 'connected') {
      services.value.claude.send(instance.id, data);
      
      // Only start refresh for actual character input, not control sequences
      if (data && data.length > 0 && data.charCodeAt(0) >= 32) {
        // Start continuous refresh for immediate feedback
        // The function handles deduplication internally
        //startContinuousRefresh(instance.id);
      }
    }
  });
  
  try {
    // Clean up any existing output handler first
    if (session.outputHandler) {
     
      session.outputHandler();
      session.outputHandler = undefined;
    }
    
    // Set up simplified output handler matching desktop
    session.outputHandler = services.value!.claude.onOutput(instance.id, (data: string | any) => {
      if (terminal) {
        const currentTime = Date.now();
        const timeSinceLastData = currentTime - session.lastDataTime;
        session.lastDataTime = currentTime;
        session.lastOutputTime = currentTime; // Track output for auto-refresh
        
        // Check for clear screen sequences
        if (data.includes('\x1b[2J') || data.includes('\x1b[H')) {
          // Clear screen command detected
          terminal.clear();
        }
        
        // Write data directly to terminal
        terminal.write(data);
        //startRefreshWithDebounce(instance.id);
        // Don't schedule auto-refresh here - continuous refresh handles it better
        
        // Handle prompt detection for auto-scroll
        const hasPromptIndicators = data.includes('Do you want to') ||
                                   data.includes('❯') ||
                                   data.includes('Yes, and don\'t ask again') ||
                                   data.includes('No, and tell Claude');
        
        const hasBoxDrawing = data.includes('╭') || data.includes('╰') ||
                             (data.includes('│') && data.includes('─'));
        
        if (hasPromptIndicators || (hasBoxDrawing && timeSinceLastData > 100)) {
          session.pendingPromptScroll = true;
        }
        
        if (session.pendingPromptScroll && (data.includes('╰') || data.includes('❯'))) {
          setTimeout(() => {
            terminal.scrollToBottom();
            session.pendingPromptScroll = false;
          }, 100);
        } else if (!session.pendingPromptScroll) {
          autoScrollIfNeeded(session);
        }
      }
    });
    
    // Set up error handler
    session.errorHandler = services.value!.claude.onError(instance.id, (error: string) => {
      console.error(`[MobileClaude] Error for ${instance.id}:`, error);
      terminal.write(`\x1b[31mError: ${error}\x1b[0m\r\n`);
      autoScrollIfNeeded(session);
    });
    
    // Set up exit handler
    session.exitHandler = services.value!.claude.onExit(instance.id, (code: number | null) => {
     
      terminal.write(`\r\n\x1b[33mClaude exited${code !== null ? ` with code ${code}` : ''}\x1b[0m\r\n`);
      const inst = claudeStore.instances.get(instance.id);
      if (inst) {
        inst.status = 'disconnected';
      }
    });
    
    // Store session
    claudeSessions.value.set(instance.id, session);
    claudeSessions.value = new Map(claudeSessions.value);
    
    await nextTick();
    
    if (instance.id === activeInstanceId.value) {
      attachTerminal(instance.id);
    }
    
    // Check if instance is already connected
    
    
    if (instance.status === 'connected') {
      terminal.write(`\x1b[32mConnected to ${instance.name}\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance ID: ${instance.id}\x1b[0m\r\n\r\n`);
      
      // Spawn/setup forwarding if not already done
      if (!session.spawned) {
        try {
          const result = await services.value!.claude.spawn(
            instance.id,
            instance.workingDirectory,
            instance.name
          );
          session.spawned = true;
        } catch (spawnError: any) {
          // If instance already exists, that's fine - it means it's already spawned
          if (spawnError?.message?.includes('already exists')) {
            
            session.spawned = true;
          } else {
            console.error('[MobileClaude] Failed to spawn:', spawnError);
          }
        }
      }
      
      // Get and restore buffer immediately (or after a short delay)
      
      if (!session.bufferRestored) {
        
        // Small delay to ensure spawn is complete and terminal is ready
        setTimeout(async () => {
          try {
            
            const buffer = await services.value!.claude.getClaudeBuffer(instance.id);
            
            if (buffer && buffer.length > 0) {
              // Write the buffer to the terminal
              terminal.write(buffer);
              session.bufferRestored = true;
              autoScrollIfNeeded(session);
            } else {
              
            }
          } catch (error) {
            console.error('[MobileClaude] Failed to get buffer:', error);
          }
        }, 500); // Wait 500ms for terminal to be ready
      } else {
        
      }
    } else {
      // Instance is disconnected - show message but don't start it
      
      terminal.write(`\x1b[33m${instance.name} is not running on desktop\x1b[0m\r\n`);
      terminal.write(`\x1b[90mStart it on desktop first to connect from mobile\x1b[0m\r\n\r\n`);
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
  
  container.innerHTML = '';
  session.terminal.open(container);
  
  
  nextTick(async () => {
    try {
      // Initial fit
      session.fitAddon.fit();
      
      // Configure terminal dimensions on server for smart buffer translation
      if (services.value && session.terminal.cols && session.terminal.rows) {
        const cols = session.terminal.cols;
        const rows = session.terminal.rows;
       
        
        services.value.claude.configureTerminal?.(instanceId, cols, rows).catch(err => {
          console.error('[MobileClaude] Failed to configure terminal dimensions:', err);
        });
      }
      
      // Restore buffer content if available
      if ((session as any).pendingBuffer) {
        try {
          const buffer = await (session as any).pendingBuffer;
          if (buffer) {
            setTimeout(() => {
              try {
                session.terminal.clear();
                
                // Restore the buffer content
                restoreSerializedBuffer(session.terminal, buffer);
                
                session.bufferRestored = true;
                session.terminal.scrollToBottom();
               
              } catch (e) {
                console.error('[MobileClaude] Failed to restore buffer:', e);
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
    // Get workspace from window.__remoteWorkspace first, fallback to fetching from server
    let workspace = (window as any).__remoteWorkspace?.path;
    
    // If not available in window, fetch from server
    if (!workspace) {
      try {
        const workspaceInfo = await $fetch('/api/workspace/current');
        workspace = workspaceInfo.path || process.env.HOME || '/';
        
      } catch (error) {
        console.error('[MobileClaude] Failed to get workspace from server:', error);
        workspace = process.env.HOME || '/';
      }
    }
    
    const instanceNumber = instances.value.length + 1;
    const instanceName = `Claude ${instanceNumber}`;
    const instanceId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const instance = {
      id: instanceId,
      name: instanceName,
      status: 'connected' as const,  // Set as connected since we'll spawn it directly
      workingDirectory: workspace,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };
    claudeStore.instances.set(instanceId, instance);
    
    await initializeClaudeSession(instance);
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
  
  if (instance.status === 'connected') {
    terminal.write('\x1b[33mClaude is already running\x1b[0m\r\n');
    return;
  }
  
  terminal.clear();
  terminal.write('\x1b[32mStarting Claude...\x1b[0m\r\n');
  
  try {
    const result = await services.value.claude.spawn(
      instance.id,
      instance.workingDirectory,
      instance.name
    );
    
   
    
    instance.status = 'connected';
    instance.pid = result.pid || -1;
    session.spawned = true; // Mark as spawned
    
    // IMPORTANT: Set up output handler if not already set up
    if (!session.outputHandler) {
      session.outputHandler = services.value.claude.onOutput(instance.id, (data: string | any) => {
        if (terminal) {
          const currentTime = Date.now();
          const timeSinceLastData = currentTime - session.lastDataTime;
          session.lastDataTime = currentTime;
          session.lastOutputTime = currentTime;
          
          // Check for clear screen sequences
          if (data.includes('\x1b[2J') || data.includes('\x1b[H')) {
            terminal.clear();
          }
          
          // Write data directly to terminal
          terminal.write(data);
          //startRefreshWithDebounce(instance.id);
          // Don't schedule auto-refresh here - continuous refresh handles it better
          
          // Handle prompt detection for auto-scroll
          const hasPromptIndicators = data.includes('Do you want to') ||
                                     data.includes('❯') ||
                                     data.includes('Yes, and don\'t ask again') ||
                                     data.includes('No, and tell Claude');
          
          const hasBoxDrawing = data.includes('╭') || data.includes('╰') ||
                               (data.includes('│') && data.includes('─'));
          
          if (hasPromptIndicators || (hasBoxDrawing && timeSinceLastData > 100)) {
            session.pendingPromptScroll = true;
          }
          
          if (session.pendingPromptScroll && (data.includes('╰') || data.includes('❯'))) {
            setTimeout(() => {
              terminal.scrollToBottom();
              session.pendingPromptScroll = false;
            }, 100);
          } else if (!session.pendingPromptScroll) {
            autoScrollIfNeeded(session);
          }
        }
      });
    }
    
    // IMPORTANT: Re-setup terminal input handler to ensure it works
    // Dispose of existing data handler if it exists
    if ((session as any).dataHandler) {
      (session as any).dataHandler.dispose();
    }
    
    // Set up fresh input handler
    (session as any).dataHandler = terminal.onData((data: string) => {
      // Track user input time
      session.lastUserInputTime = Date.now();
      
      if (services.value && instance.status === 'connected') {
        
        // Send to Claude
        services.value.claude.send(instance.id, data);
        
        // Only start refresh for actual character input, not control sequences
        if (data && data.length > 0 && data.charCodeAt(0) >= 32) {
          // Start continuous auto-refresh to show the echo and response
          //startContinuousRefresh(instance.id);
        }
      }
    });
    
    // Enable terminal input
    terminal.options.disableStdin = false;
    
    if ((result as any).alreadyRunning) {
      terminal.write(`\x1b[32mConnected to existing Claude instance on desktop\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance: ${instance.name} (${instance.id})\x1b[0m\r\n`);
      
      // Load existing buffer to show chat history
      try {
        const buffer = await services.value.claude.getClaudeBuffer(instance.id);
        if (buffer) {
          setTimeout(() => {
            terminal.clear();
            
            // Restore the buffer content
            restoreSerializedBuffer(terminal, buffer);
            
            terminal.scrollToBottom();
           
          }, 100);
        }
      } catch (e) {
        console.error('[MobileClaude] Failed to load buffer:', e);
      }
      
      // Send a newline to trigger Claude to show its prompt
      setTimeout(async () => {
        try {
          await services.value.claude.send(instance.id, '\n');
         
        } catch (e) {
          console.error('[MobileClaude] Failed to send newline:', e);
        }
      }, 500);
    } else if (result.pid === -1) {
      terminal.write(`\x1b[33mStarting Claude on desktop...\x1b[0m\r\n`);
      terminal.write(`\x1b[90mPlease wait a moment for Claude to initialize\x1b[0m\r\n`);
      
      // Wait a bit then try to get the buffer to see initial output
      setTimeout(async () => {
        try {
          const buffer = await services.value.claude.getClaudeBuffer(instance.id);
          if (buffer) {
            terminal.clear();
            restoreSerializedBuffer(terminal, buffer);
            terminal.scrollToBottom();
          }
        } catch (e) {
          console.error('[MobileClaude] Failed to get initial buffer:', e);
        }
      }, 1000);
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
  
  // Clear any running continuous refresh for this instance
  const existingInterval = continuousRefreshIntervals.get(instanceId);
  if (existingInterval) {
    
    clearInterval(existingInterval);
    continuousRefreshIntervals.delete(instanceId);
  }
  
  try {
    await services.value.claude.stop(instanceId);
    
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
    const instance = claudeStore.instances.get(instanceId);
    if (instance?.status === 'connected') {
      await services.value.claude.stop(instanceId);
    }
    
    // Clear auto-refresh timeout for this instance
    clearAutoRefresh(instanceId);
    
    const session = claudeSessions.value.get(instanceId);
    if (session) {
      if (session.outputHandler) session.outputHandler();
      if (session.errorHandler) session.errorHandler();
      if (session.exitHandler) session.exitHandler();
      if ((session as any).dataHandler) (session as any).dataHandler.dispose();
      session.terminal.dispose();
      claudeSessions.value.delete(instanceId);
      claudeSessions.value = new Map(claudeSessions.value);
    }
    
    claudeStore.instances.delete(instanceId);
    
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
  
  await services.value.claude.send(activeInstance.value.id, message + '\n');
}

// Schedule auto-refresh with debouncing
function scheduleAutoRefresh(instanceId: string) {
  // Cancel any existing timeout for this instance
  const existingTimeout = refreshTimeouts.get(instanceId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Set new timeout - reduced from 80ms to 50ms for better responsiveness
  const timeout = setTimeout(async () => {
   
    
    const session = claudeSessions.value.get(instanceId);
    if (!session || !session.terminal || !services.value) {
      refreshTimeouts.delete(instanceId);
      return;
    }
    
    try {
      // Get the latest buffer from backend
      const buffer = await services.value.claude.getClaudeBuffer(instanceId);
      
      if (buffer) {
        // Create a simple hash of the buffer to detect changes
        const bufferHash = buffer.length + '-' + buffer.slice(0, 100) + buffer.slice(-100);
        
        // Only update if buffer actually changed
        if (bufferHash !== session.lastBufferHash) {
          session.lastBufferHash = bufferHash;
          
          // Save current state
          const wasAtBottom = session.isAtBottom;
          
          // Use clear() which is optimized in xterm
          session.terminal.clear();
          
          // Write the new buffer content
          restoreSerializedBuffer(session.terminal, buffer);
          
          // Restore scroll position
          session.terminal.scrollToBottom();
        }
      }
    } catch (error) {
      console.error(`[MobileClaude] Auto-refresh failed for ${instanceId}:`, error);
    }
    
    // Clean up
    refreshTimeouts.delete(instanceId);
  }, 50);
  
  // Store the timeout
  refreshTimeouts.set(instanceId, timeout);
}

// Debounce timers for refresh
const debounceTimers = new Map<string, NodeJS.Timeout>();

// Start refresh with debounce - waits for output to stop before refreshing
function startRefreshWithDebounce(instanceId: string) {
  // Clear any existing debounce timer for this instance
  const existingTimer = debounceTimers.get(instanceId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Set a new debounce timer
  const timer = setTimeout(async () => {
    // Remove the timer from the map
    debounceTimers.delete(instanceId);
    
    // Perform a single buffer refresh
    if (services.value && services.value.claude) {
      try {
        const buffer = await services.value.claude.getClaudeBuffer(instanceId);
        if (buffer) {
          const instance = claudeStore.instances.get(instanceId);
          if (instance && instance.status === 'connected') {
            const session = claudeSessions.value.get(instanceId);
            if (session?.terminal) {
              const terminal = session.terminal;
              // Check if buffer actually changed
              const bufferHash = buffer.length + '-' + buffer.slice(0, 100) + buffer.slice(-100);
              if (bufferHash !== session.lastBufferHash) {
                session.lastBufferHash = bufferHash;
                terminal.clear();
                restoreSerializedBuffer(terminal, buffer);
                terminal.scrollToBottom();
              }
            }
          }
        }
      } catch (error) {
        console.error('[MobileClaude] Failed to refresh buffer after debounce:', error);
      }
    }
  }, 1000);
  
  debounceTimers.set(instanceId, timer);
}

// Start continuous refresh for a few seconds after input
function startContinuousRefresh(instanceId: string) {
  // Track when we last got input
  const now = Date.now();
  lastInputTime.set(instanceId, now);
  
  // Clear any existing interval first
  const existingInterval = continuousRefreshIntervals.get(instanceId);
  if (existingInterval) {
    
    clearInterval(existingInterval);
    continuousRefreshIntervals.delete(instanceId);
  }
  
  
  
  let refreshCount = 0;
  const maxRefreshes = 1; // 1 second total (10 * 100ms)
  const inputTimeStamp = now; // Capture the timestamp for this specific input
  
  const interval = setInterval(async () => {
    refreshCount++;
    
    // Stop if we've hit max refreshes or if there's been new input
    if (refreshCount > maxRefreshes || lastInputTime.get(instanceId) !== inputTimeStamp) {
      clearInterval(interval);
      continuousRefreshIntervals.delete(instanceId);
      return;
    }
    
    const session = claudeSessions.value.get(instanceId);
    if (!session || !session.terminal || !services.value) {
      clearInterval(interval);
      continuousRefreshIntervals.delete(instanceId);
      return;
    }
    
    try {
      const buffer = await services.value.claude.getClaudeBuffer(instanceId);
      if (buffer) {
        const bufferHash = buffer.length + '-' + buffer.slice(0, 100) + buffer.slice(-100);
        if (bufferHash !== session.lastBufferHash) {
          session.lastBufferHash = bufferHash;
          session.terminal.clear();
          restoreSerializedBuffer(session.terminal, buffer);
          session.terminal.scrollToBottom();
        }
      }
    } catch (error) {
      // Ignore errors during continuous refresh
    }
  }, 1000); // Increased from 50ms to 100ms to reduce frequency
  
  continuousRefreshIntervals.set(instanceId, interval);
}

// Cleanup function for refresh timeouts
function clearAutoRefresh(instanceId?: string) {
  if (instanceId) {
    const timeout = refreshTimeouts.get(instanceId);
    if (timeout) {
      clearTimeout(timeout);
      refreshTimeouts.delete(instanceId);
    }
  } else {
    // Clear all timeouts
    for (const timeout of refreshTimeouts.values()) {
      clearTimeout(timeout);
    }
    refreshTimeouts.clear();
  }
}

// Handle window resize
const resizeObserver = new ResizeObserver(() => {
  if (activeInstanceId.value) {
    const session = claudeSessions.value.get(activeInstanceId.value);
    if (session) {
      try {
        session.fitAddon.fit();
        
        // Configure terminal dimensions on server for smart buffer translation
        if (services.value && session.terminal.cols && session.terminal.rows) {
          const cols = session.terminal.cols;
          const rows = session.terminal.rows;
         
          
          services.value.claude.configureTerminal?.(activeInstanceId.value, cols, rows).catch(err => {
            console.error('[MobileClaude] Failed to configure terminal dimensions:', err);
          });
        }
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
  
  
  // Clear all auto-refresh timeouts
  clearAutoRefresh();
  
  // Clear all continuous refresh intervals - be extra thorough
  
  for (const [instanceId, interval] of continuousRefreshIntervals.entries()) {
    
    clearInterval(interval);
  }
  continuousRefreshIntervals.clear();
  
  // Clear all debounce timers
  for (const [instanceId, timer] of debounceTimers.entries()) {
    
    clearTimeout(timer);
  }
  debounceTimers.clear();
  
  // Also clear the lastInputTime map
  lastInputTime.clear();
  
  // Clean up sessions
  for (const session of claudeSessions.value.values()) {
    if (session.outputHandler) session.outputHandler();
    if (session.errorHandler) session.errorHandler();
    if (session.exitHandler) session.exitHandler();
    if ((session as any).dataHandler) (session as any).dataHandler.dispose();
    session.terminal.dispose();
  }
  
  claudeSessions.value.clear();
  
  resizeObserver.disconnect();
});
</script>

<style scoped>
.mobile-claude {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0b0d;
  position: relative;
}

/* When inside a dock/sidebar, add padding for chat input */
.right-sidebar .mobile-claude,
.left-dock .mobile-claude,
.bottom-dock .mobile-claude {
  padding-bottom: 80px;
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
  background: #0a0b0d;
  position: relative;
  /* Allow terminal to extend full height */
  display: flex;
  flex-direction: column;
}

.claude-session {
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
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

/* Mobile Chat Input - Fixed overlay at bottom */
.mobile-chat-input-overlay {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 8px;
  padding: 12px;
  background: rgba(10, 11, 13, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 100;
}

/* When inside a dock/sidebar, use absolute positioning */
.right-sidebar .mobile-chat-input-overlay,
.left-dock .mobile-chat-input-overlay,
.bottom-dock .mobile-chat-input-overlay {
  position: absolute;
  z-index: 10;
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
  position: relative;
  overflow: hidden;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}

/* Improve rendering stability */
:deep(.xterm-screen) {
  transform: translateZ(0);
  will-change: contents;
}

:deep(.xterm-rows) {
  position: relative;
}

:deep(.xterm-cursor-layer) {
  z-index: 3;
}

/* Override inline styles on helper textarea that xterm sets on mobile */
:deep(.xterm-helper-textarea) {
  left: -9999em !important;
  top: 0 !important;
  width: 0 !important;
  height: 0 !important;
}

/* Ensure the screen container fills the terminal */
:deep(.xterm-screen) {
  position: relative;
  height: 100% !important;
}

/* Ensure terminal container has proper overflow */
:deep(.xterm) {
  position: relative;
  overflow: hidden;
}

/* Fix cursor issues - hide ALL cursors since we use chat input */
:deep(.xterm-cursor-outline) {
  display: none !important;
}

/* Hide the main cursor completely */
:deep(.xterm-cursor) {
  display: none !important;
}

/* Hide the entire cursor layer */
:deep(.xterm-cursor-layer) {
  display: none !important;
}

/* Hide any cursor that appears outside the viewport */
:deep(.xterm-screen) {
  overflow: hidden !important;
}

/* Force cursor to stay within terminal bounds */
:deep(.xterm-cursor) {
  position: absolute !important;
}

/* Hide any xterm cursor completely if it's outside the main terminal area */
:deep(.xterm-cursor):not(.xterm-screen .xterm-cursor) {
  display: none !important;
}

/* Additional fix for mobile - hide cursor when not focused */
:deep(.xterm:not(.focus) .xterm-cursor-layer) {
  visibility: hidden !important;
}

/* Fix cursor taking full row - constrain height */
:deep(.xterm-cursor-layer > div) {
  max-height: 1.2em !important;
  overflow: hidden !important;
}

/* Ensure cursor block doesn't expand beyond character size */
:deep(.xterm-cursor-block) {
  height: 1em !important;
  max-height: 1em !important;
}

/* Mobile-specific fix: Hide any element with cursor classes outside terminal viewport */
:deep(body > .xterm-cursor),
:deep(body > .xterm-cursor-outline),
:deep(body > .xterm-cursor-block),
:deep(body > .xterm-cursor-bar),
:deep(body > .xterm-cursor-underline) {
  display: none !important;
}

/* Ensure cursor layer stays within terminal bounds */
:deep(.xterm-cursor-layer) {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  pointer-events: none !important;
}

/* Mobile Chrome/Android specific - prevent input helper from creating duplicate cursor */
:deep(.xterm-helper-textarea:focus) {
  caret-color: transparent !important;
}
</style>