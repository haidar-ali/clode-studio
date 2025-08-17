/**
 * In-Memory Cache for Remote Mode
 * Provides a simple memory cache implementation for remote clients
 */
import type { 
  IPerformanceCache, 
  CacheOptions, 
  CacheStats, 
  PerformanceMetrics,
  SessionState 
} from '../../interfaces/IPerformanceCache.js';

interface CacheEntry {
  value: any;
  ttl: number;
  cachedAt: number;
  hits: number;
  size: number;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
}

export class RemoteMemoryCache implements IPerformanceCache {
  private storage = new Map<string, CacheEntry>();
  private metrics: PerformanceMetrics[] = [];
  private totalHits = 0;
  private totalMisses = 0;
  
  async cache(key: string, data: any, options?: CacheOptions): Promise<void> {
    const ttl = (options?.ttl || 300) * 1000; // Convert to milliseconds
    const entry: CacheEntry = {
      value: data,
      ttl,
      cachedAt: Date.now(),
      hits: 0,
      size: JSON.stringify(data).length,
      priority: options?.priority || 'medium',
      tags: options?.tags || []
    };
    
    this.storage.set(key, entry);
    
  }
  
  async get<T = any>(key: string): Promise<T | null> {
    
    const entry = this.storage.get(key);
    
    if (!entry) {
      
      this.totalMisses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.cachedAt > entry.ttl) {
      
      this.storage.delete(key);
      this.totalMisses++;
      return null;
    }
    
    entry.hits++;
    this.totalHits++;
    
    return entry.value as T;
  }
  
  async has(key: string): Promise<boolean> {
    const entry = this.storage.get(key);
    if (!entry) return false;
    
    // Check if expired
    if (Date.now() - entry.cachedAt > entry.ttl) {
      this.storage.delete(key);
      return false;
    }
    
    return true;
  }
  
  async invalidate(pattern: string | string[]): Promise<number> {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    let count = 0;
    
    for (const [key] of this.storage) {
      if (patterns.some(p => key.includes(p))) {
        this.storage.delete(key);
        count++;
      }
    }
    
    return count;
  }
  
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }
  
  async mset(entries: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void> {
    for (const entry of entries) {
      await this.cache(entry.key, entry.value, entry.options);
    }
  }
  
  async trackMetric(metric: PerformanceMetrics): Promise<void> {
    this.metrics.push(metric);
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }
  
  async getMetrics(timeRange?: { start: number; end: number }): Promise<PerformanceMetrics[]> {
    if (!timeRange) return this.metrics;
    
    return this.metrics.filter(m => 
      m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }
  
  async getCacheStats(): Promise<CacheStats> {
    let totalSize = 0;
    const topKeys: Array<{ key: string; hits: number; size: number }> = [];
    
    for (const [key, entry] of this.storage) {
      totalSize += entry.size;
      topKeys.push({ key, hits: entry.hits, size: entry.size });
    }
    
    // Sort by hits and take top 10
    topKeys.sort((a, b) => b.hits - a.hits);
    
    const hitRate = this.totalHits + this.totalMisses > 0
      ? (this.totalHits / (this.totalHits + this.totalMisses)) * 100
      : 0;
    
    return {
      totalEntries: this.storage.size,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRate,
      memoryUsage: totalSize,
      avgResponseTime: 1, // Memory cache is fast
      bandwidthSaved: totalSize * this.totalHits,
      topKeys: topKeys.slice(0, 10)
    };
  }
  
  async saveSessionState(state: SessionState): Promise<void> {
    await this.cache(`session:${state.sessionId}`, state, { ttl: 3600 });
  }
  
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    return this.get(`session:${sessionId}`);
  }
  
  async listRecentSessions(userId: string, limit?: number): Promise<SessionState[]> {
    const sessions: SessionState[] = [];
    
    for (const [key, entry] of this.storage) {
      if (key.startsWith('session:') && entry.value.userId === userId) {
        sessions.push(entry.value);
      }
    }
    
    // Sort by last activity
    sessions.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
    
    return sessions.slice(0, limit || 10);
  }
  
  async cacheFile(path: string, content: string, hash?: string): Promise<void> {
    await this.cache(`file:${path}`, { content, hash, cachedAt: Date.now() }, { ttl: 600 });
  }
  
  async getCachedFile(path: string): Promise<{ content: string; hash: string; cachedAt: number } | null> {
    return this.get(`file:${path}`);
  }
  
  async invalidateFiles(pattern: string): Promise<number> {
    return this.invalidate(`file:${pattern}`);
  }
  
  async cacheApiResponse(endpoint: string, response: any, ttl?: number): Promise<void> {
    await this.cache(`api:${endpoint}`, response, { ttl });
  }
  
  async getCachedApiResponse(endpoint: string): Promise<any | null> {
    return this.get(`api:${endpoint}`);
  }
  
  async warmCache(keys: string[]): Promise<void> {
    // No-op for memory cache
  }
  
  async optimizeCache(): Promise<void> {
    // Remove expired entries
    const now = Date.now();
    for (const [key, entry] of this.storage) {
      if (now - entry.cachedAt > entry.ttl) {
        this.storage.delete(key);
      }
    }
  }
  
  async clear(): Promise<void> {
    this.storage.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
    this.metrics = [];
  }
  
  subscribeToStats(callback: (stats: CacheStats) => void): () => void {
    // Simple implementation - call callback every second
    const interval = setInterval(async () => {
      const stats = await this.getCacheStats();
      callback(stats);
    }, 1000);
    
    return () => clearInterval(interval);
  }
  
  // Custom method for BrowserSafePerformanceCache compatibility
  async getPerformanceMetrics(): Promise<any> {
    const stats = await this.getCacheStats();
    return {
      cacheHitRate: stats.hitRate,
      averageLatency: stats.avgResponseTime,
      bandwidthSaved: stats.bandwidthSaved,
      totalRequests: stats.totalHits + stats.totalMisses,
      activeConnections: 0
    };
  }
}