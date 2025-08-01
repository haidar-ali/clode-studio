import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface GitFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
  oldPath?: string; // For renamed files
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  label?: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export const useSourceControlStore = defineStore('source-control', () => {
  // State
  const initialized = ref(false);
  const isGitRepository = ref(false);
  const currentBranch = ref('');
  const branches = ref<BranchInfo[]>([]);
  const remotes = ref<RemoteInfo[]>([]);
  
  // File states
  const stagedFiles = ref<GitFile[]>([]);
  const modifiedFiles = ref<GitFile[]>([]);
  const untrackedFiles = ref<GitFile[]>([]);
  const deletedFiles = ref<GitFile[]>([]);
  const renamedFiles = ref<GitFile[]>([]);
  
  // Commit info
  const ahead = ref(0);
  const behind = ref(0);
  const tracking = ref<string | null>(null);
  const lastCommit = ref<GitCommit | null>(null);
  const commitHistory = ref<GitCommit[]>([]);
  
  // UI state
  const isLoading = ref(false);
  const commitMessage = ref('');
  const selectedFiles = ref<string[]>([]);
  const showDiffFor = ref<string | null>(null);
  const lastError = ref<string | null>(null);
  
  // Computed
  const hasChanges = computed(() => 
    stagedFiles.value.length > 0 || 
    modifiedFiles.value.length > 0 || 
    untrackedFiles.value.length > 0 ||
    deletedFiles.value.length > 0 ||
    renamedFiles.value.length > 0
  );
  
  const canCommit = computed(() => 
    stagedFiles.value.length > 0 && 
    commitMessage.value.trim().length > 0
  );
  
  const totalChanges = computed(() => 
    modifiedFiles.value.length + 
    untrackedFiles.value.length + 
    deletedFiles.value.length + 
    renamedFiles.value.length
  );
  
  const allFiles = computed(() => {
    const files: GitFile[] = [];
    
    // Add staged files
    files.push(...stagedFiles.value);
    
    // Add unstaged files
    files.push(...modifiedFiles.value);
    files.push(...untrackedFiles.value);
    files.push(...deletedFiles.value);
    files.push(...renamedFiles.value);
    
    return files;
  });
  
  const branchStatus = computed(() => ({
    ahead: ahead.value,
    behind: behind.value
  }));
  
  // Actions
  async function initialize(repoPath: string) {
    isLoading.value = true;
    lastError.value = null;
    
    
    
    try {
      // Set workspace path first
      await window.electronAPI.workspace.setPath(repoPath);
      
      // Check if it's a git repository
      const repoCheck = await window.electronAPI.git.checkIsRepo();
      
      
      if (repoCheck.success && repoCheck.data) {
        isGitRepository.value = true;
        
        await refreshStatus();
        
        
        
        await refreshBranches();
        
        
        
        await refreshHistory();
        
      } else {
        isGitRepository.value = false;
        clearState();
      }
      
      initialized.value = true;
    } catch (error) {
      console.error('Failed to initialize git:', error);
      lastError.value = error instanceof Error ? error.message : 'Failed to initialize';
    } finally {
      isLoading.value = false;
    }
  }
  
  async function refreshStatus() {
    
    const result = await window.electronAPI.git.status();
    
    if (result.success && result.data) {
      updateFromStatus(result.data);
    } else if (!result.success && result.error) {
      lastError.value = result.error;
    }
  }
  
  async function refreshBranches() {
    
    const result = await window.electronAPI.git.getBranches();
    
    if (result.success && result.data) {
      branches.value = result.data;
      
    }
  }
  
  async function refreshHistory(limit: number = 20) {
    
    const result = await window.electronAPI.git.getLog(limit);
    
    if (result.success && result.data) {
      commitHistory.value = result.data;
      if (result.data.length > 0) {
        lastCommit.value = result.data[0];
      }
      
    }
  }
  
  function updateFromStatus(status: any) {
    
    try {
      
      currentBranch.value = status.current || '';
      tracking.value = status.tracking || null;
      ahead.value = status.ahead || 0;
      behind.value = status.behind || 0;
      
      
      // Clear existing files
      stagedFiles.value = [];
      modifiedFiles.value = [];
      untrackedFiles.value = [];
      deletedFiles.value = [];
      renamedFiles.value = [];
      
      
      // Process staged files
      if (status.staged && status.staged.length > 0) {
        status.staged.forEach((file: string) => {
          // Check if it's also in other arrays to determine the actual status
          if (status.modified?.includes(file)) {
            stagedFiles.value.push({ path: file, status: 'modified', staged: true });
          } else if (status.deleted?.includes(file)) {
            stagedFiles.value.push({ path: file, status: 'deleted', staged: true });
          } else {
            // Assume it's a new file
            stagedFiles.value.push({ path: file, status: 'added', staged: true });
          }
        });
      }
      
    
      
      // Process modified files (not staged)
      if (status.modified && status.modified.length > 0) {
        status.modified.forEach((file: string) => {
          if (!status.staged?.includes(file)) {
            modifiedFiles.value.push({ path: file, status: 'modified', staged: false });
          }
        });
      }
      
      
      
      // Process deleted files (not staged)
      if (status.deleted && status.deleted.length > 0) {
        status.deleted.forEach((file: string) => {
          if (!status.staged?.includes(file)) {
            deletedFiles.value.push({ path: file, status: 'deleted', staged: false });
          }
        });
      }
      
      
      
      // Process renamed files
      if (status.renamed && status.renamed.length > 0) {
        status.renamed.forEach((rename: { from: string; to: string }) => {
          const isStaged = status.staged?.includes(rename.to);
          renamedFiles.value.push({
            path: rename.to,
            oldPath: rename.from,
            status: 'renamed',
            staged: isStaged
          });
        });
      }
      
      
      
      
      // Process untracked files
      if (status.untracked && Array.isArray(status.untracked) && status.untracked.length > 0) {
        
        
        // Limit the number of untracked files to prevent UI freezing
        const MAX_UNTRACKED_FILES = 1000;
        const tooManyFiles = status.untracked.length > MAX_UNTRACKED_FILES;
        const filesToProcess = tooManyFiles ? status.untracked.slice(0, MAX_UNTRACKED_FILES) : status.untracked;
        
        if (tooManyFiles) {
          console.warn(`[SourceControl] Too many untracked files (${status.untracked.length}). Showing first ${MAX_UNTRACKED_FILES} files.`);
          // Set an error/warning message
          lastError.value = `Too many untracked files (${status.untracked.length}). Only showing first ${MAX_UNTRACKED_FILES}. Consider adding a .gitignore file.`;
        }
        
        // Filter out common ignored patterns
        const ignoredPatterns = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.nuxt/', 'coverage/'];
        
        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          
          // Skip files in commonly ignored directories
          const shouldSkip = ignoredPatterns.some(pattern => file.startsWith(pattern));
          if (shouldSkip) {
            continue;
          }
          
          untrackedFiles.value.push({ path: file, status: 'untracked', staged: false });
        }
        
        if (tooManyFiles && untrackedFiles.value.length === 0) {
          // All files were filtered out, add a placeholder
          untrackedFiles.value.push({ 
            path: `${status.untracked.length} files (mostly in ignored directories)`, 
            status: 'untracked', 
            staged: false 
          });
        }
      } else {
        
      }
      
      
    } catch (error) {
      console.error('[SourceControl] Error in updateFromStatus:', error);
      lastError.value = error instanceof Error ? error.message : 'Error updating status';
    }
  }
  
  async function stageFiles(files: string[]) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.add(files);
      if (result.success) {
        await refreshStatus();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function unstageFiles(files: string[]) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.reset(files);
      if (result.success) {
        await refreshStatus();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function stageAll() {
    const filesToStage = [
      ...modifiedFiles.value.map(f => f.path),
      ...untrackedFiles.value.map(f => f.path),
      ...deletedFiles.value.map(f => f.path),
      ...renamedFiles.value.map(f => f.path)
    ];
    
    if (filesToStage.length > 0) {
      await stageFiles(filesToStage);
    }
  }
  
  async function unstageAll() {
    const filesToUnstage = stagedFiles.value.map(f => f.path);
    if (filesToUnstage.length > 0) {
      await unstageFiles(filesToUnstage);
    }
  }
  
  // Convenience methods for single files
  async function stageFile(path: string) {
    await stageFiles([path]);
  }
  
  async function unstageFile(path: string) {
    await unstageFiles([path]);
  }
  
  async function stash(message?: string) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.stash(message);
      if (result.success) {
        await refreshStatus();
      } else {
        lastError.value = result.error || 'Failed to stash changes';
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Stash operation failed';
    } finally {
      isLoading.value = false;
    }
  }
  
  async function commit() {
    if (!canCommit.value) return;
    
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.commit(commitMessage.value);
      if (result.success) {
        commitMessage.value = '';
        await refreshStatus();
        await refreshHistory();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function push(remote?: string, branch?: string) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.push(remote, branch);
      if (result.success) {
        await refreshStatus();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function pull(remote?: string, branch?: string) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.pull(remote, branch);
      if (result.success) {
        await refreshStatus();
        await refreshHistory();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function createBranch(name: string) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.createBranch(name);
      if (result.success) {
        await refreshStatus();
        await refreshBranches();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function switchBranch(name: string) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.switchBranch(name);
      if (result.success) {
        await refreshStatus();
        await refreshHistory();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function discardChanges(files: string[]) {
    isLoading.value = true;
    lastError.value = null;
    
    try {
      const result = await window.electronAPI.git.discardChanges(files);
      if (result.success) {
        await refreshStatus();
      } else if (result.error) {
        lastError.value = result.error;
      }
    } finally {
      isLoading.value = false;
    }
  }
  
  async function getDiff(file?: string) {
    const result = await window.electronAPI.git.diff(file);
    if (result.success) {
      return result.data;
    } else if (result.error) {
      lastError.value = result.error;
      return null;
    }
  }
  
  async function getStagedDiff(file?: string) {
    const result = await window.electronAPI.git.diffStaged(file);
    if (result.success) {
      return result.data;
    } else if (result.error) {
      lastError.value = result.error;
      return null;
    }
  }
  
  function clearState() {
    currentBranch.value = '';
    branches.value = [];
    remotes.value = [];
    stagedFiles.value = [];
    modifiedFiles.value = [];
    untrackedFiles.value = [];
    deletedFiles.value = [];
    renamedFiles.value = [];
    ahead.value = 0;
    behind.value = 0;
    tracking.value = null;
    lastCommit.value = null;
    commitHistory.value = [];
    commitMessage.value = '';
    selectedFiles.value = [];
    showDiffFor.value = null;
    lastError.value = null;
  }
  
  function selectFile(path: string) {
    const index = selectedFiles.value.indexOf(path);
    if (index === -1) {
      selectedFiles.value.push(path);
    } else {
      selectedFiles.value.splice(index, 1);
    }
  }
  
  function clearSelection() {
    selectedFiles.value = [];
  }
  
  async function fetch() {
    try {
      const result = await window.electronAPI.git.fetch();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch');
      }
      // Refresh status after fetch
      await refreshStatus();
      await refreshBranches();
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
  
  async function popStash() {
    try {
      const result = await window.electronAPI.git.stashPop();
      if (!result.success) {
        throw new Error(result.error || 'Failed to pop stash');
      }
      // Refresh status after popping stash
      await refreshStatus();
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
  
  async function initializeRepo() {
    try {
      const result = await window.electronAPI.git.init();
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize repository');
      }
      // Re-initialize the store after creating repo
      await initialize(window.electronAPI.workspace.getCurrentPath());
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
  
  return {
    // State
    initialized,
    isGitRepository,
    currentBranch,
    branches,
    remotes,
    stagedFiles,
    modifiedFiles,
    untrackedFiles,
    deletedFiles,
    renamedFiles,
    ahead,
    behind,
    tracking,
    lastCommit,
    commitHistory,
    isLoading,
    commitMessage,
    selectedFiles,
    showDiffFor,
    lastError,
    
    // Computed
    hasChanges,
    canCommit,
    totalChanges,
    allFiles,
    branchStatus,
    
    // Actions
    initialize,
    refreshStatus,
    refreshBranches,
    refreshHistory,
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    stageFile,
    unstageFile,
    stash,
    commit,
    push,
    pull,
    createBranch,
    switchBranch,
    discardChanges,
    getDiff,
    getStagedDiff,
    clearState,
    selectFile,
    clearSelection,
    fetch,
    popStash,
    initializeRepo
  };
});