/**
 * Updated Workspace Manager using Service Abstraction
 * This is an example of how to update composables to use the service layer
 */
import { ref, computed } from 'vue';
import { useServices } from './useServices';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useTasksStore } from '~/stores/tasks';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useTerminalInstancesStore } from '~/stores/terminal-instances';
import { useSourceControlStore } from '~/stores/source-control';

const currentWorkspacePath = ref<string>('');
const isChangingWorkspace = ref(false);

// Worktree management within workspace
const activeWorktreePath = ref<string>('');
const activeWorktrees = ref<Map<string, WorktreeSession>>(new Map());

interface WorktreeSession {
  path: string;
  branch: string;
  isMainWorktree: boolean;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  savedState?: {
    editorTabs: any[];
    activeTabId: string | null;
    claudeMessages: any[];
    terminalSessions: any[];
  };
}

export function useWorkspaceManager() {
  const { services } = useServices();
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
      // Using window.electronAPI.store directly for now
      // TODO: Add storage service to abstraction layer
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
    if (isChangingWorkspace.value || !services.value) return;
    
    isChangingWorkspace.value = true;
    
    try {
      // Stop watching the old workspace using service abstraction
      if (currentWorkspacePath.value) {
        // Get any existing watch cleanup function and call it
        // Note: We might need to track this in the composable
        
        // Save current workspace configuration before switching
        await claudeInstancesStore.saveWorkspaceConfiguration(currentWorkspacePath.value);
      }
      
      // 1. Close all editor tabs and reset terminals to avoid confusion
      editorStore.closeAllTabs();
      
      // 2. Stop and clear Claude terminal for clean slate
      await chatStore.stopClaude();
      chatStore.clearMessages();
      
      // 3. Save current configurations
      if (activeWorktreePath.value) {
        await claudeInstancesStore.saveWorkspaceConfiguration(activeWorktreePath.value);
      }
      
      // 4. Update workspace path
      currentWorkspacePath.value = path;
      
      // 5. Start watching the new workspace using service abstraction
      await services.value.file.watchDirectory(path, (event, filename) => {
        // Handle directory changes
        console.log('Directory change:', event, filename);
      });
      
      // 6. Update chat store with new workspace path
      await chatStore.updateWorkingDirectory(path);
      
      // 7. Initialize source control to detect if it's a git repository
      const sourceControlStore = useSourceControlStore();
      await sourceControlStore.initialize(path);
      
      // Small delay to ensure source control is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 8. Initialize worktrees for this workspace
      await initializeWorktrees();
      
      // 9. Load workspace-specific Claude instances configuration
      if (activeWorktreePath.value) {
        await claudeInstancesStore.loadWorkspaceConfiguration(activeWorktreePath.value);
        await terminalInstancesStore.loadWorkspaceConfiguration(activeWorktreePath.value);
      }
      
      // 10. Set project path and load tasks
      tasksStore.setProjectPath(path);
      
      // Initialize context store
      const { useContextStore } = await import('~/stores/context');
      const contextStore = useContextStore();
      await contextStore.loadPersistedCheckpoints();
      
      // Try to load existing TASKS.md using service abstraction
      const tasksPath = `${path}/TASKS.md`;
      try {
        const tasksContent = await services.value.file.readFile(tasksPath);
        if (tasksContent) {
          await tasksStore.loadTasksFromProject();
        }
      } catch (error) {
        // No TASKS.md exists - create new
        tasksStore.clearAll();
        await tasksStore.updateTasksMarkdown();
      }
      
      // Store the workspace path
      await window.electronAPI.store.set('workspacePath', path);
      
      // Update recent workspaces
      const defaultPath = await window.electronAPI.store.get('workspace.lastPath');
      if (path !== defaultPath) {
        await updateRecentWorkspaces(path);
      }
      
    } catch (error) {
      console.error('Failed to change workspace:', error);
      currentWorkspacePath.value = '';
      throw error;
    } finally {
      isChangingWorkspace.value = false;
    }
  };
  
  const initializeWorktrees = async () => {
    if (!services.value) return;
    
    try {
      // Check if it's a git repository
      const isRepo = await services.value.git.isRepository(currentWorkspacePath.value);
      
      if (isRepo) {
        // Get worktrees using service abstraction
        const worktrees = await services.value.git.getWorktrees();
        
        activeWorktrees.value.clear();
        
        for (const worktree of worktrees) {
          const session: WorktreeSession = {
            path: worktree.path,
            branch: worktree.branch,
            isMainWorktree: worktree.path === currentWorkspacePath.value,
            hasChanges: false, // Will be updated by git status
            ahead: 0,
            behind: 0
          };
          
          activeWorktrees.value.set(worktree.path, session);
        }
        
        // Set active worktree to main if not set
        if (!activeWorktreePath.value && activeWorktrees.value.size > 0) {
          const mainWorktree = Array.from(activeWorktrees.value.values())
            .find(wt => wt.isMainWorktree);
          activeWorktreePath.value = mainWorktree?.path || currentWorkspacePath.value;
        }
      } else {
        // Not a git repo - use workspace path as the "worktree"
        activeWorktreePath.value = currentWorkspacePath.value;
      }
    } catch (error) {
      console.error('Failed to initialize worktrees:', error);
      activeWorktreePath.value = currentWorkspacePath.value;
    }
  };
  
  const updateRecentWorkspaces = async (path: string) => {
    // TODO: Move this to a storage service
    const recentWorkspaces = await window.electronAPI.store.get('recentWorkspaces') || [];
    const filtered = recentWorkspaces.filter((ws: string) => ws !== path);
    filtered.unshift(path);
    const trimmed = filtered.slice(0, 10); // Keep last 10
    await window.electronAPI.store.set('recentWorkspaces', trimmed);
  };
  
  return {
    currentWorkspacePath,
    workspaceName,
    hasWorkspace,
    isChangingWorkspace,
    activeWorktreePath,
    activeWorktrees,
    changeWorkspace,
    loadWorkspaceFromStorage,
    initializeWorktrees
  };
}