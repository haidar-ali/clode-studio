<template>
  <div class="session-comparison">
    <!-- Header -->
    <div class="comparison-header">
      <h3>Session Comparison</h3>
      <div class="session-selectors">
        <div class="selector-group">
          <label>Session 1:</label>
          <select v-model="selectedSession1" @change="loadComparison">
            <option value="">Select session...</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">
              {{ session.name }} ({{ session.worktree.branch }})
            </option>
          </select>
        </div>
        <Icon name="mdi:arrow-left-right" class="compare-icon" />
        <div class="selector-group">
          <label>Session 2:</label>
          <select v-model="selectedSession2" @change="loadComparison">
            <option value="">Select session...</option>
            <option v-for="session in sessions" :key="session.id" :value="session.id">
              {{ session.name }} ({{ session.worktree.branch }})
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Comparison content -->
    <div v-if="!selectedSession1 || !selectedSession2" class="empty-state">
      <Icon name="mdi:compare" />
      <p>Select two sessions to compare their outputs and changes</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <Icon name="mdi:loading" class="animate-spin" />
      <p>Loading comparison...</p>
    </div>

    <div v-else-if="comparisonData" class="comparison-content">
      <!-- Tabs for different comparison views -->
      <div class="comparison-tabs">
        <button 
          :class="{ active: activeTab === 'overview' }" 
          @click="activeTab = 'overview'"
        >
          <Icon name="mdi:view-dashboard" />
          Overview
        </button>
        <button 
          :class="{ active: activeTab === 'files' }" 
          @click="activeTab = 'files'"
        >
          <Icon name="mdi:file-compare" />
          File Changes
        </button>
        <button 
          :class="{ active: activeTab === 'commits' }" 
          @click="activeTab = 'commits'"
        >
          <Icon name="mdi:source-commit" />
          Commits
        </button>
        <button 
          :class="{ active: activeTab === 'outputs' }" 
          @click="activeTab = 'outputs'"
        >
          <Icon name="mdi:console" />
          Outputs
        </button>
      </div>

      <!-- Tab content -->
      <div class="tab-content">
        <!-- Overview tab -->
        <div v-if="activeTab === 'overview'" class="overview-tab">
          <div class="metrics-grid">
            <div class="metric-card">
              <Icon name="mdi:clock-outline" />
              <div class="metric-info">
                <span class="metric-label">Duration</span>
                <span class="metric-value">{{ formatDuration(session1) }} vs {{ formatDuration(session2) }}</span>
              </div>
            </div>
            <div class="metric-card">
              <Icon name="mdi:file-document-multiple" />
              <div class="metric-info">
                <span class="metric-label">Files Changed</span>
                <span class="metric-value">
                  {{ getTotalChanges(comparisonData) }} differences
                </span>
              </div>
            </div>
            <div class="metric-card">
              <Icon name="mdi:source-commit" />
              <div class="metric-info">
                <span class="metric-label">Commits</span>
                <span class="metric-value">
                  {{ comparisonData.commits.ahead }} ahead, {{ comparisonData.commits.behind }} behind
                </span>
              </div>
            </div>
          </div>

          <!-- Activity timeline -->
          <div class="activity-section">
            <h4>Activity Timeline</h4>
            <div class="timeline">
              <div class="timeline-item" v-for="activity in mergedTimeline" :key="activity.id">
                <div class="timeline-marker" :class="activity.session"></div>
                <div class="timeline-content">
                  <span class="timeline-time">{{ formatTime(activity.time) }}</span>
                  <span class="timeline-action">{{ activity.action }}</span>
                  <span class="timeline-session">{{ activity.sessionName }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Files tab -->
        <div v-if="activeTab === 'files'" class="files-tab">
          <div class="file-changes-grid">
            <div class="file-column">
              <h4>Added Files ({{ comparisonData.filesAdded.length }})</h4>
              <div class="file-list">
                <div v-for="file in comparisonData.filesAdded" :key="file" class="file-item added">
                  <Icon name="mdi:file-plus" />
                  <span>{{ file }}</span>
                </div>
              </div>
            </div>
            <div class="file-column">
              <h4>Modified Files ({{ comparisonData.filesModified.length }})</h4>
              <div class="file-list">
                <div 
                  v-for="file in comparisonData.filesModified" 
                  :key="file" 
                  class="file-item modified"
                  @click="showFileDiff(file)"
                >
                  <Icon name="mdi:file-edit" />
                  <span>{{ file }}</span>
                  <Icon name="mdi:magnify" class="action-icon" />
                </div>
              </div>
            </div>
            <div class="file-column">
              <h4>Removed Files ({{ comparisonData.filesRemoved.length }})</h4>
              <div class="file-list">
                <div v-for="file in comparisonData.filesRemoved" :key="file" class="file-item removed">
                  <Icon name="mdi:file-remove" />
                  <span>{{ file }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Commits tab -->
        <div v-if="activeTab === 'commits'" class="commits-tab">
          <div class="commits-columns">
            <div class="commit-column">
              <h4>{{ session1.name }} Commits</h4>
              <div class="commit-list">
                <div v-for="commit in session1Commits" :key="commit.hash" class="commit-item">
                  <div class="commit-hash">{{ commit.hash.substring(0, 8) }}</div>
                  <div class="commit-message">{{ commit.message }}</div>
                  <div class="commit-meta">
                    <span>{{ commit.author }}</span>
                    <span>{{ formatDate(commit.date) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="commit-column">
              <h4>{{ session2.name }} Commits</h4>
              <div class="commit-list">
                <div v-for="commit in session2Commits" :key="commit.hash" class="commit-item">
                  <div class="commit-hash">{{ commit.hash.substring(0, 8) }}</div>
                  <div class="commit-message">{{ commit.message }}</div>
                  <div class="commit-meta">
                    <span>{{ commit.author }}</span>
                    <span>{{ formatDate(commit.date) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Outputs tab -->
        <div v-if="activeTab === 'outputs'" class="outputs-tab">
          <div class="output-comparison">
            <div class="output-column">
              <h4>{{ session1.name }} Output</h4>
              <div class="output-content">
                <pre>{{ getSessionOutput(session1) }}</pre>
              </div>
            </div>
            <div class="output-column">
              <h4>{{ session2.name }} Output</h4>
              <div class="output-content">
                <pre>{{ getSessionOutput(session2) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- File diff modal -->
    <teleport to="body" v-if="showDiffModal">
      <div class="diff-modal-overlay" @click="closeDiffModal">
        <div class="diff-modal" @click.stop>
          <div class="diff-modal-header">
            <h3>File Diff: {{ currentDiffFile }}</h3>
            <button @click="closeDiffModal" class="close-button">
              <Icon name="mdi:close" />
            </button>
          </div>
          <div class="diff-modal-content">
            <pre class="diff-content">{{ currentDiffContent }}</pre>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import Icon from '~/components/Icon.vue';

interface WorktreeSession {
  id: string;
  name: string;
  worktree: {
    path: string;
    branch: string;
    commit: string;
  };
  created: Date;
  lastAccessed: Date;
  metadata: {
    task?: string;
    experiment?: boolean;
    tags?: string[];
  };
}

interface ComparisonData {
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  commits: {
    ahead: number;
    behind: number;
    diverged: boolean;
  };
}

// State
const sessions = ref<WorktreeSession[]>([]);
const selectedSession1 = ref<string>('');
const selectedSession2 = ref<string>('');
const isLoading = ref(false);
const comparisonData = ref<ComparisonData | null>(null);
const activeTab = ref<'overview' | 'files' | 'commits' | 'outputs'>('overview');
const showDiffModal = ref(false);
const currentDiffFile = ref('');
const currentDiffContent = ref('');

// Mock data for commits and outputs (in real implementation, fetch from git)
const session1Commits = ref([]);
const session2Commits = ref([]);
const mergedTimeline = ref([]);

// Computed
const session1 = computed(() => sessions.value.find(s => s.id === selectedSession1.value));
const session2 = computed(() => sessions.value.find(s => s.id === selectedSession2.value));

// Load sessions on mount
onMounted(async () => {
  await loadSessions();
});

// Load sessions
async function loadSessions() {
  try {
    const result = await window.electronAPI.worktree.sessions();
    if (result.success && result.sessions) {
      sessions.value = result.sessions;
    }
  } catch (error) {
    console.error('Failed to load sessions:', error);
  }
}

// Load comparison when sessions change
async function loadComparison() {
  if (!selectedSession1.value || !selectedSession2.value) return;
  if (selectedSession1.value === selectedSession2.value) return;

  isLoading.value = true;
  try {
    const s1 = session1.value;
    const s2 = session2.value;
    
    if (!s1 || !s2) return;

    const result = await window.electronAPI.worktree.compare(
      s1.worktree.path,
      s2.worktree.path
    );

    if (result.success && result.comparison) {
      comparisonData.value = result.comparison;
      
      // Load commits for both worktrees
      await loadCommits(s1.worktree.path, s2.worktree.path);
      
      // Generate activity timeline
      generateTimeline(s1, s2);
    }
  } catch (error) {
    console.error('Failed to load comparison:', error);
  } finally {
    isLoading.value = false;
  }
}

// Load commits for both worktrees
async function loadCommits(path1: string, path2: string) {
  // In a real implementation, this would fetch actual git logs
  // For now, using mock data
  session1Commits.value = [
    {
      hash: 'abc123def',
      message: 'Add feature implementation',
      author: 'Developer',
      date: new Date()
    }
  ];
  
  session2Commits.value = [
    {
      hash: 'def456ghi',
      message: 'Fix bug in module',
      author: 'Developer',
      date: new Date()
    }
  ];
}

// Generate merged timeline
function generateTimeline(s1: WorktreeSession, s2: WorktreeSession) {
  // Mock timeline data - in real implementation, parse from git logs
  mergedTimeline.value = [
    {
      id: '1',
      time: s1.created,
      action: 'Session created',
      session: 'session1',
      sessionName: s1.name
    },
    {
      id: '2',
      time: s2.created,
      action: 'Session created',
      session: 'session2',
      sessionName: s2.name
    }
  ].sort((a, b) => b.time.getTime() - a.time.getTime());
}

// Show file diff
async function showFileDiff(file: string) {
  if (!session1.value || !session2.value) return;
  
  currentDiffFile.value = file;
  
  // In real implementation, fetch actual diff
  currentDiffContent.value = `--- a/${file}
+++ b/${file}
@@ -1,5 +1,6 @@
 function example() {
-  console.log('old version');
+  console.log('new version');
+  // Added new functionality
   return true;
 }`;
  
  showDiffModal.value = true;
}

// Close diff modal
function closeDiffModal() {
  showDiffModal.value = false;
  currentDiffFile.value = '';
  currentDiffContent.value = '';
}

// Get session output (mock data)
function getSessionOutput(session: WorktreeSession) {
  return `Terminal output for ${session.name}:
$ npm test
✓ All tests passed
$ npm run build
✓ Build completed successfully`;
}

// Utility functions
function formatDuration(session: WorktreeSession) {
  const duration = new Date().getTime() - new Date(session.created).getTime();
  const hours = Math.floor(duration / (1000 * 60 * 60));
  const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function getTotalChanges(data: ComparisonData) {
  return data.filesAdded.length + data.filesModified.length + data.filesRemoved.length;
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString();
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString();
}
</script>

<style scoped>
.session-comparison {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #252526;
  color: #cccccc;
}

.comparison-header {
  padding: 16px;
  border-bottom: 1px solid #454545;
  background: #2d2d30;
}

.comparison-header h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.session-selectors {
  display: flex;
  align-items: center;
  gap: 16px;
}

.selector-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.selector-group label {
  font-size: 12px;
  color: #858585;
  font-weight: 500;
}

.selector-group select {
  padding: 8px 12px;
  background: #252526;
  color: #cccccc;
  border: 1px solid #454545;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.compare-icon {
  font-size: 24px;
  color: #858585;
}

.empty-state,
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #858585;
}

.empty-state .icon,
.loading-state .icon {
  font-size: 48px;
  opacity: 0.5;
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.comparison-tabs {
  display: flex;
  background: #2d2d30;
  border-bottom: 1px solid #454545;
  padding: 0 16px;
}

.comparison-tabs button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.comparison-tabs button:hover {
  color: #cccccc;
  background: #3e3e42;
}

.comparison-tabs button.active {
  color: #007acc;
  border-bottom-color: #007acc;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Overview tab */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 8px;
}

.metric-card .icon {
  font-size: 24px;
  color: #007acc;
}

.metric-info {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 12px;
  color: #858585;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
}

.activity-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: #2d2d30;
  border-radius: 4px;
}

.timeline-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #007acc;
}

.timeline-marker.session1 {
  background: #4ec9b0;
}

.timeline-marker.session2 {
  background: var(--color-warning);
}

.timeline-content {
  display: flex;
  gap: 12px;
  flex: 1;
  font-size: 13px;
}

.timeline-time {
  color: #858585;
}

.timeline-session {
  margin-left: auto;
  color: #858585;
  font-size: 12px;
}

/* Files tab */
.file-changes-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.file-column h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
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

.file-item.modified {
  cursor: pointer;
}

.file-item.added {
  color: #4ec9b0;
}

.file-item.modified {
  color: var(--color-warning);
}

.file-item.removed {
  color: #f48771;
}

.action-icon {
  margin-left: auto;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.file-item:hover .action-icon {
  opacity: 1;
}

/* Commits tab */
.commits-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.commit-column h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.commit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 500px;
  overflow-y: auto;
}

.commit-item {
  padding: 12px;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
}

.commit-hash {
  font-family: monospace;
  font-size: 12px;
  color: #007acc;
  margin-bottom: 4px;
}

.commit-message {
  font-size: 14px;
  margin-bottom: 8px;
}

.commit-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #858585;
}

/* Outputs tab */
.output-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 100%;
}

.output-column h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.output-content {
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 12px;
  overflow: auto;
  max-height: 500px;
}

.output-content pre {
  margin: 0;
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
}

/* Diff modal */
.diff-modal-overlay {
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

.diff-modal {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 80%;
  max-width: 1000px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.diff-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #454545;
}

.diff-modal-header h3 {
  margin: 0;
  font-size: 16px;
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

.diff-modal-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.diff-content {
  margin: 0;
  font-family: monospace;
  font-size: 13px;
  white-space: pre;
  line-height: 1.5;
}


</style>