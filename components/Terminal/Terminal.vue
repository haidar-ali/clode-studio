<template>
  <div class="terminal-container">
    <div ref="terminalElement" class="terminal"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { useTerminalInstancesStore } from '~/stores/terminal-instances';
import 'xterm/css/xterm.css';

const props = defineProps<{
  projectPath?: string;
  instanceId?: string;
  existingPtyId?: string;
}>();

const emit = defineEmits<{
  'pty-created': [ptyId: string];
  'pty-destroyed': [];
}>();

const terminalElement = ref<HTMLElement>();
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let serializeAddon: SerializeAddon | null = null;
let ptyProcess: any = null;
let dataListener: any = null;

const terminalStore = useTerminalInstancesStore();

onMounted(async () => {
  if (!terminalElement.value) return;
  
  
  // Create terminal instance
  terminal = new Terminal({
    fontSize: 14,
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
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
      brightWhite: '#e5e5e5'
    },
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    tabStopWidth: 4
  });
  
  // Add fit addon
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  // Add serialize addon for state persistence
  serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);
  
  // Open terminal in the DOM
  terminal.open(terminalElement.value);
  
  // Expose terminal and serialize addon for state capture
  if (props.instanceId && terminalElement.value) {
    terminalElement.value.setAttribute('data-terminal-id', props.instanceId);
    (terminalElement.value as any).__terminal = terminal;
    (terminalElement.value as any).__serializeAddon = serializeAddon;
  }
  
  // Fit terminal to container
  fitAddon.fit();
  
  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon) {
      fitAddon.fit();
    }
  });
  resizeObserver.observe(terminalElement.value);
  
  // Add Mac keyboard shortcuts
  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    // Only handle on Mac
    if (navigator.platform.toLowerCase().indexOf('mac') === -1) {
      return true;
    }
    
    // Only process if we have a PTY process
    if (!ptyProcess) {
      return true;
    }
    
    try {
      // Cmd + Delete: Clear line before cursor
      if (e.metaKey && e.key === 'Backspace') {
        e.preventDefault();
        window.electronAPI.terminal.write(ptyProcess, '\x15'); // Ctrl+U clears line before cursor
        return false;
      }
      
      // Cmd + Left Arrow: Go to beginning of line
      if (e.metaKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        window.electronAPI.terminal.write(ptyProcess, '\x01'); // Ctrl+A
        return false;
      }
      
      // Cmd + Right Arrow: Go to end of line
      if (e.metaKey && e.key === 'ArrowRight') {
        e.preventDefault();
        window.electronAPI.terminal.write(ptyProcess, '\x05'); // Ctrl+E
        return false;
      }
      
    } catch (error) {
      // Silently ignore errors
    }
    
    return true;
  });
  
  // Start PTY process or reconnect to existing one
  try {
    // Check if terminal API is available
    if (!window.electronAPI?.terminal) {
      terminal.write('\x1b[1;31mError: Terminal API not available\x1b[0m\r\n');
      terminal.write('\x1b[90mMake sure you have restarted the Electron app after the latest changes\x1b[0m\r\n');
      return;
    }
    
    // Check if we should reconnect to an existing PTY
    if (props.existingPtyId) {
      ptyProcess = props.existingPtyId;
      
      try {
        // Test if PTY is still alive by trying to write to it
        const writeResult = await window.electronAPI.terminal.write(ptyProcess, '');
        
        if (writeResult && writeResult.success) {
          // Resize the existing PTY to match our terminal
          await window.electronAPI.terminal.resize(ptyProcess, terminal.cols, terminal.rows);
          
          // Restore terminal state if available from store
          if (props.instanceId) {
            const savedState = terminalStore.getTerminalBuffer(props.instanceId);
            if (savedState) {
              terminal.write(savedState);
            } else {
              // Fallback: Send Ctrl+L to at least show current prompt
              await window.electronAPI.terminal.write(ptyProcess, '\x0c');
            }
          }
          
        } else {
          ptyProcess = null;
        }
      } catch (error) {
        // PTY doesn't exist, create a new one
        ptyProcess = null;
      }
    }
    
    if (!ptyProcess) {
      // Create new PTY process
      const result = await window.electronAPI.terminal.create({
        cols: terminal.cols,
        rows: terminal.rows,
        cwd: props.projectPath || process.cwd()
      });
      
      ptyProcess = result.id;
      emit('pty-created', ptyProcess);
      
      // Write welcome message only for newly created terminals
      terminal.write('\x1b[1;34mTerminal ready\x1b[0m\r\n');
      terminal.write(`\x1b[90mWorking directory: ${props.projectPath || process.cwd()}\x1b[0m\r\n\r\n`);
    }
    
    // Handle data from PTY
    if (ptyProcess) {
      dataListener = window.electronAPI.terminal.onData(ptyProcess, (data: string) => {
        terminal?.write(data);
      });
    }
    
    // Track current command
    let currentCommand = '';
    let cursorPosition = 0;
    
    // Handle terminal input
    terminal.onData((data) => {
      window.electronAPI.terminal.write(ptyProcess, data);
      
      // Track command input
      if (data === '\r' || data === '\n') {
        // Command entered
        if (currentCommand.trim()) {
          // Emit command event for auto-checkpoint
          window.dispatchEvent(new CustomEvent('terminal-command', {
            detail: { command: currentCommand.trim() }
          }));
        }
        currentCommand = '';
        cursorPosition = 0;
      } else if (data === '\x7f') {
        // Backspace
        if (cursorPosition > 0) {
          currentCommand = currentCommand.slice(0, cursorPosition - 1) + currentCommand.slice(cursorPosition);
          cursorPosition--;
        }
      } else if (data === '\x1b[D') {
        // Left arrow
        if (cursorPosition > 0) cursorPosition--;
      } else if (data === '\x1b[C') {
        // Right arrow
        if (cursorPosition < currentCommand.length) cursorPosition++;
      } else if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
        // Regular character
        currentCommand = currentCommand.slice(0, cursorPosition) + data + currentCommand.slice(cursorPosition);
        cursorPosition++;
      }
    });
    
    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      window.electronAPI.terminal.resize(ptyProcess, cols, rows);
    });
    
    
  } catch (error) {
    console.error('Failed to create terminal:', error);
    terminal.write('\x1b[1;31mError: Failed to create terminal\x1b[0m\r\n');
    terminal.write(`\x1b[90m${error.message}\x1b[0m\r\n`);
  }
});

onUnmounted(() => {
  // Save terminal state before unmounting to store
  if (props.instanceId && serializeAddon && terminal) {
    try {
      const serializedState = serializeAddon.serialize();
      terminalStore.saveTerminalBuffer(props.instanceId, serializedState);
    } catch (error) {
    }
  }
  
  // Clean up data listener
  if (dataListener) {
    dataListener();
    dataListener = null;
  }
  
  // Don't destroy PTY process - keep it alive for reconnection
  // The PTY will only be destroyed when explicitly removed by the user
  
  if (terminal) {
    terminal.dispose();
  }
});

// Method to destroy PTY process when explicitly requested
const destroyPty = async () => {
  if (ptyProcess) {
    try {
      await window.electronAPI.terminal.destroy(ptyProcess);
      emit('pty-destroyed');
      ptyProcess = null;
    } catch (error) {
      console.error('Failed to destroy PTY:', error);
    }
  }
};

// Expose methods for parent components
defineExpose({
  clear: () => terminal?.clear(),
  focus: () => terminal?.focus(),
  write: (data: string) => terminal?.write(data),
  destroyPty
});
</script>

<style scoped>
.terminal-container {
  height: 100%;
  width: 100%;
  background: #1e1e1e;
  padding: 8px;
  overflow: hidden;
}

.terminal {
  height: 100%;
  width: 100%;
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