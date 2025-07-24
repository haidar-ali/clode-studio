<template>
  <div class="terminal-container">
    <div ref="terminalElement" class="terminal"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const props = defineProps<{
  projectPath?: string;
}>();

const terminalElement = ref<HTMLElement>();
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ptyProcess: any = null;

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
  
  // Open terminal in the DOM
  terminal.open(terminalElement.value);
  
  // Fit terminal to container
  fitAddon.fit();
  
  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon) {
      fitAddon.fit();
    }
  });
  resizeObserver.observe(terminalElement.value);
  
  // Start PTY process
  try {
    // Check if terminal API is available
    if (!window.electronAPI?.terminal) {
      terminal.write('\x1b[1;31mError: Terminal API not available\x1b[0m\r\n');
      terminal.write('\x1b[90mMake sure you have restarted the Electron app after the latest changes\x1b[0m\r\n');
      return;
    }
    
    const result = await window.electronAPI.terminal.create({
      cols: terminal.cols,
      rows: terminal.rows,
      cwd: props.projectPath || process.cwd()
    });
    
    ptyProcess = result.id;
    
    // Handle data from PTY
    window.electronAPI.terminal.onData(ptyProcess, (data: string) => {
      terminal?.write(data);
    });
    
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
    
    // Write welcome message
    terminal.write('\x1b[1;34mTerminal ready\x1b[0m\r\n');
    terminal.write(`\x1b[90mWorking directory: ${props.projectPath || process.cwd()}\x1b[0m\r\n\r\n`);
    
  } catch (error) {
    console.error('Failed to create terminal:', error);
    terminal.write('\x1b[1;31mError: Failed to create terminal\x1b[0m\r\n');
    terminal.write(`\x1b[90m${error.message}\x1b[0m\r\n`);
  }
});

onUnmounted(() => {
  if (ptyProcess) {
    window.electronAPI.terminal.destroy(ptyProcess);
  }
  if (terminal) {
    terminal.dispose();
  }
});

// Expose methods for parent components
defineExpose({
  clear: () => terminal?.clear(),
  focus: () => terminal?.focus(),
  write: (data: string) => terminal?.write(data)
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