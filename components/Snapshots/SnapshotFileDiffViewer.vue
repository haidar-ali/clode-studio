<template>
  <Teleport to="body">
    <div v-if="modelValue" class="diff-viewer-modal" @click="closeModal">
      <div class="diff-viewer-container" @click.stop>
        <div class="diff-viewer-header">
          <div class="file-info">
            <Icon :name="getFileIcon()" class="file-icon" />
            <div class="file-details">
              <h3 class="file-title">{{ file?.path }}</h3>
              <div class="file-stats" v-if="diffStats">
                <span class="stat added">+{{ diffStats.linesAdded }}</span>
                <span class="stat removed">-{{ diffStats.linesRemoved }}</span>
                <span class="stat chunks">{{ diffStats.chunks }} chunk{{ diffStats.chunks !== 1 ? 's' : '' }}</span>
              </div>
            </div>
          </div>
          
          <div class="header-actions">
            <button class="action-btn" @click="toggleViewMode" :title="viewMode === 'split' ? 'Unified View' : 'Split View'">
              <Icon :name="viewMode === 'split' ? 'mdi:view-sequential' : 'mdi:view-split-horizontal'" />
            </button>
            <button class="action-btn" @click="closeModal" title="Close">
              <Icon name="mdi:close" />
            </button>
          </div>
        </div>

        <div class="diff-viewer-content">
          <div v-if="isLoading" class="loading-state">
            <Icon name="mdi:loading" class="animate-spin" />
            <p>Loading diff...</p>
          </div>

          <div v-else-if="error" class="error-state">
            <Icon name="mdi:alert-circle" />
            <p>Failed to load diff</p>
            <p class="error-detail">{{ error }}</p>
          </div>

          <div v-else-if="diffContent" class="diff-content">
            <!-- CodeMirror Merge View -->
            <div class="codemirror-container" ref="mergeContainer">
              <!-- CodeMirror merge view will be mounted here -->
            </div>
          </div>

          <div v-else class="no-diff-state">
            <Icon name="mdi:file-compare" />
            <p>No diff available</p>
            <p class="no-diff-detail">This file may be binary or the diff couldn't be generated</p>
          </div>
        </div>

        <div class="diff-viewer-footer">
          <div class="footer-info">
            <span v-if="file">{{ getFileTypeLabel() }} • {{ formatBytes(file.size) }}</span>
          </div>
          <div class="footer-actions">
            <button class="footer-btn" @click="exportDiff" :disabled="!diffContent">
              <Icon name="mdi:download" />
              Export Diff
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { MergeView, type MergeConfig } from '@codemirror/merge';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { rust } from '@codemirror/lang-rust';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import type { ClaudeSnapshot, FileChange, DiffObject } from '~/types/snapshot';
import { useFileContentManager } from '~/composables/useFileContentManager';

interface Props {
  modelValue: boolean;
  file: FileChange | null;
  snapshot: ClaudeSnapshot | null;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// State
const isLoading = ref(false);
const error = ref<string | null>(null);
const diffContent = ref<string | null>(null);
const diffStats = ref<{ linesAdded: number; linesRemoved: number; chunks: number } | null>(null);
const viewMode = ref<'split' | 'unified'>('split');
const mergeContainer = ref<HTMLElement>();
let mergeView: MergeView | null = null;

// Computed
const fileExtension = computed(() => {
  if (!props.file) return '';
  const parts = props.file.path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
});

// Methods
function closeModal() {
  emit('update:modelValue', false);
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'split' ? 'unified' : 'split';
  if (diffContent.value) {
    nextTick(() => setupMergeView());
  }
}

function getFileIcon(): string {
  const ext = fileExtension.value;
  
  const iconMap: Record<string, string> = {
    js: 'mdi:language-javascript',
    ts: 'mdi:language-typescript',
    jsx: 'mdi:language-javascript',
    tsx: 'mdi:language-typescript',
    vue: 'mdi:vuejs',
    py: 'mdi:language-python',
    java: 'mdi:language-java',
    cpp: 'mdi:language-cpp',
    c: 'mdi:language-c',
    cs: 'mdi:language-csharp',
    php: 'mdi:language-php',
    rb: 'mdi:language-ruby',
    go: 'mdi:language-go',
    rs: 'mdi:language-rust',
    swift: 'mdi:language-swift',
    kt: 'mdi:language-kotlin',
    html: 'mdi:language-html5',
    css: 'mdi:language-css3',
    scss: 'mdi:sass',
    less: 'mdi:less',
    json: 'mdi:code-json',
    xml: 'mdi:xml',
    yml: 'mdi:file-document',
    yaml: 'mdi:file-document',
    md: 'mdi:language-markdown',
    txt: 'mdi:file-document-outline',
    pdf: 'mdi:file-pdf-box',
    png: 'mdi:file-image',
    jpg: 'mdi:file-image',
    jpeg: 'mdi:file-image',
    gif: 'mdi:file-image',
    svg: 'mdi:svg',
    mp4: 'mdi:file-video',
    mp3: 'mdi:file-music',
    zip: 'mdi:folder-zip'
  };

  return iconMap[ext] || 'mdi:file-document-outline';
}

function getFileTypeLabel(): string {
  return fileExtension.value ? fileExtension.value.toUpperCase() : 'FILE';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getLanguageSupport(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, any> = {
    'js': javascript(),
    'ts': javascript({ typescript: true }),
    'jsx': javascript({ jsx: true }),
    'tsx': javascript({ jsx: true, typescript: true }),
    'vue': html(),
    'html': html(),
    'css': css(),
    'scss': css(),
    'json': json(),
    'md': markdown(),
    'py': python(),
    'java': java(),
    'cpp': cpp(),
    'c': cpp(),
    'cs': java(), // Close enough
    'php': php(),
    'rb': python(), // Close enough
    'go': cpp(), // Close enough
    'rs': rust(),
    'swift': java(), // Close enough
    'kt': java(), // Close enough
    'yaml': json(), // Close enough
    'yml': json(), // Close enough
    'xml': xml(),
    'sql': sql(),
    'sh': javascript(), // Basic syntax
    'bash': javascript(), // Basic syntax
  };
  
  return languageMap[ext] || [];
}

async function loadDiff() {
  if (!props.file || !props.file.diffHash) {
    error.value = 'No diff hash available';
    return;
  }

  if (!props.snapshot) {
    error.value = 'No snapshot specified';
    return;
  }

  isLoading.value = true;
  error.value = null;
  diffContent.value = null;
  diffStats.value = null;

  try {
    const fileContentManager = useFileContentManager(props.snapshot.projectPath);
    
    // Get the diff object via IPC
    const result = await window.electronAPI.snapshots.getDiff({
      hash: props.file.diffHash,
      projectPath: props.snapshot.projectPath
    });
    
    if (!result.success || !result.diffObject) {
      throw new Error(result.error || 'Failed to load diff');
    }
    
    const diffObject: DiffObject = result.diffObject;
    
    diffContent.value = diffObject.diffContent;
    diffStats.value = diffObject.stats;

    // Set up CodeMirror merge view
    await setupMergeView();
  } catch (err) {
    console.error('Failed to load diff:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    isLoading.value = false;
  }
}

async function setupMergeView() {
  if (!mergeContainer.value || !props.file || !diffContent.value || !props.snapshot) return;

  // Clean up existing view
  cleanupMergeView();

  await nextTick();

  try {
    // Get original and modified content
    const fileContentManager = useFileContentManager(props.snapshot.projectPath);
    
    let originalContent = '';
    let modifiedContent = '';

    if (props.file.previousHash) {
      const originalBuffer = await fileContentManager.getContent(props.file.previousHash);
      originalContent = originalBuffer ? originalBuffer.toString('utf8') : '';
    }

    if (props.file.contentHash) {
      const modifiedBuffer = await fileContentManager.getContent(props.file.contentHash);
      modifiedContent = modifiedBuffer ? modifiedBuffer.toString('utf8') : '';
    }

    // Get language support
    const langSupport = getLanguageSupport(props.file.path);
    
    // Common extensions
    const commonExtensions = [
      basicSetup,
      oneDark,
      langSupport,
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true)
    ];
    
    // Create merge view configuration
    const config: MergeConfig = {
      a: {
        doc: originalContent,
        extensions: commonExtensions
      },
      b: {
        doc: modifiedContent,
        extensions: commonExtensions
      },
      parent: mergeContainer.value,
      orientation: viewMode.value === 'unified' ? 'a-b' : undefined
    };
    
    mergeView = new MergeView(config);
  } catch (err) {
    console.error('Failed to setup CodeMirror merge view:', err);
  }
}

function cleanupMergeView() {
  if (mergeView) {
    mergeView.destroy();
    mergeView = null;
  }
  // Clear container
  if (mergeContainer.value) {
    mergeContainer.value.innerHTML = '';
  }
}

function exportDiff() {
  if (!diffContent.value || !props.file) return;

  const blob = new Blob([diffContent.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.file.path}.diff`;
  a.click();
  URL.revokeObjectURL(url);
}

// Watchers
watch(() => props.modelValue, (newValue) => {
  if (newValue && props.file) {
    loadDiff();
  } else if (!newValue) {
    cleanupMergeView();
  }
});

watch(() => props.file, () => {
  if (props.modelValue && props.file) {
    loadDiff();
  }
});

watch(viewMode, async () => {
  if (diffContent.value) {
    await setupMergeView();
  }
});

// Lifecycle
onUnmounted(() => {
  cleanupMergeView();
});

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) {
    closeModal();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.diff-viewer-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.diff-viewer-container {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90vw;
  height: 85vh;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #3e3e42;
}

.diff-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  width: 24px;
  height: 24px;
  color: #569cd6;
}

.file-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #cccccc;
}

.file-stats {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.stat {
  font-size: 12px;
  font-weight: 500;
}

.stat.added {
  color: #73c991;
}

.stat.removed {
  color: #f14c4c;
}

.stat.chunks {
  color: #8b8b8b;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #cccccc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #3e3e42;
}

.action-btn svg {
  width: 18px;
  height: 18px;
}

.diff-viewer-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.loading-state,
.error-state,
.no-diff-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8b8b8b;
  gap: 12px;
}

.loading-state svg,
.error-state svg,
.no-diff-state svg {
  width: 48px;
  height: 48px;
}

.error-detail,
.no-diff-detail {
  font-size: 12px;
  color: #6b6b6b;
  text-align: center;
}

.diff-content {
  height: 100%;
}

.codemirror-container {
  width: 100%;
  height: 100%;
  overflow: auto;
}

/* CodeMirror Merge View Styling */
.codemirror-container :deep(.cm-mergeView) {
  height: 100%;
}

.codemirror-container :deep(.cm-mergeViewEditor) {
  height: 100%;
}

.codemirror-container :deep(.cm-editor) {
  height: 100%;
}

.codemirror-container :deep(.cm-scroller) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

/* Style the gutter between editors */
.codemirror-container :deep(.cm-merge-gap) {
  width: 2px;
  background: #3e3e42;
}

/* Diff highlighting */
.codemirror-container :deep(.cm-deletedChunk) {
  background-color: rgba(255, 0, 0, 0.2);
}

.codemirror-container :deep(.cm-insertedChunk) {
  background-color: rgba(0, 255, 0, 0.2);
}

.diff-viewer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #252526;
  border-top: 1px solid #3e3e42;
}

.footer-info {
  font-size: 12px;
  color: #8b8b8b;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #3e3e42;
  border: none;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.footer-btn:hover:not(:disabled) {
  background: #4e4e52;
}

.footer-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.footer-btn svg {
  width: 16px;
  height: 16px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>