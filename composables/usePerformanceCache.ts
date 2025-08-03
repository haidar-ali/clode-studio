/**
 * Performance Cache Composable
 * Provides reactive access to cache statistics and operations
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useServices } from './useServices';
import type { CacheStats, PerformanceMetrics } from '~/services/interfaces/IPerformanceCache';

export function usePerformanceCache() {
  const { services, isLoading } = useServices();
  
  // State
  const cacheStats = ref<CacheStats>({
    totalEntries: 0,
    totalSize: 0,
    hitRate: 0,
    averageResponseTime: 0,
    oldestEntry: Date.now(),
    entriesByPriority: {
      high: 0,
      normal: 0,
      low: 0
    }
  });
  
  const performanceMetrics = ref<PerformanceMetrics>({
    cacheHitRate: 0,
    averageLatency: 0,
    bandwidthSaved: 0,
    totalRequests: 0,
    activeConnections: 0
  });
  
  // Computed
  const hitRate = computed(() => performanceMetrics.value.cacheHitRate);
  const bandwidthSaved = computed(() => performanceMetrics.value.bandwidthSaved);
  const isAvailable = computed(() => !isLoading.value && services.value?.cache != null);
  
  // Methods
  async function getCacheStats(): Promise<CacheStats> {
    if (!services.value?.cache) {
      return cacheStats.value;
    }
    
    try {
      const stats = await services.value.cache.getCacheStats();
      cacheStats.value = stats;
      return stats;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return cacheStats.value;
    }
  }
  
  async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
    if (!services.value?.cache) {
      return performanceMetrics.value;
    }
    
    try {
      const metrics = await services.value.cache.getPerformanceMetrics();
      performanceMetrics.value = metrics;
      return metrics;
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return performanceMetrics.value;
    }
  }
  
  async function clear() {
    if (!services.value?.cache) {
      return;
    }
    
    try {
      await services.value.cache.clear();
      await updateStats();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw error;
    }
  }
  
  function subscribeToStats(callback: (stats: CacheStats) => void): () => void {
    // For now, return a no-op unsubscribe function
    // In a real implementation, this would subscribe to cache events
    return () => {};
  }
  
  async function updateStats() {
    await getCacheStats();
    await getPerformanceMetrics();
  }
  
  // Auto-update stats periodically
  let updateInterval: NodeJS.Timeout | null = null;
  
  onMounted(() => {
    // Initial load
    updateStats();
    
    // Update every 5 seconds
    updateInterval = setInterval(updateStats, 5000);
  });
  
  onUnmounted(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
  
  return {
    // State
    cacheStats: computed(() => cacheStats.value),
    performanceMetrics: computed(() => performanceMetrics.value),
    hitRate,
    bandwidthSaved,
    
    // Methods
    getCacheStats,
    getPerformanceMetrics,
    clear,
    subscribeToStats,
    isAvailable: () => isAvailable.value
  };
}