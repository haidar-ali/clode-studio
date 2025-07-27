<template>
  <Teleport to="body">
    <div v-if="modelValue" class="cherry-pick-modal" @click="closeModal">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-info">
            <Icon name="mdi:cherry" class="header-icon" />
            <div class="header-details">
              <h3 class="modal-title">Cherry Pick Changes</h3>
              <p class="modal-subtitle">Apply specific changes to current workspace</p>
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
          <!-- Source snapshot info -->
          <div class="snapshot-info" v-if="sourceSnapshot">
            <div class="info-header">
              <Icon name="mdi:source-branch" />
              <span class="info-title">Source Snapshot</span>
            </div>
            <div class="info-details">
              <div class="info-item">
                <Icon name="mdi:tag" />
                <span>{{ sourceSnapshot.message || 'Untitled Snapshot' }}</span>
              </div>
              <div class="info-item">
                <Icon name="mdi:clock" />
                <span>{{ formatDate(sourceSnapshot.timestamp) }}</span>
              </div>
              <div class="info-item">
                <Icon name="mdi:file-multiple" />
                <span>{{ totalFiles }} files changed</span>
              </div>
            </div>
          </div>

          <!-- Warning about conflicts -->
          <div class="warning-banner" v-if="hasConflicts">
            <Icon name="mdi:alert-triangle" />
            <div class="warning-content">
              <p class="warning-title">Potential Conflicts Detected</p>
              <p class="warning-text">Some selected files may conflict with current workspace changes. Review carefully before applying.</p>
            </div>
          </div>

          <!-- File selection list -->
          <div class="file-selection-container" v-if="sourceSnapshot?.fileChanges">
            <!-- Added files -->
            <div class="file-section" v-if="sourceSnapshot.fileChanges.added.length > 0">
              <div class="section-header" @click="toggleSection('added')">
                <Icon 
                  :name="expandedSections.added ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
                  class="expand-icon"
                />
                <Icon name="mdi:file-plus" class="section-icon added" />
                <span class="section-title">Added Files</span>
                <span class="file-count">{{ sourceSnapshot.fileChanges.added.length }}</span>
                <span class="cherry-pick-note">Will create new files</span>
                <button 
                  class="section-toggle" 
                  @click.stop="toggleSectionSelection('added')"
                  :title="allSectionSelected('added') ? 'Deselect All' : 'Select All'"
                >
                  <Icon :name="allSectionSelected('added') ? 'mdi:minus' : 'mdi:plus'" />
                </button>
              </div>
              <div v-show="expandedSections.added" class="file-list">
                <CherryPickFileItem
                  v-for="file in sourceSnapshot.fileChanges.added"
                  :key="`added-${file.path}`"
                  :file="file"
                  :selected="isFileSelected(file, 'added')"
                  :conflict-status="getConflictStatus(file)"
                  @toggle="toggleFileSelection(file, 'added')"
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
                <span class="cherry-pick-note">Will apply changes</span>
                <button 
                  class="section-toggle" 
                  @click.stop="toggleSectionSelection('modified')"
                  :title="allSectionSelected('modified') ? 'Deselect All' : 'Select All'"
                >
                  <Icon :name="allSectionSelected('modified') ? 'mdi:minus' : 'mdi:plus'" />
                </button>
              </div>
              <div v-show="expandedSections.modified" class="file-list">
                <CherryPickFileItem
                  v-for="file in actuallyModifiedFiles"
                  :key="`modified-${file.path}`"
                  :file="file"
                  :selected="isFileSelected(file, 'modified')"
                  :conflict-status="getConflictStatus(file)"
                  @toggle="toggleFileSelection(file, 'modified')"
                  @view-diff="showFileDiff"
                  @view-content="showFileContent"
                />
              </div>
            </div>

            <!-- Note: Removed files are not shown for cherry-pick as they would delete files -->
          </div>

          <!-- No files message -->
          <div v-else class="no-files">
            <Icon name="mdi:file-cancel" class="no-files-icon" />
            <p>No files available for cherry-pick</p>
            <p class="no-files-subtitle">This snapshot contains no addable/modifiable changes</p>
          </div>
        </div>

        <div class="modal-footer">
          <div class="selection-summary">
            <span v-if="selectedCount > 0">
              {{ selectedCount }} files selected
              <span v-if="conflictCount > 0" class="conflict-warning">
                ({{ conflictCount }} potential conflicts)
              </span>
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
              @click="cherryPickSelected"
              :disabled="selectedCount === 0 || isCherryPicking"
            >
              <Icon v-if="isCherryPicking" name="mdi:loading" class="animate-spin" />
              <Icon v-else name="mdi:cherry" />
              Cherry Pick {{ selectedCount > 0 ? `${selectedCount} Files` : '' }}
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
    :snapshot="sourceSnapshot"
  />

  <!-- File content viewer modal -->
  <SnapshotFileContentViewer
    v-model="showContentViewer"
    :file="selectedFile"
    :snapshot="sourceSnapshot"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ClaudeSnapshot, FileChange } from '~/types/snapshot';
import { useFileContentManager } from '~/composables/useFileContentManager';
import CherryPickFileItem from './CherryPickFileItem.vue';
import SnapshotFileDiffViewer from './SnapshotFileDiffViewer.vue';
import SnapshotFileContentViewer from './SnapshotFileContentViewer.vue';

interface Props {
  modelValue: boolean;
  sourceSnapshot: ClaudeSnapshot | null;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'cherry-pick-complete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// State
const selectedFiles = ref(new Set<string>());
const expandedSections = ref({
  added: true,
  modified: true
});
const isCherryPicking = ref(false);
const showDiffViewer = ref(false);
const showContentViewer = ref(false);
const selectedFile = ref<FileChange | null>(null);
const workspaceFiles = ref(new Map<string, boolean>()); // Track which files exist in workspace

// Computed
const actuallyModifiedFiles = computed(() => {
  if (!props.sourceSnapshot?.fileChanges) return [];
  return props.sourceSnapshot.fileChanges.modified.filter(f => f.status !== 'unchanged');
});

const totalFiles = computed(() => {
  if (!props.sourceSnapshot?.fileChanges) return 0;
  // Only count added and modified files (removed files can't be cherry-picked)
  return props.sourceSnapshot.fileChanges.added.length + 
         actuallyModifiedFiles.value.length;
});

const selectedCount = computed(() => selectedFiles.value.size);

const conflictCount = computed(() => {
  let conflicts = 0;
  selectedFiles.value.forEach(fileKey => {
    const [section, path] = fileKey.split(':');
    if (section === 'modified' && workspaceFiles.value.has(path)) {
      conflicts++;
    }
  });
  return conflicts;
});

const hasConflicts = computed(() => conflictCount.value > 0);

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
  if (!props.sourceSnapshot?.fileChanges) return false;
  
  let files;
  if (section === 'modified') {
    files = actuallyModifiedFiles.value;
  } else {
    files = props.sourceSnapshot.fileChanges[section] || [];
  }
  
  return files.every(file => isFileSelected(file, section));
}

function toggleSectionSelection(section: string) {
  if (!props.sourceSnapshot?.fileChanges) return;
  
  let files;
  if (section === 'modified') {
    files = actuallyModifiedFiles.value;
  } else {
    files = props.sourceSnapshot.fileChanges[section] || [];
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
  if (!props.sourceSnapshot?.fileChanges) return;
  
  selectedFiles.value.clear();
  
  // Add added files
  props.sourceSnapshot.fileChanges.added.forEach(file => {
    selectedFiles.value.add(getFileKey(file, 'added'));
  });
  
  // Add only actually modified files (not unchanged)
  actuallyModifiedFiles.value.forEach(file => {
    selectedFiles.value.add(getFileKey(file, 'modified'));
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

function getConflictStatus(file: FileChange): 'none' | 'potential' | 'conflict' {
  // For added files, check if they already exist
  if (file.status === 'added' && workspaceFiles.value.has(file.path)) {
    return 'conflict';
  }
  // For modified files, always potential conflict with workspace
  if (file.status === 'modified' && workspaceFiles.value.has(file.path)) {
    return 'potential';
  }
  return 'none';
}

function showFileDiff(file: FileChange) {
  selectedFile.value = file;
  showDiffViewer.value = true;
}

function showFileContent(file: FileChange) {
  selectedFile.value = file;
  showContentViewer.value = true;
}

async function scanWorkspaceFiles() {
  if (!props.sourceSnapshot) return;
  
  try {
    // Get current workspace files
    const result = await window.electronAPI.snapshots.scanProjectFiles({
      projectPath: props.sourceSnapshot.projectPath
    });
    
    if (result.success) {
      const fileMap = new Map<string, boolean>();
      result.files.forEach((file: any) => {
        fileMap.set(file.relativePath, true);
      });
      workspaceFiles.value = fileMap;
    }
  } catch (error) {
    console.warn('Failed to scan workspace files for conflict detection:', error);
  }
}

async function cherryPickSelected() {
  if (!props.sourceSnapshot?.fileChanges || selectedCount.value === 0) return;
  
  isCherryPicking.value = true;
  
  try {
    // Build filtered file changes object with only selected files
    const selectedChanges = {
      added: [] as FileChange[],
      modified: [] as FileChange[],
      removed: [] as FileChange[] // Always empty for cherry-pick
    };
    
    // Filter selected files by section
    // Added files
    selectedChanges.added = props.sourceSnapshot.fileChanges.added.filter(file => 
      isFileSelected(file, 'added')
    );
    
    // Only actually modified files (not unchanged)
    selectedChanges.modified = actuallyModifiedFiles.value.filter(file => 
      isFileSelected(file, 'modified')
    );
    
    // Use FileContentManager to apply the selected changes
    const fileContentManager = useFileContentManager(props.sourceSnapshot.projectPath);
    
    // For cherry-pick, we restore files but don't delete any existing files
    // This is different from full restore which would also remove files
    const filesToRestore = {
      added: selectedChanges.added,
      modified: selectedChanges.modified,
      removed: [] // Never remove files in cherry-pick
    };
    
    await fileContentManager.restoreFiles(filesToRestore);
    
    console.log(`🍒 Successfully cherry-picked ${selectedCount.value} files`);
    
    // Close modal and notify parent
    emit('cherry-pick-complete');
    closeModal();
    
  } catch (error) {
    console.error('Failed to cherry-pick selected files:', error);
    const dialogs = await import('~/composables/useDialogs');
    await dialogs.useDialogs().error(`Failed to cherry-pick files: ${error.message}`, 'Cherry Pick Failed');
  } finally {
    isCherryPicking.value = false;
  }
}

// Reset selection and scan workspace when snapshot changes
watch(() => props.sourceSnapshot, async (newSnapshot) => {
  selectedFiles.value.clear();
  if (newSnapshot) {
    await scanWorkspaceFiles();
  }
});

// Scan workspace files when modal opens
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.sourceSnapshot) {
    await scanWorkspaceFiles();
  }
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
.cherry-pick-modal {
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
  color: #ff6b9d; /* Cherry pink */
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
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  margin-bottom: 16px;
  border-left: 3px solid #ff6b9d;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.info-title {
  font-weight: 600;
  color: #cccccc;
  font-size: 14px;
}

.info-details {
  display: flex;
  gap: 16px;
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

.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 6px;
  margin-bottom: 16px;
}

.warning-banner svg {
  width: 20px;
  height: 20px;
  color: #ffc107;
  flex-shrink: 0;
  margin-top: 2px;
}

.warning-title {
  font-weight: 600;
  color: #ffc107;
  margin: 0 0 4px 0;
  font-size: 13px;
}

.warning-text {
  margin: 0;
  font-size: 12px;
  color: #cccccc;
  line-height: 1.4;
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
  gap: 4px;
}

.section-header:hover {
  background: #2a2d2e;
}

.expand-icon {
  width: 16px;
  height: 16px;
}

.section-icon {
  width: 16px;
  height: 16px;
}

.section-icon.added {
  color: #28a745;
}

.section-icon.modified {
  color: #ffc107;
}

.section-title {
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
  margin-left: 8px;
}

.cherry-pick-note {
  font-size: 10px;
  color: #8b949e;
  font-style: italic;
  margin-left: 8px;
  flex: 1;
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

.conflict-warning {
  color: #ffc107;
  font-weight: 500;
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
  background: #ff6b9d;
  color: white;
}

.footer-btn.primary:hover:not(:disabled) {
  background: #ff5a8c;
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