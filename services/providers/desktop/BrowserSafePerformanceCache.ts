/**
 * Browser-safe Performance Cache Implementation
 * Uses IndexedDB for caching in renderer process
 */
import { EventEmitter } from 'events';
import type { 
  IPerformanceCache, 
  CacheOptions, 
  CacheStats, 
  PerformanceMetrics,
  SessionState,
  CacheEntry,
  CacheQueryOptions 
} from '../../interfaces/IPerformanceCache.js';

export class BrowserSafePerformanceCache implements IPerformanceCache {
  private statsEmitter = new EventEmitter();
  private metricsCache = { hits: 0, misses: 0, totalResponseTime: 0, operations: 0 };
  private memoryCache = new Map<string, CacheEntry>();
  
  constructor(private dbPath: string) {
    // In browser context, we'll use IndexedDB or memory cache
    // For now, using memory cache as a simple implementation
  }
  
  async cache(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || 3600000; // 1 hour default
    const priority = options.priority || 'normal';
    const compress = options.compress ?? false;
    
    const expiresAt = Date.now() + ttl;
    const serialized = JSON.stringify(data);
    
    const entry: CacheEntry = {
      key,
      data: serialized,
      expiresAt,
      priority,
      compressed: compress,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      size: serialized.length
    };
    
    this.memoryCache.set(key, entry);
    this.metricsCache.operations++;
  }
  
  async get<T = any>(key: string): Promise<T | null> {
    const startTime = Date.now();
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      this.metricsCache.misses++;
      return null;
    }
    
    if (entry.expiresAt < Date.now()) {
      this.memoryCache.delete(key);
      this.metricsCache.misses++;
      return null;
    }
    
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    
    this.metricsCache.hits++;
    this.metricsCache.totalResponseTime += Date.now() - startTime;
    
    return JSON.parse(entry.data);
  }
  
  async getCacheStats(): Promise<CacheStats> {
    const entries = Array.from(this.memoryCache.values());
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    const avgSize = entries.length > 0 ? totalSize / entries.length : 0;
    
    return {
      totalEntries: this.memoryCache.size,
      totalSize,
      hitRate: this.metricsCache.hits / (this.metricsCache.hits + this.metricsCache.misses) || 0,
      averageResponseTime: this.metricsCache.totalResponseTime / this.metricsCache.operations || 0,
      oldestEntry: Math.min(...entries.map(e => e.createdAt), Date.now()),
      entriesByPriority: {
        high: entries.filter(e => e.priority === 'high').length,
        normal: entries.filter(e => e.priority === 'normal').length,
        low: entries.filter(e => e.priority === 'low').length
      }
    };
  }
  
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const stats = await this.getCacheStats();
    return {
      cacheHitRate: stats.hitRate,
      averageLatency: stats.averageResponseTime,
      bandwidthSaved: 0, // Would need to track this
      totalRequests: this.metricsCache.operations,
      activeConnections: 1 // Always 1 for desktop
    };
  }
  
  async saveSessionState(state: SessionState): Promise<void> {
    await this.cache(`session:${state.sessionId}`, state, {
      ttl: 86400000, // 24 hours
      priority: 'high'
    });
  }
  
  async loadSessionState(sessionId: string): Promise<SessionState | null> {
    return await this.get<SessionState>(`session:${sessionId}`);
  }
  
  async evictExpired(): Promise<number> {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.memoryCache.delete(key);
        evicted++;
      }
    }
    
    return evicted;
  }
  
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.metricsCache = { hits: 0, misses: 0, totalResponseTime: 0, operations: 0 };
  }
  
  async query(options: CacheQueryOptions): Promise<CacheEntry[]> {
    let entries = Array.from(this.memoryCache.values());
    
    if (options.pattern) {
      const regex = new RegExp(options.pattern);
      entries = entries.filter(e => regex.test(e.key));
    }
    
    if (options.priority) {
      entries = entries.filter(e => e.priority === options.priority);
    }
    
    if (options.createdAfter) {
      entries = entries.filter(e => e.createdAt >= options.createdAfter!);
    }
    
    if (options.createdBefore) {
      entries = entries.filter(e => e.createdAt <= options.createdBefore!);
    }
    
    // Sort by last accessed (most recent first)
    entries.sort((a, b) => b.lastAccessed - a.lastAccessed);
    
    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }
    
    return entries;
  }
  
  on(event: string, handler: Function): void {
    this.statsEmitter.on(event, handler as any);
  }
  
  off(event: string, handler: Function): void {
    this.statsEmitter.off(event, handler as any);
  }
  
  destroy(): void {
    this.statsEmitter.removeAllListeners();
    this.memoryCache.clear();
  }
}