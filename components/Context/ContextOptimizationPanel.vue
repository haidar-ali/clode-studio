<template>
  <div class="context-optimization-panel">
    <div class="panel-header">
      <h3>Context Optimization</h3>
      <button @click="$emit('close')" class="close-button">
        <Icon name="mdi:close" size="18" />
      </button>
    </div>
    
    <div class="panel-content">
      <!-- Context Overview -->
      <div class="context-overview">
        <h4>Context Usage</h4>
        <div class="usage-meter">
          <ContextMeter 
            :animated="false"
            :show-warning="true"
            :show-optimization="true"
            @optimize="executeOptimization"
          />
        </div>
        
        <div class="usage-details">
          <div class="usage-stat">
            <span class="stat-label">Total Tokens:</span>
            <span class="stat-value">{{ formatTokens(contextUsage.current) }}</span>
          </div>
          <div class="usage-stat">
            <span class="stat-label">Available:</span>
            <span class="stat-value">{{ formatTokens(contextUsage.maximum - contextUsage.current) }}</span>
          </div>
          <div class="usage-stat">
            <span class="stat-label">Trend:</span>
            <span class="stat-value" :class="trendClass">
              <Icon :name="trendIcon" size="14" />
              {{ usageTrend }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Token Breakdown -->
      <div class="token-breakdown">
        <h4>Token Distribution</h4>
        <div class="breakdown-chart">
          <div 
            v-for="segment in breakdownSegments" 
            :key="segment.type"
            class="breakdown-segment"
            :style="{ width: segment.percentage + '%', backgroundColor: segment.color }"
          >
            <span class="segment-label" v-if="segment.percentage > 10">
              {{ segment.type }} ({{ segment.percentage }}%)
            </span>
          </div>
        </div>
        <div class="breakdown-legend">
          <div v-for="segment in breakdownSegments" :key="segment.type" class="legend-item">
            <span class="legend-color" :style="{ backgroundColor: segment.color }"></span>
            <span class="legend-label">{{ segment.type }}:</span>
            <span class="legend-value">{{ formatTokens(segment.tokens) }}</span>
          </div>
        </div>
      </div>
      
      <!-- Optimization Strategies -->
      <div class="optimization-strategies" v-if="strategies.length > 0">
        <h4>Available Optimizations</h4>
        <div class="strategy-list">
          <div 
            v-for="strategy in strategies" 
            :key="strategy.id"
            class="strategy-item"
          >
            <div class="strategy-info">
              <h5>{{ strategy.name }}</h5>
              <p>{{ strategy.description }}</p>
              <span class="strategy-saving">Save ~{{ formatTokens(strategy.estimatedSaving) }}</span>
            </div>
            <button 
              @click="executeStrategy(strategy)"
              class="strategy-button"
              :disabled="isOptimizing"
            >
              <Icon name="mdi:auto-fix" size="16" />
              Apply
            </button>
          </div>
        </div>
      </div>
      
      <!-- Checkpoints -->
      <div class="checkpoints-section">
        <div class="section-header">
          <h4>Context Checkpoints</h4>
          <button @click="createNewCheckpoint" class="create-checkpoint-button">
            <Icon name="mdi:plus" size="16" />
            Create
          </button>
        </div>
        
        <div class="checkpoint-list" v-if="checkpoints.length > 0">
          <div 
            v-for="checkpoint in checkpoints" 
            :key="checkpoint.id"
            class="checkpoint-item"
          >
            <div class="checkpoint-info">
              <h5>{{ checkpoint.name }}</h5>
              <span class="checkpoint-meta">
                {{ formatTimestamp(checkpoint.timestamp) }} • {{ formatTokens(checkpoint.tokens) }}
              </span>
              <p v-if="checkpoint.description">{{ checkpoint.description }}</p>
            </div>
            <div class="checkpoint-actions">
              <button 
                @click="restoreCheckpoint(checkpoint.id)"
                class="checkpoint-action"
                title="Restore"
              >
                <Icon name="mdi:restore" size="16" />
              </button>
              <button 
                @click="deleteCheckpoint(checkpoint.id)"
                class="checkpoint-action delete"
                title="Delete"
              >
                <Icon name="mdi:delete" size="16" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          No checkpoints saved yet
        </div>
      </div>
      
      <!-- Settings -->
      <div class="optimization-settings">
        <h4>Optimization Settings</h4>
        <div class="settings-list">
          <label class="setting-item">
            <input 
              type="checkbox" 
              v-model="settings.autoOptimize"
              @change="updateSettings"
            />
            <span>Auto-optimize when context is high</span>
          </label>
          
          <div class="setting-item">
            <label>Warning Threshold:</label>
            <input 
              type="range" 
              min="50" 
              max="90" 
              v-model.number="settings.warningThreshold"
              @change="updateSettings"
            />
            <span class="threshold-value">{{ settings.warningThreshold }}%</span>
          </div>
          
          <div class="setting-item">
            <label>Critical Threshold:</label>
            <input 
              type="range" 
              min="70" 
              max="95" 
              v-model.number="settings.criticalThreshold"
              @change="updateSettings"
            />
            <span class="threshold-value">{{ settings.criticalThreshold }}%</span>
          </div>
          
          <label class="setting-item">
            <input 
              type="checkbox" 
              v-model="settings.pruneOldMessages"
              @change="updateSettings"
            />
            <span>Prune old messages automatically</span>
          </label>
          
          <label class="setting-item">
            <input 
              type="checkbox" 
              v-model="settings.preserveCodeContext"
              @change="updateSettings"
            />
            <span>Preserve code context when optimizing</span>
          </label>
        </div>
      </div>
      
      <!-- Recommendations -->
      <div class="recommendations" v-if="recommendations.length > 0">
        <h4>Recommendations</h4>
        <div class="recommendation-list">
          <div 
            v-for="(rec, index) in recommendations" 
            :key="index"
            class="recommendation-item"
            :class="`rec-${rec.level}`"
          >
            <Icon :name="getRecommendationIcon(rec.level)" size="16" />
            <span>{{ rec.message }}</span>
            <button v-if="rec.action" @click="handleRecommendationAction(rec)" class="rec-action">
              {{ rec.action }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useContextStore } from '~/stores/context';
import { useContextOptimizer } from '~/composables/useContextOptimizer';
import { useTokenCounter } from '~/composables/useTokenCounter';
import ContextMeter from './ContextMeter.vue';

const emit = defineEmits<{
  close: [];
}>();

const contextStore = useContextStore();
const contextOptimizer = useContextOptimizer();
const { formatTokenCount } = useTokenCounter();

const isOptimizing = ref(false);
const strategies = ref<any[]>([]);
const recommendations = ref<any[]>([]);

// Reactive data
const contextUsage = computed(() => contextStore.contextUsage);
const checkpoints = computed(() => contextStore.checkpoints);
const usageTrend = computed(() => contextStore.getUsageTrend());
const settings = ref({ ...contextStore.optimizationSettings });

const breakdownSegments = computed(() => {
  const total = contextUsage.value.current || 1;
  const breakdown = contextUsage.value.breakdown;
  
  return [
    {
      type: 'Chat',
      tokens: breakdown.chat,
      percentage: Math.round((breakdown.chat / total) * 100),
      color: '#3b82f6'
    },
    {
      type: 'Code',
      tokens: breakdown.code,
      percentage: Math.round((breakdown.code / total) * 100),
      color: '#10b981'
    },
    {
      type: 'Knowledge',
      tokens: breakdown.knowledge,
      percentage: Math.round((breakdown.knowledge / total) * 100),
      color: '#f59e0b'
    },
    {
      type: 'System',
      tokens: breakdown.system,
      percentage: Math.round((breakdown.system / total) * 100),
      color: '#6b7280'
    }
  ].filter(s => s.tokens > 0);
});

const trendClass = computed(() => ({
  'trend-increasing': usageTrend.value === 'increasing',
  'trend-decreasing': usageTrend.value === 'decreasing',
  'trend-stable': usageTrend.value === 'stable'
}));

const trendIcon = computed(() => {
  switch (usageTrend.value) {
    case 'increasing': return 'mdi:trending-up';
    case 'decreasing': return 'mdi:trending-down';
    default: return 'mdi:minus';
  }
});

// Methods
const formatTokens = (tokens: number) => formatTokenCount(tokens);

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return date.toLocaleDateString();
};

const executeOptimization = async () => {
  isOptimizing.value = true;
  try {
    await contextStore.optimizeContext();
    await loadStrategies();
  } finally {
    isOptimizing.value = false;
  }
};

const executeStrategy = async (strategy: any) => {
  isOptimizing.value = true;
  try {
    await strategy.execute();
    await loadStrategies();
  } finally {
    isOptimizing.value = false;
  }
};

const createNewCheckpoint = () => {
  const name = prompt('Checkpoint name:');
  if (name) {
    // TODO: Get current messages from chat store
    contextStore.createCheckpoint(name, []);
  }
};

const restoreCheckpoint = (checkpointId: string) => {
  if (confirm('Restore this checkpoint? Current context will be replaced.')) {
    contextStore.restoreCheckpoint(checkpointId);
  }
};

const deleteCheckpoint = (checkpointId: string) => {
  if (confirm('Delete this checkpoint?')) {
    contextStore.deleteCheckpoint(checkpointId);
  }
};

const updateSettings = () => {
  contextStore.updateSettings(settings.value);
};

const loadStrategies = async () => {
  // TODO: Get current messages and files from stores
  await contextOptimizer.analyzeContext([], [], []);
  strategies.value = contextOptimizer.getOptimizationStrategies();
  recommendations.value = contextOptimizer.getRecommendations();
};

const handleRecommendationAction = (rec: any) => {
  switch (rec.action) {
    case 'Optimize Now':
      executeOptimization();
      break;
    case 'Review Strategies':
      // Scroll to strategies section
      break;
    case 'Prune Old Messages':
      const pruneStrategy = strategies.value.find(s => s.id === 'remove-old-messages');
      if (pruneStrategy) executeStrategy(pruneStrategy);
      break;
  }
};

const getRecommendationIcon = (level: string) => {
  switch (level) {
    case 'critical': return 'mdi:alert-circle';
    case 'warning': return 'mdi:alert';
    case 'info': return 'mdi:information';
    default: return 'mdi:help-circle';
  }
};

onMounted(() => {
  loadStrategies();
});
</script>

<style scoped>
.context-optimization-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  color: #d4d4d4;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  background: #3e3e42;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.panel-content > div {
  margin-bottom: 24px;
}

.panel-content h4 {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
}

/* Context Overview */
.usage-meter {
  margin-bottom: 16px;
}

.usage-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.usage-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  color: #858585;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
}

.trend-increasing {
  color: #f59e0b;
}

.trend-decreasing {
  color: #10b981;
}

.trend-stable {
  color: #6b7280;
}

/* Token Breakdown */
.breakdown-chart {
  display: flex;
  height: 32px;
  background: #252526;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.breakdown-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
}

.segment-label {
  font-size: 11px;
  color: white;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.breakdown-legend {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-label {
  color: #858585;
}

.legend-value {
  margin-left: auto;
  font-weight: 500;
}

/* Optimization Strategies */
.strategy-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.strategy-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #252526;
  border-radius: 4px;
  border: 1px solid #3e3e42;
}

.strategy-info h5 {
  margin: 0 0 4px 0;
  font-size: 13px;
  font-weight: 500;
}

.strategy-info p {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #858585;
}

.strategy-saving {
  font-size: 11px;
  color: #10b981;
  font-weight: 500;
}

.strategy-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #0e8a16;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.strategy-button:hover:not(:disabled) {
  background: #0fa418;
}

.strategy-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Checkpoints */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.create-checkpoint-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.create-checkpoint-button:hover {
  background: #2563eb;
}

.checkpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkpoint-item {
  display: flex;
  justify-content: space-between;
  align-items: start;
  padding: 8px 12px;
  background: #252526;
  border-radius: 4px;
  border: 1px solid #3e3e42;
}

.checkpoint-info h5 {
  margin: 0 0 2px 0;
  font-size: 12px;
  font-weight: 500;
}

.checkpoint-meta {
  font-size: 11px;
  color: #858585;
}

.checkpoint-info p {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: #cccccc;
}

.checkpoint-actions {
  display: flex;
  gap: 4px;
}

.checkpoint-action {
  padding: 4px;
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.checkpoint-action:hover {
  background: #3e3e42;
  color: #cccccc;
}

.checkpoint-action.delete:hover {
  background: #5a1d1d;
  color: #f48771;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #858585;
  font-size: 12px;
}

/* Settings */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.setting-item input[type="checkbox"] {
  margin-right: 4px;
}

.setting-item input[type="range"] {
  flex: 1;
  margin: 0 8px;
}

.threshold-value {
  min-width: 35px;
  text-align: right;
  font-weight: 500;
}

/* Recommendations */
.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recommendation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid;
}

.rec-info {
  background: #1e3a4c;
  border-color: #2563eb;
  color: #60a5fa;
}

.rec-warning {
  background: #4a3c1c;
  border-color: #f59e0b;
  color: #fbbf24;
}

.rec-critical {
  background: #4a1c1c;
  border-color: #ef4444;
  color: #f87171;
}

.rec-action {
  margin-left: auto;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.rec-action:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}
</style>