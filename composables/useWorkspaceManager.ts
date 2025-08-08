import { ref, computed } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useTasksStore } from '~/stores/tasks';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useTerminalInstancesStore } from '~/stores/terminal-instances';
import { useSourceControlStore } from '~/stores/source-control';
import { getServices } from '~/services';

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
  const terminalInstancesStore = useTerminalInstancesStore();

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
        
        // Sync workspace path to server for remote file access
        try {
          await $fetch('/api/workspace/set', {
            method: 'POST',
            body: { workspacePath: savedPath }
          });
          console.log('Initial workspace synced to server:', savedPath);
        } catch (error) {
          console.error('Failed to sync initial workspace to server:', error);
        }
        
        return savedPath;
      }
    } catch (error) {
      console.error('Failed to load workspace from storage:', error);
    }
    return null;
  };

  const changeWorkspace = async (path: string) => {
    if (isChangingWorkspace.value) return;
    console.log('test')
    isChangingWorkspace.value = true;
    
    try {
      // Stop watching the old workspace
      if (currentWorkspacePath.value) {
        await window.electronAPI.fs.unwatchDirectory(currentWorkspacePath.value);
        
        // Save current workspace configuration before switching
        await claudeInstancesStore.saveWorkspaceConfiguration(currentWorkspacePath.value);
        
        // Stop desktop feature sync
        // Desktop feature sync removed - now using Socket.IO for real-time sync
      }
      
      // 1. Close all editor tabs and reset terminals to avoid confusion
      editorStore.closeAllTabs();
      
      // 2. Stop and clear Claude terminal for clean slate
      await chatStore.stopClaude();
      chatStore.clearMessages();
      
      // 3. Don't clear all Claude instances - they're managed per worktree
      // Just save current configurations
      if (activeWorktreePath.value) {
        await claudeInstancesStore.saveWorkspaceConfiguration(activeWorktreePath.value);
      }
      
      // 4. Update workspace path
      currentWorkspacePath.value = path;
      
      // 4.5. Sync workspace path to server for remote file access
      try {
        await $fetch('/api/workspace/set', {
          method: 'POST',
          body: { workspacePath: path }
        });
        console.log('Workspace synced to server:', path);
      } catch (error) {
        console.error('Failed to sync workspace to server:', error);
      }
      
      // 5. Start watching the new workspace
      await window.electronAPI.fs.watchDirectory(path);
      
      // 6. Update chat store with new workspace path
      await chatStore.updateWorkingDirectory(path);
      
      // 7. Initialize source control to detect if it's a git repository
      const sourceControlStore = useSourceControlStore();
      await sourceControlStore.initialize(path);
      
      // Small delay to ensure source control is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 8. Initialize worktrees for this workspace BEFORE loading Claude instances
    
      await initializeWorktrees();
    
      
      // 9. Load workspace-specific Claude instances configuration using the activeWorktreePath
      // For non-git projects, activeWorktreePath will be set to currentWorkspacePath
      if (activeWorktreePath.value) {
      
        await claudeInstancesStore.loadWorkspaceConfiguration(activeWorktreePath.value);
        
        // Also load Terminal instances configuration
      
        await terminalInstancesStore.loadWorkspaceConfiguration(activeWorktreePath.value);
      } else {
      
      }
      
      // 10. Set project path FIRST, then load existing tasks (don't clear until after loading)
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
      
      
      // Load MCP servers for the workspace
      const { useMCPStore } = await import('~/stores/mcp');
      const mcpStore = useMCPStore();
      await mcpStore.loadServers();
      
      // Initialize autocomplete with project context
      if (window.electronAPI?.autocomplete?.initializeProject) {
      
        await window.electronAPI.autocomplete.initializeProject(path);
      }
      
      // Sync desktop features to cache for remote access
      // Desktop feature sync removed - now using Socket.IO for real-time sync
      
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
    const previousWorktreePath = activeWorktreePath.value;
    if (previousWorktreePath && previousWorktreePath !== worktreePath) {
      await saveWorktreeState(previousWorktreePath);
      // Save Claude instances configuration for old worktree
      await claudeInstancesStore.saveWorkspaceConfiguration(previousWorktreePath);
      // Save Terminal instances configuration for old worktree
      await terminalInstancesStore.saveWorkspaceConfiguration(previousWorktreePath);
    }
    
    // Update active worktree path
    activeWorktreePath.value = worktreePath;
    
    // Update the backend's active worktree path
    await window.electronAPI.workspace.setPath(worktreePath);
    
    // Stop watching the old worktree directory
    if (currentWorkspacePath.value && currentWorkspacePath.value !== worktreePath) {
      await window.electronAPI.fs.unwatchDirectory(currentWorkspacePath.value);
    }
    
    // Update current workspace path to the new worktree
    currentWorkspacePath.value = worktreePath;
    
    // Start watching the new worktree directory
    await window.electronAPI.fs.watchDirectory(worktreePath);
    
    // Don't update chat store - it's for the old single-instance approach
    // await chatStore.updateWorkingDirectory(worktreePath);
    
    // Load Claude instances configuration for new worktree
    await claudeInstancesStore.loadWorkspaceConfiguration(worktreePath);
    
    // Load Terminal instances configuration for new worktree
    await terminalInstancesStore.loadWorkspaceConfiguration(worktreePath);
    
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
    
    // Re-initialize autocomplete with new worktree context
    if (window.electronAPI?.autocomplete?.initializeProject) {
    
      await window.electronAPI.autocomplete.initializeProject(worktreePath);
    }
    
    
    
  };

  // NEW: Initialize worktrees for the workspace
  const initializeWorktrees = async () => {
    if (!currentWorkspacePath.value) return;
    
    // Save ALL Claude configurations before any changes
    await claudeInstancesStore.saveAllWorkspaceConfigurations();
    
    // Save terminal configurations for all existing worktrees
    for (const [path, _] of activeWorktrees.value) {
      await terminalInstancesStore.saveWorkspaceConfiguration(path);
    }
    
    // Clear existing worktrees first
    activeWorktrees.value.clear();
    activeWorktreePath.value = null;
    
    // Get list of worktrees
    const result = await window.electronAPI.worktree.list();
  
    
    if (!result.success || !result.worktrees) {
      // Check if it's because this is not a git repository
      if (result.error && (result.error.includes('not a git repository') || result.error.includes('Not a git repository'))) {
      
        
        // Add a worktree session for non-git projects
        const nonGitWorktree: WorktreeSession = {
          path: currentWorkspacePath.value,
          branch: 'main', // Default branch name for non-git
          isMainWorktree: true,
          hasChanges: false,
          ahead: 0,
          behind: 0
        };
        activeWorktrees.value.set(currentWorkspacePath.value, nonGitWorktree);
        
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
    // Save ALL Claude configurations before creating new worktree
    await claudeInstancesStore.saveAllWorkspaceConfigurations();
    
    // Save terminal configurations
    for (const [path, _] of activeWorktrees.value) {
      await terminalInstancesStore.saveWorkspaceConfiguration(path);
    }
    
    // Always create with a session - use branch name if no session name provided
    const finalSessionName = sessionName || branchName;
    const result = await window.electronAPI.worktree.create(branchName, finalSessionName, description);
    if (result.success && result.worktree) {
      // Just add the new worktree to the list without reinitializing
      await addWorktreeToList(result.worktree.path);
      return result.worktree;
    }
    throw new Error(result.error || 'Failed to create worktree');
  };
  
  // NEW: Add a single worktree without clearing existing ones
  const addWorktreeToList = async (worktreePath: string) => {
    const result = await window.electronAPI.worktree.list();
    if (result.success && result.worktrees) {
      const newWorktree = result.worktrees.find(w => w.path === worktreePath);
      if (newWorktree && !activeWorktrees.value.has(worktreePath)) {
        // Save ALL Claude configurations before adding new one
        await claudeInstancesStore.saveAllWorkspaceConfigurations();
        
        // Save terminal configurations
        for (const [path, _] of activeWorktrees.value) {
          await terminalInstancesStore.saveWorkspaceConfiguration(path);
        }
        
        const session: WorktreeSession = {
          path: newWorktree.path,
          branch: newWorktree.branch,
          isMainWorktree: false,
          hasChanges: false,
          ahead: 0,
          behind: 0
        };
        activeWorktrees.value.set(worktreePath, session);
        
        // Create empty configuration for the new worktree
        // This ensures it doesn't inherit or affect other worktree configurations
        const key = `worktree-${worktreePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await window.electronAPI.store.set(key, {
          instances: [],
          activeInstanceId: null
        });
      }
    }
  };

  // NEW: Refresh git status for all worktrees
  const refreshWorktreeStatus = async () => {
    // Save ALL Claude configurations before any updates
    await claudeInstancesStore.saveAllWorkspaceConfigurations();
    
    // Save terminal configurations
    for (const [path, _] of activeWorktrees.value) {
      await terminalInstancesStore.saveWorkspaceConfiguration(path);
    }
    
    // First check for any new worktrees
    if (currentWorkspacePath.value) {
      const result = await window.electronAPI.worktree.list();
      if (result.success && result.worktrees) {
        // Add any new worktrees that aren't already in our list
        for (const worktree of result.worktrees) {
          if (!activeWorktrees.value.has(worktree.path)) {
            const session: WorktreeSession = {
              path: worktree.path,
              branch: worktree.branch,
              isMainWorktree: worktree.path === currentWorkspacePath.value,
              hasChanges: false,
              ahead: 0,
              behind: 0
            };
            activeWorktrees.value.set(worktree.path, session);
            
            // Create empty configuration for new worktrees discovered during refresh
            const key = `worktree-${worktree.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const existingConfig = await window.electronAPI.store.get(key);
            if (!existingConfig) {
              await window.electronAPI.store.set(key, {
                instances: [],
                activeInstanceId: null
              });
            }
          }
        }
      }
    }
    
    // Skip updating git status for now to avoid workspace path changes
    // TODO: Implement a way to get git status without changing workspace path
    // This would require a new IPC method that accepts a path parameter
    
    // For now, only update status for the current active worktree
    if (activeWorktreePath.value) {
      const session = activeWorktrees.value.get(activeWorktreePath.value);
      if (session) {
        try {
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
          console.warn(`Failed to get status for worktree ${activeWorktreePath.value}:`, error);
        }
      }
    }
  };

  // NEW: Remove a single worktree from the list without reinitializing
  const removeWorktreeFromList = async (worktreePath: string) => {
    // If we're removing the active worktree, switch to the main worktree
    if (worktreePath === activeWorktreePath.value) {
      // Find the main worktree
      let mainWorktreePath = currentWorkspacePath.value;
      for (const [path, session] of activeWorktrees.value) {
        if (session.isMainWorktree) {
          mainWorktreePath = path;
          break;
        }
      }
      
      // Switch to main worktree if we're removing the active one
      if (mainWorktreePath && mainWorktreePath !== worktreePath) {
        await switchWorktreeWithinWorkspace(mainWorktreePath);
      }
    }
    
    // Remove the worktree from our list
    activeWorktrees.value.delete(worktreePath);
    
    // Update git status for remaining worktrees
    await refreshWorktreeStatus();
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
    addWorktreeToList,
    removeWorktreeFromList,
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