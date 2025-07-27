import { defineStore } from 'pinia';
import { workspaceState } from '~/composables/useWorkspaceManager';

export const useWorkspaceStore = defineStore('workspace', {
  getters: {
    // Map currentPath to currentWorkspacePath from WorkspaceManager
    currentPath: () => workspaceState.currentWorkspacePath.value,
    currentWorkspacePath: () => workspaceState.currentWorkspacePath.value,
    
    // Additional getters for convenience
    workspaceName: () => workspaceState.workspaceName.value,
    hasWorkspace: () => workspaceState.hasWorkspace.value
  }
});