import { ref, computed, watch } from 'vue';
import type { 
  GitTimelineData, 
  GitTimelineCommit, 
  TimelineFilter,
  GitGraphOptions 
} from '~/utils/git-timeline-types';
import { useWorkspaceStore } from '~/stores/workspace';

export function useGitTimeline() {
  const workspaceStore = useWorkspaceStore();
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const timelineData = ref<GitTimelineData | null>(null);
  const selectedCommit = ref<GitTimelineCommit | null>(null);
  const filter = ref<TimelineFilter>({
    limit: 100,
    branches: [],
    authors: [],
    search: '',
    dateRange: undefined
  });

  const currentBranch = computed(() => {
    if (!timelineData.value) return null;
    return timelineData.value.branches.find(b => b.current);
  });

  const branches = computed(() => {
    if (!timelineData.value) return [];
    return timelineData.value.branches.filter(b => b.isLocal);
  });

  const remoteBranches = computed(() => {
    if (!timelineData.value) return [];
    return timelineData.value.branches.filter(b => b.isRemote);
  });

  const tags = computed(() => {
    if (!timelineData.value) return [];
    return timelineData.value.tags;
  });

  // Load timeline data
  async function loadTimeline() {
    const workspacePath = workspaceStore.currentWorkspacePath;
    console.log('[useGitTimeline] loadTimeline called, workspacePath:', workspacePath);
    if (!workspacePath) return;

    isLoading.value = true;
    error.value = null;

    try {
      // Ensure filter is serializable (convert dates to ISO strings if needed)
      const serializableFilter = JSON.parse(JSON.stringify(filter.value));
      console.log('[useGitTimeline] Making IPC call with filter:', serializableFilter);
      
      const result = await window.electronAPI.gitTimeline.getData(
        workspacePath,
        serializableFilter
      );

      if (result.success) {
        console.log('[useGitTimeline] Received data:', result.data);
        timelineData.value = result.data;
      } else {
        console.error('[useGitTimeline] Error:', result.error);
        error.value = result.error || 'Failed to load git timeline';
      }
    } catch (err) {
      console.error('[useGitTimeline] Caught error:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  // Get commit details with file changes
  async function getCommitDetails(hash: string): Promise<GitTimelineCommit | null> {
    const workspacePath = workspaceStore.currentWorkspacePath;
    if (!workspacePath) return null;

    try {
      const result = await window.electronAPI.gitTimeline.getCommitDetails(
        workspacePath,
        hash
      );

      if (result.success) {
        return result.commit;
      }
    } catch (err) {
      console.error('Failed to get commit details:', err);
    }

    return null;
  }

  // Select a commit
  async function selectCommit(commit: GitTimelineCommit) {
    const details = await getCommitDetails(commit.hash);
    selectedCommit.value = details || commit;
  }

  // Clear selection
  function clearSelection() {
    selectedCommit.value = null;
  }

  // Checkout branch
  async function checkoutBranch(branchName: string) {
    const workspacePath = workspaceStore.currentWorkspacePath;
    if (!workspacePath) return;

    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.gitTimeline.checkoutBranch(
        workspacePath,
        branchName
      );

      if (result.success) {
        // Reload timeline data
        await loadTimeline();
      } else {
        error.value = result.error || 'Failed to checkout branch';
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  // Create new branch
  async function createBranch(branchName: string, startPoint?: string) {
    const workspacePath = workspaceStore.currentWorkspacePath;
    if (!workspacePath) return;

    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.gitTimeline.createBranch(
        workspacePath,
        branchName,
        startPoint
      );

      if (result.success) {
        // Reload timeline data
        await loadTimeline();
      } else {
        error.value = result.error || 'Failed to create branch';
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  // Update filter
  function updateFilter(newFilter: Partial<TimelineFilter>) {
    filter.value = { ...filter.value, ...newFilter };
    loadTimeline();
  }

  // Clear cache and reload
  async function refresh() {
    const workspacePath = workspaceStore.currentWorkspacePath;
    if (!workspacePath) return;

    await window.electronAPI.gitTimeline.clearCache(workspacePath);
    await loadTimeline();
  }

  // Format commit date
  function formatCommitDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${diffMins} minutes ago`;
      }
      return `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Watch for workspace changes
  watch(
    () => workspaceStore.currentWorkspacePath,
    (newPath) => {
      console.log('[useGitTimeline] Workspace path changed:', newPath);
      if (newPath) {
        loadTimeline();
      }
    },
    { immediate: true }
  );

  return {
    // State
    isLoading,
    error,
    timelineData,
    selectedCommit,
    filter,
    
    // Computed
    currentBranch,
    branches,
    remoteBranches,
    tags,
    
    // Methods
    loadTimeline,
    getCommitDetails,
    selectCommit,
    clearSelection,
    checkoutBranch,
    createBranch,
    updateFilter,
    refresh,
    formatCommitDate
  };
}