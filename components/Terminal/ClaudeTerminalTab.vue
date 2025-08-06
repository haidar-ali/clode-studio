<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <div class="header-left">
        <h3>{{ instance.name }}</h3>
      </div>
      <div class="terminal-actions">
        <PersonalitySelector
          :instanceId="instance.id"
          :currentPersonalityId="instance.personalityId"
          @update="updatePersonality"
        />
        <button
          v-if="instance.status === 'disconnected'"
          @click="startClaude"
          class="icon-button start-button"
          :title="hasSession ? 'Continue Claude session' : 'Start new Claude session'"
        >
          <Icon name="mdi:play" size="16" />
          <span>{{ hasSession ? 'Continue' : 'Start' }}</span>
        </button>
        <button
          v-else-if="instance.status === 'connected'"
          @click="stopClaude"
          class="icon-button pause-button"
          title="Pause Claude (keeps session)"
        >
          <Icon name="mdi:pause" size="16" />
          <span>Pause</span>
        </button>
        <button
          v-if="instance.status === 'connected' || hasSession"
          @click="deleteSession"
          class="icon-button delete-button"
          :title="instance.status === 'connected' ? 'Stop and delete Claude session permanently' : 'Delete Claude session permanently'"
        >
          <Icon name="mdi:delete" size="16" />
          <span>{{ instance.status === 'connected' ? 'Stop & Delete' : 'Delete' }}</span>
        </button>
        <ClaudeRunConfigSelector
          v-if="instance.status === 'disconnected'"
          @config-changed="onConfigChanged"
        />
      </div>
    </div>

    <!-- Session Restoration Status -->
    <div v-if="restorationStatus" class="restoration-status" :class="restorationStatus.status">
      <div v-if="restorationStatus.status === 'retrying'" class="restoration-message">
        <Icon name="mdi:loading" class="spin" size="16" />
        <span>Retrying session restoration (Attempt {{ restorationStatus.attemptNumber }}/{{ restorationStatus.totalAttempts }})</span>
      </div>
      <div v-else-if="restorationStatus.status === 'failed'" class="restoration-message">
        <Icon name="mdi:alert-circle" size="16" />
        <span>Session {{ restorationStatus.sessionId?.slice(0, 8) }} not found, trying fallback...</span>
      </div>
      <div v-else-if="restorationStatus.status === 'success'" class="restoration-message">
        <Icon name="mdi:check-circle" size="16" />
        <span>Session restored successfully</span>
      </div>
      <div v-else-if="restorationStatus.status === 'all-failed'" class="restoration-message">
        <Icon name="mdi:close-circle" size="16" />
        <span>All {{ restorationStatus.totalAttempts }} session restoration attempts failed</span>
      </div>
    </div>

    <div ref="terminalElement" class="terminal-content"></div>

    <!-- Floating Chat Button -->
    <button
      @click="toggleChatInput"
      class="floating-chat-button"
      :class="{ active: showChatInput }"
      title="Toggle chat input"
    >
      <Icon name="heroicons:chat-bubble-left-right" size="20" />
    </button>

    <!-- Chat Input Overlay -->
    <TerminalChatInput
      :isVisible="showChatInput"
      :instanceId="instance.id"
      @close="showChatInput = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, provide, nextTick, watchEffect } from 'vue';
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
const terminalElement = ref<HTMLElement>();
const showChatInput = ref(false);
const selectedRunConfig = ref<ClaudeRunConfig | null>(null);
const restorationStatus = ref<any>(null);

// Provide working directory for child components
provide('workingDirectory', props.instance.workingDirectory);

// Terminal state
const hasSession = ref(false);

// Check if session exists on mount
onMounted(async () => {
  if (window.electronAPI?.claude?.hasSession) {
    hasSession.value = await window.electronAPI.claude.hasSession(props.instance.id);
  }
});

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
let cleanupRestorationListener: (() => void) | null = null;
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
    
    // Block Cmd+Enter to prevent unwanted character insertion
    if (event.metaKey && event.key === 'Enter') {
      event.preventDefault();
      // Just send a regular Enter instead
      if (props.instance.status === 'connected') {
        window.electronAPI.claude.send(props.instance.id, '\r');
      }
      return false;
    }
    
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
    // Block the specific 13-byte bracketed paste sequence that occurs with Cmd+Enter + clipboard image
    // [27, 91, 50, 48, 48, 126, 13, 27, 91, 50, 48, 49, 126] = ESC[200~\rESC[201~
    if (data.length === 13 && 
        data.charCodeAt(0) === 27 && data.charCodeAt(1) === 91 && 
        data.charCodeAt(2) === 50 && data.charCodeAt(3) === 48 && 
        data.charCodeAt(4) === 48 && data.charCodeAt(5) === 126 &&
        data.charCodeAt(6) === 13 && // CR in the middle
        data.charCodeAt(7) === 27 && data.charCodeAt(8) === 91 &&
        data.charCodeAt(9) === 50 && data.charCodeAt(10) === 48 &&
        data.charCodeAt(11) === 49 && data.charCodeAt(12) === 126) {
      // Just send a newline instead of the bracketed paste
      if (props.instance.status === 'connected') {
        window.electronAPI.claude.send(props.instance.id, '\n');
        window.dispatchEvent(new CustomEvent(`claude-prompt-sent-${props.instance.id}`));
      }
      return;
    }
    
    // Also block minimal bracketed paste sequences (just newline content)
    if (data.includes('\x1b[200~') && data.includes('\x1b[201~')) {
      const pasteContent = data.replace(/\x1b\[200~/, '').replace(/\x1b\[201~/, '');
      if (pasteContent.length <= 2 && (pasteContent === '\r' || pasteContent === '\n' || pasteContent === '\r\n')) {
        // Send just a newline
        if (props.instance.status === 'connected') {
          window.electronAPI.claude.send(props.instance.id, '\n');
          window.dispatchEvent(new CustomEvent(`claude-prompt-sent-${props.instance.id}`));
        }
        return;
      }
    }
    
    if (props.instance.status === 'connected') {
      // Send all data to Claude immediately for proper terminal handling
      window.electronAPI.claude.send(props.instance.id, data);
      
      // Fire event when user presses Enter (sends a prompt)
      if (data === '\r' || data === '\n') {
        window.dispatchEvent(new CustomEvent(`claude-prompt-sent-${props.instance.id}`));
      }
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

  // Always show welcome message since we clear status/PID on load
  showWelcomeMessage();
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
  
  // Check if we have a session to show correct button text
  window.electronAPI?.claude?.hasSession(props.instance.id).then((hasStoredSession: boolean) => {
    hasSession.value = hasStoredSession;
    if (hasStoredSession) {
      terminal.writeln('Click the \x1b[32mContinue\x1b[0m button above to resume your Claude session');
    } else {
      terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
    }
    terminal.writeln('');
    terminal.scrollToBottom();
  }).catch(() => {
    terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
    terminal.writeln('');
    terminal.scrollToBottom();
  });
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

  // Setup restoration status listener
  cleanupRestorationListener = window.electronAPI.claude.onRestorationStatus(props.instance.id, (status: any) => {
    restorationStatus.value = status;
    
    // Clear the status after a few seconds for success/failure messages
    if (status.status === 'success' || status.status === 'all-failed') {
      setTimeout(() => {
        restorationStatus.value = null;
      }, 5000);
    }
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
    if (cleanupRestorationListener) {
      cleanupRestorationListener();
      cleanupRestorationListener = null;
    }

    // Also call the removeAllListeners for this instance
    window.electronAPI.claude.removeAllListeners(props.instance.id);

    listenersSetup = false;
  }
};

// Reconnect to existing Claude process
const reconnectToExistingProcess = async () => {
  if (!terminal || props.instance.status !== 'connected') return;
  
  // Attempting to reconnect to Claude process
  
  // Re-setup listeners if not already setup
  if (!listenersSetup) {
    setupClaudeListeners();
  }
  
  // Sync terminal size
  if (fitAddon && terminal) {
    fitAddon.fit();
    try {
      await window.electronAPI.claude.resize(props.instance.id, terminal.cols, terminal.rows);
    } catch (error) {
      console.error('Failed to resize terminal:', error);
    }
  }
  
  // Don't send a newline - it causes unwanted line breaks
  // The terminal will maintain its state properly without this
  
  // Focus terminal
  terminal.focus();
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
    
    // Show restoration status
    if (result.restored) {
      terminal.writeln('\x1b[32m✓ Session restored successfully!\x1b[0m');
      terminal.writeln('Your previous conversation has been continued.');
    } else if (result.restorationFailed) {
      terminal.writeln('\x1b[33m⚠ Previous session expired, starting fresh.\x1b[0m');
    } else {
      terminal.writeln('Claude CLI started successfully!');
    }
    
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
    terminal.writeln('\r\n\x1b[33mPausing Claude CLI (session preserved)...\x1b[0m');
    autoScrollIfNeeded();
  }

  try {
    await window.electronAPI.claude.stop(props.instance.id);
  } catch (error) {
    console.error('Failed to pause Claude:', error);
  }
  
  removeClaudeListeners();
  emit('status-change', 'disconnected');

  if (terminal) {
    terminal.clear();
    showWelcomeMessage();
  }
};

const deleteSession = async () => {
  const confirmed = confirm('Are you sure you want to delete this Claude session? This cannot be undone.');
  if (!confirmed) return;
  
  if (terminal) {
    terminal.writeln('\r\n\x1b[31mDeleting Claude session permanently...\x1b[0m');
    autoScrollIfNeeded();
  }

  try {
    await window.electronAPI.claude.deleteSession(props.instance.id);
    hasSession.value = false;
    
    // If currently connected, update status
    if (props.instance.status === 'connected') {
      removeClaudeListeners();
      emit('status-change', 'disconnected');
    }
    
    if (terminal) {
      terminal.clear();
      terminal.writeln('\x1b[90mSession deleted. Start a new session when ready.\x1b[0m');
      showWelcomeMessage();
    }
  } catch (error) {
    console.error('Failed to delete Claude session:', error);
    if (terminal) {
      terminal.writeln('\x1b[31mFailed to delete session\x1b[0m');
      autoScrollIfNeeded();
    }
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

// Watch for instance visibility changes (when switching worktrees)
let isVisible = ref(false);

// Use IntersectionObserver for better performance
watchEffect(() => {
  if (!terminalElement.value) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const wasVisible = isVisible.value;
      isVisible.value = entry.isIntersecting;
      
      if (!wasVisible && isVisible.value && terminal && props.instance.status === 'connected') {
        // Component became visible and instance should be connected
        // Terminal became visible, reconnecting...
        
        // Use nextTick to ensure DOM is stable
        nextTick(() => {
          reconnectToExistingProcess();
        });
      }
    });
  }, {
    threshold: 0.1 // Trigger when at least 10% visible
  });
  
  observer.observe(terminalElement.value);
  
  // Cleanup
  return () => {
    observer.disconnect();
  };
});

// Watch for external status changes
watch(() => props.instance.status, (newStatus, oldStatus) => {
  if (oldStatus === 'connected' && newStatus === 'disconnected' && terminal) {
    // Instance was disconnected externally
    removeClaudeListeners();
    terminal.writeln('\r\n\x1b[33mClaude process disconnected.\x1b[0m');
  } else if (oldStatus === 'disconnected' && newStatus === 'connected' && terminal && isVisible.value) {
    // Instance was reconnected externally while visible
    reconnectToExistingProcess();
  }
});

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

.pause-button {
  background: #f59e0b;
  color: white;
}

.pause-button:hover {
  background: #f97316;
}

.delete-button {
  background: #cd3131;
  color: white;
  margin-left: 4px;
}

.delete-button:hover {
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

.floating-chat-button {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #007acc;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(0, 122, 204, 0.4);
  z-index: 50;
}

.floating-chat-button:hover {
  background: #1a7dc4;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 122, 204, 0.5);
}

.floating-chat-button.active {
  background: #1a7dc4;
  transform: rotate(45deg);
}

/* Restoration Status Styles */
.restoration-status {
  padding: 8px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  animation: slideDown 0.3s ease;
}

.restoration-message {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.restoration-status.retrying .restoration-message {
  color: #4fc3f7;
}

.restoration-status.failed .restoration-message {
  color: #ffb74d;
}

.restoration-status.success .restoration-message {
  color: #81c784;
}

.restoration-status.all-failed .restoration-message {
  color: #e57373;
}

.restoration-message .spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>