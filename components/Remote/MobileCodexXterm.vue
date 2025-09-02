<template>
  <div class="mobile-codex">
    <!-- Codex Header -->
    <div class="codex-header">
      <div class="header-left">
        <h3>Codex Assistant</h3>
      </div>
      <div class="codex-actions">
        <button @click="createNewInstance" class="action-btn" title="New Codex">
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
          <span class="tab-name">{{ instance.name }}</span>
          <div class="tab-status" :class="`status-${instance.status}`"></div>
          <button
            v-if="instance.status === 'disconnected'"
            @click.stop="startCodex(instance.id)"
            class="tab-action start"
            title="Start"
          >
            <Icon name="mdi:play" />
          </button>
          <button
            v-else-if="instance.status === 'connected'"
            @click.stop="stopCodex(instance.id)"
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
    
    <!-- Codex Terminal Container -->
    <div class="codex-container">
      <div v-if="instances.length === 0" class="empty-state">
        <Icon name="mdi:robot" />
        <p>No Codex instances active</p>
        <button @click="createNewInstance" class="create-btn">
          Start Codex Assistant
        </button>
      </div>
      
      <!-- Codex Terminal Sessions -->
      <div
        v-for="instance in instances"
        v-show="instance.id === activeInstanceId"
        :key="`session-${instance.id}`"
        :ref="el => terminalRefs[instance.id] = el"
        class="codex-session"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import 'xterm/css/xterm.css';
import { useCodexInstancesStore } from '~/stores/codex-instances';
import { useServices } from '~/composables/useServices';
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import { useMobileConnection } from '~/composables/useMobileConnection';

interface CodexSession {
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
  lastOutputTime: number;
  lastUserInputTime: number;
  lastBufferHash?: string;
}

// Use mobile connection for mobile devices
const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const remoteConnection = isMobileDevice ? useMobileConnection() : useRemoteConnection();
const { connected } = remoteConnection;
const { services, initialize } = useServices();

const codexStore = useCodexInstancesStore();

// All instances in the store (not filtered)
const allInstances = computed(() => codexStore.instancesList);

// Filtered instances for display based on current workspace
const instances = computed(() => {
  const workspace = (window as any).__remoteWorkspace?.path;
  if (!workspace) {
    // If no workspace, show all instances
    return allInstances.value;
  }
  
  // In remote mode, only show instances from the current workspace
  return allInstances.value.filter(instance => {
    const instanceWorkingDir = instance.workingDirectory || '';
    return instanceWorkingDir === workspace;
  });
});

const activeInstanceId = ref<string>('');
const activeInstance = computed(() => 
  allInstances.value.find(i => i.id === activeInstanceId.value)
);

const codexSessions = ref(new Map<string, CodexSession>());
const terminalRefs = ref<Record<string, any>>({});

// Restore serialized buffer to terminal
function restoreSerializedBuffer(terminal: any, serializedBuffer: string) {
  try {
    if (serializedBuffer.startsWith('{')) {
      const data = JSON.parse(serializedBuffer);
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((line: any, index: number) => {
          if (line) {
            if (index < data.data.length - 1) {
              terminal.writeln(line);
            } else {
              terminal.write(line);
            }
          }
        });
      }
    } else {
      terminal.write(serializedBuffer);
    }
  } catch (e) {
    console.error('[MobileCodex] Failed to restore serialized buffer:', e);
    terminal.write(serializedBuffer);
  }
}

// Simple auto-scroll helper
function autoScrollIfNeeded(session: CodexSession) {
  if (session.isAtBottom) {
    session.terminal.scrollToBottom();
  }
}

// Retry loading instances with exponential backoff
async function loadCodexInstancesWithRetry(maxRetries = 2, delay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await loadCodexInstances();
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5;
      }
    }
  }
  console.error('[MobileCodex] Failed to load instances after all retries');
}

// Set up socket event listeners
const setupSocketListeners = async () => {
  let socket = (services.value as any)?.getSocket?.() || (services.value as any)?.__socket;
  
  if (!socket) {
    try {
      const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
      socket = remoteConnection.getSocket();
    } catch (e) {}
  }
  
  if (socket) {
    // Add connection listener to retry loading instances when connected
    socket.on('connect', async () => {
      setTimeout(async () => {
        await loadCodexInstancesWithRetry();
      }, 500);
    });
    
    // If socket is already connected, load instances
    if (socket.connected) {
      setTimeout(async () => {
        await loadCodexInstancesWithRetry();
      }, 500);
    }
    
    return true;
  }
  return false;
};

// Handler for connection ready event
const onConnectionReady = async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const hasSocket = await setupSocketListeners();
  if (hasSocket) {
    await loadCodexInstancesWithRetry();
  }
};

// Initialize services and load instances
onMounted(async () => {
  await initialize();
  await codexStore.init();
  
  // Try to load existing Codex instances
  await loadCodexInstancesWithRetry();
  
  // Try to set up socket listeners immediately
  const hasSocket = await setupSocketListeners();
  
  // Listen for remote connection ready event
  window.addEventListener('remote-connection-ready', onConnectionReady);
  
  // Setup codex instance update listener
  const setupInstanceUpdateListener = () => {
    const socket = (services.value as any)?.getSocket?.() || (services.value as any)?.__socket;
    if (socket) {
      // Remove any existing listener first to avoid duplicates
      socket.off('codex:instances:updated');
      
      socket.on('codex:instances:updated', async (data: any) => {
        console.log('[MobileCodex] Received instance update:', data);
        
        // If we have specific instance status update, handle it directly
        if (data && data.instanceId && data.status) {
          codexStore.updateInstanceStatus(data.instanceId, data.status, data.pid);
        }
        
        // Add a small delay to ensure backend state is updated
        setTimeout(async () => {
          await codexStore.reloadInstances();
          // Force reload all instances and their terminal sessions
          await loadCodexInstances();
          
          // If we have an active instance that's now connected, re-setup its handlers
          if (activeInstance.value && activeInstance.value.status === 'connected') {
            const session = codexSessions.value.get(activeInstance.value.id);
            if (session && services.value) {
              // Re-setup terminal input handler when instance becomes connected
              if ((session as any).dataHandler) {
                (session as any).dataHandler.dispose();
              }
              
              (session as any).dataHandler = session.terminal.onData((data: string) => {
                session.lastUserInputTime = Date.now();
                if (services.value && activeInstance.value.status === 'connected') {
                  services.value.codex.send(activeInstance.value.id, data);
                }
              });
              
              // Ensure output handler is set up
              if (!session.outputHandler) {
                session.outputHandler = services.value.codex.onOutput(activeInstance.value.id, (data: string | any) => {
                  if (session.terminal) {
                    session.lastDataTime = Date.now();
                    session.lastOutputTime = Date.now();
                    
                    if (data.includes('\x1b[2J') || data.includes('\x1b[H')) {
                      session.terminal.clear();
                    }
                    
                    session.terminal.write(data);
                  }
                });
              }
              
              if (!session.spawned) {
                try {
                  const result = await services.value.codex.spawn(
                    activeInstance.value.id,
                    activeInstance.value.workingDirectory,
                    activeInstance.value.name
                  );
                  session.spawned = true;
                  
                  // Get the current buffer to show existing content
                  const buffer = await services.value.codex.getCodexBuffer(activeInstance.value.id);
                  if (buffer) {
                    session.terminal.clear();
                    session.terminal.reset();
                    restoreSerializedBuffer(session.terminal, buffer);
                    session.terminal.scrollToBottom();
                  }
                } catch (error) {
                  console.error('[MobileCodex] Failed to setup instance after update:', error);
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

// Load Codex instances (remote or desktop)
async function loadCodexInstances() {
  if (!services.value) return;
  
  // Check if connected before attempting to load instances
  const socket = (services.value as any)?.getSocket?.() || (services.value as any)?.__socket;
  if (!socket?.connected) {
    console.log('[MobileCodex] Socket not connected, skipping instance load');
    return;
  }
  
  // Get current workspace path
  let currentWorkspace = (window as any).__remoteWorkspace?.path;
  if (!currentWorkspace) {
    try {
      const workspaceInfo = await $fetch('/api/workspace/current');
      currentWorkspace = workspaceInfo.path;
    } catch (error) {
      console.log('[MobileCodex] Could not determine current workspace');
    }
  }
  
  try {
    const existingInstances = await services.value.codex.listDesktopInstances();
    console.log('[MobileCodex] Loaded instances:', existingInstances);
    console.log('[MobileCodex] Current workspace:', currentWorkspace);
    
    // In remote/headless mode, we process ALL instances without filtering
    // These are remote instances, not desktop instances
    for (const info of existingInstances) {
      // Codex instances might have different structure than Claude
      const instanceId = info.instanceId || info.id;
      if (!instanceId) continue;
      
      // In remote/headless mode, all instances are remote instances
      // Don't skip based on isDesktop flag
      
      let instance = codexStore.instances.get(instanceId);
      if (!instance) {
        instance = {
          id: instanceId,
          name: info.name || `Codex ${instances.value.length + 1}`,
          status: info.status || 'disconnected',
          workingDirectory: info.workingDirectory || info.cwd || '/',
          createdAt: info.createdAt || new Date().toISOString(),
          lastActiveAt: info.lastActiveAt || new Date().toISOString(),
          color: info.color,
          pid: info.pid
        };
        codexStore.instances.set(instance.id, instance);
      } else {
        instance.status = info.status || 'disconnected';
        instance.pid = info.pid;
        codexStore.instances.set(instance.id, { ...instance });
      }
      
      if (!codexSessions.value.has(instance.id)) {
        await initializeCodexSession(instance);
      } else if (instance.status === 'connected') {
        const session = codexSessions.value.get(instance.id);
        if (session && services.value) {
          try {
            // Re-enable terminal input in case it was disabled
            session.terminal.options.disableStdin = false;
            
            if (!session.spawned) {
              try {
                const result = await services.value.codex.spawn(
                  instance.id,
                  instance.workingDirectory,
                  instance.name
                );
                session.spawned = true;
              } catch (spawnError: any) {
                if (spawnError?.message?.includes('already exists')) {
                  session.spawned = true;
                } else {
                  console.error('[MobileCodex] Failed to spawn:', spawnError);
                }
              }
            }
          } catch (error) {
            console.error('[MobileCodex] Unexpected error:', error);
          }
        }
      }
    }
    
    // Set active instance to first in current workspace if none active
    if (instances.value.length > 0 && !activeInstanceId.value) {
      setActiveInstance(instances.value[0].id);
    }
  } catch (error) {
    console.error('[MobileCodex] Failed to load instances:', error);
  }
}

// Initialize Codex session with xterm
async function initializeCodexSession(instance: any) {
  if (codexSessions.value.has(instance.id)) {
    const existingSession = codexSessions.value.get(instance.id);
    if (existingSession && instance.status === 'connected' && !existingSession.spawned && services.value) {
      try {
        const result = await services.value.codex.spawn(
          instance.id,
          instance.workingDirectory,
          instance.name
        );
        existingSession.spawned = true;
      } catch (error) {
        console.error('[MobileCodex] Failed to spawn for existing session:', error);
      }
    }
    return;
  }
  
  // Create terminal matching desktop configuration
  const terminal = new Terminal({
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
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
    cursorStyle: 'block',
    scrollback: 10000,
    convertEol: true,
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
  
  // Track scroll position
  let isAtBottom = true;
  terminal.onScroll(() => {
    const buffer = terminal.buffer.active;
    const scrollbackSize = buffer.length - terminal.rows;
    const scrollOffset = buffer.viewportY;
    isAtBottom = scrollOffset >= scrollbackSize - 5;
  });
  
  // Create session
  const session: CodexSession = {
    id: instance.id,
    instanceId: instance.id,
    terminal,
    fitAddon,
    serializeAddon,
    isAtBottom: true,
    lastDataTime: 0,
    lastOutputTime: Date.now(),
    lastUserInputTime: 0,
    lastBufferHash: undefined
  };
  
  // Update session's isAtBottom when terminal scrolls
  terminal.onScroll(() => {
    session.isAtBottom = isAtBottom;
  });
  
  // Handle terminal input
  (session as any).dataHandler = terminal.onData((data: string) => {
    session.lastUserInputTime = Date.now();
    
    if (services.value && instance.status === 'connected') {
      services.value.codex.send(instance.id, data);
    }
  });
  
  try {
    // Clean up any existing output handler first
    if (session.outputHandler) {
      session.outputHandler();
      session.outputHandler = undefined;
    }
    
    // Set up output handler
    session.outputHandler = services.value!.codex.onOutput(instance.id, (data: string | any) => {
      if (terminal) {
        const currentTime = Date.now();
        session.lastDataTime = currentTime;
        session.lastOutputTime = currentTime;
        
        // Check for clear screen sequences
        if (data.includes('\x1b[2J') || data.includes('\x1b[H')) {
          terminal.clear();
        }
        
        // Write data directly to terminal
        terminal.write(data);
        autoScrollIfNeeded(session);
      }
    });
    
    // Set up error handler
    session.errorHandler = services.value!.codex.onError(instance.id, (error: string) => {
      console.error(`[MobileCodex] Error for ${instance.id}:`, error);
      terminal.write(`\x1b[31mError: ${error}\x1b[0m\r\n`);
      autoScrollIfNeeded(session);
    });
    
    // Set up exit handler
    session.exitHandler = services.value!.codex.onExit(instance.id, (code: number | null) => {
      terminal.write(`\r\n\x1b[33mCodex exited${code !== null ? ` with code ${code}` : ''}\x1b[0m\r\n`);
      const inst = codexStore.instances.get(instance.id);
      if (inst) {
        inst.status = 'disconnected';
      }
    });
    
    // Store session
    codexSessions.value.set(instance.id, session);
    codexSessions.value = new Map(codexSessions.value);
    
    await nextTick();
    
    if (instance.id === activeInstanceId.value) {
      attachTerminal(instance.id);
    }
    
    if (instance.status === 'connected') {
      terminal.write(`\x1b[32mConnected to ${instance.name}\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance ID: ${instance.id}\x1b[0m\r\n\r\n`);
      
      // Spawn/setup forwarding if not already done
      if (!session.spawned) {
        try {
          const result = await services.value!.codex.spawn(
            instance.id,
            instance.workingDirectory,
            instance.name
          );
          session.spawned = true;
        } catch (spawnError: any) {
          if (spawnError?.message?.includes('already exists')) {
            session.spawned = true;
          } else {
            console.error('[MobileCodex] Failed to spawn:', spawnError);
          }
        }
      }
      
      // Get and restore buffer
      if (!session.bufferRestored) {
        setTimeout(async () => {
          try {
            const buffer = await services.value!.codex.getCodexBuffer(instance.id);
            if (buffer && buffer.length > 0) {
              terminal.write(buffer);
              session.bufferRestored = true;
              autoScrollIfNeeded(session);
            }
          } catch (error) {
            console.error('[MobileCodex] Failed to get buffer:', error);
          }
        }, 500);
      }
    } else {
      terminal.write(`\x1b[33m${instance.name} is not running on desktop\x1b[0m\r\n`);
      terminal.write(`\x1b[90mStart it on desktop first to connect from mobile\x1b[0m\r\n\r\n`);
    }
    
  } catch (error) {
    console.error('[MobileCodex] Failed to initialize session:', error);
    terminal.dispose();
    codexSessions.value.delete(instance.id);
  }
}

// Attach terminal to DOM
function attachTerminal(instanceId: string) {
  const session = codexSessions.value.get(instanceId);
  const container = terminalRefs.value[instanceId];
  
  if (!session || !container) return;
  
  container.innerHTML = '';
  session.terminal.open(container);
  
  nextTick(async () => {
    try {
      // Initial fit
      session.fitAddon.fit();
      
      // Configure terminal dimensions on server (only for connected instances)
      const inst = codexStore.instances.get(instanceId);
      if (services.value && session.terminal.cols && session.terminal.rows && inst?.status === 'connected') {
        const cols = session.terminal.cols;
        const rows = session.terminal.rows;
        
        services.value.codex.configureTerminal(instanceId, cols, rows).catch(err => {
          console.error('[MobileCodex] Failed to configure terminal dimensions:', err);
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
                session.terminal.reset();
                restoreSerializedBuffer(session.terminal, buffer);
                session.bufferRestored = true;
                session.terminal.scrollToBottom();
              } catch (e) {
                console.error('[MobileCodex] Failed to restore buffer:', e);
              }
            }, 100);
          }
          delete (session as any).pendingBuffer;
        } catch (e) {
          console.error('[MobileCodex] Failed to load pending buffer:', e);
          delete (session as any).pendingBuffer;
        }
      }
    } catch (e) {
      console.error('[MobileCodex] Failed to fit terminal:', e);
    }
  });
}

// Create new Codex instance
async function createNewInstance() {
  if (!services.value) return;
  
  try {
    // Get workspace from window.__remoteWorkspace first, fallback to fetching from server
    let workspace = (window as any).__remoteWorkspace?.path;
    
    if (!workspace) {
      try {
        const workspaceInfo = await $fetch('/api/workspace/current');
        workspace = workspaceInfo.path || process.env.HOME || '/';
      } catch (error) {
        console.error('[MobileCodex] Failed to get workspace from server:', error);
        workspace = process.env.HOME || '/';
      }
    }
    
    const instanceNumber = instances.value.length + 1;
    const instanceName = `Codex ${instanceNumber}`;
    const instanceId = `codex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const instance = {
      id: instanceId,
      name: instanceName,
      status: 'connected' as const,
      workingDirectory: workspace,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };
    codexStore.instances.set(instanceId, instance);
    
    await initializeCodexSession(instance);
    setActiveInstance(instanceId);
    
  } catch (error) {
    console.error('[MobileCodex] Failed to create instance:', error);
  }
}

// Start Codex instance
async function startCodex(instanceId: string) {
  if (!services.value) return;
  
  const instance = codexStore.instances.get(instanceId);
  if (!instance) return;
  
  const session = codexSessions.value.get(instanceId);
  if (!session) return;
  
  const { terminal } = session;
  
  if (instance.status === 'connected') {
    terminal.write('\x1b[33mCodex is already running\x1b[0m\r\n');
    return;
  }
  
  terminal.clear();
  terminal.write('\x1b[32mStarting Codex...\x1b[0m\r\n');
  
  try {
    const result = await services.value.codex.spawn(
      instance.id,
      instance.workingDirectory,
      instance.name
    );
    
    instance.status = 'connected';
    instance.pid = result.pid || -1;
    session.spawned = true;
    
    // Set up output handler if not already set up
    if (!session.outputHandler) {
      session.outputHandler = services.value.codex.onOutput(instance.id, (data: string | any) => {
        if (terminal) {
          const currentTime = Date.now();
          session.lastDataTime = currentTime;
          session.lastOutputTime = currentTime;
          
          if (data.includes('\x1b[2J') || data.includes('\x1b[H')) {
            terminal.clear();
          }
          
          terminal.write(data);
          autoScrollIfNeeded(session);
        }
      });
    }
    
    // Re-setup terminal input handler
    if ((session as any).dataHandler) {
      (session as any).dataHandler.dispose();
    }
    
    (session as any).dataHandler = terminal.onData((data: string) => {
      session.lastUserInputTime = Date.now();
      
      if (services.value && instance.status === 'connected') {
        services.value.codex.send(instance.id, data);
      }
    });
    
    // Enable terminal input
    terminal.options.disableStdin = false;
    
    if ((result as any).alreadyRunning) {
      terminal.write(`\x1b[32mConnected to existing Codex instance on desktop\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance: ${instance.name} (${instance.id})\x1b[0m\r\n`);
      
      // Load existing buffer
      try {
        const buffer = await services.value.codex.getCodexBuffer(instance.id);
        if (buffer) {
          setTimeout(() => {
            // Clear the terminal completely before restoring
            terminal.clear();
            terminal.reset();
            restoreSerializedBuffer(terminal, buffer);
            terminal.scrollToBottom();
          }, 100);
        }
      } catch (e) {
        console.error('[MobileCodex] Failed to load buffer:', e);
      }
    } else {
      terminal.write(`\x1b[32mCodex started successfully!\x1b[0m\r\n`);
      terminal.write(`\x1b[90mInstance: ${instance.name} (${instance.id})\x1b[0m\r\n`);
    }
    terminal.write('\r\n');
  } catch (error) {
    console.error('[MobileCodex] Failed to start Codex:', error);
    terminal.write(`\x1b[31mFailed to start Codex: ${error}\x1b[0m\r\n`);
    instance.status = 'disconnected';
  }
}

// Stop Codex instance
async function stopCodex(instanceId: string) {
  if (!services.value) return;
  
  const instance = codexStore.instances.get(instanceId);
  if (!instance) return;
  
  const session = codexSessions.value.get(instanceId);
  if (!session) return;
  
  const { terminal } = session;
  
  terminal.write('\r\n\x1b[33mStopping Codex...\x1b[0m\r\n');
  
  try {
    await services.value.codex.stop(instanceId);
    
    instance.status = 'disconnected';
    instance.pid = undefined;
    
    terminal.clear();
    terminal.write('\x1b[33mCodex stopped\x1b[0m\r\n');
    terminal.write('\x1b[90mClick the Start button to launch Codex again\x1b[0m\r\n');
  } catch (error) {
    console.error('[MobileCodex] Failed to stop Codex:', error);
    terminal.write(`\x1b[31mFailed to stop Codex: ${error}\x1b[0m\r\n`);
  }
}

// Remove Codex instance
async function removeInstance(instanceId: string) {
  if (!services.value || instances.value.length <= 1) return;
  
  try {
    const instance = codexStore.instances.get(instanceId);
    if (instance?.status === 'connected') {
      await services.value.codex.stop(instanceId);
    }
    
    const session = codexSessions.value.get(instanceId);
    if (session) {
      if (session.outputHandler) session.outputHandler();
      if (session.errorHandler) session.errorHandler();
      if (session.exitHandler) session.exitHandler();
      if ((session as any).dataHandler) (session as any).dataHandler.dispose();
      session.terminal.dispose();
      codexSessions.value.delete(instanceId);
      codexSessions.value = new Map(codexSessions.value);
    }
    
    codexStore.instances.delete(instanceId);
    
    if (activeInstanceId.value === instanceId && instances.value.length > 0) {
      setActiveInstance(instances.value[0].id);
    }
    
  } catch (error) {
    console.error('[MobileCodex] Failed to remove instance:', error);
  }
}

// Set active instance
function setActiveInstance(instanceId: string) {
  activeInstanceId.value = instanceId;
  codexStore.setActiveInstance(instanceId);
  
  nextTick(() => {
    attachTerminal(instanceId);
  });
}

// Handle window resize
const resizeObserver = new ResizeObserver(() => {
  if (activeInstanceId.value) {
    const session = codexSessions.value.get(activeInstanceId.value);
    if (session) {
      try {
        session.fitAddon.fit();
        
        // Configure terminal dimensions on server
        const activeInst = codexStore.instances.get(activeInstanceId.value);
        if (services.value && session.terminal.cols && session.terminal.rows && activeInst?.status === 'connected') {
          const cols = session.terminal.cols;
          const rows = session.terminal.rows;
          
          services.value.codex.configureTerminal(activeInstanceId.value, cols, rows).catch(err => {
            console.error('[MobileCodex] Failed to configure terminal dimensions:', err);
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
  // Clean up event listeners
  if (typeof window !== 'undefined') {
    window.removeEventListener('remote-connection-ready', onConnectionReady);
  }
  
  // Clean up sessions
  for (const session of codexSessions.value.values()) {
    if (session.outputHandler) session.outputHandler();
    if (session.errorHandler) session.errorHandler();
    if (session.exitHandler) session.exitHandler();
    if ((session as any).dataHandler) (session as any).dataHandler.dispose();
    session.terminal.dispose();
  }
  
  codexSessions.value.clear();
  resizeObserver.disconnect();
});
</script>

<style scoped>
.mobile-codex {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  position: relative;
}

/* Codex Header */
.codex-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(180deg, #252526 0%, #1e1e1e 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 12px;
  min-height: 48px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.codex-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.codex-actions {
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
  background: rgba(79, 195, 247, 0.1);
  border-color: rgba(79, 195, 247, 0.3);
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

/* Codex Container */
.codex-container {
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
  position: relative;
  display: flex;
  flex-direction: column;
}

.codex-session {
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
  color: #4fc3f7;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.create-btn {
  padding: 8px 16px;
  background: rgba(79, 195, 247, 0.1);
  color: #4fc3f7;
  border: 1px solid rgba(79, 195, 247, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.create-btn:hover {
  background: rgba(79, 195, 247, 0.2);
  transform: translateY(-1px);
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
</style>