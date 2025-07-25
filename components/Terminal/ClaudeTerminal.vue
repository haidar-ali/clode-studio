<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <h3>Claude Terminal</h3>
      <div class="terminal-actions">
        <button
          v-if="claudeStatus === 'disconnected'"
          @click="startClaude"
          class="icon-button start-button"
          title="Start Claude"
        >
          <Icon name="mdi:play" size="16" />
          <span>Start</span>
        </button>
        <button
          v-else-if="claudeStatus === 'connected'"
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
          @click="clearTerminal"
          class="icon-button"
          title="Clear terminal"
        >
          <Icon name="mdi:delete" size="16" />
        </button>
      </div>
    </div>
    
    <div ref="terminalElement" class="terminal-content"></div>
    
    <!-- Chat Input Overlay -->
    <TerminalChatInput 
      :isVisible="showChatInput" 
      :instanceId="instanceId"
      @close="showChatInput = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useChatStore } from '~/stores/chat';
import { useTaskMonitor } from '~/composables/useTaskMonitor';
import TerminalChatInput from './TerminalChatInput.vue';
import 'xterm/css/xterm.css';

const props = defineProps<{
  instanceId: string;
}>();

const chatStore = useChatStore();
const terminalElement = ref<HTMLElement>();
const showChatInput = ref(false);

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let isAtBottom = true; // Track if user is at bottom of terminal
let lastDataTime = 0; // Track last data received time
let pendingPromptScroll = false; // Track if we need to scroll for a prompt

const claudeStatus = computed(() => chatStore.claudeStatus);

// Initialize task monitoring
useTaskMonitor();

// Helper function to auto-scroll only if user is at bottom
const autoScrollIfNeeded = () => {
  if (terminal && isAtBottom) {
    terminal.scrollToBottom();
  }
};

const initTerminal = () => {
  if (!terminalElement.value) return;
  
  // Create terminal instance
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
    // Disable local echo since PTY will echo back
    // This is handled by the PTY, not locally
    disableStdin: false,
    // Improve scrolling behavior
    smoothScrollDuration: 0,
    fastScrollModifier: 'shift',
    fastScrollSensitivity: 5,
    // Fix cursor positioning issues
    windowsMode: false
  });
  
  // Add fit addon
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  // Attach to DOM
  terminal.open(terminalElement.value);
  fitAddon.fit();
  
  // Track scroll position
  terminal.onScroll(() => {
    const buffer = terminal.buffer.active;
    const scrollbackSize = buffer.length - terminal.rows;
    const scrollOffset = buffer.viewportY;
    
    // Check if we're at the bottom (within 5 lines of bottom)
    isAtBottom = scrollOffset >= scrollbackSize - 5;
  });
  
  // Add Mac keyboard shortcuts
  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    // Only handle on Mac
    if (navigator.platform.toLowerCase().indexOf('mac') === -1) {
      return true;
    }
    
    // Cmd + Delete: Clear line before cursor
    if (e.metaKey && e.key === 'Backspace') {
      if (chatStore.claudeStatus === 'connected') {
        window.electronAPI.claude.send('\x15'); // Ctrl+U clears line before cursor
      }
      return false;
    }
    
    // Cmd + Left Arrow: Go to beginning of line
    if (e.metaKey && e.key === 'ArrowLeft') {
      if (chatStore.claudeStatus === 'connected') {
        window.electronAPI.claude.send('\x01'); // Ctrl+A
      }
      return false;
    }
    
    // Cmd + Right Arrow: Go to end of line
    if (e.metaKey && e.key === 'ArrowRight') {
      if (chatStore.claudeStatus === 'connected') {
        window.electronAPI.claude.send('\x05'); // Ctrl+E
      }
      return false;
    }
    
    // Option + Left Arrow: Move left one word
    if (e.altKey && e.key === 'ArrowLeft') {
      if (chatStore.claudeStatus === 'connected') {
        window.electronAPI.claude.send('\x1bb'); // Alt+B
      }
      return false;
    }
    
    // Option + Right Arrow: Move right one word
    if (e.altKey && e.key === 'ArrowRight') {
      if (chatStore.claudeStatus === 'connected') {
        window.electronAPI.claude.send('\x1bf'); // Alt+F
      }
      return false;
    }
    
    // Option + Delete: Delete word before cursor
    if (e.altKey && e.key === 'Backspace') {
      if (chatStore.claudeStatus === 'connected') {
        window.electronAPI.claude.send('\x17'); // Ctrl+W
      }
      return false;
    }
    
    return true;
  });
  
  // Handle terminal input
  terminal.onData((data: string) => {
    // Send input to Claude process
    if (chatStore.claudeStatus === 'connected') {
      // Don't echo locally - let the PTY handle it
      window.electronAPI.claude.send(data);
    }
  });
  
  // Setup Claude output listener
  setupClaudeListeners();
  
  // Handle window resize with debouncing
  let resizeTimeout: NodeJS.Timeout;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (fitAddon && terminal) {
        fitAddon.fit();
        // Notify PTY of the new size
        if (chatStore.claudeStatus === 'connected') {
          window.electronAPI.claude.resize(terminal.cols, terminal.rows);
        }
      }
    }, 100);
  });
  resizeObserver.observe(terminalElement.value);
  
  // Show welcome message
  terminal.writeln('Welcome to Clode Studio Terminal');
  terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
  terminal.writeln('');
  terminal.scrollToBottom();
};

const setupClaudeListeners = () => {
  // Remove any existing listeners first to avoid duplicates
  window.electronAPI.claude.removeAllListeners();
  
  
  
  // Listen for Claude output
  window.electronAPI.claude.onOutput((data: string) => {
    if (terminal && chatStore.claudeStatus === 'connected') {
      const currentTime = Date.now();
      const timeSinceLastData = currentTime - lastDataTime;
      lastDataTime = currentTime;
      
      terminal.write(data);
      
      // Check if this looks like an interactive prompt
      const hasPromptIndicators = data.includes('Do you want to') || 
                                 data.includes('❯') ||
                                 data.includes('Yes, and don\'t ask again') ||
                                 data.includes('No, and tell Claude');
      
      // Check for box drawing characters that indicate a prompt box
      const hasBoxDrawing = data.includes('╭') || data.includes('╰') || 
                           (data.includes('│') && data.includes('─'));
      
      // If we see prompt indicators, set flag for pending scroll
      if (hasPromptIndicators || (hasBoxDrawing && timeSinceLastData > 100)) {
        pendingPromptScroll = true;
      }
      
      // If we have a pending prompt scroll and see the end of the prompt box
      if (pendingPromptScroll && (data.includes('╰') || data.includes('❯'))) {
        // Delay scroll to ensure the full prompt is rendered
        setTimeout(() => {
          terminal.scrollToBottom();
          pendingPromptScroll = false;
        }, 100);
      } else if (!pendingPromptScroll) {
        // Normal auto-scroll behavior when not in a prompt
        autoScrollIfNeeded();
      }
    }
  });
  
  // Listen for Claude errors
  window.electronAPI.claude.onError((data: string) => {
    if (terminal) {
      terminal.write(`\x1b[31mError: ${data}\x1b[0m`); // Red color for errors
      autoScrollIfNeeded();
    }
  });
  
  // Listen for Claude exit
  window.electronAPI.claude.onExit((code: number | null) => {
    if (terminal) {
      terminal.writeln(`\r\n\x1b[33mClaude process exited with code ${code}\x1b[0m`);
      autoScrollIfNeeded();
    }
  });
};

const startClaude = async () => {
  if (!terminal) return;
  
  terminal.clear();
  terminal.writeln('Starting Claude CLI...');
  
  // Ensure listeners are properly setup before starting
  setupClaudeListeners();
  
  await chatStore.startClaude();
  
  if (chatStore.claudeStatus === 'connected') {
    terminal.writeln('Claude CLI started successfully!');
    terminal.writeln('You can now type commands or chat with Claude.');
    terminal.writeln('');
    autoScrollIfNeeded();
    
    // Aggressive terminal sizing fix for PTY sync
    const fixTerminalSize = async () => {
      if (!fitAddon || !terminal) return;
      
      // Wait for container to be fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Multiple resize attempts with PTY sync
      for (let i = 0; i < 5; i++) {
        fitAddon.fit();
        
        // Sync the PTY size after each fit
        if (chatStore.claudeStatus === 'connected') {
          await window.electronAPI.claude.resize(terminal.cols, terminal.rows);
          
        }
        
        // Progressive delays
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }
      
      // Final focus
      terminal.focus();
    };
    
    // Start the sizing process
    fixTerminalSize();
    
    // Also fix size when container becomes visible
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
  
  await chatStore.stopClaude();
  
  // Clear the terminal like the trash button for clean visual feedback
  if (terminal) {
    terminal.clear();
    terminal.writeln('Claude CLI stopped');
    terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
    terminal.writeln('');
    autoScrollIfNeeded();
  }
};

const clearTerminal = () => {
  if (terminal) {
    terminal.clear();
  }
};

const toggleChatInput = () => {
  showChatInput.value = !showChatInput.value;
};

// Handle Claude stopped event from store
const handleClaudeStop = () => {
  if (terminal) {
    terminal.clear();
    terminal.writeln('Claude CLI stopped');
    terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
    terminal.writeln('');
    autoScrollIfNeeded();
  }
};

onMounted(() => {
  initTerminal();
  
  // Listen for Claude stop events (from workspace switching)
  window.addEventListener('claude-stopped', handleClaudeStop);
});

onUnmounted(() => {
  if (terminal) {
    terminal.dispose();
  }
  window.electronAPI.claude.removeAllListeners();
  
  // Clean up event listeners
  window.removeEventListener('claude-stopped', handleClaudeStop);
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
  gap: 4px;
}

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
}

/* Override xterm.js styles for better integration */
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