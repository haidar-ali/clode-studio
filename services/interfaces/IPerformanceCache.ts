/**
 * Performance Cache Interface
 * Provides high-speed caching for improved responsiveness
 * Replaces offline queue with performance-focused caching
 */

export interface CacheOptions {
  ttl?: number;                    // Time to live in seconds (default: 300)
  priority?: 'high' | 'medium' | 'low';  // Cache priority for eviction
  compress?: boolean;              // Compress large data
  tags?: string[];                // Tags for bulk invalidation
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;                 // Percentage
  memoryUsage: number;            // Bytes
  avgResponseTime: number;        // Milliseconds
  bandwidthSaved: number;         // Bytes
  topKeys: Array<{
    key: string;
    hits: number;
    size: number;
  }>;
}

export interface PerformanceMetrics {
  operation: string;
  duration: number;               // Milliseconds
  timestamp: number;
  cacheHit: boolean;
  size?: number;                  // Bytes
}

export interface SessionState {
  sessionId: string;
  userId: string;
  workspace: string;
  openFiles: string[];
  claudeInstances: Array<{
    instanceId: string;
    personalityId?: string;
    workingDirectory: string;
  }>;
  layout: any;
  lastActivity: Date;
}

export interface IPerformanceCache {
  // Core caching operations
  cache(key: string, data: any, options?: CacheOptions): Promise<void>;
  get<T = any>(key: string): Promise<T | null>;
  has(key: string): Promise<boolean>;
  invalidate(pattern: string | string[]): Promise<number>; // Returns count of invalidated entries
  
  // Bulk operations
  mget<T = any>(keys: string[]): Promise<(T | null)[]>;
  mset(entries: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void>;
  
  // Performance tracking
  trackMetric(metric: PerformanceMetrics): Promise<void>;
  getMetrics(timeRange?: { start: number; end: number }): Promise<PerformanceMetrics[]>;
  getCacheStats(): Promise<CacheStats>;
  
  // Session management (for quick device switching)
  saveSessionState(state: SessionState): Promise<void>;
  getSessionState(sessionId: string): Promise<SessionState | null>;
  listRecentSessions(userId: string, limit?: number): Promise<SessionState[]>;
  
  // File caching
  cacheFile(path: string, content: string, hash?: string): Promise<void>;
  getCachedFile(path: string): Promise<{ content: string; hash: string; cachedAt: number } | null>;
  invalidateFiles(pattern: string): Promise<number>;
  
  // API response caching
  cacheApiResponse(endpoint: string, response: any, ttl?: number): Promise<void>;
  getCachedApiResponse(endpoint: string): Promise<any | null>;
  
  // Optimization operations
  warmCache(keys: string[]): Promise<void>;        // Pre-load frequently used data
  optimizeCache(): Promise<void>;                   // Clean up and optimize storage
  clear(): Promise<void>;                           // Clear all cache entries
  
  // Real-time monitoring
  subscribeToStats(callback: (stats: CacheStats) => void): () => void; // Returns unsubscribe function
}

// Helper types for implementation
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  cachedAt: number;
  hitCount: number;
  size: number;
  compressed: boolean;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface CacheQueryOptions {
  tags?: string[];
  minHits?: number;
  maxAge?: number;
  priority?: 'high' | 'medium' | 'low';
}