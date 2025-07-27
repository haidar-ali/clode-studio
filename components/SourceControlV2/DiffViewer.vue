<template>
  <Teleport to="body">
    <Transition name="diff-modal">
      <div v-if="modelValue" class="diff-modal-backdrop" @click="close">
        <div class="diff-modal-content" @click.stop>
          <div class="diff-header">
            <div class="diff-title">
              <Icon :name="fileIcon" class="file-icon" />
              <span class="file-path">{{ file?.path }}</span>
              <span class="diff-type">{{ diffType }}</span>
            </div>
            <div class="diff-actions">
              <button 
                class="action-btn"
                @click="toggleViewMode"
                title="Toggle View Mode"
              >
                <Icon :name="viewMode === 'split' ? 'mdi:view-split-vertical' : 'mdi:view-sequential'" />
              </button>
              <button 
                v-if="canEdit && viewMode === 'edit'"
                class="action-btn primary"
                @click="saveChanges"
                title="Save Changes"
              >
                <Icon name="mdi:content-save" />
              </button>
              <button 
                class="action-btn"
                @click="close"
                title="Close"
              >
                <Icon name="mdi:close" />
              </button>
            </div>
          </div>

          <div class="diff-content">
            <!-- CodeMirror Merge View -->
            <div ref="mergeContainer" class="merge-container"></div>
          </div>

          <div class="diff-footer">
            <div class="diff-stats">
              <span class="stat additions">+{{ stats.additions }}</span>
              <span class="stat deletions">-{{ stats.deletions }}</span>
            </div>
            <div class="diff-info">
              {{ file?.status }} · {{ formatFileSize(file?.size) }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';
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

const props = defineProps<{
  modelValue: boolean;
  file?: {
    path: string;
    status: string;
    size?: number;
    originalContent?: string;
    currentContent?: string;
  };
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'save': [content: string];
}>();

const mergeContainer = ref<HTMLElement | null>(null);
const viewMode = ref<'split' | 'unified' | 'edit'>('split');
const hasChanges = ref(false);
const editedContent = ref('');
const stats = ref({ additions: 0, deletions: 0 });

let mergeView: MergeView | null = null;
let singleEditor: EditorView | null = null;

const fileIcon = computed(() => {
  if (!props.file) return 'mdi:file';
  
  const ext = props.file.path.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    'js': 'mdi:language-javascript',
    'ts': 'mdi:language-typescript',
    'jsx': 'mdi:language-javascript',
    'tsx': 'mdi:language-typescript',
    'vue': 'mdi:vuejs',
    'html': 'mdi:language-html5',
    'css': 'mdi:language-css3',
    'scss': 'mdi:sass',
    'json': 'mdi:code-json',
    'md': 'mdi:language-markdown',
    'py': 'mdi:language-python',
    'java': 'mdi:language-java',
    'cpp': 'mdi:language-cpp',
    'c': 'mdi:language-c',
    'cs': 'mdi:language-csharp',
    'php': 'mdi:language-php',
    'rb': 'mdi:language-ruby',
    'go': 'mdi:language-go',
    'rs': 'mdi:language-rust',
    'swift': 'mdi:language-swift',
    'kt': 'mdi:language-kotlin',
    'yaml': 'mdi:yaml',
    'yml': 'mdi:yaml',
    'xml': 'mdi:xml',
    'sh': 'mdi:shell-script',
    'bash': 'mdi:bash',
  };
  
  return iconMap[ext] || 'mdi:file';
});

const diffType = computed(() => {
  if (!props.file) return '';
  
  const types: Record<string, string> = {
    'modified': 'Modified',
    'added': 'Added',
    'deleted': 'Deleted',
    'renamed': 'Renamed',
    'untracked': 'Untracked'
  };
  
  return types[props.file.status] || props.file.status;
});

const canEdit = computed(() => {
  return props.file?.status !== 'deleted';
});

function close() {
  emit('update:modelValue', false);
}

function toggleViewMode() {
  // Cycle through modes: split -> unified -> edit (if canEdit) -> split
  if (viewMode.value === 'split') {
    viewMode.value = 'unified';
  } else if (viewMode.value === 'unified' && canEdit.value) {
    viewMode.value = 'edit';
  } else {
    viewMode.value = 'split';
  }
  
  nextTick(() => createMergeView());
}

function saveChanges() {
  if (hasChanges.value && editedContent.value) {
    emit('save', editedContent.value);
    close();
  }
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

function calculateStats(original: string | undefined, modified: string | undefined) {
  // Ensure we have valid strings
  const originalStr = original || '';
  const modifiedStr = modified || '';
  
  const originalLines = originalStr.split('\n');
  const modifiedLines = modifiedStr.split('\n');
  
  // Simple line-based diff calculation (for display purposes)
  const maxLen = Math.max(originalLines.length, modifiedLines.length);
  let additions = 0;
  let deletions = 0;
  
  for (let i = 0; i < maxLen; i++) {
    if (i >= originalLines.length) {
      additions++;
    } else if (i >= modifiedLines.length) {
      deletions++;
    } else if (originalLines[i] !== modifiedLines[i]) {
      additions++;
      deletions++;
    }
  }
  
  stats.value = { additions, deletions };
}

async function createMergeView() {
  if (!mergeContainer.value || !props.file) return;
  
  // Clean up existing views
  cleanupViews();
  
  await nextTick();
  
  const originalContent = props.file.originalContent || '';
  const currentContent = props.file.currentContent || '';
  
  // Calculate stats
  calculateStats(originalContent, currentContent);
  
  // Get language support
  const langSupport = getLanguageSupport(props.file.path);
  
  // Common extensions
  const commonExtensions = [
    basicSetup,
    oneDark,
    langSupport,
    EditorView.lineWrapping
  ];
  
  if (viewMode.value === 'edit') {
    // Single editor for editing
    singleEditor = new EditorView({
      doc: currentContent,
      extensions: [
        ...commonExtensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            editedContent.value = update.state.doc.toString();
            hasChanges.value = editedContent.value !== currentContent;
          }
        })
      ],
      parent: mergeContainer.value
    });
  } else {
    // Merge view for diff display
    const config: MergeConfig = {
      a: {
        doc: originalContent,
        extensions: [
          ...commonExtensions,
          EditorView.editable.of(false),
          EditorState.readOnly.of(true)
        ]
      },
      b: {
        doc: currentContent,
        extensions: [
          ...commonExtensions,
          EditorView.editable.of(false),
          EditorState.readOnly.of(true)
        ]
      },
      parent: mergeContainer.value,
      orientation: viewMode.value === 'unified' ? 'a-b' : undefined
    };
    
    mergeView = new MergeView(config);
  }
}

function cleanupViews() {
  if (mergeView) {
    mergeView.destroy();
    mergeView = null;
  }
  if (singleEditor) {
    singleEditor.destroy();
    singleEditor = null;
  }
  // Clear container
  if (mergeContainer.value) {
    mergeContainer.value.innerHTML = '';
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Watch for modal open/close
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.file) {
    viewMode.value = 'split'; // Reset to split view
    hasChanges.value = false;
    await nextTick();
    await createMergeView();
  } else if (!isOpen) {
    cleanupViews();
  }
});

// Watch for file changes only when modal is open
watch(() => props.file, async (newFile, oldFile) => {
  if (props.modelValue && newFile && newFile !== oldFile) {
    viewMode.value = 'split'; // Reset to split view
    hasChanges.value = false;
    await nextTick();
    await createMergeView();
  }
});

// Cleanup on unmount
onUnmounted(() => {
  cleanupViews();
});
</script>

<style scoped>
.diff-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.diff-modal-content {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90%;
  max-width: 1200px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  border-radius: 8px 8px 0 0;
}

.diff-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.file-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.file-path {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.diff-type {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  background: #3e3e42;
  color: #8b8b8b;
  margin-left: 8px;
}

.diff-actions {
  display: flex;
  gap: 4px;
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

.action-btn.primary {
  background: #0e639c;
  color: white;
}

.action-btn.primary:hover {
  background: #1177bb;
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.diff-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.merge-container {
  width: 100%;
  height: 100%;
  overflow: auto;
}

/* CodeMirror Merge View Styling */
.merge-container :deep(.cm-mergeView) {
  height: 100%;
}

.merge-container :deep(.cm-mergeViewEditor) {
  height: 100%;
}

.merge-container :deep(.cm-editor) {
  height: 100%;
}

.merge-container :deep(.cm-scroller) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

/* Style the gutter between editors */
.merge-container :deep(.cm-merge-gap) {
  width: 2px;
  background: #3e3e42;
}

/* Diff highlighting */
.merge-container :deep(.cm-deletedChunk) {
  background-color: rgba(255, 0, 0, 0.2);
}

.merge-container :deep(.cm-insertedChunk) {
  background-color: rgba(0, 255, 0, 0.2);
}

.diff-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  border-radius: 0 0 8px 8px;
}

.diff-stats {
  display: flex;
  gap: 12px;
}

.stat {
  font-size: 12px;
  font-weight: 500;
}

.stat.additions {
  color: #73c991;
}

.stat.deletions {
  color: #f14c4c;
}

.diff-info {
  font-size: 12px;
  color: #8b8b8b;
}

/* Modal transition */
.diff-modal-enter-active,
.diff-modal-leave-active {
  transition: opacity 0.3s ease;
}

.diff-modal-enter-from,
.diff-modal-leave-to {
  opacity: 0;
}

.diff-modal-enter-active .diff-modal-content,
.diff-modal-leave-active .diff-modal-content {
  transition: transform 0.3s ease;
}

.diff-modal-enter-from .diff-modal-content {
  transform: scale(0.95) translateY(20px);
}

.diff-modal-leave-to .diff-modal-content {
  transform: scale(0.95) translateY(20px);
}
</style>