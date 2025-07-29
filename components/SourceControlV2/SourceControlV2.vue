<template>
  <div class="source-control-v2">
    <!-- Header with workspace info -->
    <div class="sc-header">
      <div class="workspace-info">
        <div class="workspace-selector" @click="showWorkspaceSwitcher = true">
          <Icon name="mdi:folder-open" class="workspace-icon" />
          <div class="workspace-details">
            <div class="workspace-name">{{ workspaceName }}</div>
            <div class="branch-info">
              <Icon name="mdi:source-branch" />
              <span>{{ currentBranch }}</span>
              <span v-if="branchStatus" class="branch-status">
                {{ branchStatus }}
              </span>
            </div>
          </div>
          <Icon name="mdi:chevron-down" class="dropdown-icon" />
        </div>
      </div>
      
      <div class="header-actions">
        <button 
          class="icon-btn"
          @click="createSnapshot"
          title="Create Snapshot"
        >
          <Icon name="mdi:camera" />
        </button>
        <button 
          class="icon-btn"
          @click="refresh"
          :disabled="isLoading"
          title="Refresh"
        >
          <Icon name="mdi:refresh" :class="{ 'animate-spin': isLoading }" />
        </button>
        <button 
          class="icon-btn"
          @click="showMenu = !showMenu"
          title="More Actions"
        >
          <Icon name="mdi:dots-vertical" />
        </button>
      </div>
    </div>

    <!-- Branch Operations Dropdown -->
    <Transition name="dropdown">
      <div v-if="showMenu" class="dropdown-menu" @click.stop v-click-outside="() => showMenu = false">
        <div class="dropdown-section">
          <div class="dropdown-header">Branch Operations</div>
          <button class="dropdown-item" @click="handleCreateBranch">
            <Icon name="mdi:plus" />
            Create New Branch...
          </button>
          <button class="dropdown-item" @click="handleSwitchBranch">
            <Icon name="mdi:source-branch-sync" />
            Switch Branch...
          </button>
          <button class="dropdown-item" @click="handleMergeBranch">
            <Icon name="mdi:source-merge" />
            Merge Branch...
          </button>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" @click="handlePull">
            <Icon name="mdi:arrow-down" />
            Pull from Remote
          </button>
          <button class="dropdown-item" @click="handlePush">
            <Icon name="mdi:arrow-up" />
            Push to Remote
          </button>
          <button class="dropdown-item" @click="handleFetch">
            <Icon name="mdi:cloud-download" />
            Fetch from Remote
          </button>
        </div>
        <div class="dropdown-section">
          <div class="dropdown-header">Stash Operations</div>
          <button class="dropdown-item" @click="handleStashWithMessage">
            <Icon name="mdi:package-down" />
            Stash Changes...
          </button>
          <button class="dropdown-item" @click="handlePopStash">
            <Icon name="mdi:package-up" />
            Pop Latest Stash
          </button>
          <button class="dropdown-item" @click="handleViewStashes">
            <Icon name="mdi:view-list" />
            View Stashes...
          </button>
        </div>
        <div class="dropdown-section">
          <div class="dropdown-header">Repository</div>
          <button class="dropdown-item" @click="handleInitRepo">
            <Icon name="mdi:git" />
            Initialize Repository
          </button>
          <button class="dropdown-item" @click="handleCloneRepo">
            <Icon name="mdi:cloud-download-outline" />
            Clone Repository...
          </button>
          <button class="dropdown-item" @click="handleOpenInTerminal">
            <Icon name="mdi:console" />
            Open in Terminal
          </button>
        </div>
      </div>
    </Transition>

    <!-- Commit interface -->
    <div class="commit-section" v-if="hasChanges">
      <div class="commit-input-wrapper">
        <input
          v-model="commitMessage"
          @keydown.enter.meta="handleCommit"
          @keydown.enter.ctrl="handleCommit"
          placeholder="Commit message (Cmd/Ctrl+Enter)"
          class="commit-input"
        />
        <button 
          class="commit-btn"
          @click="handleCommit"
          :disabled="!commitMessage || isCommitting"
        >
          <Icon v-if="isCommitting" name="mdi:loading" class="animate-spin" />
          <Icon v-else name="mdi:check" />
        </button>
      </div>
      <div class="commit-actions">
        <button class="text-btn" @click="commitAndPush">
          <Icon name="mdi:arrow-up" />
          Commit & Push
        </button>
        <button class="text-btn" @click="stashChanges">
          <Icon name="mdi:package-down" />
          Stash
        </button>
      </div>
    </div>

    <!-- Changes list -->
    <div class="changes-container" v-if="!isLoading">
      <!-- Staged Changes -->
      <div class="changes-section" v-if="stagedFiles.length > 0">
        <div class="section-header" @click="toggleSection('staged')">
          <Icon 
            :name="expandedSections.staged ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
            class="expand-icon"
          />
          <span class="section-title">Staged Changes</span>
          <span class="file-count">{{ stagedFiles.length }}</span>
          <button 
            class="icon-btn small"
            @click.stop="unstageAll"
            title="Unstage All"
          >
            <Icon name="mdi:minus" />
          </button>
        </div>
        <div v-show="expandedSections.staged" class="file-list">
          <FileItem
            v-for="file in stagedFiles"
            :key="file.path"
            :file="file"
            :staged="true"
            @click="showDiff(file)"
            @unstage="unstageFile(file)"
          />
        </div>
      </div>

      <!-- Changes -->
      <div class="changes-section" v-if="modifiedFiles.length > 0">
        <div class="section-header" @click="toggleSection('changes')">
          <Icon 
            :name="expandedSections.changes ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
            class="expand-icon"
          />
          <span class="section-title">Changes</span>
          <span class="file-count">{{ modifiedFiles.length }}</span>
          <button 
            class="icon-btn small"
            @click.stop="stageAll"
            title="Stage All"
          >
            <Icon name="mdi:plus" />
          </button>
        </div>
        <div v-show="expandedSections.changes" class="file-list">
          <FileItem
            v-for="file in modifiedFiles"
            :key="file.path"
            :file="file"
            :staged="false"
            @click="showDiff(file)"
            @stage="stageFile(file)"
            @discard="discardChanges(file)"
          />
        </div>
      </div>

      <!-- Untracked files -->
      <div class="changes-section" v-if="untrackedFiles.length > 0">
        <div class="section-header" @click="toggleSection('untracked')">
          <Icon 
            :name="expandedSections.untracked ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
            class="expand-icon"
          />
          <span class="section-title">Untracked Files</span>
          <span class="file-count">{{ untrackedFiles.length }}</span>
          <button 
            class="icon-btn small"
            @click.stop="stageAll"
            title="Stage All"
          >
            <Icon name="mdi:plus" />
          </button>
        </div>
        <div v-show="expandedSections.untracked" class="file-list">
          <FileItem
            v-for="file in untrackedFiles"
            :key="file.path"
            :file="file"
            :staged="false"
            @click="showDiff(file)"
            @stage="stageFile(file)"
          />
        </div>
      </div>

      <!-- No changes message -->
      <div v-if="!hasChanges" class="no-changes">
        <Icon name="mdi:check-circle" class="no-changes-icon" />
        <p>No changes in working directory</p>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading changes...</p>
    </div>

    <!-- Snapshots timeline -->
    <!-- Temporarily commented out - snapshots now have their own tab
    <div class="snapshots-section" v-if="recentSnapshots.length > 0">
      <div class="section-header" @click="toggleSection('snapshots')">
        <Icon 
          :name="expandedSections.snapshots ? 'mdi:chevron-down' : 'mdi:chevron-right'" 
          class="expand-icon"
        />
        <span class="section-title">Recent Snapshots</span>
        <span class="file-count">{{ recentSnapshots.length }}</span>
      </div>
      <div v-show="expandedSections.snapshots" class="snapshot-list">
        <EnhancedSnapshotItem
          v-for="snapshot in recentSnapshots"
          :key="snapshot.id"
          :snapshot="snapshot"
          @restore="restoreSnapshot(snapshot)"
          @delete="deleteSnapshot(snapshot)"
          @view-changes="viewSnapshotChanges(snapshot)"
          @selective-restore="showSelectiveRestore(snapshot)"
          @cherry-pick="showCherryPick(snapshot)"
        />
      </div>
    </div>
    -->

    <!-- Workspace/Worktree Switcher Modal -->
    <WorkspaceSwitcher
      v-model="showWorkspaceSwitcher"
      :current-workspace="currentWorkspace"
      @switch="switchWorkspace"
      @create="createWorktree"
    />

    <!-- Diff Viewer Modal -->
    <DiffViewer
      v-model="showDiffViewer"
      :file="selectedFile"
      @save="saveDiffChanges"
    />

    <!-- Selective Restore Modal -->
    <SelectiveRestoreModal
      v-model="showSelectiveRestoreModal"
      :snapshot="selectedSnapshotForRestore"
      @restore-complete="handleSelectiveRestoreComplete"
    />

    <!-- Cherry Pick Modal -->
    <CherryPickModal
      v-model="showCherryPickModal"
      :source-snapshot="selectedSnapshotForCherryPick"
      @cherry-pick-complete="handleCherryPickComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useSourceControlStore } from '~/stores/source-control';
import { useSnapshotsStore } from '~/stores/snapshots';
import { useWorkspaceStore } from '~/stores/workspace';
import { useWorkspaceManager } from '~/composables/useWorkspaceManager';
import { useDialogs } from '~/composables/useDialogs';
import FileItem from './FileItem.vue';
import EnhancedSnapshotItem from './EnhancedSnapshotItem.vue';
import WorkspaceSwitcher from './WorkspaceSwitcher.vue';
import DiffViewer from './DiffViewer.vue';
import SelectiveRestoreModal from '../Snapshots/SelectiveRestoreModal.vue';
import CherryPickModal from '../Snapshots/CherryPickModal.vue';
import { vClickOutside } from '~/directives/clickOutside';

const sourceControl = useSourceControlStore();
const snapshots = useSnapshotsStore();
const workspace = useWorkspaceStore();
const workspaceManager = useWorkspaceManager();

// State
const isCommitting = ref(false);
const showWorkspaceSwitcher = ref(false);
const showDiffViewer = ref(false);
const selectedFile = ref(null);
const showMenu = ref(false);
const showSelectiveRestoreModal = ref(false);
const selectedSnapshotForRestore = ref(null);
const showCherryPickModal = ref(false);
const selectedSnapshotForCherryPick = ref(null);
const expandedSections = ref({
  staged: true,
  changes: true,
  untracked: true,
  snapshots: false
});

// Computed
const workspaceName = computed(() => workspace.workspaceName || 'No workspace');
const currentBranch = computed(() => sourceControl.currentBranch || 'No branch');
const currentWorkspace = computed(() => workspace.currentPath);
const isLoading = computed(() => sourceControl.isLoading);
const hasChanges = computed(() => 
  sourceControl.stagedFiles.length > 0 || 
  sourceControl.modifiedFiles.length > 0 ||
  sourceControl.untrackedFiles.length > 0
);

const branchStatus = computed(() => {
  const { ahead, behind } = sourceControl.branchStatus || {};
  if (ahead && behind) return `↑${ahead} ↓${behind}`;
  if (ahead) return `↑${ahead}`;
  if (behind) return `↓${behind}`;
  return '';
});

const stagedFiles = computed(() => sourceControl.stagedFiles);
const modifiedFiles = computed(() => sourceControl.modifiedFiles);
const untrackedFiles = computed(() => sourceControl.untrackedFiles);
const recentSnapshots = computed(() => snapshots.recentSnapshots.slice(0, 5));
const commitMessage = computed({
  get: () => sourceControl.commitMessage,
  set: (value) => sourceControl.commitMessage = value
});

// Methods
function toggleSection(section: string) {
  expandedSections.value[section] = !expandedSections.value[section];
}

async function refresh() {
  await sourceControl.refreshStatus();
  await sourceControl.refreshBranches();
  await sourceControl.refreshHistory();
}


async function handleCommit() {
  if (!commitMessage.value || isCommitting.value) return;
  
  isCommitting.value = true;
  try {
    await sourceControl.commit();
  } finally {
    isCommitting.value = false;
  }
}

async function commitAndPush() {
  await handleCommit();
  await sourceControl.push();
}

async function stageFile(file: any) {
  await sourceControl.stageFile(file.path);
}

async function unstageFile(file: any) {
  await sourceControl.unstageFile(file.path);
}

async function stageAll() {
  await sourceControl.stageAll();
}

async function unstageAll() {
  await sourceControl.unstageAll();
}

async function discardChanges(file: any) {
  const dialogs = useDialogs();
  const confirmed = await dialogs.confirm(`Discard changes to ${file.path}?`, 'Discard Changes');
  if (confirmed) {
    await sourceControl.discardChanges([file.path]);
  }
}

async function stashChanges() {
  const dialogs = useDialogs();
  const message = await dialogs.prompt({
    message: 'Stash message (optional):',
    placeholder: 'Enter stash description'
  });
  if (message !== null) {
    await sourceControl.stash(message);
  }
}

async function showDiff(file: any) {
  // Get the file content for diff viewer
  try {
    const filePath = workspace.currentPath ? `${workspace.currentPath}/${file.path}` : file.path;
    const readResult = await window.electronAPI.fs.readFile(filePath);
    
    // Handle the result from fs.readFile which returns { success: boolean, content: string }
    let currentContent = '';
    if (readResult.success && readResult.content) {
      currentContent = readResult.content;
    } else {
      throw new Error(readResult.error || 'Failed to read file');
    }
    
    // Get the original content from HEAD
    let originalContent = '';
    if (file.status !== 'untracked' && file.status !== 'added') {
      const result = await window.electronAPI.git.getFileAtHead(file.path);
      if (result.success && result.data) {
        originalContent = result.data;
      }
    }
    
    selectedFile.value = {
      ...file,
      currentContent,
      originalContent,
      size: currentContent.length
    };
    showDiffViewer.value = true;
  } catch (error) {
    console.error('Failed to load file for diff:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to load file for diff viewer', 'Error');
  }
}

async function saveDiffChanges(content: string) {
  if (selectedFile.value) {
    const filePath = workspace.currentPath ? `${workspace.currentPath}/${selectedFile.value.path}` : selectedFile.value.path;
    await window.electronAPI.fs.writeFile(filePath, content);
    await refresh();
  }
}

async function createSnapshot() {
  const dialogs = useDialogs();
  const message = await dialogs.prompt({
    title: 'Create Snapshot',
    message: 'Enter a description for this snapshot:',
    placeholder: 'Snapshot description'
  });
  if (message) {
    await snapshots.captureSnapshot(message, 'manual');
  }
}

async function restoreSnapshot(snapshot: any) {
  const dialogs = useDialogs();
  const confirmed = await dialogs.confirm(`Restore snapshot "${snapshot.message}"?`, 'Restore Snapshot');
  if (confirmed) {
    await snapshots.restoreSnapshot(snapshot.id);
  }
}

async function deleteSnapshot(snapshot: any) {
  const dialogs = useDialogs();
  const confirmed = await dialogs.confirm(`Delete snapshot "${snapshot.name}"?`, 'Delete Snapshot');
  if (confirmed) {
    await snapshots.deleteSnapshot(snapshot.id);
  }
}

async function viewSnapshotChanges(snapshot: any) {
  // Show detailed file changes in a modal or expand view

  
  if (snapshot.fileChanges) {
    const totalChanges = snapshot.fileChanges.summary.filesChanged;
  
  
  
  
  } else {
  
  }
}

function showSelectiveRestore(snapshot: any) {
  selectedSnapshotForRestore.value = snapshot;
  showSelectiveRestoreModal.value = true;
}

async function handleSelectiveRestoreComplete() {
  // Refresh the source control view after selective restore
  await refresh();

}

function showCherryPick(snapshot: any) {
  selectedSnapshotForCherryPick.value = snapshot;
  showCherryPickModal.value = true;
}

async function handleCherryPickComplete() {
  // Refresh the source control view after cherry-pick
  await refresh();

}

async function switchWorkspace(path: string) {
  try {
    // Switch to the worktree
    const result = await window.electronAPI.worktree.switch(path);
    
    if (result.success) {
      // Use workspace manager to change workspace
      const { useWorkspaceManager } = await import('~/composables/useWorkspaceManager');
      const workspaceManager = useWorkspaceManager();
      await workspaceManager.changeWorkspace(path);
      
      // Reinitialize source control for the new workspace
      await sourceControl.initialize(path);
      
      // Refresh everything
      await refresh();
    } else {
      console.error('Failed to switch workspace:', result.error);
      const dialogs = useDialogs();
      await dialogs.error(`Failed to switch workspace: ${result.error}`, 'Error');
    }
  } catch (error) {
    console.error('Error switching workspace:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to switch workspace', 'Error');
  }
}

async function createWorktree(data: {
  branchName: string;
  sessionName: string;
  startPoint: string;
  checkout: boolean;
}) {
  try {
    // Create the worktree
    const result = await window.electronAPI.worktree.create(
      data.branchName,
      data.sessionName,
      data.sessionName // Use session name as description
    );
    
    if (result.success) {
      // Create a snapshot for the new worktree branch
      await snapshots.captureSnapshot(
        `New worktree: ${data.branchName}`,
        'auto-branch'
      );
      
      // If checkout is requested, switch to the new worktree
      if (data.checkout && result.worktree) {
        await switchWorkspace(result.worktree.path);
      }
      
      // Refresh the source control status
      await refresh();
    } else {
      console.error('Failed to create worktree:', result.error);
      const dialogs = useDialogs();
      await dialogs.error(`Failed to create worktree: ${result.error}`, 'Error');
    }
  } catch (error) {
    console.error('Error creating worktree:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to create worktree', 'Error');
  }
}

// Branch operations handlers
async function handleCreateBranch() {
  showMenu.value = false;
  const dialogs = useDialogs();
  const branchName = await dialogs.prompt({
    title: 'Create Branch',
    message: 'Enter new branch name:',
    placeholder: 'feature/my-new-branch'
  });
  if (branchName) {
    try {
      await sourceControl.createBranch(branchName);
      await refresh();
    } catch (error) {
      console.error('Failed to create branch:', error);
      await dialogs.error('Failed to create branch', 'Error');
    }
  }
}

async function handleSwitchBranch() {
  showMenu.value = false;
  const dialogs = useDialogs();
  const branches = sourceControl.branches;
  if (branches.length === 0) {
    await dialogs.alert('No branches available');
    return;
  }
  
  const branchNames = branches.map(b => b.name).join(', ');
  const branchName = await dialogs.prompt({
    title: 'Switch Branch',
    message: `Available branches: ${branchNames}`,
    placeholder: 'Enter branch name'
  });
  if (branchName) {
    try {
      await sourceControl.switchBranch(branchName);
      await refresh();
    } catch (error) {
      console.error('Failed to switch branch:', error);
      await dialogs.error('Failed to switch branch', 'Error');
    }
  }
}

async function handleMergeBranch() {
  showMenu.value = false;
  const dialogs = useDialogs();
  await dialogs.info('Merge branch functionality coming soon!', 'Coming Soon');
}

async function handlePull() {
  showMenu.value = false;
  try {
    await sourceControl.pull();
    await refresh();
  } catch (error) {
    console.error('Failed to pull:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to pull from remote', 'Error');
  }
}

async function handlePush() {
  showMenu.value = false;
  try {
    await sourceControl.push();
  } catch (error) {
    console.error('Failed to push:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to push to remote', 'Error');
  }
}

async function handleFetch() {
  showMenu.value = false;
  try {
    await sourceControl.fetch();
  } catch (error) {
    console.error('Failed to fetch:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to fetch from remote', 'Error');
  }
}

async function handleStashWithMessage() {
  showMenu.value = false;
  const dialogs = useDialogs();
  const message = await dialogs.prompt({
    title: 'Stash Changes',
    message: 'Stash message (optional):',
    placeholder: 'Enter stash description'
  });
  if (message !== null) {
    await sourceControl.stash(message);
  }
}

async function handlePopStash() {
  showMenu.value = false;
  try {
    await sourceControl.popStash();
    await refresh();
  } catch (error) {
    console.error('Failed to pop stash:', error);
    const dialogs = useDialogs();
    await dialogs.error('Failed to pop stash', 'Error');
  }
}

async function handleViewStashes() {
  showMenu.value = false;
  const dialogs = useDialogs();
  await dialogs.info('View stashes functionality coming soon!', 'Coming Soon');
}

async function handleInitRepo() {
  showMenu.value = false;
  const dialogs = useDialogs();
  const confirmed = await dialogs.confirm('Initialize a new Git repository in this folder?', 'Initialize Repository');
  if (confirmed) {
    try {
      await sourceControl.initializeRepo();
      await refresh();
    } catch (error) {
      console.error('Failed to initialize repository:', error);
      await dialogs.error('Failed to initialize repository', 'Error');
    }
  }
}

async function handleCloneRepo() {
  showMenu.value = false;
  const dialogs = useDialogs();
  await dialogs.info('Clone repository functionality coming soon!', 'Coming Soon');
}

async function handleOpenInTerminal() {
  showMenu.value = false;
  window.dispatchEvent(new CustomEvent('switch-bottom-tab', { detail: { tab: 'terminal' } }));
}

// Watch for workspace changes
watch(() => workspace.currentPath, async (newPath) => {
  if (newPath) {
    // Use active worktree path if available, otherwise use workspace path
    const pathToUse = workspaceManager.activeWorktreePath.value || newPath;
    await sourceControl.initialize(pathToUse);
  }
});

// Watch for worktree changes
watch(() => workspaceManager.activeWorktreePath.value, async (newWorktreePath) => {
  if (newWorktreePath) {
    await sourceControl.initialize(newWorktreePath);
    // Reload snapshots for the new branch
    await snapshots.loadSnapshots(false);
  }
});

// Watch for branch changes
watch(() => sourceControl.currentBranch, async (newBranch, oldBranch) => {
  if (newBranch && newBranch !== oldBranch) {
    // Reload snapshots for the new branch
    await snapshots.loadSnapshots(false);
  }
});

// Initialize
onMounted(async () => {
  // Use active worktree path if available, otherwise use workspace path
  const pathToUse = workspaceManager.activeWorktreePath.value || workspace.currentPath;
  if (pathToUse) {
    await sourceControl.initialize(pathToUse);
  }
});
</script>

<style scoped>
.source-control-v2 {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  font-size: 13px;
  position: relative;
}

/* Header */
.sc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  position: relative;
}

.workspace-info {
  flex: 1;
  min-width: 0;
}

.workspace-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.workspace-selector:hover {
  background: #2a2d2e;
}

.workspace-icon {
  width: 18px;
  height: 18px;
  opacity: 0.8;
}

.workspace-details {
  flex: 1;
  min-width: 0;
}

.workspace-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #8b8b8b;
  margin-top: 2px;
}

.branch-info svg {
  width: 12px;
  height: 12px;
}

.branch-status {
  margin-left: 4px;
  color: #569cd6;
}

.dropdown-icon {
  width: 16px;
  height: 16px;
  opacity: 0.6;
}

.header-actions {
  display: flex;
  gap: 4px;
}

/* Buttons */
.icon-btn {
  width: 28px;
  height: 28px;
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

.icon-btn:hover:not(:disabled) {
  background: #2a2d2e;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.icon-btn.small {
  width: 20px;
  height: 20px;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.text-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: none;
  border: none;
  color: #cccccc;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.text-btn:hover {
  background: #2a2d2e;
}

.text-btn svg {
  width: 14px;
  height: 14px;
}

/* Commit Section */
.commit-section {
  padding: 12px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
}

.commit-input-wrapper {
  display: flex;
  gap: 8px;
}

.commit-input {
  flex: 1;
  height: 32px;
  padding: 0 12px;
  background: #3c3c3c;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
}

.commit-input:focus {
  border-color: #007acc;
  background: #2d2d30;
}

.commit-input::placeholder {
  color: #6b6b6b;
}

.commit-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.commit-btn:hover:not(:disabled) {
  background: #1177bb;
}

.commit-btn:disabled {
  background: #3e3e42;
  cursor: default;
}

.commit-btn svg {
  width: 16px;
  height: 16px;
}

.commit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* Changes Container */
.changes-container {
  flex: 1;
  overflow-y: auto;
}

.changes-section {
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
  margin-right: 8px;
}

.file-list {
  padding: 0;
}

/* Loading & Empty States */
.loading-state,
.no-changes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: #8b8b8b;
}

.no-changes-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}

.loading-state svg {
  width: 32px;
  height: 32px;
  margin-bottom: 12px;
}

/* Snapshots Section */
.snapshots-section {
  border-top: 1px solid #3e3e42;
  margin-top: auto;
}

.snapshot-list {
  max-height: 200px;
  overflow-y: auto;
}

/* Animations */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Dropdown Menu */
.dropdown-menu {
  position: absolute;
  top: 56px;
  right: 12px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 240px;
  max-width: 300px;
  overflow: hidden;
}

.dropdown-section {
  padding: 4px 0;
}

.dropdown-section + .dropdown-section {
  border-top: 1px solid #3e3e42;
}

.dropdown-header {
  padding: 6px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #8b8b8b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  color: #cccccc;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.dropdown-item:hover {
  background: #094771;
  color: white;
}

.dropdown-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.dropdown-divider {
  height: 1px;
  background: #3e3e42;
  margin: 4px 0;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>