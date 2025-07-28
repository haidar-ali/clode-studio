<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <div class="header-left">
        <h3>{{ instance.name }}</h3>
        <div class="worktree-indicator">
          <Icon 
            :name="isWorktree ? 'mdi:git-branch' : 'mdi:source-branch'" 
            size="14"
            :class="{ 'worktree-icon': isWorktree, 'main-icon': !isWorktree }"
          />
          <span 
            class="branch-name" 
            :class="{ 'worktree-name': isWorktree, 'main-name': !isWorktree }"
            :title="isWorktree ? `Worktree: ${currentBranch}` : `Main branch: ${currentBranch}`"
          >
            {{ currentBranch }}
          </span>
        </div>
      </div>
      <div class="terminal-actions">
        <PersonalitySelector
          :instanceId="instance.id"
          :currentPersonalityId="instance.personalityId"
          @update="updatePersonality"
        />
        <ClaudeRunConfigSelector
          v-if="instance.status === 'disconnected'"
          @config-changed="onConfigChanged"
        />
        <button
          v-if="instance.status === 'disconnected'"
          @click="startClaude"
          class="icon-button start-button"
          title="Start Claude"
        >
          <Icon name="mdi:play" size="16" />
          <span>Start</span>
        </button>
        <button
          v-else-if="instance.status === 'connected'"
          @click="stopClaude"
          class="icon-button stop-button"
          title="Stop Claude"
        >
          <Icon name="mdi:stop" size="16" />
          <span>Stop</span>
        </button>
        <button
          @click="toggleChatInput"
          class="icon-button"
          :class="{ active: showChatInput }"
          title="Toggle chat input"
        >
          <Icon name="heroicons:chat-bubble-left-right" size="16" />
        </button>
        <button
          v-if="hasUndo"
          @click="undoLastCheckpoint"
          class="icon-button undo-button"
          :disabled="isUndoing"
          :title="checkpointInfo ? `Undo to checkpoint: ${checkpointInfo.message.substring(0, 30)}... (${checkpointInfo.time})` : 'Undo last Claude action'"
        >
          <Icon name="mdi:undo" size="16" />
        </button>
        <button
          @click="clearTerminal"
          class="icon-button"
          :title="instance.status === 'connected' ? 'Clear screen (Ctrl+L)' : 'Clear terminal'"
        >
          <Icon name="mdi:delete" size="16" />
        </button>
      </div>
    </div>

    <div ref="terminalElement" class="terminal-content"></div>

    <!-- Chat Input Overlay -->
    <TerminalChatInput
      :isVisible="showChatInput"
      :instanceId="instance.id"
      @close="showChatInput = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, provide, nextTick } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import type { ClaudeInstance } from '~/stores/claude-instances';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useContextManager } from '~/composables/useContextManager';
import { useCommandsStore } from '~/stores/commands';
import PersonalitySelector from './PersonalitySelector.vue';
import TerminalChatInput from './TerminalChatInput.vue';
import ClaudeRunConfigSelector from './ClaudeRunConfigSelector.vue';
import type { ClaudeRunConfig } from '~/stores/claude-run-configs';
import { useGitBranch } from '~/composables/useGitBranch';
import { useCheckpoints } from '~/composables/useCheckpoints';
import 'xterm/css/xterm.css';

const props = defineProps<{
  instance: ClaudeInstance;
}>();

const emit = defineEmits<{
  'status-change': [status: ClaudeInstance['status'], pid?: number];
}>();

const instancesStore = useClaudeInstancesStore();
const contextManager = useContextManager();
const commandsStore = useCommandsStore();
const { currentBranch, isWorktree } = useGitBranch();
const { hasUndo, undoLastCheckpoint, isUndoing, checkpointInfo } = useCheckpoints();
const terminalElement = ref<HTMLElement>();
const showChatInput = ref(false);
const selectedRunConfig = ref<ClaudeRunConfig | null>(null);

// Provide working directory for child components
provide('workingDirectory', props.instance.workingDirectory);

// Terminal state




let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let isAtBottom = true;
let lastDataTime = 0;
let pendingPromptScroll = false;

// Track if this instance's listeners are setup
let listenersSetup = false;
let cleanupOutputListener: (() => void) | null = null;
let cleanupErrorListener: (() => void) | null = null;
let cleanupExitListener: (() => void) | null = null;
let emergencyCleanupListener: (() => void) | null = null;

const personality = computed(() => {
  return props.instance.personalityId
    ? instancesStore.getPersonalityById(props.instance.personalityId)
    : null;
});

const updatePersonality = async (personalityId: string | undefined) => {
  instancesStore.updateInstancePersonality(props.instance.id, personalityId);

  // If Claude is running, send the new personality instructions
  if (props.instance.status === 'connected' && personalityId) {
    const newPersonality = instancesStore.getPersonalityById(personalityId);
    if (newPersonality && terminal) {
      terminal.writeln('\r\n\x1b[36m[Personality Changed: ' + newPersonality.name + ']\x1b[0m');
      terminal.writeln('\x1b[90m' + newPersonality.description + '\x1b[0m\r\n');

      // Send the personality instructions to Claude
      const instructions = `System: Your personality has been changed. ${newPersonality.instructions}`;
      await window.electronAPI.claude.send(props.instance.id, instructions + '\n');
    }
  } else if (!personalityId && props.instance.status === 'connected' && terminal) {
    terminal.writeln('\r\n\x1b[36m[Personality Removed]\x1b[0m');
    terminal.writeln('\x1b[90mReverted to default Claude behavior\x1b[0m\r\n');

    // Tell Claude to revert to default behavior
    const instructions = `System: Your personality has been reset. Please revert to your default behavior.`;
    await window.electronAPI.claude.send(props.instance.id, instructions + '\n');
  }
};

const autoScrollIfNeeded = () => {
  if (terminal && isAtBottom) {
    terminal.scrollToBottom();
  }
};

const initTerminal = () => {
  if (!terminalElement.value) return;

  terminal = new Terminal({
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
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
    fontFamily: 'Consolas, "Courier New", monospace',
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

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(terminalElement.value);
  fitAddon.fit();

  terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {

    
    // Only handle on Mac
    if (navigator.platform.toLowerCase().indexOf('mac') !== -1) {
      // Only process if Claude is connected
      if (props.instance.status === 'connected') {
        try {
          // Cmd + Delete: Clear line before cursor
          if (event.metaKey && event.key === 'Backspace') {
            event.preventDefault();
            window.electronAPI.claude.send(props.instance.id, '\x15'); // Ctrl+U
            return false;
          }
          
          // Cmd + Left Arrow: Go to beginning of line
          if (event.metaKey && event.key === 'ArrowLeft') {
            event.preventDefault();
            window.electronAPI.claude.send(props.instance.id, '\x01'); // Ctrl+A
            return false;
          }
          
          // Cmd + Right Arrow: Go to end of line
          if (event.metaKey && event.key === 'ArrowRight') {
            event.preventDefault();
            window.electronAPI.claude.send(props.instance.id, '\x05'); // Ctrl+E
            return false;
          }
          
          // Option + Left Arrow: Move left one word
          if (event.altKey && event.key === 'ArrowLeft') {
            event.preventDefault();
            window.electronAPI.claude.send(props.instance.id, '\x1bb'); // Alt+B
            return false;
          }
          
          // Option + Right Arrow: Move right one word
          if (event.altKey && event.key === 'ArrowRight') {
            event.preventDefault();
            window.electronAPI.claude.send(props.instance.id, '\x1bf'); // Alt+F
            return false;
          }
          
          // Option + Delete: Delete word before cursor
          if (event.altKey && event.key === 'Backspace') {
            event.preventDefault();
            window.electronAPI.claude.send(props.instance.id, '\x17'); // Ctrl+W
            return false;
          }
        } catch (error) {
          // Silently ignore errors
        }
      }
    }
    
    // Block Option+Enter (Alt+Enter) - prevent xterm's default behavior
    if (event.type === 'keydown' && event.key === 'Enter' && event.altKey) {
      return false;
    }

    // Handle Shift+Enter for inserting a newline
    if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      terminal.paste('\n');
      return false;
    }

    return true;
  });

  terminal.onScroll(() => {
    const buffer = terminal.buffer.active;
    const scrollbackSize = buffer.length - terminal.rows;
    const scrollOffset = buffer.viewportY;
    isAtBottom = scrollOffset >= scrollbackSize - 5;
  });

  // Send terminal input to Claude
  terminal.onData(async (data: string) => {
    if (props.instance.status === 'connected') {
      // Send all data to Claude immediately for proper terminal handling
      window.electronAPI.claude.send(props.instance.id, data);
    }
  });

  let resizeTimeout: NodeJS.Timeout;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(async () => {
      if (fitAddon && terminal) {
        try {
          fitAddon.fit();
          if (props.instance.status === 'connected') {
            // Ensure we're passing plain values, not reactive objects
            const cols = terminal.cols;
            const rows = terminal.rows;
            const instanceId = props.instance.id;
            await window.electronAPI.claude.resize(instanceId, cols, rows);
          }
        } catch (error) {
          console.error('Resize observer error:', error);
        }
      }
    }, 100);
  });
  resizeObserver.observe(terminalElement.value);

  // Check if Claude is already connected
  if (props.instance.status === 'connected') {
    terminal.writeln('Claude CLI is already running');
    terminal.writeln(`Instance: ${props.instance.name}`);
    terminal.writeln('Reconnecting to existing session...');
    terminal.writeln('');
    
    // Reconnect listeners
    setupClaudeListeners();
    
    // Sync terminal size
    setTimeout(() => {
      if (fitAddon && terminal) {
        fitAddon.fit();
        window.electronAPI.claude.resize(props.instance.id, terminal.cols, terminal.rows);
      }
    }, 100);
  } else {
    // Show welcome message
    showWelcomeMessage();
  }
};

const showWelcomeMessage = () => {
  if (!terminal) return;

  terminal.writeln('Welcome to Clode Studio Terminal');
  terminal.writeln(`Instance: ${props.instance.name}`);
  if (personality.value && personality.value.name) {
    const desc = personality.value.description || '';
    terminal.writeln(`Personality: ${personality.value.name} - ${desc}`);
  }
  terminal.writeln('\x1b[36m[Lightweight Context: Enabled]\x1b[0m');
  terminal.writeln('\x1b[90mSmart file discovery and project context available\x1b[0m');
  terminal.writeln('\x1b[33m[Slash Commands: /help]\x1b[0m');
  terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
  terminal.writeln('');
  terminal.scrollToBottom();
};


const setupClaudeListeners = () => {
  // Remove any existing listeners for this instance
  removeClaudeListeners();

  // Setting up Claude listeners for instance

  // Setup output listener
  cleanupOutputListener = window.electronAPI.claude.onOutput(props.instance.id, async (data: string) => {
    if (terminal && props.instance.status === 'connected') {
      const currentTime = Date.now();
      const timeSinceLastData = currentTime - lastDataTime;
      lastDataTime = currentTime;

      terminal.write(data);

      // Check if Claude is showing a prompt - this means it's ready for input
      const hasPromptIndicators = data.includes('Do you want to') ||
                                 data.includes('❯') ||
                                 data.includes('Yes, and don\'t ask again') ||
                                 data.includes('No, and tell Claude');

      const hasBoxDrawing = data.includes('╭') || data.includes('╰') ||
                           (data.includes('│') && data.includes('─'));


      if (hasPromptIndicators || (hasBoxDrawing && timeSinceLastData > 100)) {
        pendingPromptScroll = true;
      }

      if (pendingPromptScroll && (data.includes('╰') || data.includes('❯'))) {
        setTimeout(() => {
          terminal.scrollToBottom();
          pendingPromptScroll = false;
        }, 100);
      } else if (!pendingPromptScroll) {
        autoScrollIfNeeded();
      }
    }
  });

  // Setup error listener
  cleanupErrorListener = window.electronAPI.claude.onError(props.instance.id, (data: string) => {
    if (terminal) {
      terminal.write(`\x1b[31mError: ${data}\x1b[0m`);
      autoScrollIfNeeded();
    }
  });

  // Setup exit listener
  cleanupExitListener = window.electronAPI.claude.onExit(props.instance.id, (code: number | null) => {

    if (terminal) {
      terminal.writeln(`\r\n\x1b[33mClaude process exited with code ${code}\x1b[0m`);
      autoScrollIfNeeded();
    }
    emit('status-change', 'disconnected');
  });

  listenersSetup = true;
};

const removeClaudeListeners = () => {
  if (listenersSetup) {
    // Call cleanup functions
    if (cleanupOutputListener) {
      cleanupOutputListener();
      cleanupOutputListener = null;
    }
    if (cleanupErrorListener) {
      cleanupErrorListener();
      cleanupErrorListener = null;
    }
    if (cleanupExitListener) {
      cleanupExitListener();
      cleanupExitListener = null;
    }

    // Also call the removeAllListeners for this instance
    window.electronAPI.claude.removeAllListeners(props.instance.id);

    listenersSetup = false;
  }
};

const onConfigChanged = (config: ClaudeRunConfig) => {
  selectedRunConfig.value = config;
};

const startClaude = async () => {
  if (!terminal) return;

  // Check if Claude is already running
  if (props.instance.status === 'connected') {
    terminal.writeln('\x1b[33mClaude CLI is already running\x1b[0m');
    terminal.writeln('You can continue your conversation.');
    terminal.writeln('');
    autoScrollIfNeeded();
    return;
  }

  terminal.clear();
  terminal.writeln('Starting Claude CLI...');

  if (personality.value && personality.value.name) {
    terminal.writeln(`\x1b[36mApplying personality: ${personality.value.name}\x1b[0m`);
    if (personality.value.instructions) {
      terminal.writeln(`\x1b[90m${personality.value.instructions}\x1b[0m`);
    }
    terminal.writeln('');
  }

  setupClaudeListeners();

  emit('status-change', 'connecting');

  // Display the run configuration if it has special parameters
  if (selectedRunConfig.value && selectedRunConfig.value.args.length > 0) {
    terminal.writeln(`\x1b[90mRun configuration: ${selectedRunConfig.value.name}\x1b[0m`);
    terminal.writeln(`\x1b[90mCommand: ${selectedRunConfig.value.command} ${selectedRunConfig.value.args.join(' ')}\x1b[0m`);
    terminal.writeln('');
  }

  const result = await window.electronAPI.claude.start(
    props.instance.id,
    props.instance.workingDirectory,
    props.instance.name, // Pass the instance name for hooks
    selectedRunConfig.value ? {
      command: selectedRunConfig.value.command,
      args: [...selectedRunConfig.value.args] // Create a new array to ensure it's serializable
    } : undefined
  );

  if (result.success) {
    emit('status-change', 'connected', result.pid);
    terminal.writeln('Claude CLI started successfully!');
    if (result.claudeInfo) {
      terminal.writeln(`\x1b[90mUsing: ${result.claudeInfo.path} (${result.claudeInfo.source})\x1b[0m`);
      terminal.writeln(`\x1b[90mVersion: ${result.claudeInfo.version}\x1b[0m`);
    }
    terminal.writeln('You can now type commands or chat with Claude.');
    terminal.writeln('');
    terminal.writeln(`\x1b[90mInstance: ${props.instance.name} (ID: ${props.instance.id.slice(0, 8)})\x1b[0m`);
    terminal.writeln('');
    autoScrollIfNeeded();

    // Send personality instructions if set
    if (personality.value && personality.value.instructions) {
      // Capture instructions value to avoid reactive reference in timeout
      const personalityInstructions = personality.value.instructions;
      setTimeout(async () => {
        try {
          const instructions = `System: ${personalityInstructions}`;
          await window.electronAPI.claude.send(props.instance.id, instructions + '\n');
        } catch (error) {
          console.error('Failed to send personality instructions:', error);
        }
      }, 1000);
    }

    // Terminal sizing fix
    const fixTerminalSize = async () => {
      if (!fitAddon || !terminal) return;

      await new Promise(resolve => setTimeout(resolve, 100));

      for (let i = 0; i < 5; i++) {
        try {
          fitAddon.fit();

          if (props.instance.status === 'connected') {
            // Ensure we're passing plain values
            const instanceId = props.instance.id;
            const cols = terminal.cols;
            const rows = terminal.rows;
            await window.electronAPI.claude.resize(instanceId, cols, rows);
          }
        } catch (error) {
          console.error('Terminal resize failed:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }

      terminal.focus();
    };

    fixTerminalSize();

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => fixTerminalSize(), 200);
          observer.disconnect();
        }
      });
    });

    if (terminalElement.value) {
      observer.observe(terminalElement.value);
    }
  } else {
    emit('status-change', 'disconnected');
    terminal.writeln('\x1b[31mFailed to start Claude CLI\x1b[0m');
    terminal.writeln('Check console for details and try again.');
    autoScrollIfNeeded();
  }
};

const stopClaude = async () => {
  if (terminal) {
    terminal.writeln('\r\n\x1b[33mStopping Claude CLI...\x1b[0m');
    autoScrollIfNeeded();
  }

  await window.electronAPI.claude.stop(props.instance.id);
  removeClaudeListeners();
  emit('status-change', 'disconnected');

  if (terminal) {
    terminal.clear();
    showWelcomeMessage();
  }
};

const clearTerminal = () => {

  if (terminal && props.instance.status === 'connected') {
    // In Claude interactive mode, send Ctrl+L to clear the screen
    // This clears the visible terminal but keeps history in scrollback
    window.electronAPI.claude.send(props.instance.id, '\x0C'); // Ctrl+L
  } else if (terminal) {
    // If not connected, clear the entire terminal
    terminal.clear();
    terminal.writeln('\x1b[90mTerminal cleared. Click Start to launch Claude CLI.\x1b[0m\r\n');
  }
};

const toggleChatInput = () => {
  showChatInput.value = !showChatInput.value;
};



// Handle chat sent event (no longer needed for input tracking)

onMounted(async () => {
  // Initialize command store if not already done
  if (commandsStore.allCommands.length === 0) {
    await commandsStore.initialize();
  }

  // Add a small delay to ensure container has dimensions
  await nextTick();
  setTimeout(() => {
    initTerminal();
  }, 100);

  // Set up event listeners for chat control
  openChatHandler = (event: Event) => {
    const customEvent = event as CustomEvent;
    if (customEvent.detail.instanceId === props.instance.id) {
      showChatInput.value = true;
    }
  };

  window.addEventListener('open-claude-chat', openChatHandler);

  // Set up event listener for starting Claude from tes
  startClaudeHandler = (event: Event) => {
    const customEvent = event as CustomEvent;
    if (customEvent.detail.instanceId === props.instance.id && props.instance.status === 'disconnected') {
      startClaude();
    }
  };

  window.addEventListener('start-claude-instance', startClaudeHandler);

  // Set up event listeners

  // Set up emergency cleanup listener
  emergencyCleanupListener = () => {



    // Clear terminal if it exists
    if (terminal) {
      terminal.clear();
      terminal.writeln('\x1b[90mEmergency cleanup performed. Click Start to launch Claude CLI.\x1b[0m\r\n');
    }

    // Clear context data
    // Note: Old enhancement system removed, no cleanup needed
  };

  window.addEventListener('emergency-cleanup', emergencyCleanupListener);
});

// Store event handler references for cleanup
let openChatHandler: ((event: Event) => void) | null = null;
let startClaudeHandler: ((event: Event) => void) | null = null;

onUnmounted(() => {
  removeClaudeListeners();

  if (terminal) {
    terminal.dispose();
  }

  // Remove chat event listener
  if (openChatHandler) {
    window.removeEventListener('open-claude-chat', openChatHandler);
  }

  // Remove start Claude event listener
  if (startClaudeHandler) {
    window.removeEventListener('start-claude-instance', startClaudeHandler);
  }

  // Remove event listeners

  // Remove emergency cleanup listener
  if (emergencyCleanupListener) {
    window.removeEventListener('emergency-cleanup', emergencyCleanupListener);
    emergencyCleanupListener = null;
  }


  // Note: Old enhancement system removed, no cleanup needed
});
</script>

<style scoped>
.terminal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  position: relative;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.terminal-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: normal;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.worktree-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.worktree-icon {
  color: #569cd6;
}

.main-icon {
  color: #cccccc;
}

.branch-name {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.worktree-name {
  color: #569cd6;
}

.main-name {
  color: #cccccc;
}

.terminal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

/* Personality selector integrated in header */

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  transition: all 0.2s;
}

.icon-button:hover {
  background: #3e3e42;
}

.undo-button {
  color: #f9c23c;
}

.undo-button:hover {
  background: rgba(249, 194, 60, 0.1);
  color: #ffd700;
}

.undo-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-button {
  background: #0e8a16;
  color: white;
}

.start-button:hover {
  background: #0fa418;
}

.stop-button {
  background: #cd3131;
  color: white;
}

.stop-button:hover {
  background: #e14444;
}

.terminal-content {
  flex: 1;
  padding: 8px;
  overflow: hidden;
  position: relative;
}

:deep(.xterm) {
  height: 100%;
  padding: 4px;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}

:deep(.xterm-screen) {
  height: 100% !important;
}
</style>