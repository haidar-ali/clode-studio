<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <div class="header-left">
        <h3>{{ instance.name }}</h3>
      </div>
      <div class="terminal-actions">
        <button
          v-if="currentInstance.status === 'disconnected'"
          @click="startCodex"
          class="icon-button start-button"
          title="Start Codex"
        >
          <Icon name="mdi:play" size="16" />
          <span>Start</span>
        </button>
        <button
          v-else-if="currentInstance.status === 'connected'"
          @click="stopCodex"
          class="icon-button stop-button"
          title="Stop Codex"
        >
          <Icon name="mdi:stop" size="16" />
          <span>Stop</span>
        </button>
        <button
          v-else-if="currentInstance.status === 'connecting'"
          disabled
          class="icon-button connecting-button"
          title="Connecting..."
        >
          <Icon name="mdi:loading" size="16" class="spin" />
          <span>Connecting...</span>
        </button>
      </div>
    </div>

    <div ref="terminalElement" class="terminal-content"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import type { CodexInstance } from '~/stores/codex-instances';
import { useCodexInstancesStore } from '~/stores/codex-instances';

const props = defineProps<{ instance: CodexInstance }>();
const emit = defineEmits<{ 'status-change': [status: CodexInstance['status'], pid?: number] }>();

const instancesStore = useCodexInstancesStore();
const terminalElement = ref<HTMLElement>();
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeHandler: ((this: Window, ev: UIEvent) => any) | null = null;

const currentInstance = computed(() => {
  const storeInstance = instancesStore.instancesList.find(inst => inst.id === props.instance.id);
  return storeInstance || props.instance;
});

let cleanupOutput: (() => void) | null = null;
let cleanupError: (() => void) | null = null;
let cleanupExit: (() => void) | null = null;

const setupListeners = () => {
  cleanupOutput = window.electronAPI.codex.onOutput(props.instance.id, (data: string) => {
    if (terminal) terminal.write(data);
  });
  cleanupError = window.electronAPI.codex.onError(props.instance.id, (data: string) => {
    if (terminal) terminal.writeln(`\r\n\x1b[31m${data}\x1b[0m`);
  });
  cleanupExit = window.electronAPI.codex.onExit(props.instance.id, (code: number | null) => {
    if (terminal) terminal.writeln(`\r\n\x1b[33mCodex exited with code ${code ?? 'null'}\x1b[0m`);
    emit('status-change', 'disconnected');
    instancesStore.updateInstanceStatus(props.instance.id, 'disconnected');
  });
};

const removeListeners = () => {
  cleanupOutput?.(); cleanupOutput = null;
  cleanupError?.(); cleanupError = null;
  cleanupExit?.(); cleanupExit = null;
  window.electronAPI.codex.removeAllListeners(props.instance.id);
};

const initTerminal = () => {
  if (!terminalElement.value) return;
  terminal = new Terminal({
    theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14, lineHeight: 1.2, cursorBlink: true, scrollback: 10000, convertEol: true
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalElement.value);
  fitAddon.fit();

  terminal.onData(async (data) => {
    try { await window.electronAPI.codex.send(props.instance.id, data); } catch {}
  });
};

const startCodex = async () => {
  if (!terminal) initTerminal();
  if (!terminal) return;
  terminal.writeln('\x1b[90mStarting Codex...\x1b[0m');
  emit('status-change', 'connecting');
  instancesStore.updateInstanceStatus(props.instance.id, 'connecting');

  const result = await window.electronAPI.codex.start(
    props.instance.id,
    props.instance.workingDirectory,
    props.instance.name
  );

  if (result.success) {
    emit('status-change', 'connected', result.pid);
    instancesStore.updateInstanceStatus(props.instance.id, 'connected', result.pid);
    setupListeners();
    terminal.writeln('\x1b[32mCodex started.\x1b[0m');
    if (fitAddon && terminal) {
      try { await window.electronAPI.codex.resize(props.instance.id, terminal.cols, terminal.rows); } catch {}
    }
  } else {
    emit('status-change', 'disconnected');
    instancesStore.updateInstanceStatus(props.instance.id, 'disconnected');
    terminal.writeln('\x1b[31mFailed to start Codex\x1b[0m');
    if (result.error) terminal.writeln(`\x1b[31m${result.error}\x1b[0m`);
  }
};

const stopCodex = async () => {
  if (terminal) terminal.writeln('\x1b[33mStopping Codex...\x1b[0m');
  try { await window.electronAPI.codex.stop(props.instance.id); } catch {}
  removeListeners();
  emit('status-change', 'disconnected');
  instancesStore.updateInstanceStatus(props.instance.id, 'disconnected');
};

onMounted(async () => {
  await nextTick();
  setTimeout(() => {
    initTerminal();
    if (currentInstance.value.status === 'connected') {
      setTimeout(setupListeners, 100);
    }
  }, 100);

  const handleResize = () => {
    if (fitAddon && terminal) {
      fitAddon.fit();
      if (currentInstance.value.status !== 'disconnected') {
        window.electronAPI.codex.resize(props.instance.id, terminal.cols, terminal.rows).catch(() => {});
      }
    }
  };
  resizeHandler = handleResize as any;
  window.addEventListener('resize', resizeHandler);
});

onUnmounted(() => {
  if (resizeHandler) {
    try { window.removeEventListener('resize', resizeHandler); } catch {}
    resizeHandler = null;
  }
  removeListeners();
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});
</script>

<style scoped>
.terminal-container { display:flex; flex-direction:column; height:100%; }
.terminal-header { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#252526; border-bottom:1px solid #1e1e1e; }
.terminal-header h3 { margin:0; font-size:13px; color:#fff; }
.terminal-actions { display:flex; gap:8px; }
.icon-button { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:none; border-radius:4px; cursor:pointer; font-size:12px; }
.start-button { background:#0dbc79; color:#fff; }
.start-button:hover { background:#0fa418; }
.stop-button { background:#cd3131; color:#fff; }
.stop-button:hover { background:#e14444; }
.connecting-button { background:#f9c23c; color:#fff; cursor:not-allowed; opacity:.8; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
.terminal-content { flex:1; padding:8px; overflow:hidden; position:relative; }
:deep(.xterm) { height:100%; padding:4px; }
:deep(.xterm-viewport) { background-color:transparent !important; }
</style>
