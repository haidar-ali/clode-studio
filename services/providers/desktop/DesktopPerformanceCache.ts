/**
 * Desktop Performance Cache Implementation
 * Uses SQLite for high-speed local caching to improve responsiveness
 */
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type { 
  IPerformanceCache, 
  CacheOptions, 
  CacheStats, 
  PerformanceMetrics,
  SessionState,
  CacheEntry 
} from '../../interfaces/IPerformanceCache.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class DesktopPerformanceCache implements IPerformanceCache {
  private db: Database.Database;
  private statsEmitter = new EventEmitter();
  private cleanupInterval: NodeJS.Timeout;
  private metricsCache = { hits: 0, misses: 0, totalResponseTime: 0, operations: 0 };
  
  constructor(private dbPath: string) {
    this.db = new Database(dbPath);
    this.setupDatabase();
    this.startCleanupTimer();
    this.startMetricsTimer();
  }
  
  private setupDatabase(): void {
    // Enable performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    
    // Create tables
    this.db.exec(`
      -- Main cache table
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value BLOB,
        ttl INTEGER NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        hit_count INTEGER DEFAULT 0,
        size INTEGER NOT NULL,
        compressed INTEGER DEFAULT 0,
        priority TEXT DEFAULT 'medium',
        tags TEXT DEFAULT '[]'
      );
      
      -- Performance metrics table
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        duration INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        cache_hit INTEGER DEFAULT 0,
        size INTEGER
      );
      
      -- Session state table
      CREATE TABLE IF NOT EXISTS session_states (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace TEXT NOT NULL,
        state TEXT NOT NULL,
        last_activity INTEGER NOT NULL
      );
      
      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_priority ON cache_entries(priority, expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_hits ON cache_entries(hit_count DESC);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON performance_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_session_user ON session_states(user_id, last_activity DESC);
    `);
  }
  
  async cache(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    const start = Date.now();
    
    try {
      const ttl = options.ttl || 300; // 5 minutes default
      const priority = options.priority || 'medium';
      const tags = options.tags || [];
      
      let value = JSON.stringify(data);
      let compressed = false;
      
      // Compress large data if requested
      if (options.compress && value.length > 1024) {
        const compressed_data = await gzip(value);
        if (compressed_data.length < value.length * 0.8) {
          value = compressed_data.toString('base64');
          compressed = true;
        }
      }
      
      const now = Date.now();
      const expires_at = now + (ttl * 1000);
      const size = Buffer.byteLength(value);
      
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cache_entries 
        (key, value, ttl, cached_at, expires_at, hit_count, size, compressed, priority, tags)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT hit_count FROM cache_entries WHERE key = ?), 0), ?, ?, ?, ?)
      `);
      
      stmt.run(key, value, ttl, now, expires_at, key, size, compressed ? 1 : 0, priority, JSON.stringify(tags));
      
      await this.trackMetric({
        operation: 'cache_set',
        duration: Date.now() - start,
        timestamp: now,
        cacheHit: false,
        size
      });
      
    } catch (error) {
      console.error('Cache set error:', error);
      throw error;
    }
  }
  
  async get<T = any>(key: string): Promise<T | null> {
    const start = Date.now();
    
    try {
      const row = this.db.prepare(`
        SELECT value, compressed, expires_at, size 
        FROM cache_entries 
        WHERE key = ? AND expires_at > ?
      `).get(key, Date.now()) as any;
      
      if (!row) {
        this.metricsCache.misses++;
        await this.trackMetric({
          operation: 'cache_get',
          duration: Date.now() - start,
          timestamp: Date.now(),
          cacheHit: false
        });
        return null;
      }
      
      // Update hit count
      this.db.prepare('UPDATE cache_entries SET hit_count = hit_count + 1 WHERE key = ?').run(key);
      
      // Decompress if needed
      let value = row.value;
      if (row.compressed) {
        const buffer = Buffer.from(value.toString(), 'base64');
        const decompressed = await gunzip(buffer);
        value = decompressed.toString();
      } else {
        value = value.toString();
      }
      
      this.metricsCache.hits++;
      await this.trackMetric({
        operation: 'cache_get',
        duration: Date.now() - start,
        timestamp: Date.now(),
        cacheHit: true,
        size: row.size
      });
      
      return JSON.parse(value);
      
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }
  
  async has(key: string): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM cache_entries WHERE key = ? AND expires_at > ?')
      .get(key, Date.now());
    return !!row;
  }
  
  async invalidate(pattern: string | string[]): Promise<number> {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    let totalInvalidated = 0;
    
    const stmt = this.db.prepare('DELETE FROM cache_entries WHERE key LIKE ?');
    
    for (const p of patterns) {
      const result = stmt.run(p.replace('*', '%'));
      totalInvalidated += result.changes;
    }
    
    return totalInvalidated;
  }
  
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    const placeholders = keys.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT key, value, compressed, expires_at 
      FROM cache_entries 
      WHERE key IN (${placeholders}) AND expires_at > ?
    `).all(...keys, Date.now()) as any[];
    
    const resultMap = new Map<string, any>();
    
    for (const row of rows) {
      let value = row.value;
      if (row.compressed) {
        const buffer = Buffer.from(value.toString(), 'base64');
        const decompressed = await gunzip(buffer);
        value = decompressed.toString();
      } else {
        value = value.toString();
      }
      resultMap.set(row.key, JSON.parse(value));
    }
    
    return keys.map(key => resultMap.get(key) || null);
  }
  
  async mset(entries: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_entries 
      (key, value, ttl, cached_at, expires_at, hit_count, size, compressed, priority, tags)
      VALUES (?, ?, ?, ?, ?, COALESCE((SELECT hit_count FROM cache_entries WHERE key = ?), 0), ?, ?, ?, ?)
    `);
    
    const transaction = this.db.transaction((entries: any[]) => {
      for (const entry of entries) {
        const ttl = entry.options?.ttl || 300;
        const priority = entry.options?.priority || 'medium';
        const tags = entry.options?.tags || [];
        const value = JSON.stringify(entry.value);
        const now = Date.now();
        const expires_at = now + (ttl * 1000);
        const size = Buffer.byteLength(value);
        
        stmt.run(entry.key, value, ttl, now, expires_at, entry.key, size, 0, priority, JSON.stringify(tags));
      }
    });
    
    transaction(entries);
  }
  
  async trackMetric(metric: PerformanceMetrics): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics (operation, duration, timestamp, cache_hit, size)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      metric.operation,
      metric.duration,
      metric.timestamp,
      metric.cacheHit ? 1 : 0,
      metric.size || null
    );
    
    // Update in-memory metrics
    this.metricsCache.operations++;
    this.metricsCache.totalResponseTime += metric.duration;
  }
  
  async getMetrics(timeRange?: { start: number; end: number }): Promise<PerformanceMetrics[]> {
    let query = 'SELECT * FROM performance_metrics';
    const params: any[] = [];
    
    if (timeRange) {
      query += ' WHERE timestamp BETWEEN ? AND ?';
      params.push(timeRange.start, timeRange.end);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT 1000';
    
    const rows = this.db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      operation: row.operation,
      duration: row.duration,
      timestamp: row.timestamp,
      cacheHit: !!row.cache_hit,
      size: row.size
    }));
  }
  
  async getCacheStats(): Promise<CacheStats> {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(hit_count) as total_hits,
        SUM(size) as total_size,
        AVG(hit_count) as avg_hits
      FROM cache_entries
      WHERE expires_at > ?
    `).get(Date.now()) as any;
    
    const topKeys = this.db.prepare(`
      SELECT key, hit_count as hits, size
      FROM cache_entries
      WHERE expires_at > ?
      ORDER BY hit_count DESC
      LIMIT 10
    `).all(Date.now()) as any[];
    
    const hitRate = this.metricsCache.hits / (this.metricsCache.hits + this.metricsCache.misses) * 100 || 0;
    const avgResponseTime = this.metricsCache.operations > 0 
      ? this.metricsCache.totalResponseTime / this.metricsCache.operations 
      : 0;
    
    return {
      totalEntries: stats.total_entries || 0,
      totalHits: stats.total_hits || 0,
      totalMisses: this.metricsCache.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage: stats.total_size || 0,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      bandwidthSaved: (stats.total_hits || 0) * (stats.total_size || 0) / (stats.total_entries || 1),
      topKeys: topKeys || []
    };
  }
  
  async saveSessionState(state: SessionState): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO session_states 
      (session_id, user_id, workspace, state, last_activity)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      state.sessionId,
      state.userId,
      state.workspace,
      JSON.stringify(state),
      state.lastActivity.getTime()
    );
    
    // Also cache in main cache for quick access
    await this.cache(`session:${state.sessionId}`, state, { 
      ttl: 3600, // 1 hour
      priority: 'high' 
    });
  }
  
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    // Try cache first
    const cached = await this.get<SessionState>(`session:${sessionId}`);
    if (cached) return cached;
    
    // Fall back to session table
    const row = this.db.prepare('SELECT state FROM session_states WHERE session_id = ?')
      .get(sessionId) as any;
    
    return row ? JSON.parse(row.state) : null;
  }
  
  async listRecentSessions(userId: string, limit: number = 5): Promise<SessionState[]> {
    const rows = this.db.prepare(`
      SELECT state FROM session_states 
      WHERE user_id = ? 
      ORDER BY last_activity DESC 
      LIMIT ?
    `).all(userId, limit) as any[];
    
    return rows.map(row => JSON.parse(row.state));
  }
  
  async cacheFile(path: string, content: string, hash?: string): Promise<void> {
    const fileHash = hash || createHash('sha256').update(content).digest('hex');
    
    await this.cache(`file:${path}`, {
      content,
      hash: fileHash,
      cachedAt: Date.now()
    }, {
      ttl: 3600, // 1 hour for files
      priority: 'high',
      compress: content.length > 10240, // Compress files > 10KB
      tags: ['file', path.split('/').slice(0, -1).join('/')]
    });
  }
  
  async getCachedFile(path: string): Promise<{ content: string; hash: string; cachedAt: number } | null> {
    return await this.get(`file:${path}`);
  }
  
  async invalidateFiles(pattern: string): Promise<number> {
    return await this.invalidate(`file:${pattern}`);
  }
  
  async cacheApiResponse(endpoint: string, response: any, ttl: number = 300): Promise<void> {
    await this.cache(`api:${endpoint}`, response, {
      ttl,
      priority: 'medium',
      tags: ['api', endpoint.split('/')[0]]
    });
  }
  
  async getCachedApiResponse(endpoint: string): Promise<any | null> {
    return await this.get(`api:${endpoint}`);
  }
  
  async warmCache(keys: string[]): Promise<void> {
    // Pre-load frequently used data
    const placeholders = keys.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT key FROM cache_entries 
      WHERE key IN (${placeholders}) AND expires_at <= ?
    `).all(...keys, Date.now()) as any[];
    
    // Re-fetch expired entries
   
  }
  
  async optimizeCache(): Promise<void> {
    // Remove expired entries
    const expired = this.db.prepare('DELETE FROM cache_entries WHERE expires_at <= ?')
      .run(Date.now());
    
    // Remove low-priority items if cache is too large
    const stats = await this.getCacheStats();
    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB limit
      const removed = this.db.prepare(`
        DELETE FROM cache_entries 
        WHERE priority = 'low' 
        AND hit_count < 5
        ORDER BY cached_at ASC
        LIMIT 100
      `).run();
      
     
    }
    
    // Vacuum database
    this.db.exec('VACUUM');
  }
  
  async clear(): Promise<void> {
    this.db.exec('DELETE FROM cache_entries');
    this.db.exec('DELETE FROM performance_metrics');
    this.metricsCache = { hits: 0, misses: 0, totalResponseTime: 0, operations: 0 };
  }
  
  subscribeToStats(callback: (stats: CacheStats) => void): () => void {
    const handler = async () => {
      const stats = await this.getCacheStats();
      callback(stats);
    };
    
    this.statsEmitter.on('stats', handler);
    return () => this.statsEmitter.off('stats', handler);
  }
  
  private startCleanupTimer(): void {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.optimizeCache();
      } catch (error) {
        console.error('Cache cleanup error:', error);
      }
    }, 5 * 60 * 1000);
  }
  
  private startMetricsTimer(): void {
    // Emit stats every 10 seconds
    setInterval(() => {
      this.statsEmitter.emit('stats');
    }, 10000);
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.statsEmitter.removeAllListeners();
    this.db.close();
  }
}