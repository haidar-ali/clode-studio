<template>
  <div class="context-visualization">
    <!-- Header with controls -->
    <div class="viz-header">
      <h3>Context Visualization</h3>
      <div class="header-actions">
        <button 
          class="action-btn"
          :class="{ active: autoRefresh }"
          @click="autoRefresh = !autoRefresh"
        >
          <Icon name="heroicons:arrow-path" />
          Auto Refresh
        </button>
        <button class="action-btn" @click="optimizeContext">
          <Icon name="heroicons:sparkles" />
          Optimize
        </button>
      </div>
    </div>

    <!-- Context Meter -->
    <div class="context-meter">
      <div class="meter-info">
        <span class="meter-label">Context Usage</span>
        <span class="meter-value">{{ formatTokens(currentTokens) }} / {{ formatTokens(maxTokens) }}</span>
        <span class="meter-percentage">{{ contextPercentage }}%</span>
      </div>
      <div class="meter-bar">
        <div 
          class="meter-fill"
          :class="meterClass"
          :style="{ width: `${contextPercentage}%` }"
        >
          <div class="meter-animation"></div>
        </div>
        <div class="meter-segments">
          <div v-for="i in 10" :key="i" class="segment"></div>
        </div>
      </div>
      <div class="meter-labels">
        <span>0</span>
        <span>{{ formatTokens(maxTokens / 2) }}</span>
        <span>{{ formatTokens(maxTokens) }}</span>
      </div>
    </div>

    <!-- Context Breakdown -->
    <div class="context-breakdown">
      <h4>Context Distribution</h4>
      <div class="breakdown-items">
        <div 
          v-for="item in contextBreakdown" 
          :key="item.type"
          class="breakdown-item"
        >
          <div class="item-header">
            <Icon :name="item.icon" />
            <span class="item-type">{{ item.label }}</span>
            <span class="item-tokens">{{ formatTokens(item.tokens) }}</span>
          </div>
          <div class="item-bar">
            <div 
              class="item-fill"
              :style="{ 
                width: `${(item.tokens / currentTokens) * 100}%`,
                backgroundColor: item.color 
              }"
            ></div>
          </div>
          <div v-if="item.files && item.files.length > 0" class="item-details">
            <div 
              v-for="file in item.files.slice(0, 3)" 
              :key="file.path"
              class="file-item"
            >
              <span class="file-name">{{ file.name }}</span>
              <span class="file-tokens">{{ formatTokens(file.tokens) }}</span>
            </div>
            <div v-if="item.files.length > 3" class="more-files">
              +{{ item.files.length - 3 }} more
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Optimization Suggestions -->
    <div v-if="suggestions.length > 0" class="optimization-suggestions">
      <h4>Optimization Suggestions</h4>
      <div class="suggestion-list">
        <div 
          v-for="suggestion in suggestions" 
          :key="suggestion.id"
          class="suggestion-item"
        >
          <Icon :name="suggestion.icon" />
          <div class="suggestion-content">
            <p class="suggestion-text">{{ suggestion.text }}</p>
            <span class="suggestion-impact">
              Save ~{{ formatTokens(suggestion.tokensSaved) }} tokens
            </span>
          </div>
          <button 
            class="apply-btn"
            @click="applySuggestion(suggestion)"
          >
            Apply
          </button>
        </div>
      </div>
    </div>

    <!-- Historical View -->
    <div class="context-history">
      <h4>Context Usage History</h4>
      <div class="history-chart">
        <canvas ref="chartCanvas"></canvas>
      </div>
      <div class="history-stats">
        <div class="stat">
          <span class="stat-label">Avg Usage</span>
          <span class="stat-value">{{ formatTokens(avgUsage) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Peak Usage</span>
          <span class="stat-value">{{ formatTokens(peakUsage) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Optimizations</span>
          <span class="stat-value">{{ totalOptimizations }}</span>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <button class="quick-action" @click="createCheckpoint">
        <Icon name="heroicons:bookmark" />
        Create Checkpoint
      </button>
      <button class="quick-action" @click="clearUnusedContext">
        <Icon name="heroicons:trash" />
        Clear Unused
      </button>
      <button class="quick-action" @click="showAdvancedSettings">
        <Icon name="heroicons:cog-6-tooth" />
        Advanced
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useContextStore } from '~/stores/context';
import { useEditorStore } from '~/stores/editor';
import { useKnowledgeStore } from '~/stores/knowledge';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const contextStore = useContextStore();
const editorStore = useEditorStore();
const knowledgeStore = useKnowledgeStore();

const autoRefresh = ref(true);
const chartCanvas = ref<HTMLCanvasElement>();
let chart: Chart | null = null;
let refreshInterval: NodeJS.Timeout | null = null;

// Mock data for visualization - should be replaced with actual context tracking
const currentTokens = ref(45000);
const maxTokens = ref(200000);
const contextHistory = ref<Array<{ time: Date; tokens: number }>>([]);

const contextPercentage = computed(() => 
  Math.round((currentTokens.value / maxTokens.value) * 100)
);

const meterClass = computed(() => {
  const percentage = contextPercentage.value;
  if (percentage >= 90) return 'critical';
  if (percentage >= 75) return 'warning';
  if (percentage >= 50) return 'moderate';
  return 'safe';
});

const contextBreakdown = computed(() => {
  const openFiles = editorStore.tabs.length;
  const knowledgeEntries = knowledgeStore.entries.length;
  
  return [
    {
      type: 'system',
      label: 'System Prompts',
      tokens: 2500,
      icon: 'heroicons:cog',
      color: '#8b5cf6'
    },
    {
      type: 'memory',
      label: 'Memory (CLAUDE.md)',
      tokens: 5000,
      icon: 'heroicons:cpu-chip',
      color: '#3b82f6'
    },
    {
      type: 'files',
      label: 'Open Files',
      tokens: 20000,
      icon: 'heroicons:document',
      color: '#10b981',
      files: editorStore.tabs.map(tab => ({
        name: tab.name,
        path: tab.path,
        tokens: Math.floor(Math.random() * 5000) + 1000
      }))
    },
    {
      type: 'knowledge',
      label: 'Knowledge Base',
      tokens: 10000,
      icon: 'heroicons:book-open',
      color: '#f59e0b',
      files: knowledgeStore.entries.slice(0, 5).map(entry => ({
        name: entry.title,
        path: entry.id,
        tokens: Math.floor(Math.random() * 3000) + 500
      }))
    },
    {
      type: 'conversation',
      label: 'Conversation History',
      tokens: 7500,
      icon: 'heroicons:chat-bubble-left-right',
      color: '#ef4444'
    }
  ];
});

const suggestions = computed(() => {
  const suggs = [];
  
  if (contextPercentage.value > 70) {
    suggs.push({
      id: 'remove-old-files',
      text: 'Remove files not accessed in the last 30 minutes',
      tokensSaved: 8000,
      icon: 'heroicons:document-minus'
    });
  }
  
  if (contextBreakdown.value.find(b => b.type === 'conversation')?.tokens! > 5000) {
    suggs.push({
      id: 'summarize-conversation',
      text: 'Summarize older conversation history',
      tokensSaved: 4000,
      icon: 'heroicons:document-duplicate'
    });
  }
  
  if (knowledgeStore.entries.length > 10) {
    suggs.push({
      id: 'prune-knowledge',
      text: 'Remove low-relevance knowledge entries',
      tokensSaved: 3000,
      icon: 'heroicons:scissors'
    });
  }
  
  return suggs;
});

const avgUsage = computed(() => {
  if (contextHistory.value.length === 0) return 0;
  const sum = contextHistory.value.reduce((acc, h) => acc + h.tokens, 0);
  return Math.round(sum / contextHistory.value.length);
});

const peakUsage = computed(() => {
  if (contextHistory.value.length === 0) return 0;
  return Math.max(...contextHistory.value.map(h => h.tokens));
});

const totalOptimizations = ref(0);

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function optimizeContext() {
  // Simulate optimization
  const reduction = Math.floor(currentTokens.value * 0.2);
  currentTokens.value -= reduction;
  totalOptimizations.value++;
  
  // Add to history
  addToHistory();
}

function applySuggestion(suggestion: any) {
  // Simulate applying suggestion
  currentTokens.value -= suggestion.tokensSaved;
  totalOptimizations.value++;
  
  // Remove the suggestion
  // In real implementation, this would trigger actual context changes
}

function createCheckpoint() {
  contextStore.createCheckpoint('manual', {
    tokens: currentTokens.value,
    breakdown: contextBreakdown.value
  });
}

function clearUnusedContext() {
  // Simulate clearing unused context
  currentTokens.value = Math.floor(currentTokens.value * 0.7);
  addToHistory();
}

function showAdvancedSettings() {
  // Would open a modal with advanced settings
  
}

function addToHistory() {
  contextHistory.value.push({
    time: new Date(),
    tokens: currentTokens.value
  });
  
  // Keep last 50 entries
  if (contextHistory.value.length > 50) {
    contextHistory.value = contextHistory.value.slice(-50);
  }
  
  updateChart();
}

function updateChart() {
  if (!chart || !chartCanvas.value) return;
  
  const labels = contextHistory.value.map(h => 
    h.time.toLocaleTimeString()
  );
  
  const data = contextHistory.value.map(h => h.tokens);
  
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

function initChart() {
  if (!chartCanvas.value) return;
  
  const ctx = chartCanvas.value.getContext('2d');
  if (!ctx) return;
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Token Usage',
        data: [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: maxTokens.value,
          ticks: {
            callback: (value) => formatTokens(value as number)
          }
        }
      }
    }
  });
  
  // Add initial data
  for (let i = 0; i < 10; i++) {
    contextHistory.value.push({
      time: new Date(Date.now() - (10 - i) * 60000),
      tokens: Math.floor(Math.random() * 50000) + 30000
    });
  }
  
  updateChart();
}

onMounted(() => {
  initChart();
  
  // Set up auto refresh
  if (autoRefresh.value) {
    refreshInterval = setInterval(() => {
      // Simulate context changes
      currentTokens.value += Math.floor(Math.random() * 2000) - 1000;
      currentTokens.value = Math.max(0, Math.min(maxTokens.value, currentTokens.value));
      addToHistory();
    }, 5000);
  }
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  if (chart) {
    chart.destroy();
  }
});

watch(autoRefresh, (value) => {
  if (value && !refreshInterval) {
    refreshInterval = setInterval(() => {
      currentTokens.value += Math.floor(Math.random() * 2000) - 1000;
      currentTokens.value = Math.max(0, Math.min(maxTokens.value, currentTokens.value));
      addToHistory();
    }, 5000);
  } else if (!value && refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
});
</script>

<style scoped>
.context-visualization {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
}

.viz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.viz-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: var(--color-background-soft);
}

.action-btn.active {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Context Meter */
.context-meter {
  background-color: var(--color-background-soft);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.meter-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}

.meter-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.meter-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.meter-percentage {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.meter-bar {
  position: relative;
  height: 32px;
  background-color: var(--color-background-mute);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 8px;
}

.meter-fill {
  height: 100%;
  border-radius: 16px;
  transition: width 0.5s ease, background-color 0.3s;
  position: relative;
  overflow: hidden;
}

.meter-fill.safe {
  background-color: #10b981;
}

.meter-fill.moderate {
  background-color: #3b82f6;
}

.meter-fill.warning {
  background-color: #f59e0b;
}

.meter-fill.critical {
  background-color: #ef4444;
}

.meter-animation {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  to {
    left: 100%;
  }
}

.meter-segments {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 2px;
  padding: 2px;
}

.segment {
  flex: 1;
  background-color: var(--color-background);
  opacity: 0.2;
}

.meter-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* Context Breakdown */
.context-breakdown {
  background-color: var(--color-background-soft);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.context-breakdown h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.breakdown-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.breakdown-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-header svg {
  width: 16px;
  height: 16px;
}

.item-type {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
}

.item-tokens {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.item-bar {
  height: 8px;
  background-color: var(--color-background-mute);
  border-radius: 4px;
  overflow: hidden;
}

.item-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.item-details {
  margin-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.more-files {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-style: italic;
}

/* Optimization Suggestions */
.optimization-suggestions {
  background-color: var(--color-background-soft);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.optimization-suggestions h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.suggestion-item svg {
  width: 20px;
  height: 20px;
  color: var(--color-primary);
}

.suggestion-content {
  flex: 1;
}

.suggestion-text {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--color-text);
}

.suggestion-impact {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.apply-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background-color: var(--color-primary);
  color: white;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.apply-btn:hover {
  background-color: var(--color-primary-hover);
}

/* History Chart */
.context-history {
  background-color: var(--color-background-soft);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.context-history h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.history-chart {
  height: 200px;
  margin-bottom: 16px;
}

.history-stats {
  display: flex;
  justify-content: space-around;
}

.stat {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

/* Quick Actions */
.quick-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.quick-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background-color: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.quick-action:hover {
  background-color: var(--color-background-soft);
}

/* Dark theme variables */
:root {
  --color-background: #1a1a1a;
  --color-background-soft: #242424;
  --color-background-mute: #2a2a2a;
  --color-border: #363636;
  --color-text: #e4e4e4;
  --color-text-secondary: #a0a0a0;
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
}
</style>