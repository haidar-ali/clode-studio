<template>
  <Teleport to="body">
    <div v-if="modelValue" class="selective-restore-modal" @click="closeModal">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-info">
            <Icon name="mdi:restore" class="header-icon" />
            <div class="header-details">
              <h3 class="modal-title">Selective Restore</h3>
              <p class="modal-subtitle">Choose files to restore from snapshot</p>
            </div>
          </div>
          
          <div class="header-actions">
            <button class="action-btn" @click="selectAll" title="Select All">
              <Icon name="mdi:select-all" />
            </button>
            <button class="action-btn" @click="selectNone" title="Select None">
              <Icon name="mdi:select-off" />
            </button>
            <button class="action-btn" @click="closeModal" title="Close">
              <Icon name="mdi:close" />
            </button>
          </div>
        </div>

        <div class="modal-content">
          <!-- Snapshot info -->
          <div class="snapshot-info" v-if="snapshot">
            <div class="info-item">
              <Icon name="mdi:tag" />
              <span>{{ snapshot.message || 'Untitled Snapshot' }}</span>
            </div>
            <div class="info-item">
              <Icon name="mdi:clock" />
              <span>{{ formatDate(snapshot.timestamp) }}</span>
            </div>
            <div class="info-item">
              <Icon name="mdi:file-multiple" />
              <span>{{ totalFiles }} files changed</span>
            </div>
          </div>

          <!-- File selection list -->
          <div class="file-selection-container" v-if="snapshot?.fileChanges">
            <!-- Added files -->
            <div class="file-section" v-if="snapshot.fileChanges.added.length > 0">
              <div class="section-header" @click="toggleSection('added')">
                <Icon 
                  :name="expandedSections.added ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
                  class="expand-icon"
                />
                <Icon name="mdi:file-plus" class="section-icon added" />
                <span class="section-title">Added Files</span>
                <span class="file-count">{{ snapshot.fileChanges.added.length }}</span>
                <button 
                  class="section-toggle" 
                  @click.stop="toggleSectionSelection('added')"
                  :title="allSectionSelected('added') ? 'Deselect All' : 'Select All'"
                >
                  <Icon :name="allSectionSelected('added') ? 'mdi:minus' : 'mdi:plus'" />
                </button>
              </div>
              <div v-show="expandedSections.added" class="file-list">
                <SelectableFileItem
                  v-for="file in snapshot.fileChanges.added"
                  :key="`added-${file.path}`"
                  :file="file"
                  :selected="isFileSelected(file, 'added')"
                  @toggle="toggleFileSelection(file, 'added')"
                  @view-diff="showFileDiff"
                  @view-content="showFileContent"
                />
              </div>
            </div>

            <!-- Modified files -->
            <div class="file-section" v-if="actuallyModifiedFiles.length > 0">
              <div class="section-header" @click="toggleSection('modified')">
                <Icon 
                  :name="expandedSections.modified ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
                  class="expand-icon"
                />
                <Icon name="mdi:file-edit" class="section-icon modified" />
                <span class="section-title">Modified Files</span>
                <span class="file-count">{{ actuallyModifiedFiles.length }}</span>
                <button 
                  class="section-toggle" 
                  @click.stop="toggleSectionSelection('modified')"
                  :title="allSectionSelected('modified') ? 'Deselect All' : 'Select All'"
                >
                  <Icon :name="allSectionSelected('modified') ? 'mdi:minus' : 'mdi:plus'" />
                </button>
              </div>
              <div v-show="expandedSections.modified" class="file-list">
                <SelectableFileItem
                  v-for="file in actuallyModifiedFiles"
                  :key="`modified-${file.path}`"
                  :file="file"
                  :selected="isFileSelected(file, 'modified')"
                  @toggle="toggleFileSelection(file, 'modified')"
                  @view-diff="showFileDiff"
                  @view-content="showFileContent"
                />
              </div>
            </div>

            <!-- Removed files -->
            <div class="file-section" v-if="snapshot.fileChanges.removed.length > 0">
              <div class="section-header" @click="toggleSection('removed')">
                <Icon 
                  :name="expandedSections.removed ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
                  class="expand-icon"
                />
                <Icon name="mdi:file-minus" class="section-icon removed" />
                <span class="section-title">Removed Files</span>
                <span class="file-count">{{ snapshot.fileChanges.removed.length }}</span>
                <button 
                  class="section-toggle" 
                  @click.stop="toggleSectionSelection('removed')"
                  :title="allSectionSelected('removed') ? 'Deselect All' : 'Select All'"
                >
                  <Icon :name="allSectionSelected('removed') ? 'mdi:minus' : 'mdi:plus'" />
                </button>
              </div>
              <div v-show="expandedSections.removed" class="file-list">
                <SelectableFileItem
                  v-for="file in snapshot.fileChanges.removed"
                  :key="`removed-${file.path}`"
                  :file="file"
                  :selected="isFileSelected(file, 'removed')"
                  @toggle="toggleFileSelection(file, 'removed')"
                  @view-content="showFileContent"
                />
              </div>
            </div>
          </div>

          <!-- No files message -->
          <div v-else class="no-files">
            <Icon name="mdi:file-cancel" class="no-files-icon" />
            <p>No file changes to restore</p>
            <p class="no-files-subtitle">This snapshot only contains IDE state</p>
          </div>
        </div>

        <div class="modal-footer">
          <div class="selection-summary">
            <span v-if="selectedCount > 0">
              {{ selectedCount }} of {{ totalFiles }} files selected
            </span>
            <span v-else class="no-selection">
              No files selected
            </span>
          </div>
          
          <div class="footer-actions">
            <button class="footer-btn secondary" @click="closeModal">
              Cancel
            </button>
            <button 
              class="footer-btn primary" 
              @click="restoreSelected"
              :disabled="selectedCount === 0 || isRestoring"
            >
              <Icon v-if="isRestoring" name="mdi:loading" class="animate-spin" />
              <Icon v-else name="mdi:restore" />
              Restore {{ selectedCount > 0 ? `${selectedCount} Files` : '' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- File diff viewer modal -->
  <SnapshotFileDiffViewer
    v-model="showDiffViewer"
    :file="selectedFile"
    :snapshot="snapshot"
  />

  <!-- File content viewer modal -->
  <SnapshotFileContentViewer
    v-model="showContentViewer"
    :file="selectedFile"
    :snapshot="snapshot"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ClaudeSnapshot, FileChange } from '~/types/snapshot';
import { useFileContentManager } from '~/composables/useFileContentManager';
import SelectableFileItem from './SelectableFileItem.vue';
import SnapshotFileDiffViewer from './SnapshotFileDiffViewer.vue';
import SnapshotFileContentViewer from './SnapshotFileContentViewer.vue';

interface Props {
  modelValue: boolean;
  snapshot: ClaudeSnapshot | null;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'restore-complete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// State
const selectedFiles = ref(new Set<string>());
const expandedSections = ref({
  added: true,
  modified: true,
  removed: false
});
const isRestoring = ref(false);
const showDiffViewer = ref(false);
const showContentViewer = ref(false);
const selectedFile = ref<FileChange | null>(null);

// Computed
const actuallyModifiedFiles = computed(() => {
  if (!props.snapshot?.fileChanges) return [];
  return props.snapshot.fileChanges.modified.filter(f => f.status !== 'unchanged');
});

const totalFiles = computed(() => {
  if (!props.snapshot?.fileChanges) return 0;
  return props.snapshot.fileChanges.added.length + 
         actuallyModifiedFiles.value.length + 
         props.snapshot.fileChanges.removed.length;
});

const selectedCount = computed(() => selectedFiles.value.size);

// Methods
function getFileKey(file: FileChange, section: string): string {
  return `${section}:${file.path}`;
}

function isFileSelected(file: FileChange, section: string): boolean {
  return selectedFiles.value.has(getFileKey(file, section));
}

function toggleFileSelection(file: FileChange, section: string) {
  const key = getFileKey(file, section);
  if (selectedFiles.value.has(key)) {
    selectedFiles.value.delete(key);
  } else {
    selectedFiles.value.add(key);
  }
}

function allSectionSelected(section: string): boolean {
  if (!props.snapshot?.fileChanges) return false;
  
  let files;
  if (section === 'modified') {
    files = actuallyModifiedFiles.value;
  } else {
    files = props.snapshot.fileChanges[section] || [];
  }
  
  return files.every(file => isFileSelected(file, section));
}

function toggleSectionSelection(section: string) {
  if (!props.snapshot?.fileChanges) return;
  
  let files;
  if (section === 'modified') {
    files = actuallyModifiedFiles.value;
  } else {
    files = props.snapshot.fileChanges[section] || [];
  }
  
  const allSelected = allSectionSelected(section);
  
  files.forEach(file => {
    const key = getFileKey(file, section);
    if (allSelected) {
      selectedFiles.value.delete(key);
    } else {
      selectedFiles.value.add(key);
    }
  });
}

function toggleSection(section: string) {
  expandedSections.value[section] = !expandedSections.value[section];
}

function selectAll() {
  if (!props.snapshot?.fileChanges) return;
  
  selectedFiles.value.clear();
  
  // Add added files
  props.snapshot.fileChanges.added.forEach(file => {
    selectedFiles.value.add(getFileKey(file, 'added'));
  });
  
  // Add only actually modified files (not unchanged)
  actuallyModifiedFiles.value.forEach(file => {
    selectedFiles.value.add(getFileKey(file, 'modified'));
  });
  
  // Add removed files
  props.snapshot.fileChanges.removed.forEach(file => {
    selectedFiles.value.add(getFileKey(file, 'removed'));
  });
}

function selectNone() {
  selectedFiles.value.clear();
}

function closeModal() {
  emit('update:modelValue', false);
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function showFileDiff(file: FileChange) {
  selectedFile.value = file;
  showDiffViewer.value = true;
}

function showFileContent(file: FileChange) {
  selectedFile.value = file;
  showContentViewer.value = true;
}

async function restoreSelected() {
  if (!props.snapshot?.fileChanges || selectedCount.value === 0) return;
  
  isRestoring.value = true;
  
  try {
    // Build filtered file changes object with only selected files
    const filteredChanges = {
      added: [] as FileChange[],
      modified: [] as FileChange[],
      removed: [] as FileChange[]
    };
    
    // Filter selected files by section
    // Added files
    filteredChanges.added = props.snapshot.fileChanges.added.filter(file => 
      isFileSelected(file, 'added')
    );
    
    // Only actually modified files (not unchanged)
    filteredChanges.modified = actuallyModifiedFiles.value.filter(file => 
      isFileSelected(file, 'modified')
    );
    
    // Removed files
    filteredChanges.removed = props.snapshot.fileChanges.removed.filter(file => 
      isFileSelected(file, 'removed')
    );
    
    // Use FileContentManager to restore the selected files
    const fileContentManager = useFileContentManager(props.snapshot.projectPath);
    await fileContentManager.restoreFiles(filteredChanges);
    
  
    
    // Close modal and notify parent
    emit('restore-complete');
    closeModal();
    
  } catch (error) {
    console.error('Failed to restore selected files:', error);
    const dialogs = await import('~/composables/useDialogs');
    await dialogs.useDialogs().error(`Failed to restore files: ${error.message}`, 'Restore Failed');
  } finally {
    isRestoring.value = false;
  }
}

// Reset selection when snapshot changes
watch(() => props.snapshot, () => {
  selectedFiles.value.clear();
});

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) {
    closeModal();
  }
}

// Add keyboard listener when modal opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeydown);
  } else {
    document.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.selective-restore-modal {
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
  padding: 20px;
}

.modal-container {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90vw;
  height: 85vh;
  max-width: 1000px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #3e3e42;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 24px;
  height: 24px;
  color: #569cd6;
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #cccccc;
}

.modal-subtitle {
  margin: 0;
  font-size: 12px;
  color: #8b8b8b;
  margin-top: 2px;
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

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.snapshot-info {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8b8b8b;
}

.info-item svg {
  width: 14px;
  height: 14px;
}

.file-selection-container {
  background: #1e1e1e;
}

.file-section {
  border-bottom: 1px solid #2d2d30;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.section-header:hover {
  background: #2a2d2e;
}

.expand-icon {
  width: 16px;
  height: 16px;
  margin-right: 4px;
}

.section-icon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.section-icon.added {
  color: #28a745;
}

.section-icon.modified {
  color: #ffc107;
}

.section-icon.removed {
  color: #dc3545;
}

.section-title {
  flex: 1;
  font-weight: 500;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.file-count {
  font-size: 11px;
  color: #8b8b8b;
  background: #3e3e42;
  padding: 2px 6px;
  border-radius: 10px;
  margin-right: 8px;
}

.section-toggle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #cccccc;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.section-toggle:hover {
  background: #3e3e42;
}

.section-toggle svg {
  width: 12px;
  height: 12px;
}

.file-list {
  padding: 0;
}

.no-files {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: #8b8b8b;
}

.no-files-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}

.no-files-subtitle {
  font-size: 12px;
  margin-top: 4px;
  color: #6b6b6b;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #252526;
  border-top: 1px solid #3e3e42;
}

.selection-summary {
  font-size: 12px;
  color: #8b8b8b;
}

.no-selection {
  color: #6b6b6b;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.footer-btn.secondary {
  background: #3e3e42;
  color: #cccccc;
}

.footer-btn.secondary:hover {
  background: #4a4a4a;
}

.footer-btn.primary {
  background: #0e639c;
  color: white;
}

.footer-btn.primary:hover:not(:disabled) {
  background: #1177bb;
}

.footer-btn:disabled {
  background: #3e3e42;
  color: #6b6b6b;
  cursor: default;
  opacity: 0.5;
}

.footer-btn svg {
  width: 14px;
  height: 14px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>