<template>
  <div class="knowledge-validation-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <h3>Knowledge Validation</h3>
        <span class="badge" :class="getBadgeClass()">{{ getStatusText() }}</span>
      </div>
      <div class="header-right">
        <button @click="refreshData" class="btn-icon" :disabled="isRefreshing">
          <Icon name="mdi:refresh" :class="{ spinning: isRefreshing }" />
        </button>
        <button @click="showSettings = true" class="btn-secondary">
          <Icon name="mdi:cog" /> Settings
        </button>
        <button @click="exportKnowledge" class="btn-secondary">
          <Icon name="mdi:download" /> Export
        </button>
      </div>
    </div>

    <!-- Statistics Overview -->
    <div class="statistics-section">
      <div class="section-title">
        <Icon name="mdi:chart-bar" />
        Knowledge Base Statistics
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ statistics.totalPatterns }}</div>
          <div class="stat-label">Total Patterns</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ statistics.validatedPatterns }}</div>
          <div class="stat-label">Validated</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ statistics.pendingPatterns }}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ (statistics.avgConfidence * 100).toFixed(1) }}%</div>
          <div class="stat-label">Avg Confidence</div>
        </div>
      </div>
    </div>

    <!-- Pattern Categories -->
    <div class="categories-section">
      <div class="section-title">
        <Icon name="mdi:shape" />
        Pattern Categories
      </div>
      
      <div class="category-filters">
        <button 
          v-for="category in availableCategories" 
          :key="category"
          class="category-btn"
          :class="{ active: selectedCategory === category }"
          @click="selectCategory(category)"
        >
          <Icon :name="getCategoryIcon(category)" />
          {{ formatCategory(category) }}
          <span class="category-count">{{ getCategoryCount(category) }}</span>
        </button>
      </div>
    </div>

    <!-- Patterns List -->
    <div class="patterns-section">
      <div class="section-title">
        <Icon name="mdi:lightbulb-outline" />
        Patterns
        <div class="search-box">
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="Search patterns..."
            class="search-input"
          />
          <Icon name="mdi:magnify" class="search-icon" />
        </div>
      </div>
      
      <div class="patterns-list">
        <div 
          v-for="pattern in filteredPatterns" 
          :key="pattern.id"
          class="pattern-item"
          :class="`pattern-${pattern.validation.status}`"
          @click="selectPattern(pattern)"
        >
          <div class="pattern-header">
            <div class="pattern-title">{{ pattern.name }}</div>
            <div class="pattern-status">
              <Icon :name="getStatusIcon(pattern.validation.status)" />
              {{ formatStatus(pattern.validation.status) }}
            </div>
          </div>
          
          <div class="pattern-description">{{ pattern.description }}</div>
          
          <div class="pattern-meta">
            <span class="pattern-category">{{ formatCategory(pattern.category) }}</span>
            <span class="pattern-confidence">{{ (pattern.metadata.confidence * 100).toFixed(1) }}% confidence</span>
            <span class="pattern-usage">{{ pattern.metadata.usageCount }} uses</span>
          </div>
          
          <div class="pattern-tags">
            <span v-for="tag in pattern.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
        
        <div v-if="filteredPatterns.length === 0" class="no-patterns">
          <Icon name="mdi:lightbulb-off-outline" />
          <p>No patterns found</p>
          <small>Try adjusting your search or category filter</small>
        </div>
      </div>
    </div>

    <!-- Learning Events -->
    <div class="events-section">
      <div class="section-title">
        <Icon name="mdi:timeline" />
        Recent Learning Events
      </div>
      
      <div class="events-list">
        <div 
          v-for="event in recentEvents" 
          :key="event.id"
          class="event-item"
          :class="`event-${event.type}`"
        >
          <div class="event-icon">
            <Icon :name="getEventIcon(event.type)" />
          </div>
          <div class="event-content">
            <div class="event-description">{{ event.description }}</div>
            <div class="event-meta">
              <span class="event-agent">{{ event.agentId }}</span>
              <span class="event-time">{{ formatTime(event.timestamp) }}</span>
              <span class="event-impact" :class="`impact-${event.impact}`">{{ event.impact }} impact</span>
            </div>
          </div>
        </div>
        
        <div v-if="recentEvents.length === 0" class="no-events">
          <Icon name="mdi:timeline-outline" />
          <p>No recent learning events</p>
        </div>
      </div>
    </div>

    <!-- Pattern Detail Modal -->
    <Teleport to="body">
      <div v-if="selectedPattern" class="modal-overlay" @click="selectedPattern = null">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>{{ selectedPattern.name }}</h3>
            <button @click="selectedPattern = null" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="pattern-details">
              <div class="detail-section">
                <h4>Problem</h4>
                <p>{{ selectedPattern.problem }}</p>
              </div>
              
              <div class="detail-section">
                <h4>Solution</h4>
                <pre class="solution-code">{{ selectedPattern.solution }}</pre>
              </div>
              
              <div class="detail-section" v-if="selectedPattern.examples.length > 0">
                <h4>Examples</h4>
                <div class="examples-list">
                  <div v-for="example in selectedPattern.examples" :key="example.title" class="example-item">
                    <h5>{{ example.title }}</h5>
                    <p>{{ example.description }}</p>
                    <pre v-if="example.code" class="example-code">{{ example.code }}</pre>
                  </div>
                </div>
              </div>
              
              <div class="detail-section">
                <h4>Metrics</h4>
                <div class="metrics-grid">
                  <div class="metric-item">
                    <span class="metric-label">Success Rate</span>
                    <span class="metric-value">{{ (selectedPattern.metrics.successRate * 100).toFixed(1) }}%</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Error Rate</span>
                    <span class="metric-value">{{ (selectedPattern.metrics.errorRate * 100).toFixed(1) }}%</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Avg Execution Time</span>
                    <span class="metric-value">{{ selectedPattern.metrics.avgExecutionTime }}ms</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Usage Count</span>
                    <span class="metric-value">{{ selectedPattern.metadata.usageCount }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="validatePattern(selectedPattern)" class="btn-primary">
              <Icon name="mdi:check-circle" /> Validate
            </button>
            <button @click="applyPattern(selectedPattern)" class="btn-primary">
              <Icon name="mdi:play" /> Apply Pattern
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Settings Modal -->
    <Teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click="showSettings = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Knowledge Validation Settings</h3>
            <button @click="showSettings = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="settings-form">
              <div class="form-group">
                <label>Confidence Threshold</label>
                <input 
                  v-model.number="settings.confidenceThreshold" 
                  type="number" 
                  step="0.1"
                  min="0"
                  max="1"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Minimum Examples Required</label>
                <input 
                  v-model.number="settings.minExamples" 
                  type="number"
                  min="1"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Auto-Validation</label>
                <div class="checkbox-group">
                  <input 
                    v-model="settings.autoValidation"
                    type="checkbox"
                    id="auto-validation"
                    class="form-checkbox"
                  />
                  <label for="auto-validation">Enable automatic pattern validation</label>
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showSettings = false" class="btn-secondary">Cancel</button>
            <button @click="saveSettings" class="btn-primary">Save Settings</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Pattern, LearningEvent } from '~/agents/knowledge/validation-workflow';

// State
const isRefreshing = ref(false);
const showSettings = ref(false);
const selectedPattern = ref<Pattern | null>(null);
const searchQuery = ref('');
const selectedCategory = ref<string>('all');

// Data
const patterns = ref<Pattern[]>([]);
const recentEvents = ref<LearningEvent[]>([]);
const statistics = ref({
  totalPatterns: 0,
  validatedPatterns: 0,
  pendingPatterns: 0,
  avgConfidence: 0
});

const settings = ref({
  confidenceThreshold: 0.7,
  minExamples: 2,
  autoValidation: false
});

// Auto-refresh interval
let refreshInterval: number | null = null;

// Available categories
const availableCategories = computed(() => {
  const categories = new Set(['all']);
  patterns.value.forEach(p => categories.add(p.category));
  return Array.from(categories);
});

// Filtered patterns
const filteredPatterns = computed(() => {
  let filtered = patterns.value;
  
  // Filter by category
  if (selectedCategory.value && selectedCategory.value !== 'all') {
    filtered = filtered.filter(p => p.category === selectedCategory.value);
  }
  
  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.problem.toLowerCase().includes(query) ||
      p.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }
  
  // Sort by confidence and usage
  return filtered.sort((a, b) => {
    const scoreA = a.metadata.confidence * Math.log(a.metadata.usageCount + 1);
    const scoreB = b.metadata.confidence * Math.log(b.metadata.usageCount + 1);
    return scoreB - scoreA;
  });
});

// Methods
async function refreshData() {
  if (isRefreshing.value) return;
  
  isRefreshing.value = true;
  try {
    // Use electron API to get knowledge validation data
    if (window.electronAPI?.knowledge) {
      const [patternsResult, eventsResult, statsResult] = await Promise.all([
        window.electronAPI.knowledge.executeTask('getPatterns', {}),
        window.electronAPI.knowledge.executeTask('getLearningEvents', { limit: 10 }),
        window.electronAPI.knowledge.executeTask('getStatistics', {})
      ]);
      
      if (patternsResult.success) patterns.value = patternsResult.patterns || [];
      if (eventsResult.success) recentEvents.value = eventsResult.events || [];
      if (statsResult.success) statistics.value = statsResult.statistics || statistics.value;
    } else {
      // Mock data for development
      patterns.value = [
        {
          id: 'pattern-1',
          name: 'React Component Pattern',
          description: 'Standard pattern for creating reusable React components',
          category: 'implementation',
          tags: ['react', 'typescript', 'components'],
          problem: 'Need to create reusable UI components',
          solution: 'Use functional components with TypeScript interfaces',
          context: { language: 'typescript', framework: 'react' },
          examples: [],
          metrics: {
            successRate: 0.95,
            avgExecutionTime: 150,
            avgTokensUsed: 800,
            avgCost: 0.02,
            errorRate: 0.05,
            adoptionRate: 0.85
          },
          validation: { status: 'validated' },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceAgents: ['developer'],
            sourceTasks: ['task-1'],
            confidence: 0.95,
            usageCount: 25
          }
        }
      ];
      
      recentEvents.value = [
        {
          id: 'event-1',
          timestamp: new Date().toISOString(),
          type: 'discovery',
          agentId: 'developer',
          taskId: 'task-1',
          description: 'Discovered new React component pattern',
          impact: 'medium',
          automated: true
        }
      ];
      
      statistics.value = {
        totalPatterns: 1,
        validatedPatterns: 1,
        pendingPatterns: 0,
        avgConfidence: 0.95
      };
    }
  } catch (error) {
    console.error('Failed to refresh knowledge validation data:', error);
  } finally {
    isRefreshing.value = false;
  }
}

function selectCategory(category: string) {
  selectedCategory.value = category;
}

function selectPattern(pattern: Pattern) {
  selectedPattern.value = pattern;
}

async function validatePattern(pattern: Pattern) {
  try {
    if (window.electronAPI?.knowledge) {
      const result = await window.electronAPI.knowledge.executeTask('validatePattern', {
        patternId: pattern.id
      });
      
      if (result.success) {
        // Update pattern in local state
        const index = patterns.value.findIndex(p => p.id === pattern.id);
        if (index !== -1) {
          patterns.value[index] = result.pattern;
        }
        selectedPattern.value = null;
      }
    }
  } catch (error) {
    console.error('Failed to validate pattern:', error);
  }
}

async function applyPattern(pattern: Pattern) {
  // TODO: Implement pattern application
  console.log('Applying pattern:', pattern.name);
}

async function exportKnowledge() {
  try {
    if (window.electronAPI?.knowledge) {
      const result = await window.electronAPI.knowledge.executeTask('exportKnowledge', {
        format: 'json'
      });
      
      if (result.success) {
        // Download the exported knowledge
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `knowledge-base-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  } catch (error) {
    console.error('Failed to export knowledge:', error);
  }
}

async function saveSettings() {
  try {
    if (window.electronAPI?.knowledge) {
      await window.electronAPI.knowledge.executeTask('updateSettings', {
        settings: settings.value
      });
    }
    showSettings.value = false;
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Helper functions
function getBadgeClass() {
  const pendingCount = statistics.value.pendingPatterns;
  if (pendingCount > 5) return 'badge-warning';
  if (pendingCount > 0) return 'badge-info';
  return 'badge-success';
}

function getStatusText() {
  const pendingCount = statistics.value.pendingPatterns;
  if (pendingCount > 5) return 'High Pending';
  if (pendingCount > 0) return 'Some Pending';
  return 'Up to Date';
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'architecture': return 'mdi:sitemap';
    case 'implementation': return 'mdi:code-braces';
    case 'debugging': return 'mdi:bug';
    case 'optimization': return 'mdi:speedometer';
    case 'testing': return 'mdi:test-tube';
    default: return 'mdi:shape';
  }
}

function formatCategory(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function getCategoryCount(category: string) {
  if (category === 'all') return patterns.value.length;
  return patterns.value.filter(p => p.category === category).length;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'validated': return 'mdi:check-circle';
    case 'pending': return 'mdi:clock-outline';
    case 'rejected': return 'mdi:close-circle';
    case 'deprecated': return 'mdi:archive';
    default: return 'mdi:help-circle';
  }
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getEventIcon(type: string) {
  switch (type) {
    case 'success': return 'mdi:check';
    case 'failure': return 'mdi:alert';
    case 'optimization': return 'mdi:tune';
    case 'discovery': return 'mdi:lightbulb';
    default: return 'mdi:information';
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Lifecycle
onMounted(async () => {
  await refreshData();
  
  // Set up auto-refresh every 30 seconds
  refreshInterval = window.setInterval(refreshData, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    window.clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.knowledge-validation-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #181818;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-success { background: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
.badge-info { background: rgba(0, 122, 204, 0.2); color: #007acc; }
.badge-warning { background: rgba(255, 193, 7, 0.2); color: #ffc107; }

.header-right {
  display: flex;
  gap: 8px;
}

.statistics-section,
.categories-section,
.patterns-section,
.events-section {
  padding: 16px;
  border-bottom: 1px solid #181818;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #ffffff;
  font-size: 13px;
}

.search-box {
  margin-left: auto;
  position: relative;
}

.search-input {
  padding: 6px 30px 6px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 12px;
  width: 200px;
}

.search-icon {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: #007acc;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
}

.category-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.category-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.category-btn:hover {
  background: #4c4c4c;
}

.category-btn.active {
  background: #007acc;
  border-color: #007acc;
  color: #ffffff;
}

.category-count {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}

.patterns-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pattern-item {
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
  cursor: pointer;
  transition: all 0.2s;
}

.pattern-item:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.pattern-validated { border-left: 4px solid #4ec9b0; }
.pattern-pending { border-left: 4px solid #ffc107; }
.pattern-rejected { border-left: 4px solid #cd3131; }
.pattern-deprecated { border-left: 4px solid #6c6c6c; }

.pattern-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.pattern-title {
  font-weight: 600;
  color: #ffffff;
  font-size: 13px;
}

.pattern-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #999;
}

.pattern-description {
  font-size: 12px;
  color: #cccccc;
  margin-bottom: 8px;
  line-height: 1.4;
}

.pattern-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #999;
  margin-bottom: 8px;
}

.pattern-category {
  background: #007acc;
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 3px;
}

.pattern-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  background: #3c3c3c;
  color: #cccccc;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.event-success { border-left: 4px solid #4ec9b0; }
.event-failure { border-left: 4px solid #cd3131; }
.event-optimization { border-left: 4px solid #ff9800; }
.event-discovery { border-left: 4px solid #007acc; }

.event-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3c3c3c;
  border-radius: 50%;
}

.event-content {
  flex: 1;
}

.event-description {
  font-size: 12px;
  color: #cccccc;
  margin-bottom: 4px;
}

.event-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #999;
}

.impact-high { color: #cd3131; }
.impact-medium { color: #ffc107; }
.impact-low { color: #4ec9b0; }

.no-patterns,
.no-events {
  text-align: center;
  padding: 32px;
  color: #999;
}

.no-patterns p,
.no-events p {
  margin: 8px 0 4px;
  font-size: 14px;
}

.no-patterns small {
  font-size: 12px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Button styles */
.btn-primary,
.btn-secondary,
.btn-icon {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #005a9e;
}

.btn-secondary {
  background: #3c3c3c;
  color: #cccccc;
}

.btn-secondary:hover:not(:disabled) {
  background: #4c4c4c;
}

.btn-icon {
  padding: 6px;
  background: transparent;
  color: #cccccc;
}

.btn-icon:hover:not(:disabled) {
  background: #3c3c3c;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 6px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #181818;
  background: #252526;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #181818;
  background: #252526;
}

.pattern-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-section h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #ffffff;
  font-weight: 600;
}

.solution-code,
.example-code {
  background: #252526;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #3c3c3c;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #d4d4d4;
  white-space: pre-wrap;
  overflow-x: auto;
}

.examples-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.example-item {
  padding: 12px;
  background: #252526;
  border-radius: 4px;
  border: 1px solid #3c3c3c;
}

.example-item h5 {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #ffffff;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #252526;
  border-radius: 4px;
  border: 1px solid #3c3c3c;
}

.metric-label {
  font-size: 12px;
  color: #cccccc;
}

.metric-value {
  font-size: 12px;
  color: #007acc;
  font-weight: 600;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-weight: 500;
  font-size: 12px;
  color: #cccccc;
}

.form-input {
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.form-input:focus {
  outline: none;
  border-color: #007acc;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-checkbox {
  width: 16px;
  height: 16px;
}
</style>