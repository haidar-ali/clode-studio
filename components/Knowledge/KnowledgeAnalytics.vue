<template>
  <div class="knowledge-analytics">
    <!-- Header -->
    <div class="analytics-header">
      <h2>Knowledge Base Analytics</h2>
      <div class="header-actions">
        <select v-model="selectedTimeframe" class="timeframe-select">
          <option value="day">Last 24 Hours</option>
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
          <option value="all">All Time</option>
        </select>
        <button 
          class="action-btn" 
          @click="analyzeKnowledgeBase"
          :disabled="isAnalyzing"
        >
          <Icon :name="isAnalyzing ? 'mdi:loading' : 'mdi:refresh'" />
          {{ isAnalyzing ? 'Analyzing...' : 'Analyze' }}
        </button>
        <button class="action-btn" @click="exportReport">
          <Icon name="mdi:download" />
          Export Report
        </button>
      </div>
    </div>

    <!-- Health Score Card -->
    <div class="health-card">
      <div class="health-score" :class="getHealthClass(insights.health)">
        <div class="score-circle">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" class="score-bg" />
            <circle 
              cx="50" 
              cy="50" 
              r="45" 
              class="score-fill"
              :stroke-dasharray="`${(insights.health / 100) * 283} 283`"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div class="score-value">{{ insights.health }}</div>
        </div>
        <div class="health-details">
          <h3>Knowledge Base Health</h3>
          <p>{{ getHealthDescription(insights.health) }}</p>
          <div class="health-metrics">
            <div class="metric">
              <span class="metric-label">Coverage</span>
              <span class="metric-value">{{ insights.summary.coveragePercentage.toFixed(1) }}%</span>
            </div>
            <div class="metric">
              <span class="metric-label">Effectiveness</span>
              <span class="metric-value">{{ (insights.summary.effectiveness * 100).toFixed(1) }}%</span>
            </div>
            <div class="metric">
              <span class="metric-label">Critical Gaps</span>
              <span class="metric-value">{{ insights.summary.criticalGaps }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recommendations -->
    <div v-if="insights.recommendations.length > 0" class="recommendations-section">
      <h3>Recommendations</h3>
      <div class="recommendations-grid">
        <div 
          v-for="rec in insights.recommendations" 
          :key="rec.title"
          :class="['recommendation-card', `priority-${rec.priority}`]"
        >
          <div class="rec-header">
            <Icon :name="getRecommendationIcon(rec.type)" />
            <span class="rec-priority">{{ rec.priority }}</span>
          </div>
          <h4>{{ rec.title }}</h4>
          <p>{{ rec.description }}</p>
          <button class="rec-action" @click="handleRecommendationAction(rec)">
            {{ rec.action }}
          </button>
        </div>
      </div>
    </div>

    <!-- Analytics Tabs -->
    <div class="analytics-tabs">
      <div class="tab-nav">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <Icon :name="tab.icon" />
          {{ tab.label }}
        </button>
      </div>

      <!-- Usage Tab -->
      <div v-if="activeTab === 'usage'" class="tab-content">
        <div class="usage-grid">
          <!-- Most Used Entries -->
          <div class="usage-card">
            <h4>Most Used Entries</h4>
            <div class="usage-list">
              <div 
                v-for="{ entry, usage } in mostUsed.slice(0, 5)" 
                :key="entry.id"
                class="usage-item"
              >
                <div class="usage-info">
                  <Icon :name="getCategoryIcon(entry.category)" />
                  <span class="entry-title">{{ entry.title }}</span>
                </div>
                <div class="usage-stats">
                  <span class="access-count">{{ usage.accessCount }}</span>
                  <div class="relevance-bar">
                    <div 
                      class="relevance-fill"
                      :style="{ width: `${usage.averageRelevanceScore * 100}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Least Used Entries -->
          <div class="usage-card">
            <h4>Least Used Entries</h4>
            <div class="usage-list">
              <div 
                v-for="{ entry, usage } in leastUsed.slice(0, 5)" 
                :key="entry.id"
                class="usage-item low-usage"
              >
                <div class="usage-info">
                  <Icon :name="getCategoryIcon(entry.category)" />
                  <span class="entry-title">{{ entry.title }}</span>
                </div>
                <div class="usage-stats">
                  <span class="access-count">{{ usage.accessCount }}</span>
                  <button class="remove-btn" @click="handleRemoveEntry(entry)">
                    <Icon name="mdi:delete" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Token Usage Chart -->
        <div class="token-usage-chart">
          <h4>Token Usage by Source</h4>
          <canvas ref="tokenChartCanvas"></canvas>
        </div>
      </div>

      <!-- Gaps Tab -->
      <div v-if="activeTab === 'gaps'" class="tab-content">
        <div class="gaps-overview">
          <div class="gap-distribution">
            <h4>Gap Distribution</h4>
            <div class="gap-chart">
              <div 
                v-for="gap in getGapDistribution()" 
                :key="gap.type"
                class="gap-bar"
              >
                <div class="gap-label">{{ gap.type }}</div>
                <div class="gap-meter">
                  <div 
                    class="gap-fill"
                    :style="{ width: `${gap.percentage}%` }"
                  ></div>
                </div>
                <div class="gap-count">{{ gap.count }}</div>
              </div>
            </div>
          </div>

          <div class="critical-gaps">
            <h4>Critical Gaps</h4>
            <div class="gap-list">
              <div 
                v-for="gap in gaps.filter(g => g.severity === 'high').slice(0, 5)" 
                :key="gap.id"
                class="gap-item critical"
              >
                <div class="gap-header">
                  <Icon name="mdi:alert" />
                  <span class="gap-type">{{ formatGapType(gap.type) }}</span>
                </div>
                <p class="gap-description">{{ gap.description }}</p>
                <button class="fix-btn" @click="handleFixGap(gap)">
                  Fix Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trends Tab -->
      <div v-if="activeTab === 'trends'" class="tab-content">
        <div class="trends-charts">
          <div class="trend-chart">
            <h4>Query Volume</h4>
            <canvas ref="queryTrendCanvas"></canvas>
          </div>
          <div class="trend-chart">
            <h4>Average Relevance</h4>
            <canvas ref="relevanceTrendCanvas"></canvas>
          </div>
        </div>

        <div class="trend-insights">
          <h4>Trend Insights</h4>
          <div class="insight-cards">
            <div class="insight-card">
              <Icon name="mdi:trending-up" />
              <div class="insight-content">
                <span class="insight-label">Query Growth</span>
                <span class="insight-value">{{ calculateGrowth() }}%</span>
              </div>
            </div>
            <div class="insight-card">
              <Icon name="mdi:speedometer" />
              <div class="insight-content">
                <span class="insight-label">Avg Response Time</span>
                <span class="insight-value">{{ avgResponseTime }}ms</span>
              </div>
            </div>
            <div class="insight-card">
              <Icon name="mdi:target" />
              <div class="insight-content">
                <span class="insight-label">Hit Rate</span>
                <span class="insight-value">{{ hitRate }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dependencies Tab -->
      <div v-if="activeTab === 'dependencies'" class="tab-content">
        <div class="dependencies-view">
          <div class="dependency-stats">
            <h4>Dependency Analysis</h4>
            <div class="dep-metrics">
              <div class="dep-metric">
                <span class="metric-label">Total Nodes</span>
                <span class="metric-value">{{ dependencyInsights.totalNodes }}</span>
              </div>
              <div class="dep-metric">
                <span class="metric-label">Circular Dependencies</span>
                <span class="metric-value critical">{{ dependencyInsights.circularDependencies.length }}</span>
              </div>
              <div class="dep-metric">
                <span class="metric-label">Highly Coupled</span>
                <span class="metric-value warning">{{ dependencyInsights.highlyCoupled.length }}</span>
              </div>
              <div class="dep-metric">
                <span class="metric-label">Isolated Nodes</span>
                <span class="metric-value">{{ dependencyInsights.isolated.length }}</span>
              </div>
            </div>
          </div>

          <div class="dependency-graph">
            <h4>Dependency Graph</h4>
            <div ref="dependencyGraphContainer" class="graph-container">
              <!-- D3.js graph will be rendered here -->
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Last Analysis Info -->
    <div v-if="lastAnalysisTime" class="last-analysis">
      <Icon name="mdi:information" />
      Last analyzed: {{ formatDate(lastAnalysisTime) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import { useKnowledgeInsights } from '~/composables/useKnowledgeInsights';

Chart.register(...registerables);

const {
  isAnalyzing,
  lastAnalysisTime,
  selectedTimeframe,
  insights,
  gaps,
  mostUsed,
  leastUsed,
  coverage,
  effectiveness,
  dependencyInsights,
  analyzeKnowledgeBase,
  getDependencyGraphData,
  getGapDistribution,
  getTokenUsageBySource,
  exportInsightsReport
} = useKnowledgeInsights();

const activeTab = ref('usage');
const tokenChartCanvas = ref<HTMLCanvasElement>();
const queryTrendCanvas = ref<HTMLCanvasElement>();
const relevanceTrendCanvas = ref<HTMLCanvasElement>();
const dependencyGraphContainer = ref<HTMLDivElement>();

const tabs = [
  { id: 'usage', label: 'Usage', icon: 'mdi:chart-line' },
  { id: 'gaps', label: 'Knowledge Gaps', icon: 'mdi:alert-circle' },
  { id: 'trends', label: 'Trends', icon: 'mdi:trending-up' },
  { id: 'dependencies', label: 'Dependencies', icon: 'mdi:graph' }
];

// Computed properties
const avgResponseTime = computed(() => {
  // Mock data - in real implementation, this would come from analytics
  return 235;
});

const hitRate = computed(() => {
  // Mock data - in real implementation, this would come from analytics
  return 87.5;
});

// Methods
function getHealthClass(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function getHealthDescription(score: number): string {
  if (score >= 80) return 'Your knowledge base is in excellent condition!';
  if (score >= 60) return 'Good overall health with some areas for improvement.';
  if (score >= 40) return 'Fair condition - consider addressing the recommendations.';
  return 'Needs attention - multiple critical issues detected.';
}

function getRecommendationIcon(type: string): string {
  const icons: Record<string, string> = {
    coverage: 'mdi:file-document-multiple',
    quality: 'mdi:quality-high',
    gaps: 'mdi:alert',
    maintenance: 'mdi:wrench'
  };
  return icons[type] || 'mdi:lightbulb';
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    concepts: 'mdi:lightbulb',
    api: 'mdi:api',
    guides: 'mdi:book-open-variant',
    snippets: 'mdi:code-tags',
    architecture: 'mdi:sitemap',
    troubleshooting: 'mdi:bug'
  };
  return icons[category] || 'mdi:file-document';
}

function formatGapType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function calculateGrowth(): number {
  // Mock calculation - in real implementation, compare current vs previous period
  return 23.5;
}

async function handleRecommendationAction(recommendation: any) {
  // Handle different recommendation actions
  console.log('Handle recommendation:', recommendation);
}

async function handleRemoveEntry(entry: any) {
  if (confirm(`Remove "${entry.title}" from knowledge base?`)) {
    // Remove entry logic
    console.log('Remove entry:', entry);
  }
}

async function handleFixGap(gap: any) {
  // Handle gap fixing
  console.log('Fix gap:', gap);
}

async function exportReport() {
  const report = exportInsightsReport('markdown');
  const blob = new Blob([report], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knowledge-insights-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// Chart initialization
function initializeCharts() {
  // Token usage chart
  if (tokenChartCanvas.value) {
    const ctx = tokenChartCanvas.value.getContext('2d');
    if (ctx) {
      const tokenData = getTokenUsageBySource();
      
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: tokenData.map(d => d.source),
          datasets: [{
            data: tokenData.map(d => d.tokens),
            backgroundColor: [
              '#3b82f6',
              '#10b981',
              '#f59e0b',
              '#ef4444',
              '#8b5cf6'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            }
          }
        }
      });
    }
  }

  // Query trend chart
  if (queryTrendCanvas.value) {
    const ctx = queryTrendCanvas.value.getContext('2d');
    if (ctx) {
      // Mock trend data
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString();
      });
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: 'Queries',
            data: [45, 52, 48, 61, 58, 65, 72],
            borderColor: '#3b82f6',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    }
  }

  // Relevance trend chart
  if (relevanceTrendCanvas.value) {
    const ctx = relevanceTrendCanvas.value.getContext('2d');
    if (ctx) {
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString();
      });
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: 'Relevance',
            data: [0.75, 0.78, 0.72, 0.81, 0.79, 0.83, 0.85],
            borderColor: '#10b981',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 0,
              max: 1
            }
          },
          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    }
  }
}

// Initialize dependency graph (would use D3.js in real implementation)
function initializeDependencyGraph() {
  if (!dependencyGraphContainer.value) return;
  
  // This is a placeholder - in real implementation, use D3.js
  // to create an interactive force-directed graph
  const graphData = getDependencyGraphData();
  console.log('Graph data:', graphData);
}

onMounted(() => {
  // Run initial analysis
  analyzeKnowledgeBase();
  
  // Initialize charts after a delay to ensure DOM is ready
  setTimeout(() => {
    initializeCharts();
    initializeDependencyGraph();
  }, 100);
});

watch(activeTab, (newTab) => {
  if (newTab === 'usage' || newTab === 'trends') {
    setTimeout(initializeCharts, 100);
  } else if (newTab === 'dependencies') {
    setTimeout(initializeDependencyGraph, 100);
  }
});
</script>

<style scoped>
.knowledge-analytics {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow-y: auto;
}

/* Header */
.analytics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.analytics-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.timeframe-select {
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Health Card */
.health-card {
  margin: 20px;
}

.health-score {
  display: flex;
  gap: 24px;
  padding: 24px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.score-circle {
  position: relative;
  width: 120px;
  height: 120px;
}

.score-circle svg {
  width: 100%;
  height: 100%;
}

.score-bg {
  fill: none;
  stroke: var(--bg-tertiary);
  stroke-width: 8;
}

.score-fill {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}

.health-score.excellent .score-fill {
  stroke: #10b981;
}

.health-score.good .score-fill {
  stroke: #3b82f6;
}

.health-score.fair .score-fill {
  stroke: #f59e0b;
}

.health-score.poor .score-fill {
  stroke: #ef4444;
}

.score-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 36px;
  font-weight: 700;
}

.health-details {
  flex: 1;
}

.health-details h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
}

.health-details p {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
}

.health-metrics {
  display: flex;
  gap: 24px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
}

/* Recommendations */
.recommendations-section {
  margin: 0 20px 20px;
}

.recommendations-section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
}

.recommendations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.recommendation-card {
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.recommendation-card.priority-high {
  border-color: #ef4444;
}

.recommendation-card.priority-medium {
  border-color: #f59e0b;
}

.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rec-priority {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  padding: 2px 8px;
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.recommendation-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.recommendation-card p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.rec-action {
  padding: 6px 12px;
  background: var(--primary-color);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
}

/* Analytics Tabs */
.analytics-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0 20px 20px;
}

.tab-nav {
  display: flex;
  gap: 2px;
  background: var(--bg-secondary);
  padding: 4px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tab-btn.active {
  background: var(--bg-primary);
  color: var(--primary-color);
  font-weight: 500;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

/* Usage Tab */
.usage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.usage-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.usage-card h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.usage-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 6px;
}

.usage-item.low-usage {
  opacity: 0.7;
}

.usage-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.entry-title {
  font-size: 14px;
  font-weight: 500;
}

.usage-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.access-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
}

.relevance-bar {
  width: 60px;
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}

.relevance-fill {
  height: 100%;
  background: var(--success-color);
  transition: width 0.3s;
}

.remove-btn {
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
}

.remove-btn:hover {
  background: var(--danger-color);
  color: white;
}

.token-usage-chart {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  height: 300px;
}

.token-usage-chart h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.token-usage-chart canvas {
  max-height: 250px;
}

/* Gaps Tab */
.gaps-overview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.gap-distribution,
.critical-gaps {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.gap-distribution h4,
.critical-gaps h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.gap-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gap-bar {
  display: grid;
  grid-template-columns: 120px 1fr 40px;
  align-items: center;
  gap: 12px;
}

.gap-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.gap-meter {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.gap-fill {
  height: 100%;
  background: var(--warning-color);
  transition: width 0.3s;
}

.gap-count {
  text-align: right;
  font-size: 14px;
  font-weight: 600;
}

.gap-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gap-item {
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.gap-item.critical {
  border-color: var(--danger-color);
}

.gap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--danger-color);
}

.gap-type {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.gap-description {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.fix-btn {
  padding: 6px 12px;
  background: var(--danger-color);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 12px;
}

/* Trends Tab */
.trends-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.trend-chart {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  height: 250px;
}

.trend-chart h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.trend-chart canvas {
  max-height: 180px;
}

.trend-insights {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.trend-insights h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.insight-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.insight-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 6px;
}

.insight-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.insight-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.insight-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-color);
}

/* Dependencies Tab */
.dependencies-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dependency-stats {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.dependency-stats h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.dep-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.dep-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-value.critical {
  color: var(--danger-color);
}

.metric-value.warning {
  color: var(--warning-color);
}

.dependency-graph {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.dependency-graph h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.graph-container {
  height: 400px;
  background: var(--bg-primary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

/* Last Analysis */
.last-analysis {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-secondary);
}

/* CSS Variables */
:root {
  --bg-primary: #1a1a1a;
  --bg-secondary: #242424;
  --bg-tertiary: #2a2a2a;
  --bg-hover: #333333;
  --text-primary: #e4e4e4;
  --text-secondary: #a0a0a0;
  --border-color: #363636;
  --primary-color: #3b82f6;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --danger-color: #ef4444;
}
</style>