import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
export class KnowledgeCacheService extends EventEmitter {
    cache = new Map();
    queryPatterns = new Map();
    metrics = {
        totalQueries: 0,
        cacheHitRate: 0,
        avgResponseTime: 0,
        popularPatterns: [],
        userPreferences: {},
        contextEffectiveness: {}
    };
    cachePath;
    maxCacheSize = 100 * 1024 * 1024; // 100MB
    currentCacheSize = 0;
    saveDebounceTimer = null;
    constructor(workspacePath) {
        super();
        this.cachePath = path.join(workspacePath, '.claude', 'cache');
        this.initialize();
    }
    /**
     * Initialize cache system
     */
    async initialize() {
        try {
            // Ensure cache directory exists
            await fs.mkdir(this.cachePath, { recursive: true });
            // Load existing cache
            await this.loadCache();
            // Load learning metrics
            await this.loadMetrics();
            // Start periodic cleanup
            setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
        }
        catch (error) {
            console.error('Failed to initialize cache:', error);
        }
    }
    /**
     * Get cached result
     */
    async get(key) {
        const startTime = Date.now();
        const entry = this.cache.get(key);
        if (entry) {
            // Check TTL
            if (entry.metadata.ttl) {
                const age = Date.now() - entry.metadata.created.getTime();
                if (age > entry.metadata.ttl) {
                    this.cache.delete(key);
                    this.updateMetrics('miss', Date.now() - startTime);
                    return null;
                }
            }
            // Update access metadata
            entry.metadata.accessed = new Date();
            entry.metadata.accessCount++;
            this.updateMetrics('hit', Date.now() - startTime);
            this.emit('cache:hit', { key, entry });
            return entry.data;
        }
        this.updateMetrics('miss', Date.now() - startTime);
        return null;
    }
    /**
     * Set cache entry
     */
    async set(key, data, options = {}) {
        const size = this.estimateSize(data);
        // Check if we need to evict entries
        if (this.currentCacheSize + size > this.maxCacheSize) {
            await this.evictLRU(size);
        }
        const entry = {
            id: this.generateId(key),
            key,
            data,
            metadata: {
                created: new Date(),
                accessed: new Date(),
                accessCount: 1,
                size,
                ttl: options.ttl,
                tags: options.tags
            }
        };
        this.cache.set(key, entry);
        this.currentCacheSize += size;
        this.emit('cache:set', { key, entry });
        this.scheduleSave();
    }
    /**
     * Invalidate cache entries
     */
    async invalidate(pattern, tags) {
        let invalidated = 0;
        for (const [key, entry] of this.cache.entries()) {
            let shouldInvalidate = false;
            // Check pattern match
            if (pattern) {
                if (typeof pattern === 'string') {
                    shouldInvalidate = key.includes(pattern);
                }
                else {
                    shouldInvalidate = pattern.test(key);
                }
            }
            // Check tag match
            if (tags && entry.metadata.tags) {
                shouldInvalidate = shouldInvalidate ||
                    tags.some(tag => entry.metadata.tags.includes(tag));
            }
            if (shouldInvalidate) {
                this.cache.delete(key);
                this.currentCacheSize -= entry.metadata.size;
                invalidated++;
            }
        }
        if (invalidated > 0) {
            this.emit('cache:invalidated', { count: invalidated, pattern, tags });
            this.scheduleSave();
        }
        return invalidated;
    }
    /**
     * Learn from query patterns
     */
    async learnFromQuery(query, result, responseTime, success) {
        // Update total queries
        this.metrics.totalQueries++;
        // Track query pattern
        const patternKey = this.extractPattern(query);
        let pattern = this.queryPatterns.get(patternKey);
        if (!pattern) {
            pattern = {
                pattern: patternKey,
                frequency: 0,
                lastUsed: new Date(),
                avgResponseTime: 0,
                successRate: 0
            };
            this.queryPatterns.set(patternKey, pattern);
        }
        // Update pattern metrics
        pattern.frequency++;
        pattern.lastUsed = new Date();
        pattern.avgResponseTime =
            (pattern.avgResponseTime * (pattern.frequency - 1) + responseTime) / pattern.frequency;
        pattern.successRate =
            (pattern.successRate * (pattern.frequency - 1) + (success ? 1 : 0)) / pattern.frequency;
        // Update popular patterns
        this.updatePopularPatterns();
        // Learn from result structure
        if (success && result) {
            this.learnFromResult(query, result);
        }
        // Save metrics periodically
        this.scheduleSave();
    }
    /**
     * Get learning insights
     */
    getInsights() {
        const recommendations = [];
        // Generate recommendations based on metrics
        if (this.metrics.cacheHitRate < 0.3) {
            recommendations.push('Consider pre-caching frequently accessed data');
        }
        if (this.metrics.avgResponseTime > 1000) {
            recommendations.push('Response times are high - consider optimizing queries');
        }
        // Find inefficient patterns
        const inefficientPatterns = Array.from(this.queryPatterns.values())
            .filter(p => p.successRate < 0.5 || p.avgResponseTime > 2000);
        if (inefficientPatterns.length > 0) {
            recommendations.push(`${inefficientPatterns.length} query patterns have low success rates`);
        }
        return {
            recommendations,
            patterns: this.metrics.popularPatterns,
            preferences: this.metrics.userPreferences,
            performance: {
                cacheHitRate: this.metrics.cacheHitRate,
                avgResponseTime: this.metrics.avgResponseTime,
                totalQueries: this.metrics.totalQueries
            }
        };
    }
    /**
     * Predict what user might need next
     */
    async predictNextQueries(currentContext) {
        const predictions = [];
        // Based on popular patterns
        for (const pattern of this.metrics.popularPatterns) {
            if (this.matchesContext(pattern.pattern, currentContext)) {
                predictions.push(pattern.pattern);
            }
        }
        // Based on user preferences
        const preferredTypes = Object.entries(this.metrics.userPreferences)
            .filter(([_, count]) => count > 5)
            .map(([type, _]) => type);
        // Generate predictions based on preferences
        for (const type of preferredTypes) {
            predictions.push(`Find ${type} in current context`);
        }
        return predictions.slice(0, 5);
    }
    /**
     * Extract pattern from query
     */
    extractPattern(query) {
        // Remove specific identifiers and normalize
        return query
            .replace(/['"]\w+['"]/g, '<identifier>')
            .replace(/\d+/g, '<number>')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
    /**
     * Learn from result structure
     */
    learnFromResult(query, result) {
        // Track result types
        const resultType = this.getResultType(result);
        this.metrics.userPreferences[resultType] =
            (this.metrics.userPreferences[resultType] || 0) + 1;
        // Track context effectiveness
        if (query.includes('context:')) {
            const contextSize = JSON.stringify(result).length;
            const contextType = query.match(/context:(\w+)/)?.[1] || 'unknown';
            if (!this.metrics.contextEffectiveness[contextType]) {
                this.metrics.contextEffectiveness[contextType] = 0;
            }
            // Simple effectiveness score based on size
            const effectiveness = Math.min(1, 1000 / contextSize);
            this.metrics.contextEffectiveness[contextType] =
                (this.metrics.contextEffectiveness[contextType] + effectiveness) / 2;
        }
    }
    /**
     * Get result type for learning
     */
    getResultType(result) {
        if (Array.isArray(result))
            return 'array';
        if (result.code)
            return 'code';
        if (result.documentation)
            return 'documentation';
        if (result.error)
            return 'error';
        if (result.analysis)
            return 'analysis';
        return 'unknown';
    }
    /**
     * Check if pattern matches current context
     */
    matchesContext(pattern, context) {
        // Simple keyword matching for now
        const keywords = pattern.split(' ');
        const contextStr = JSON.stringify(context).toLowerCase();
        return keywords.some(keyword => contextStr.includes(keyword));
    }
    /**
     * Update metrics
     */
    updateMetrics(type, responseTime) {
        const hits = this.metrics.cacheHitRate * this.metrics.totalQueries;
        const newHits = type === 'hit' ? hits + 1 : hits;
        this.metrics.cacheHitRate = newHits / (this.metrics.totalQueries + 1);
        this.metrics.avgResponseTime =
            (this.metrics.avgResponseTime * this.metrics.totalQueries + responseTime) /
                (this.metrics.totalQueries + 1);
    }
    /**
     * Update popular patterns list
     */
    updatePopularPatterns() {
        this.metrics.popularPatterns = Array.from(this.queryPatterns.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10);
    }
    /**
     * Evict least recently used entries
     */
    async evictLRU(requiredSpace) {
        const entries = Array.from(this.cache.values())
            .sort((a, b) => a.metadata.accessed.getTime() - b.metadata.accessed.getTime());
        let freedSpace = 0;
        for (const entry of entries) {
            if (freedSpace >= requiredSpace)
                break;
            this.cache.delete(entry.key);
            freedSpace += entry.metadata.size;
            this.currentCacheSize -= entry.metadata.size;
            this.emit('cache:evicted', { key: entry.key, reason: 'lru' });
        }
    }
    /**
     * Periodic cleanup
     */
    async cleanup() {
        let cleaned = 0;
        // Remove expired entries
        for (const [key, entry] of this.cache.entries()) {
            if (entry.metadata.ttl) {
                const age = Date.now() - entry.metadata.created.getTime();
                if (age > entry.metadata.ttl) {
                    this.cache.delete(key);
                    this.currentCacheSize -= entry.metadata.size;
                    cleaned++;
                }
            }
        }
        // Remove least accessed entries if cache is too large
        if (this.currentCacheSize > this.maxCacheSize * 0.9) {
            await this.evictLRU(this.maxCacheSize * 0.1);
        }
        if (cleaned > 0) {
            this.emit('cache:cleaned', { count: cleaned });
            await this.saveCache();
        }
    }
    /**
     * Generate cache entry ID
     */
    generateId(key) {
        return createHash('md5').update(key).digest('hex');
    }
    /**
     * Estimate data size
     */
    estimateSize(data) {
        return JSON.stringify(data).length * 2; // Rough estimate in bytes
    }
    /**
     * Schedule cache save
     */
    scheduleSave() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        this.saveDebounceTimer = setTimeout(() => {
            this.saveCache();
            this.saveMetrics();
        }, 5000);
    }
    /**
     * Save cache to disk
     */
    async saveCache() {
        try {
            const cacheData = {
                entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                    key,
                    entry: {
                        ...entry,
                        metadata: {
                            ...entry.metadata,
                            created: entry.metadata.created.toISOString(),
                            accessed: entry.metadata.accessed.toISOString()
                        }
                    }
                })),
                currentSize: this.currentCacheSize
            };
            await fs.writeFile(path.join(this.cachePath, 'cache.json'), JSON.stringify(cacheData, null, 2));
        }
        catch (error) {
            console.error('Failed to save cache:', error);
        }
    }
    /**
     * Load cache from disk
     */
    async loadCache() {
        try {
            const cachePath = path.join(this.cachePath, 'cache.json');
            const data = await fs.readFile(cachePath, 'utf-8');
            const cacheData = JSON.parse(data);
            for (const { key, entry } of cacheData.entries) {
                this.cache.set(key, {
                    ...entry,
                    metadata: {
                        ...entry.metadata,
                        created: new Date(entry.metadata.created),
                        accessed: new Date(entry.metadata.accessed)
                    }
                });
            }
            this.currentCacheSize = cacheData.currentSize || 0;
        }
        catch (error) {
            // Cache doesn't exist yet
        }
    }
    /**
     * Save metrics to disk
     */
    async saveMetrics() {
        try {
            const metricsData = {
                ...this.metrics,
                queryPatterns: Array.from(this.queryPatterns.entries())
            };
            await fs.writeFile(path.join(this.cachePath, 'metrics.json'), JSON.stringify(metricsData, null, 2));
        }
        catch (error) {
            console.error('Failed to save metrics:', error);
        }
    }
    /**
     * Load metrics from disk
     */
    async loadMetrics() {
        try {
            const metricsPath = path.join(this.cachePath, 'metrics.json');
            const data = await fs.readFile(metricsPath, 'utf-8');
            const metricsData = JSON.parse(data);
            this.metrics = {
                ...metricsData,
                popularPatterns: metricsData.popularPatterns || []
            };
            if (metricsData.queryPatterns) {
                this.queryPatterns = new Map(metricsData.queryPatterns);
            }
        }
        catch (error) {
            // Metrics don't exist yet
        }
    }
    /**
     * Clear all cache
     */
    async clear() {
        this.cache.clear();
        this.queryPatterns.clear();
        this.currentCacheSize = 0;
        this.metrics = {
            totalQueries: 0,
            cacheHitRate: 0,
            avgResponseTime: 0,
            popularPatterns: [],
            userPreferences: {},
            contextEffectiveness: {}
        };
        await this.saveCache();
        await this.saveMetrics();
        this.emit('cache:cleared');
    }
    /**
     * Get cache statistics
     */
    getStatistics() {
        return {
            entries: this.cache.size,
            size: this.currentCacheSize,
            maxSize: this.maxCacheSize,
            hitRate: this.metrics.cacheHitRate,
            patterns: this.queryPatterns.size,
            ...this.metrics
        };
    }
}
// Export singleton factory
export function createKnowledgeCache(workspacePath) {
    return new KnowledgeCacheService(workspacePath);
}
