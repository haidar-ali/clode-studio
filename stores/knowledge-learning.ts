import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useTasksStore } from './tasks';
import { useKnowledgeStore } from './knowledge';

export interface QueryMetrics {
  query: string;
  timestamp: Date;
  responseTime: number;
  success: boolean;
  resultType: string;
  contextUsed: string[];
}

export interface LearningInsight {
  type: 'pattern' | 'preference' | 'performance' | 'recommendation';
  title: string;
  description: string;
  value?: number | string;
  trend?: 'up' | 'down' | 'stable';
  action?: {
    label: string;
    handler: () => void;
  };
}

export interface CacheStats {
  totalEntries: number;
  cacheSize: number;
  hitRate: number;
  avgResponseTime: number;
  popularQueries: Array<{
    pattern: string;
    count: number;
    avgTime: number;
  }>;
}

export const useKnowledgeLearningStore = defineStore('knowledge-learning', () => {
  // State
  const isEnabled = ref(true);
  const queryHistory = ref<QueryMetrics[]>([]);
  const insights = ref<LearningInsight[]>([]);
  const cacheStats = ref<CacheStats>({
    totalEntries: 0,
    cacheSize: 0,
    hitRate: 0,
    avgResponseTime: 0,
    popularQueries: []
  });
  const predictions = ref<string[]>([]);
  const lastCacheUpdate = ref<Date | null>(null);

  // Get other stores
  const tasksStore = useTasksStore();
  const knowledgeStore = useKnowledgeStore();

  // Computed
  const recentQueries = computed(() => 
    queryHistory.value.slice(-10).reverse()
  );

  const performanceTrend = computed(() => {
    if (queryHistory.value.length < 10) return 'stable';
    
    const recent = queryHistory.value.slice(-10);
    const older = queryHistory.value.slice(-20, -10);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, q) => sum + q.responseTime, 0) / recent.length;
    const olderAvg = older.reduce((sum, q) => sum + q.responseTime, 0) / older.length;
    
    if (recentAvg < olderAvg * 0.8) return 'up';
    if (recentAvg > olderAvg * 1.2) return 'down';
    return 'stable';
  });

  const successRate = computed(() => {
    if (queryHistory.value.length === 0) return 0;
    
    const successful = queryHistory.value.filter(q => q.success).length;
    return (successful / queryHistory.value.length) * 100;
  });

  const contextEffectiveness = computed(() => {
    const effectiveness: Record<string, { used: number; successful: number }> = {};
    
    queryHistory.value.forEach(query => {
      query.contextUsed.forEach(context => {
        if (!effectiveness[context]) {
          effectiveness[context] = { used: 0, successful: 0 };
        }
        effectiveness[context].used++;
        if (query.success) {
          effectiveness[context].successful++;
        }
      });
    });
    
    return Object.entries(effectiveness)
      .map(([context, stats]) => ({
        context,
        effectiveness: (stats.successful / stats.used) * 100,
        usage: stats.used
      }))
      .sort((a, b) => b.effectiveness - a.effectiveness);
  });

  // Actions
  async function recordQuery(metrics: Omit<QueryMetrics, 'timestamp'>) {
    const fullMetrics: QueryMetrics = {
      ...metrics,
      timestamp: new Date()
    };
    
    queryHistory.value.push(fullMetrics);
    
    // Keep only last 1000 queries
    if (queryHistory.value.length > 1000) {
      queryHistory.value = queryHistory.value.slice(-1000);
    }
    
    // Send to cache service
    if (tasksStore.projectPath) {
      try {
        await window.electronAPI.knowledgeCache.recordQuery(
          tasksStore.projectPath,
          fullMetrics
        );
      } catch (error) {
        console.error('Failed to record query:', error);
      }
    }
    
    // Update insights
    generateInsights();
  }

  async function updateCacheStats() {
    if (!tasksStore.projectPath) return;
    
    try {
      const result = await window.electronAPI.knowledgeCache.getStats(
        tasksStore.projectPath
      );
      
      if (result.success && result.stats) {
        cacheStats.value = {
          totalEntries: result.stats.entries,
          cacheSize: result.stats.size,
          hitRate: result.stats.hitRate * 100,
          avgResponseTime: result.stats.avgResponseTime,
          popularQueries: result.stats.popularPatterns?.map((p: any) => ({
            pattern: p.pattern,
            count: p.frequency,
            avgTime: p.avgResponseTime
          })) || []
        };
        
        lastCacheUpdate.value = new Date();
      }
    } catch (error) {
      console.error('Failed to update cache stats:', error);
    }
  }

  async function getPredictions(context: any) {
    if (!tasksStore.projectPath) return;
    
    try {
      const result = await window.electronAPI.knowledgeCache.predict(
        tasksStore.projectPath,
        context
      );
      
      if (result.success && result.predictions) {
        predictions.value = result.predictions;
      }
    } catch (error) {
      console.error('Failed to get predictions:', error);
    }
  }

  async function clearCache() {
    if (!tasksStore.projectPath) return;
    
    if (!confirm('Are you sure you want to clear the knowledge cache? This cannot be undone.')) {
      return;
    }
    
    try {
      const result = await window.electronAPI.knowledgeCache.clear(
        tasksStore.projectPath
      );
      
      if (result.success) {
        queryHistory.value = [];
        await updateCacheStats();
        generateInsights();
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  async function invalidateCache(pattern?: string, tags?: string[]) {
    if (!tasksStore.projectPath) return;
    
    try {
      const result = await window.electronAPI.knowledgeCache.invalidate(
        tasksStore.projectPath,
        pattern,
        tags
      );
      
      if (result.success) {
        await updateCacheStats();
      }
    } catch (error) {
      console.error('Failed to invalidate cache:', error);
    }
  }

  function generateInsights() {
    const newInsights: LearningInsight[] = [];
    
    // Performance insights
    if (performanceTrend.value === 'down') {
      newInsights.push({
        type: 'performance',
        title: 'Performance Degradation',
        description: 'Query response times are increasing',
        trend: 'down',
        action: {
          label: 'Optimize Cache',
          handler: () => invalidateCache()
        }
      });
    } else if (performanceTrend.value === 'up') {
      newInsights.push({
        type: 'performance',
        title: 'Performance Improvement',
        description: 'Query response times are decreasing',
        trend: 'up'
      });
    }
    
    // Cache effectiveness
    if (cacheStats.value.hitRate < 30) {
      newInsights.push({
        type: 'performance',
        title: 'Low Cache Hit Rate',
        description: `Only ${cacheStats.value.hitRate.toFixed(1)}% of queries are using cache`,
        value: `${cacheStats.value.hitRate.toFixed(1)}%`,
        trend: 'down',
        action: {
          label: 'Pre-cache Common Queries',
          handler: () => preCacheCommonQueries()
        }
      });
    }
    
    // Pattern insights
    if (cacheStats.value.popularQueries.length > 0) {
      const topPattern = cacheStats.value.popularQueries[0];
      newInsights.push({
        type: 'pattern',
        title: 'Most Common Query Pattern',
        description: topPattern.pattern,
        value: `${topPattern.count} times`
      });
    }
    
    // Context effectiveness
    const topContext = contextEffectiveness.value[0];
    if (topContext && topContext.effectiveness > 80) {
      newInsights.push({
        type: 'preference',
        title: 'Most Effective Context',
        description: `${topContext.context} context has ${topContext.effectiveness.toFixed(1)}% success rate`,
        value: `${topContext.effectiveness.toFixed(1)}%`,
        trend: 'up'
      });
    }
    
    // Success rate
    if (successRate.value < 70) {
      newInsights.push({
        type: 'recommendation',
        title: 'Improve Query Success Rate',
        description: `Current success rate is ${successRate.value.toFixed(1)}%`,
        value: `${successRate.value.toFixed(1)}%`,
        trend: 'down',
        action: {
          label: 'Review Failed Queries',
          handler: () => reviewFailedQueries()
        }
      });
    }
    
    insights.value = newInsights;
  }

  async function preCacheCommonQueries() {
    if (!tasksStore.projectPath) return;
    
    // Get top patterns
    const patterns = cacheStats.value.popularQueries.slice(0, 5);
    
    for (const pattern of patterns) {
      // Pre-execute common queries
      // This would need to be implemented based on your query execution logic
      
    }
  }

  function reviewFailedQueries() {
    const failed = queryHistory.value
      .filter(q => !q.success)
      .slice(-10);
    
    
    // Could open a modal or panel to review these
  }

  async function exportMetrics() {
    const data = {
      queryHistory: queryHistory.value,
      cacheStats: cacheStats.value,
      insights: insights.value,
      contextEffectiveness: contextEffectiveness.value,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-metrics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Initialize
  async function initialize() {
    if (tasksStore.projectPath) {
      await updateCacheStats();
      generateInsights();
      
      // Set up periodic updates
      setInterval(() => {
        updateCacheStats();
      }, 30000); // Every 30 seconds
    }
  }

  return {
    // State
    isEnabled,
    queryHistory,
    insights,
    cacheStats,
    predictions,
    lastCacheUpdate,
    
    // Computed
    recentQueries,
    performanceTrend,
    successRate,
    contextEffectiveness,
    
    // Actions
    recordQuery,
    updateCacheStats,
    getPredictions,
    clearCache,
    invalidateCache,
    exportMetrics,
    initialize
  };
});