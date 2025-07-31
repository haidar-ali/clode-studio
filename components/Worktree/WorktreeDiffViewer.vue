<template>
  <Teleport to="body">
    <div v-if="modelValue" class="diff-viewer-modal" @click="closeModal">
      <div class="diff-viewer-container" @click.stop>
        <div class="diff-viewer-header">
          <div class="file-info">
            <Icon :name="getFileIcon()" class="file-icon" />
            <div class="file-details">
              <h3 class="file-title">{{ file }}</h3>
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
            <span>{{ getFileTypeLabel() }}</span>
          </div>
          <div class="footer-actions">
            <button class="footer-btn primary" @click="applyChanges" :disabled="!diffContent">
              <Icon name="mdi:content-save" />
              Apply Changes
            </button>
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
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { MergeView } from '@codemirror/merge';
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
import Icon from '~/components/Icon.vue';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
}

interface Props {
  modelValue: boolean;
  file: string | null;
  worktree1: Worktree;
  worktree2: Worktree;
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
const content1 = ref<string>('');
const content2 = ref<string>('');
let mergeView: MergeView | null = null;

// Computed
const fileExtension = computed(() => {
  if (!props.file) return '';
  const parts = props.file.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
});

// Watch for file changes
watch(() => props.file, async (newFile) => {
  if (newFile && props.modelValue) {
    await loadDiff();
  }
});

watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.file) {
    await loadDiff();
  } else {
    cleanupMergeView();
  }
});

// Methods
function closeModal() {
  emit('update:modelValue', false);
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'split' ? 'unified' : 'split';
  if (content1.value && content2.value) {
    nextTick(() => setupMergeView());
  }
}

async function loadDiff() {
  if (!props.file) return;

  isLoading.value = true;
  error.value = null;
  diffContent.value = null;

  try {
    // Construct proper file paths using path.join equivalent
    // Remove leading slash if present to avoid double slashes
    const cleanFile = props.file.startsWith('/') ? props.file.substring(1) : props.file;
    const file1Path = `${props.worktree1.path}/${cleanFile}`.replace(/\/\/+/g, '/');
    const file2Path = `${props.worktree2.path}/${cleanFile}`.replace(/\/\/+/g, '/');
    
  
    
    // Load file content from both worktrees
    const [result1, result2] = await Promise.all([
      window.electronAPI.fs.readFile(file1Path),
      window.electronAPI.fs.readFile(file2Path)
    ]);
    
    console.log('File read results:', { 
      result1: { success: result1.success, hasContent: !!result1.content, contentLength: result1.content?.length },
      result2: { success: result2.success, hasContent: !!result2.content, contentLength: result2.content?.length }
    });

    // Handle cases where file might not exist in one worktree
    if (!result1.success && result1.error?.includes('ENOENT')) {
      // File doesn't exist in worktree1 (was added in worktree2)
      content1.value = '';
      content2.value = result2.content || '';
    } else if (!result2.success && result2.error?.includes('ENOENT')) {
      // File doesn't exist in worktree2 (was removed)
      content1.value = result1.content || '';
      content2.value = '';
    } else if (!result1.success) {
      error.value = `Failed to load file from ${props.worktree1.branch}: ${result1.error || 'Unknown error'}`;
      console.error('Failed to load file1:', result1);
      return;
    } else if (!result2.success) {
      error.value = `Failed to load file from ${props.worktree2.branch}: ${result2.error || 'Unknown error'}`;
      console.error('Failed to load file2:', result2);
      return;
    } else {
      content1.value = result1.content || '';
      content2.value = result2.content || '';
    }
    
    // Always proceed if we have at least one content
    if (content1.value !== null && content2.value !== null) {
      console.log('Content loaded:', {
        content1Length: content1.value.length,
        content2Length: content2.value.length,
        content1Preview: content1.value.substring(0, 100),
        content2Preview: content2.value.substring(0, 100)
      });
      
      // Calculate diff stats
      calculateDiffStats();
      
      // Generate diff content
      generateDiffContent();
      
      // Setup merge view
      await nextTick();
      setupMergeView();
    } else {
      console.error('Content is null:', { content1: content1.value, content2: content2.value });
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load diff';
  } finally {
    isLoading.value = false;
  }
}

function calculateDiffStats() {
  const lines1 = content1.value.split('\n');
  const lines2 = content2.value.split('\n');
  
  let linesAdded = 0;
  let linesRemoved = 0;
  let chunks = 0;
  let inChunk = false;
  
  // Simple line-by-line comparison (for basic stats)
  const maxLines = Math.max(lines1.length, lines2.length);
  
  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';
    
    if (line1 !== line2) {
      if (!inChunk) {
        chunks++;
        inChunk = true;
      }
      
      if (i >= lines1.length) {
        linesAdded++;
      } else if (i >= lines2.length) {
        linesRemoved++;
      } else {
        linesAdded++;
        linesRemoved++;
      }
    } else {
      inChunk = false;
    }
  }
  
  diffStats.value = { linesAdded, linesRemoved, chunks };
}

function generateDiffContent() {
  // Generate a unified diff format
  const lines1 = content1.value.split('\n');
  const lines2 = content2.value.split('\n');
  
  let diff = `--- ${props.worktree1.branch}/${props.file}\n`;
  diff += `+++ ${props.worktree2.branch}/${props.file}\n`;
  
  // Simple unified diff generation
  const maxLines = Math.max(lines1.length, lines2.length);
  let contextStart = -1;
  let contextLines: string[] = [];
  
  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];
    
    if (line1 !== line2) {
      if (contextStart === -1) {
        contextStart = Math.max(0, i - 3);
        diff += `@@ -${contextStart + 1},${Math.min(lines1.length - contextStart, 7)} +${contextStart + 1},${Math.min(lines2.length - contextStart, 7)} @@\n`;
        
        // Add context before
        for (let j = contextStart; j < i; j++) {
          if (lines1[j] !== undefined) {
            diff += ` ${lines1[j]}\n`;
          }
        }
      }
      
      if (line1 !== undefined) {
        diff += `-${line1}\n`;
      }
      if (line2 !== undefined) {
        diff += `+${line2}\n`;
      }
    } else if (contextStart !== -1 && i - contextStart < 6) {
      diff += ` ${line1}\n`;
    } else {
      contextStart = -1;
    }
  }
  
  diffContent.value = diff;
}

function setupMergeView() {
  cleanupMergeView();
  
  if (!mergeContainer.value) {
    console.error('No merge container found');
    return;
  }
  
  console.log('Setting up merge view with:', {
    content1: content1.value?.substring(0, 100),
    content2: content2.value?.substring(0, 100),
    container: mergeContainer.value
  });
  
  const languageSupport = getLanguageSupport();
  
  mergeView = new MergeView({
    parent: mergeContainer.value,
    a: {
      doc: content1.value || '',
      extensions: [
        basicSetup,
        oneDark,
        languageSupport,
        EditorView.editable.of(false),
        EditorState.readOnly.of(true)
      ]
    },
    b: {
      doc: content2.value || '',
      extensions: [
        basicSetup,
        oneDark,
        languageSupport,
        EditorView.editable.of(false),
        EditorState.readOnly.of(true)
      ]
    },
    collapseUnchanged: { margin: 3, minSize: 4 },
    renderGutters: true,
    highlightChanges: true,
    gutter: true
  });
}

function cleanupMergeView() {
  if (mergeView) {
    mergeView.destroy();
    mergeView = null;
  }
}

function getLanguageSupport() {
  const ext = fileExtension.value;
  
  const languageMap: Record<string, any> = {
    js: javascript(),
    jsx: javascript({ jsx: true }),
    ts: javascript({ typescript: true }),
    tsx: javascript({ typescript: true, jsx: true }),
    py: python(),
    css: css(),
    scss: css(),
    sass: css(),
    html: html(),
    vue: html(),
    json: json(),
    md: markdown(),
    cpp: cpp(),
    c: cpp(),
    java: java(),
    php: php(),
    rs: rust(),
    xml: xml(),
    sql: sql()
  };
  
  return languageMap[ext] || [];
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
    json: 'mdi:code-json',
    xml: 'mdi:xml',
    yaml: 'mdi:file-code',
    yml: 'mdi:file-code',
    md: 'mdi:language-markdown',
    sql: 'mdi:database',
  };
  
  return iconMap[ext] || 'mdi:file-document-outline';
}

function getFileTypeLabel(): string {
  const ext = fileExtension.value;
  
  const typeMap: Record<string, string> = {
    js: 'JavaScript',
    ts: 'TypeScript',
    jsx: 'JavaScript React',
    tsx: 'TypeScript React',
    vue: 'Vue Component',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    cs: 'C#',
    php: 'PHP',
    rb: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    swift: 'Swift',
    kt: 'Kotlin',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    sql: 'SQL',
  };
  
  return typeMap[ext] || 'Plain Text';
}

async function applyChanges() {
  if (!props.file || !content2.value) return;
  
  try {
    // Copy the file from worktree2 to worktree1
    const targetPath = `${props.worktree1.path}/${props.file}`;
    const result = await window.electronAPI.fs.writeFile(targetPath, content2.value);
    
    if (result.success) {
      closeModal();
      // Show success message
      alert(`Changes applied successfully to ${props.worktree1.branch}`);
    } else {
      error.value = 'Failed to apply changes';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to apply changes';
  }
}

function exportDiff() {
  if (!diffContent.value || !props.file) return;
  
  const blob = new Blob([diffContent.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.file.replace(/\//g, '_')}.diff`;
  a.click();
  URL.revokeObjectURL(url);
}

onUnmounted(() => {
  cleanupMergeView();
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
  z-index: 3000;
  padding: 20px;
}

.diff-viewer-container {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  width: 90vw;
  max-width: 1400px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.diff-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  border-radius: 8px 8px 0 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  overflow: hidden;
}

.file-icon {
  font-size: 24px;
  color: #858585;
  flex-shrink: 0;
}

.file-details {
  overflow: hidden;
}

.file-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e1e1e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  font-size: 13px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat.added {
  color: #4ec9b0;
}

.stat.removed {
  color: #f48771;
}

.stat.chunks {
  color: #858585;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  color: #cccccc;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: #3e3e42;
  color: #ffffff;
}

.diff-viewer-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #1e1e1e;
}

.loading-state,
.error-state,
.no-diff-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: #858585;
}

.error-state {
  color: #f48771;
}

.error-detail,
.no-diff-detail {
  font-size: 13px;
  opacity: 0.8;
}

.diff-content {
  height: 100%;
  overflow: hidden;
}

.codemirror-container {
  height: 100%;
  overflow: auto;
}

.codemirror-container :deep(.cm-editor) {
  height: 100%;
}

.codemirror-container :deep(.cm-merge-revert) {
  display: none;
}

.diff-viewer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  border-radius: 0 0 8px 8px;
}

.footer-info {
  font-size: 13px;
  color: #858585;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-btn {
  background: #3e3e42;
  border: 1px solid #505050;
  color: #cccccc;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-btn:hover:not(:disabled) {
  background: #505050;
  border-color: #626262;
  color: #ffffff;
}

.footer-btn.primary {
  background: #007acc;
  border-color: #007acc;
  color: white;
}

.footer-btn.primary:hover:not(:disabled) {
  background: #1a8cff;
  border-color: #1a8cff;
}

.footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>