<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <h3>{{ instance.name }}</h3>
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
          @click="clearTerminal"
          class="icon-button"
          title="Clear terminal"
        >
          <Icon name="mdi:delete" size="16" />
        </button>
      </div>
    </div>
    
    <div ref="terminalElement" class="terminal-content"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import type { ClaudeInstance } from '~/stores/claude-instances';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import PersonalitySelector from './PersonalitySelector.vue';
import 'xterm/css/xterm.css';

const props = defineProps<{
  instance: ClaudeInstance;
}>();

const emit = defineEmits<{
  'status-change': [status: ClaudeInstance['status'], pid?: number];
}>();

const instancesStore = useClaudeInstancesStore();
const terminalElement = ref<HTMLElement>();

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
  
  terminal.onScroll(() => {
    const buffer = terminal.buffer.active;
    const scrollbackSize = buffer.length - terminal.rows;
    const scrollOffset = buffer.viewportY;
    isAtBottom = scrollOffset >= scrollbackSize - 5;
  });
  
  terminal.onData((data: string) => {
    if (props.instance.status === 'connected') {
      // Send with instance ID
      window.electronAPI.claude.send(props.instance.id, data);
    }
  });
  
  let resizeTimeout: NodeJS.Timeout;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (fitAddon && terminal) {
        fitAddon.fit();
        if (props.instance.status === 'connected') {
          window.electronAPI.claude.resize(props.instance.id, terminal.cols, terminal.rows);
        }
      }
    }, 100);
  });
  resizeObserver.observe(terminalElement.value);
  
  // Show welcome message
  showWelcomeMessage();
};

const showWelcomeMessage = () => {
  if (!terminal) return;
  
  terminal.writeln('Welcome to Claude Code IDE Terminal');
  terminal.writeln(`Instance: ${props.instance.name}`);
  if (personality.value) {
    terminal.writeln(`Personality: ${personality.value.name} - ${personality.value.description}`);
  }
  terminal.writeln('Click the \x1b[32mStart\x1b[0m button above to launch Claude CLI');
  terminal.writeln('');
  terminal.scrollToBottom();
};


const setupClaudeListeners = () => {
  // Remove any existing listeners for this instance
  removeClaudeListeners();
  
  console.log(`Setting up Claude listeners for instance: ${props.instance.id}`);
  
  // Setup output listener
  cleanupOutputListener = window.electronAPI.claude.onOutput(props.instance.id, (data: string) => {
    if (terminal && props.instance.status === 'connected') {
      const currentTime = Date.now();
      const timeSinceLastData = currentTime - lastDataTime;
      lastDataTime = currentTime;
      
      terminal.write(data);
      
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
    console.log(`Removing Claude listeners for instance: ${props.instance.id}`);
    
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

const startClaude = async () => {
  if (!terminal) return;
  
  terminal.clear();
  terminal.writeln('Starting Claude CLI...');
  
  if (personality.value) {
    terminal.writeln(`\x1b[36mApplying personality: ${personality.value.name}\x1b[0m`);
    terminal.writeln(`\x1b[90m${personality.value.instructions}\x1b[0m`);
    terminal.writeln('');
  }
  
  setupClaudeListeners();
  
  emit('status-change', 'connecting');
  
  const result = await window.electronAPI.claude.start(props.instance.id, props.instance.workingDirectory);
  
  if (result.success) {
    emit('status-change', 'connected', result.pid);
    terminal.writeln('Claude CLI started successfully!');
    terminal.writeln('You can now type commands or chat with Claude.');
    terminal.writeln('');
    autoScrollIfNeeded();
    
    // Send personality instructions if set
    if (personality.value) {
      setTimeout(async () => {
        const instructions = `System: ${personality.value.instructions}`;
        await window.electronAPI.claude.send(props.instance.id, instructions + '\n');
      }, 1000);
    }
    
    // Terminal sizing fix
    const fixTerminalSize = async () => {
      if (!fitAddon || !terminal) return;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      for (let i = 0; i < 5; i++) {
        fitAddon.fit();
        
        if (props.instance.status === 'connected') {
          await window.electronAPI.claude.resize(props.instance.id, terminal.cols, terminal.rows);
          console.log(`Terminal resize attempt ${i + 1}: ${terminal.cols}x${terminal.rows}`);
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
  if (terminal) {
    terminal.clear();
  }
};

onMounted(() => {
  initTerminal();
});

onUnmounted(() => {
  removeClaudeListeners();
  
  if (terminal) {
    terminal.dispose();
  }
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