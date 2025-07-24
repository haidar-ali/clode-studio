<template>
  <teleport to="body">
    <div class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog large">
        <div class="dialog-header">
          <h3>Compare Worktrees</h3>
          <button @click="$emit('close')" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>
        
        <div class="compare-header">
          <div class="worktree-info">
            <Icon name="mdi:source-branch" />
            <span class="branch-name">{{ worktree1.branch }}</span>
            <span class="path">{{ formatPath(worktree1.path) }}</span>
          </div>
          <Icon name="mdi:arrow-left-right" class="compare-icon" />
          <div class="worktree-info">
            <Icon name="mdi:source-branch" />
            <span class="branch-name">{{ worktree2.branch }}</span>
            <span class="path">{{ formatPath(worktree2.path) }}</span>
          </div>
        </div>
        
        <div v-if="isLoading" class="loading-state">
          <Icon name="mdi:loading" class="animate-spin" />
          <p>Comparing worktrees...</p>
        </div>
        
        <div v-else-if="comparison" class="comparison-content">
          <!-- Summary -->
          <div class="summary-section">
            <div class="summary-card">
              <Icon name="mdi:plus" class="summary-icon added" />
              <div class="summary-info">
                <span class="summary-count">{{ comparison.filesAdded.length }}</span>
                <span class="summary-label">Files Added</span>
              </div>
            </div>
            <div class="summary-card">
              <Icon name="mdi:minus" class="summary-icon removed" />
              <div class="summary-info">
                <span class="summary-count">{{ comparison.filesRemoved.length }}</span>
                <span class="summary-label">Files Removed</span>
              </div>
            </div>
            <div class="summary-card">
              <Icon name="mdi:pencil" class="summary-icon modified" />
              <div class="summary-info">
                <span class="summary-count">{{ comparison.filesModified.length }}</span>
                <span class="summary-label">Files Modified</span>
              </div>
            </div>
            <div class="summary-card">
              <Icon name="mdi:source-commit" class="summary-icon commits" />
              <div class="summary-info">
                <span class="summary-count">
                  <span v-if="comparison.commits.ahead > 0">+{{ comparison.commits.ahead }}</span>
                  <span v-if="comparison.commits.ahead > 0 && comparison.commits.behind > 0">/</span>
                  <span v-if="comparison.commits.behind > 0">-{{ comparison.commits.behind }}</span>
                  <span v-if="comparison.commits.ahead === 0 && comparison.commits.behind === 0">0</span>
                </span>
                <span class="summary-label">Commits</span>
              </div>
            </div>
          </div>
          
          <!-- File lists -->
          <div class="file-lists">
            <!-- Added files -->
            <div v-if="comparison.filesAdded.length > 0" class="file-section">
              <h4 class="section-title">
                <Icon name="mdi:plus" />
                Added Files
              </h4>
              <div class="file-list">
                <div v-for="file in comparison.filesAdded" :key="file" class="file-item added">
                  <Icon name="mdi:file-plus" />
                  <span>{{ file }}</span>
                </div>
              </div>
            </div>
            
            <!-- Removed files -->
            <div v-if="comparison.filesRemoved.length > 0" class="file-section">
              <h4 class="section-title">
                <Icon name="mdi:minus" />
                Removed Files
              </h4>
              <div class="file-list">
                <div v-for="file in comparison.filesRemoved" :key="file" class="file-item removed">
                  <Icon name="mdi:file-remove" />
                  <span>{{ file }}</span>
                </div>
              </div>
            </div>
            
            <!-- Modified files -->
            <div v-if="comparison.filesModified.length > 0" class="file-section">
              <h4 class="section-title">
                <Icon name="mdi:pencil" />
                Modified Files
              </h4>
              <div class="file-list">
                <div v-for="file in comparison.filesModified" :key="file" class="file-item modified">
                  <Icon name="mdi:file-edit" />
                  <span>{{ file }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Icon from '~/components/Icon.vue';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isActive: boolean;
  isLocked: boolean;
  prunable: boolean;
}

interface WorktreeComparisonResult {
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  commits: {
    ahead: number;
    behind: number;
    diverged: boolean;
  };
}

const props = defineProps<{
  worktree1: Worktree;
  worktree2: Worktree;
}>();

defineEmits<{
  close: [];
}>();

// State
const isLoading = ref(true);
const comparison = ref<WorktreeComparisonResult | null>(null);

// Load comparison on mount
onMounted(async () => {
  try {
    const result = await window.electronAPI.worktree.compare(
      props.worktree1.path,
      props.worktree2.path
    );
    
    if (result.success && result.comparison) {
      comparison.value = result.comparison;
    }
  } catch (error) {
    console.error('Failed to compare worktrees:', error);
  } finally {
    isLoading.value = false;
  }
});

function formatPath(path: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.dialog.large {
  width: 800px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #454545;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
  color: #858585;
  transition: all 0.2s;
}

.close-button:hover {
  background: #3e3e42;
  color: #cccccc;
}

.compare-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 20px;
  background: #2d2d30;
  border-bottom: 1px solid #454545;
}

.worktree-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.branch-name {
  font-weight: 600;
  font-size: 15px;
}

.path {
  font-size: 12px;
  color: #858585;
}

.compare-icon {
  font-size: 24px;
  color: #858585;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 16px;
}

.loading-state p {
  margin: 0;
  color: #858585;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.comparison-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.summary-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 8px;
}

.summary-icon {
  font-size: 24px;
}

.summary-icon.added {
  color: #4ec9b0;
}

.summary-icon.removed {
  color: #f48771;
}

.summary-icon.modified {
  color: var(--color-warning);
}

.summary-icon.commits {
  color: #007acc;
}

.summary-info {
  display: flex;
  flex-direction: column;
}

.summary-count {
  font-size: 20px;
  font-weight: 600;
}

.summary-label {
  font-size: 12px;
  color: #858585;
}

.file-lists {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.file-section {
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 8px;
  padding: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: monospace;
  border-radius: 4px;
  transition: background 0.2s;
}

.file-item:hover {
  background: #3e3e42;
}

.file-item.added {
  color: #4ec9b0;
}

.file-item.removed {
  color: #f48771;
}

.file-item.modified {
  color: var(--color-warning);
}


</style>