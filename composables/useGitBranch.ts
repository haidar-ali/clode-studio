import { ref, onMounted, onUnmounted } from 'vue';

export function useGitBranch() {
  const currentBranch = ref<string>('main');
  const isWorktree = ref<boolean>(false);
  const worktreePath = ref<string>('');
  
  let intervalId: NodeJS.Timeout | null = null;
  
  const fetchBranchInfo = async () => {
    try {
      // Get current branch
      const branchResult = await window.electronAPI.git.getCurrentBranch();
      if (branchResult.success && branchResult.branch) {
        currentBranch.value = branchResult.branch;
      }
      
      // Check if we're in a worktree
      const currentPath = await window.electronAPI.workspace.getCurrentPath();
      if (currentPath) {
        const worktrees = await window.electronAPI.worktree.list();
        if (worktrees.success && worktrees.worktrees) {
          const currentWorktree = worktrees.worktrees.find((wt: any) => 
            currentPath.includes(wt.path) || wt.path.includes(currentPath)
          );
          
          if (currentWorktree) {
            isWorktree.value = true;
            worktreePath.value = currentWorktree.path;
          } else {
            isWorktree.value = false;
            worktreePath.value = '';
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch branch info:', error);
    }
  };
  
  const startPolling = () => {
    fetchBranchInfo();
    intervalId = setInterval(fetchBranchInfo, 2000); // Poll every 2 seconds
  };
  
  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
  
  onMounted(() => {
    startPolling();
  });
  
  onUnmounted(() => {
    stopPolling();
  });
  
  return {
    currentBranch,
    isWorktree,
    worktreePath,
    refresh: fetchBranchInfo
  };
}