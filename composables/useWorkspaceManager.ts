import { ref, computed } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useTasksStore } from '~/stores/tasks';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

const currentWorkspacePath = ref<string>('');
const isChangingWorkspace = ref(false);

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
      
      // 9. Try to load existing TASKS.md from the new workspace
      const tasksPath = `${path}/TASKS.md`;
      const tasksResult = await window.electronAPI.fs.readFile(tasksPath);
      
      if (tasksResult.success) {
        // TASKS.md exists - load it WITHOUT clearing first
        console.log('Loading existing TASKS.md from new workspace');
        await tasksStore.loadTasksFromProject();
      } else {
        // No TASKS.md exists - NOW we can safely clear and create new
        console.log('No TASKS.md found, creating new one for workspace');
        tasksStore.clearAll();
        await tasksStore.updateTasksMarkdown();
      }
      
      // Store the workspace path
      await window.electronAPI.store.set('workspacePath', path);
      
      console.log('Workspace changed successfully to:', path);
      
    } catch (error) {
      console.error('Failed to change workspace:', error);
      throw error;
    } finally {
      isChangingWorkspace.value = false;
    }
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

  return {
    currentWorkspacePath: computed(() => currentWorkspacePath.value),
    workspaceName,
    hasWorkspace,
    isChangingWorkspace: computed(() => isChangingWorkspace.value),
    loadWorkspaceFromStorage,
    changeWorkspace,
    selectWorkspace
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