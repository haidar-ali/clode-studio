<template>
  <Teleport to="body">
    <div v-if="modelValue" class="content-viewer-modal" @click="closeModal">
      <div class="content-viewer-container" @click.stop>
        <div class="content-viewer-header">
          <div class="file-info">
            <Icon :name="getFileIcon()" class="file-icon" />
            <div class="file-details">
              <h3 class="file-title">{{ file?.path }}</h3>
              <div class="file-metadata">
                <span class="file-type">{{ getFileTypeLabel() }}</span>
                <span class="file-size">{{ formatBytes(file?.size || 0) }}</span>
                <span class="file-encoding">{{ file?.encoding }}</span>
                <span v-if="!file?.isTextFile" class="binary-badge">BINARY</span>
              </div>
            </div>
          </div>
          
          <div class="header-actions">
            <button 
              v-if="file?.isTextFile"
              class="action-btn" 
              @click="toggleWordWrap" 
              :title="wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'"
            >
              <Icon :name="wordWrap ? 'mdi:wrap-disabled' : 'mdi:wrap'" />
            </button>
            <button 
              class="action-btn" 
              @click="downloadFile" 
              :disabled="!fileContent"
              title="Download File"
            >
              <Icon name="mdi:download" />
            </button>
            <button class="action-btn" @click="closeModal" title="Close">
              <Icon name="mdi:close" />
            </button>
          </div>
        </div>

        <div class="content-viewer-content">
          <div v-if="isLoading" class="loading-state">
            <Icon name="mdi:loading" class="animate-spin" />
            <p>Loading file content...</p>
          </div>

          <div v-else-if="error" class="error-state">
            <Icon name="mdi:alert-circle" />
            <p>Failed to load file content</p>
            <p class="error-detail">{{ error }}</p>
          </div>

          <div v-else-if="!file?.isTextFile" class="binary-content-state">
            <Icon name="mdi:file-code" />
            <p>Binary File</p>
            <p class="binary-detail">This file contains binary data and cannot be displayed as text</p>
            <div class="binary-actions">
              <button class="action-button" @click="downloadFile">
                <Icon name="mdi:download" />
                Download File
              </button>
            </div>
          </div>

          <div v-else-if="fileContent !== null" class="text-content">
            <!-- CodeMirror Editor for syntax highlighting -->
            <div class="editor-container" ref="editorContainer">
              <!-- CodeMirror editor will be mounted here -->
            </div>
          </div>

          <div v-else class="no-content-state">
            <Icon name="mdi:file-outline" />
            <p>No content available</p>
            <p class="no-content-detail">The file content could not be retrieved</p>
          </div>
        </div>

        <div class="content-viewer-footer">
          <div class="footer-info">
            <span v-if="file">
              {{ file.path }} • {{ getFileTypeLabel() }} • {{ formatBytes(file.size) }}
            </span>
            <span v-if="fileContent && file?.isTextFile" class="line-info">
              {{ getLineCount() }} lines
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
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
import type { ClaudeSnapshot, FileChange } from '~/types/snapshot';
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
const fileContent = ref<string | null>(null);
const wordWrap = ref(false);
const editorContainer = ref<HTMLElement>();
let editor: EditorView | null = null;

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

function toggleWordWrap() {
  wordWrap.value = !wordWrap.value;
  if (editor && editorContainer.value && fileContent.value) {
    // Recreate editor with new word wrap setting
    setupCodeMirrorEditor();
  }
}

function getFileIcon(): string {
  const ext = fileExtension.value;
  
  const iconMap: Record<string, string> = {
    js: 'mdi:language-javascript',
    ts: 'mdi:language-typescript',
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

function getLineCount(): number {
  return fileContent.value ? fileContent.value.split('\n').length : 0;
}

function downloadFile() {
  if (!fileContent.value || !props.file) return;

  const blob = new Blob([fileContent.value], { 
    type: props.file.mimeType || 'text/plain' 
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = props.file.path.split('/').pop() || 'file';
  a.click();
  URL.revokeObjectURL(url);
}

async function loadFileContent() {
  if (!props.file) {
    error.value = 'No file specified';
    return;
  }

  if (!props.snapshot) {
    error.value = 'No snapshot specified';
    return;
  }

  isLoading.value = true;
  error.value = null;
  fileContent.value = null;

  try {
    const fileContentManager = useFileContentManager(props.snapshot.projectPath);
    
    // Get the content hash to use (prefer current content, fallback to previous)
    const contentHash = props.file.contentHash || props.file.previousHash;
    
    if (!contentHash) {
      throw new Error('No content hash available for this file');
    }

    const content = await fileContentManager.getContent(contentHash);
    
    if (!content) {
      throw new Error('File content not found in storage');
    }

    if (props.file.isTextFile) {
      // Content is already a string from getContent
      fileContent.value = content;
      
      // Set up CodeMirror editor
      await nextTick();
      await setupCodeMirrorEditor();
    } else {
      // For binary files, we'll just show metadata
      fileContent.value = `[Binary file: ${formatBytes(props.file.size)}]`;
    }
  } catch (err) {
    console.error('Failed to load file content:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    isLoading.value = false;
  }
}

async function setupCodeMirrorEditor() {
  if (!editorContainer.value || !fileContent.value || !props.file?.isTextFile) return;

  // Clean up any existing editor
  cleanupEditor();

  try {
    await nextTick();
    
    // Get language support
    const langSupport = getLanguageSupport();

    // Create CodeMirror editor
    const extensions = [
      basicSetup,
      oneDark,
      langSupport,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true)
    ];

    // Add word wrap if enabled
    if (wordWrap.value) {
      extensions.push(EditorView.lineWrapping);
    }

    const state = EditorState.create({
      doc: fileContent.value,
      extensions
    });

    editor = new EditorView({
      state,
      parent: editorContainer.value
    });
  } catch (err) {
    console.error('Failed to setup CodeMirror editor:', err);
  }
}

function cleanupEditor() {
  if (editor) {
    editor.destroy();
    editor = null;
  }
  // Clear container
  if (editorContainer.value) {
    editorContainer.value.innerHTML = '';
  }
}

function getLanguageSupport() {
  const ext = fileExtension.value;
  
  const langMap: Record<string, any> = {
    js: javascript(),
    ts: javascript({ typescript: true }),
    jsx: javascript({ jsx: true }),
    tsx: javascript({ jsx: true, typescript: true }),
    vue: html(),
    py: python(),
    java: java(),
    cpp: cpp(),
    c: cpp(),
    cs: java(), // Close enough
    php: php(),
    rb: python(), // Close enough
    go: cpp(), // Close enough
    rs: rust(),
    swift: java(), // Close enough
    kt: java(), // Close enough
    html: html(),
    css: css(),
    scss: css(),
    less: css(),
    json: json(),
    xml: xml(),
    yaml: json(), // Close enough
    yml: json(), // Close enough
    md: markdown(),
    sql: sql(),
    sh: javascript(), // Basic syntax
    bash: javascript(), // Basic syntax
    ps1: javascript(), // Basic syntax
    dockerfile: javascript() // Basic syntax
  };

  return langMap[ext] || [];
}

// Watchers
watch(() => props.modelValue, async (newValue) => {
  if (newValue && props.file) {
    await loadFileContent();
    if (props.file.isTextFile && fileContent.value) {
      await nextTick();
      // Add a small delay to ensure DOM is ready
      setTimeout(async () => {
        await setupCodeMirrorEditor();
      }, 100);
    }
  } else {
    cleanupEditor();
  }
});

watch(() => props.file, async () => {
  if (props.modelValue && props.file) {
    await loadFileContent();
    if (props.file.isTextFile && fileContent.value) {
      await nextTick();
      setTimeout(async () => {
        await setupCodeMirrorEditor();
      }, 100);
    }
  }
});

// Lifecycle
onUnmounted(() => {
  cleanupEditor();
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
.content-viewer-modal {
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

.content-viewer-container {
  background: #1e1e1e;
  border-radius: 8px;
  width: 85vw;
  height: 80vh;
  max-width: 1000px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #3e3e42;
}

.content-viewer-header {
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

.file-metadata {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  align-items: center;
}

.file-metadata > span {
  font-size: 11px;
  color: #8b8b8b;
}

.file-type,
.binary-badge {
  background: #3e3e42;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 500;
}

.binary-badge {
  background: #6f42c1;
  color: white;
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

.action-btn:hover:not(:disabled) {
  background: #3e3e42;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.action-btn svg {
  width: 18px;
  height: 18px;
}

.content-viewer-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.loading-state,
.error-state,
.binary-content-state,
.no-content-state {
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
.binary-content-state svg,
.no-content-state svg {
  width: 48px;
  height: 48px;
}

.error-detail,
.binary-detail,
.no-content-detail {
  font-size: 12px;
  color: #6b6b6b;
  text-align: center;
}

.binary-actions {
  margin-top: 16px;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.action-button:hover {
  background: #1177bb;
}

.action-button svg {
  width: 16px;
  height: 16px;
}

.text-content {
  height: 100%;
}

.editor-container {
  height: 100%;
  width: 100%;
  overflow: auto;
}

/* CodeMirror styling */
.editor-container :deep(.cm-editor) {
  height: 100%;
}

.editor-container :deep(.cm-scroller) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

.content-viewer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #252526;
  border-top: 1px solid #3e3e42;
}

.footer-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #8b8b8b;
}

.line-info {
  color: #569cd6;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>