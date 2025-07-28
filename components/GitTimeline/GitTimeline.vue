<template>
  <div class="git-timeline-panel">
    <!-- Header with controls -->
    <div class="panel-header">
      <div class="header-title">
        <Icon name="mdi:timeline-clock" class="header-icon" />
        <h3>Git Timeline</h3>
      </div>
      <div class="header-actions">
        <!-- Current branch display -->
        <div class="branch-info">
          <Icon name="mdi:source-branch" />
          <span>{{ currentBranch?.name || 'No branch' }}</span>
        </div>

          <!-- Refresh -->
          <button 
            class="icon-button"
            @click="refresh"
            :disabled="isLoading"
            title="Refresh"
          >
            <Icon name="mdi:refresh" :class="{ 'animate-spin': isLoading }" />
          </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && !timelineData" class="loading-state">
      <div class="text-center">
        <Icon name="mdi:loading" class="animate-spin mb-2" />
        <p>Loading git history...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-state">
      <div class="text-center">
        <Icon name="mdi:alert-circle" class="mb-2" />
        <p>{{ error }}</p>
      </div>
    </div>

    <!-- Timeline visualization -->
    <div v-else class="timeline-content">
      <!-- Graph canvas -->
      <div class="timeline-graph">
        <div ref="graphContainer" class="w-full h-full"></div>
      </div>

      <!-- Commit details panel -->
      <Transition name="slide">
        <div v-if="selectedCommit" class="commit-details">
          <CommitDetails 
            :commit="selectedCommit"
            @close="clearSelection"
          />
        </div>
      </Transition>
    </div>

    <!-- Create branch modal -->
    <CreateBranchModal
      v-model="showCreateBranch"
      :current-branch="currentBranch?.name"
      @create="handleCreateBranch"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { createGitgraph, Mode, TemplateName } from '@gitgraph/js';
import type { GitgraphUserApi } from '@gitgraph/core';
import { debounce } from 'lodash-es';
import { useGitTimeline } from '~/composables/useGitTimeline';
import CommitDetails from './CommitDetails.vue';
import CreateBranchModal from './CreateBranchModal.vue';

const {
  isLoading,
  error,
  timelineData,
  selectedCommit,
  currentBranch,
  branches,
  checkoutBranch,
  createBranch,
  selectCommit,
  clearSelection,
  updateFilter,
  refresh
} = useGitTimeline();

// UI state
const graphContainer = ref<HTMLElement | null>(null);
const showCreateBranch = ref(false);
const showRemotes = ref(false);
const showTags = ref(true);
const compactMode = ref(false);
const searchQuery = ref('');

let gitgraph: GitgraphUserApi<SVGElement> | null = null;

// Debounced search
const debouncedSearch = debounce(() => {
  updateFilter({ search: searchQuery.value });
}, 300);

// Create branch handler
async function handleCreateBranch(branchName: string, startPoint?: string) {
  await createBranch(branchName, startPoint);
  showCreateBranch.value = false;
}

// Render git graph
function renderGraph() {

  if (!graphContainer.value || !timelineData.value) return;

  // Clear existing graph
  if (gitgraph) {
    graphContainer.value.innerHTML = '';
  }

  // Create new graph
  try {
  
    gitgraph = createGitgraph(graphContainer.value, {
      template: TemplateName.Metro,
      mode: compactMode.value ? Mode.Compact : Mode.Extended,
      orientation: 'horizontal',
      reverseArrow: false,
      author: ' ',
      commitMessage: ' '
    });
  
  } catch (err) {
    console.error('[GitTimeline] Error creating gitgraph:', err);
    return;
  }

  // Track branches
  const branchRefs = new Map<string, any>();

  // Create branches
  timelineData.value.branches.forEach(branch => {
    if (!branch.isRemote || showRemotes.value) {
      const ref = gitgraph.branch(branch.name);
      branchRefs.set(branch.name, ref);
    }
  });

  // Add commits in reverse order (oldest first for gitgraph)
  const commits = [...timelineData.value.commits].reverse();

  
  commits.forEach(commit => {
  
    // Find which branch this commit belongs to
    let targetBranch = null;
    
    // Check refs for branch names
    commit.refs.forEach(ref => {
      if (branchRefs.has(ref)) {
        targetBranch = branchRefs.get(ref);
      }
    });

    // Default to master/main if no branch found
    if (!targetBranch) {
      targetBranch = branchRefs.get('main') || branchRefs.get('master') || gitgraph;
    }

    // Create commit
    targetBranch.commit({
      subject: commit.subject,
      author: `${commit.author.name} <${commit.author.email}>`,
      hash: commit.abbrevHash,
      onClick: () => selectCommit(commit),
      dotText: '●',
      style: {
        message: {
          displayAuthor: false,
          displayHash: true
        },
        dot: {
          size: 8
        }
      }
    });

    // Add tags if enabled
    if (showTags.value) {
      timelineData.value.tags
        .filter(tag => tag.commit === commit.hash)
        .forEach(tag => {
          targetBranch.tag(tag.name);
        });
    }
  });
}

// Watch for data changes
watch(timelineData, (newData) => {

  if (newData) {
  
  
  }
});

watch([timelineData, compactMode, showRemotes, showTags], () => {
  nextTick(() => renderGraph());
});

// Initial render
onMounted(() => {




  if (timelineData.value) {
    renderGraph();
  }
});

// Cleanup
onUnmounted(() => {
  if (graphContainer.value) {
    graphContainer.value.innerHTML = '';
  }
});
</script>

<style scoped>
.git-timeline-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  color: #cccccc;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #3e3e42;
  background: #2d2d30;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.header-title h3 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.header-icon {
  width: 1rem;
  height: 1rem;
  opacity: 0.8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  padding: 0.25rem;
  border-radius: 0.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: #3e3e42;
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-button svg {
  width: 1rem;
  height: 1rem;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: #8b8b8b;
}

.branch-info svg {
  width: 0.875rem;
  height: 0.875rem;
}

.timeline-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.timeline-graph {
  flex: 1;
  overflow: auto;
  background: #1e1e1e;
  padding: 1rem;
}

.commit-details {
  width: 24rem;
  background: #252526;
  border-left: 1px solid #3e3e42;
  overflow-y: auto;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from {
  transform: translateX(100%);
}

.slide-leave-to {
  transform: translateX(100%);
}

/* Loading and error states */
.loading-state,
.error-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b8b8b;
}

.error-state {
  color: #f48771;
}
</style>