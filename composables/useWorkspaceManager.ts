import { ref, computed } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useTasksStore } from '~/stores/tasks';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useSourceControlStore } from '~/stores/source-control';

const currentWorkspacePath = ref<string>('');
const isChangingWorkspace = ref(false);

// NEW: Worktree management within workspace
const activeWorktreePath = ref<string>('');
const activeWorktrees = ref<Map<string, WorktreeSession>>(new Map());

interface WorktreeSession {
  path: string;
  branch: string;
  isMainWorktree: boolean;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  // Saved state for this worktree
  savedState?: {
    editorTabs: any[];
    activeTabId: string | null;
    claudeMessages: any[];
    terminalSessions: any[];
  };
}

export function useWorkspaceManager() {
  const editorStore = useEditorStore();
  const chatStore = useChatStore();
  const tasksStore = useTasksStore();
  const claudeInstancesStore = useClaudeInstancesStore();

  const workspaceName = computed(() => {
    if (!currentWorkspacePath.value) return '';
    return currentWorkspacePath.value.split('/').pop() || 'Workspace';
  });

  const hasWorkspace = computed(() => !!currentWorkspacePath.value);

  const loadWorkspaceFromStorage = async () => {
    try {
      const savedPath = await window.electronAPI.store.get('workspacePath');
      if (savedPath && typeof savedPath === 'string') {
        currentWorkspacePath.value = savedPath;
        return savedPath;
      }
    } catch (error) {
      console.error('Failed to load workspace from storage:', error);
    }
    return null;
  };

  const changeWorkspace = async (path: string) => {
    if (isChangingWorkspace.value) return;
    
    isChangingWorkspace.value = true;
    
    try {
      // Stop watching the old workspace
      if (currentWorkspacePath.value) {
        await window.electronAPI.fs.unwatchDirectory(currentWorkspacePath.value);
        
        // Save current workspace configuration before switching
        await claudeInstancesStore.saveWorkspaceConfiguration(currentWorkspacePath.value);
      }
      
      // 1. Close all editor tabs and reset terminals to avoid confusion
      editorStore.closeAllTabs();
      
      // 2. Stop and clear Claude terminal for clean slate
      await chatStore.stopClaude();
      chatStore.clearMessages();
      
      // 3. Clear all Claude instances from current workspace
      await claudeInstancesStore.clearAllInstances();
      
      // 4. Update workspace path
      currentWorkspacePath.value = path;
      
      // 5. Start watching the new workspace
      await window.electronAPI.fs.watchDirectory(path);
      
      // 6. Update chat store with new workspace path
      await chatStore.updateWorkingDirectory(path);
      
      // 7. Load workspace-specific Claude instances configuration
      await claudeInstancesStore.loadWorkspaceConfiguration(path);
      
      // 8. Set project path FIRST, then load existing tasks (don't clear until after loading)
      tasksStore.setProjectPath(path);
      
      // 8.5. Initialize context store with persisted data
      const { useContextStore } = await import('~/stores/context');
      const contextStore = useContextStore();
      await contextStore.loadPersistedCheckpoints();
      
      
      // 9. Try to load existing TASKS.md from the new workspace
      const tasksPath = `${path}/TASKS.md`;
      const tasksResult = await window.electronAPI.fs.readFile(tasksPath);
      
      if (tasksResult.success) {
        // TASKS.md exists - load it WITHOUT clearing first
        
        await tasksStore.loadTasksFromProject();
      } else {
        // No TASKS.md exists - NOW we can safely clear and create new
        
        tasksStore.clearAll();
        await tasksStore.updateTasksMarkdown();
      }
      
      // Store the workspace path
      await window.electronAPI.store.set('workspacePath', path);
      
      // Update recent workspaces if this is not the default workspace
      const defaultPath = await window.electronAPI.store.get('workspace.lastPath');
      if (path !== defaultPath) {
        await updateRecentWorkspaces(path);
      }
      
      // Initialize source control to detect if it's a git repository
      const sourceControlStore = useSourceControlStore();
      
      await sourceControlStore.initialize(path);
      
      // Small delay to ensure source control is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // NEW: Initialize worktrees for this workspace
      await initializeWorktrees();
      
      // Load MCP servers for the workspace
      const { useMCPStore } = await import('~/stores/mcp');
      const mcpStore = useMCPStore();
      await mcpStore.loadServers();
      
      
      
      
    } catch (error) {
      console.error('Failed to change workspace:', error);
      throw error;
    } finally {
      isChangingWorkspace.value = false;
    }
  };

  const updateRecentWorkspaces = async (workspace: string) => {
    interface RecentWorkspace {
      path: string;
      lastAccessed: string;
    }
    
    // Get current recent workspaces
    let recent: RecentWorkspace[] = await window.electronAPI.store.get('workspace.recent') || [];
    
    // Remove this workspace if it already exists
    recent = recent.filter((w: RecentWorkspace) => w.path !== workspace);
    
    // Add to the beginning
    recent.unshift({
      path: workspace,
      lastAccessed: new Date().toISOString()
    });
    
    // Keep only the last 5
    recent = recent.slice(0, 5);
    
    // Save back
    await window.electronAPI.store.set('workspace.recent', recent);
  };

  const selectWorkspace = async () => {
    try {
      const result = await window.electronAPI.dialog.selectFolder();
      
      if (!result.success || result.canceled) {
        return false;
      }
      
      const path = result.path;
      if (!path) return false;
      
      await changeWorkspace(path);
      return true;
    } catch (error) {
      console.error('Failed to select workspace:', error);
      throw error;
    }
  };

  // NEW: Save worktree state before switching
  const saveWorktreeState = async (worktreePath: string) => {
    const session = activeWorktrees.value.get(worktreePath);
    if (!session) return;
    
    // Save current editor state
    const editorTabs = editorStore.tabs.map(tab => ({
      id: tab.id,
      path: tab.path,
      name: tab.name,
      isDirty: tab.isDirty
    }));
    
    // Save Claude messages
    const claudeMessages = chatStore.messages.slice(); // Copy array
    
    session.savedState = {
      editorTabs,
      activeTabId: editorStore.activeTab?.id || null,
      claudeMessages,
      terminalSessions: [] // TODO: Implement terminal session saving
    };
  };

  // NEW: Restore worktree state after switching
  const restoreWorktreeState = async (worktreePath: string) => {
    const session = activeWorktrees.value.get(worktreePath);
    if (!session?.savedState) return;
    
    const { editorTabs, activeTabId, claudeMessages } = session.savedState;
    
    // Restore editor tabs
    editorStore.closeAllTabs();
    for (const tab of editorTabs) {
      await editorStore.openFile(tab.path);
    }
    
    // Restore active tab
    if (activeTabId) {
      const tab = editorStore.tabs.find(t => t.id === activeTabId);
      if (tab) editorStore.setActiveTab(tab.id);
    }
    
    // Restore Claude messages
    chatStore.clearMessages();
    if (claudeMessages && claudeMessages.length > 0) {
      chatStore.messages = claudeMessages;
    }
  };

  // NEW: Switch worktree within the same workspace
  const switchWorktreeWithinWorkspace = async (worktreePath: string) => {
    
    
    // Save current worktree state if we have one
    if (activeWorktreePath.value && activeWorktreePath.value !== worktreePath) {
      await saveWorktreeState(activeWorktreePath.value);
    }
    
    // Update active worktree path
    activeWorktreePath.value = worktreePath;
    
    // Update the backend's active worktree path
    await window.electronAPI.workspace.setPath(worktreePath);
    
    // Stop watching the old worktree directory
    if (currentWorkspacePath.value && currentWorkspacePath.value !== worktreePath) {
      await window.electronAPI.fs.unwatchDirectory(currentWorkspacePath.value);
    }
    
    // Start watching the new worktree directory
    await window.electronAPI.fs.watchDirectory(worktreePath);
    
    // Update chat working directory
    await chatStore.updateWorkingDirectory(worktreePath);
    
    // Update tasks path to the worktree
    tasksStore.setProjectPath(worktreePath);
    
    // Refresh source control to get the correct branch for the worktree
    const sourceControlStore = useSourceControlStore();
    await sourceControlStore.refreshStatus();
    
    // Restore worktree state if exists
    await restoreWorktreeState(worktreePath);
    
    // Load tasks from worktree
    const tasksPath = `${worktreePath}/TASKS.md`;
    const tasksResult = await window.electronAPI.fs.readFile(tasksPath);
    
    if (tasksResult.success) {
      await tasksStore.loadTasksFromProject();
    } else {
      tasksStore.clearAll();
      await tasksStore.updateTasksMarkdown();
    }
    
    // Update source control to use worktree path
    await sourceControlStore.initialize(worktreePath);
    
    // Reload MCP servers for the worktree context
    const { useMCPStore } = await import('~/stores/mcp');
    const mcpStore = useMCPStore();
    await mcpStore.loadServers();
    
    
    
  };

  // NEW: Initialize worktrees for the workspace
  const initializeWorktrees = async () => {
    if (!currentWorkspacePath.value) return;
    
    
    
    // Clear existing worktrees first
    activeWorktrees.value.clear();
    activeWorktreePath.value = null;
    
    // Get list of worktrees
    const result = await window.electronAPI.worktree.list();
    if (!result.success || !result.worktrees) {
      // Check if it's because this is not a git repository
      if (result.error && (result.error.includes('not a git repository') || result.error.includes('Not a git repository'))) {
        
        // Set the main workspace path as the active worktree for non-git repos
        activeWorktreePath.value = currentWorkspacePath.value;
        return;
      }
      console.warn('[WorkspaceManager] Failed to list worktrees:', result.error);
      return;
    }
    
    // Already cleared above
    
    // Add main repository as a worktree
    // Get the current branch for main repo
    let mainBranch = 'main';
    try {
      const branchResult = await window.electronAPI.git.getCurrentBranch();
      if (branchResult.success && branchResult.data) {
        mainBranch = branchResult.data;
      }
    } catch (error) {
      console.warn('Failed to get current branch:', error);
    }
    
    const mainWorktree: WorktreeSession = {
      path: currentWorkspacePath.value,
      branch: mainBranch,
      isMainWorktree: true,
      hasChanges: false,
      ahead: 0,
      behind: 0
    };
    activeWorktrees.value.set(currentWorkspacePath.value, mainWorktree);
    
    // Add other worktrees
    for (const worktree of result.worktrees) {
      const session: WorktreeSession = {
        path: worktree.path,
        branch: worktree.branch,
        isMainWorktree: false,
        hasChanges: false, // TODO: Get from git status
        ahead: 0,
        behind: 0
      };
      activeWorktrees.value.set(worktree.path, session);
    }
    
    // Set active worktree if not set
    if (!activeWorktreePath.value) {
      activeWorktreePath.value = currentWorkspacePath.value;
      // Update the backend's active worktree path
      await window.electronAPI.workspace.setPath(activeWorktreePath.value);
    }
    
    // Refresh git status for all worktrees
    await refreshWorktreeStatus();
  };

  // NEW: Create a new worktree
  const createWorktree = async (branchName: string, sessionName?: string, description?: string) => {
    // Always create with a session - use branch name if no session name provided
    const finalSessionName = sessionName || branchName;
    const result = await window.electronAPI.worktree.create(branchName, finalSessionName, description);
    if (result.success) {
      await initializeWorktrees();
      return result.worktree;
    }
    throw new Error(result.error || 'Failed to create worktree');
  };
  
  // NEW: Refresh git status for all worktrees
  const refreshWorktreeStatus = async () => {
    for (const [path, session] of activeWorktrees.value) {
      try {
        // Temporarily set the git path to this worktree
        await window.electronAPI.workspace.setPath(path);
        
        // Get git status
        const statusResult = await window.electronAPI.git.status();
        if (statusResult.success && statusResult.data) {
          const status = statusResult.data;
          session.hasChanges = (status.modified?.length || 0) + 
                              (status.staged?.length || 0) + 
                              (status.untracked?.length || 0) > 0;
          session.ahead = status.ahead || 0;
          session.behind = status.behind || 0;
        }
      } catch (error) {
        console.warn(`Failed to get status for worktree ${path}:`, error);
      }
    }
    
    // Restore the active worktree path
    if (activeWorktreePath.value) {
      await window.electronAPI.workspace.setPath(activeWorktreePath.value);
    }
  };

  return {
    currentWorkspacePath: computed(() => currentWorkspacePath.value),
    workspaceName,
    hasWorkspace,
    isChangingWorkspace: computed(() => isChangingWorkspace.value),
    loadWorkspaceFromStorage,
    changeWorkspace,
    selectWorkspace,
    // NEW: Worktree management
    activeWorktreePath: computed(() => activeWorktreePath.value),
    activeWorktrees: computed(() => activeWorktrees.value),
    switchWorktreeWithinWorkspace,
    initializeWorktrees,
    createWorktree,
    refreshWorktreeStatus,
    hasMultipleWorktrees: computed(() => activeWorktrees.value.size > 1)
  };
}

// Export the reactive state for global access
export const workspaceState = {
  currentWorkspacePath: computed(() => currentWorkspacePath.value),
  workspaceName: computed(() => {
    if (!currentWorkspacePath.value) return '';
    return currentWorkspacePath.value.split('/').pop() || 'Workspace';
  }),
  hasWorkspace: computed(() => !!currentWorkspacePath.value)
};