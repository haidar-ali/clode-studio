import { defineStore } from 'pinia';
import { useKnowledgeStore } from './knowledge';

export interface KnowledgeUsageMetric {
  entryId: string;
  accessCount: number;
  lastAccessed: Date;
  averageRelevanceScore: number;
  contextInjections: number;
  userRatings: number[];
}

export interface KnowledgeGap {
  id: string;
  type: 'missing_documentation' | 'outdated_content' | 'low_coverage' | 'ambiguous_references';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedAreas: string[];
  suggestedAction: string;
  detectedAt: Date;
}

export interface ContextEffectiveness {
  queryId: string;
  query: string;
  timestamp: Date;
  tokensUsed: number;
  relevanceScore: number;
  userFeedback?: 'helpful' | 'not_helpful' | 'neutral';
  responseTime: number;
  contextSources: Array<{
    source: string;
    contribution: number;
    tokens: number;
  }>;
}

export interface DependencyNode {
  id: string;
  type: 'file' | 'module' | 'concept' | 'external';
  name: string;
  dependencies: string[];
  dependents: string[];
  metrics: {
    coupling: number;
    cohesion: number;
    complexity: number;
  };
}

export interface AnalyticsTimeframe {
  start: Date;
  end: Date;
  label: string;
}

export const useKnowledgeAnalyticsStore = defineStore('knowledge-analytics', {
  state: () => ({
    usageMetrics: new Map<string, KnowledgeUsageMetric>(),
    knowledgeGaps: [] as KnowledgeGap[],
    contextEffectiveness: [] as ContextEffectiveness[],
    dependencyGraph: new Map<string, DependencyNode>(),
    timeframes: {
      current: 'week' as 'day' | 'week' | 'month' | 'all',
      custom: null as AnalyticsTimeframe | null
    },
    thresholds: {
      lowUsage: 5,
      outdatedDays: 30,
      lowRelevance: 0.3,
      highCoupling: 0.7
    }
  }),

  getters: {
    // Most used knowledge entries
    mostUsedEntries(): Array<{ entry: any; usage: KnowledgeUsageMetric }> {
      const knowledgeStore = useKnowledgeStore();
      const entries = [];
      
      for (const [entryId, usage] of this.usageMetrics.entries()) {
        const entry = knowledgeStore.entries.find(e => e.id === entryId);
        if (entry) {
          entries.push({ entry, usage });
        }
      }
      
      return entries
        .sort((a, b) => b.usage.accessCount - a.usage.accessCount)
        .slice(0, 10);
    },

    // Least used entries (potential removal candidates)
    leastUsedEntries(): Array<{ entry: any; usage: KnowledgeUsageMetric }> {
      const knowledgeStore = useKnowledgeStore();
      const entries = [];
      
      for (const entry of knowledgeStore.entries) {
        const usage = this.usageMetrics.get(entry.id) || {
          entryId: entry.id,
          accessCount: 0,
          lastAccessed: new Date(0),
          averageRelevanceScore: 0,
          contextInjections: 0,
          userRatings: []
        };
        
        if (usage.accessCount < this.thresholds.lowUsage) {
          entries.push({ entry, usage });
        }
      }
      
      return entries.sort((a, b) => a.usage.accessCount - b.usage.accessCount);
    },

    // Average context effectiveness
    averageEffectiveness(): number {
      if (this.contextEffectiveness.length === 0) return 0;
      
      const sum = this.contextEffectiveness.reduce(
        (acc, ce) => acc + ce.relevanceScore, 
        0
      );
      
      return sum / this.contextEffectiveness.length;
    },

    // Knowledge coverage statistics
    coverageStats() {
      const knowledgeStore = useKnowledgeStore();
      const totalFiles = 100; // This would come from workspace analysis
      const coveredFiles = new Set<string>();
      
      for (const entry of knowledgeStore.entries) {
        if (entry.metadata?.filePath) {
          coveredFiles.add(entry.metadata.filePath);
        }
      }
      
      return {
        totalEntries: knowledgeStore.entries.length,
        coveredFiles: coveredFiles.size,
        totalFiles,
        coveragePercentage: (coveredFiles.size / totalFiles) * 100,
        averageEntriesPerFile: knowledgeStore.entries.length / (coveredFiles.size || 1)
      };
    },

    // Critical knowledge gaps
    criticalGaps(): KnowledgeGap[] {
      return this.knowledgeGaps
        .filter(gap => gap.severity === 'high')
        .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
    },

    // Token usage statistics
    tokenUsageStats() {
      const stats = {
        totalTokens: 0,
        averageTokensPerQuery: 0,
        tokensBySource: new Map<string, number>(),
        trend: [] as Array<{ date: Date; tokens: number }>
      };
      
      for (const ce of this.contextEffectiveness) {
        stats.totalTokens += ce.tokensUsed;
        
        for (const source of ce.contextSources) {
          const current = stats.tokensBySource.get(source.source) || 0;
          stats.tokensBySource.set(source.source, current + source.tokens);
        }
      }
      
      if (this.contextEffectiveness.length > 0) {
        stats.averageTokensPerQuery = stats.totalTokens / this.contextEffectiveness.length;
      }
      
      return stats;
    },

    // Dependency insights
    dependencyInsights() {
      const nodes = Array.from(this.dependencyGraph.values());
      
      // Find circular dependencies
      const circular: string[][] = [];
      const visited = new Set<string>();
      const recursionStack = new Set<string>();
      
      const findCycles = (nodeId: string, path: string[] = []) => {
        if (recursionStack.has(nodeId)) {
          const cycleStart = path.indexOf(nodeId);
          if (cycleStart !== -1) {
            circular.push(path.slice(cycleStart));
          }
          return;
        }
        
        if (visited.has(nodeId)) return;
        
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);
        
        const node = this.dependencyGraph.get(nodeId);
        if (node) {
          for (const dep of node.dependencies) {
            findCycles(dep, [...path]);
          }
        }
        
        recursionStack.delete(nodeId);
      };
      
      for (const node of nodes) {
        findCycles(node.id);
      }
      
      // Find highly coupled modules
      const highlyCoupled = nodes.filter(n => n.metrics.coupling > this.thresholds.highCoupling);
      
      // Find isolated modules
      const isolated = nodes.filter(n => 
        n.dependencies.length === 0 && n.dependents.length === 0
      );
      
      return {
        totalNodes: nodes.length,
        circularDependencies: circular,
        highlyCoupled,
        isolated,
        averageCoupling: nodes.reduce((sum, n) => sum + n.metrics.coupling, 0) / nodes.length,
        averageComplexity: nodes.reduce((sum, n) => sum + n.metrics.complexity, 0) / nodes.length
      };
    },

    // Time-filtered metrics
    filteredMetrics() {
      const now = new Date();
      let startDate: Date;
      
      switch (this.timeframes.current) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }
      
      if (this.timeframes.custom) {
        startDate = this.timeframes.custom.start;
      }
      
      const filtered = this.contextEffectiveness.filter(ce => 
        ce.timestamp >= startDate
      );
      
      return {
        queries: filtered.length,
        averageRelevance: filtered.reduce((sum, ce) => sum + ce.relevanceScore, 0) / filtered.length,
        totalTokens: filtered.reduce((sum, ce) => sum + ce.tokensUsed, 0),
        helpfulPercentage: filtered.filter(ce => ce.userFeedback === 'helpful').length / filtered.length * 100
      };
    }
  },

  actions: {
    // Track knowledge entry usage
    trackUsage(entryId: string, relevanceScore: number = 1) {
      let metric = this.usageMetrics.get(entryId);
      
      if (!metric) {
        metric = {
          entryId,
          accessCount: 0,
          lastAccessed: new Date(),
          averageRelevanceScore: 0,
          contextInjections: 0,
          userRatings: []
        };
        this.usageMetrics.set(entryId, metric);
      }
      
      metric.accessCount++;
      metric.lastAccessed = new Date();
      metric.averageRelevanceScore = 
        (metric.averageRelevanceScore * (metric.accessCount - 1) + relevanceScore) / 
        metric.accessCount;
    },

    // Track context effectiveness
    trackContextEffectiveness(effectiveness: ContextEffectiveness) {
      this.contextEffectiveness.push(effectiveness);
      
      // Limit history
      if (this.contextEffectiveness.length > 1000) {
        this.contextEffectiveness = this.contextEffectiveness.slice(-1000);
      }
      
      // Update usage metrics for involved entries
      for (const source of effectiveness.contextSources) {
        const entryId = source.source.split(':')[0]; // Assuming format "entryId:section"
        if (this.usageMetrics.has(entryId)) {
          const metric = this.usageMetrics.get(entryId)!;
          metric.contextInjections++;
        }
      }
    },

    // Detect knowledge gaps
    async detectKnowledgeGaps() {
      const gaps: KnowledgeGap[] = [];
      const knowledgeStore = useKnowledgeStore();
      const now = new Date();
      
      // Check for outdated content
      for (const entry of knowledgeStore.entries) {
        const lastModified = new Date(entry.metadata?.lastModified || entry.createdAt);
        const daysSinceModified = (now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceModified > this.thresholds.outdatedDays) {
          gaps.push({
            id: `outdated-${entry.id}`,
            type: 'outdated_content',
            severity: daysSinceModified > 60 ? 'high' : 'medium',
            description: `Entry "${entry.title}" hasn't been updated in ${Math.floor(daysSinceModified)} days`,
            affectedAreas: [entry.category],
            suggestedAction: 'Review and update the content',
            detectedAt: now
          });
        }
      }
      
      // Check for low coverage areas
      const categoryCounts = new Map<string, number>();
      for (const entry of knowledgeStore.entries) {
        const count = categoryCounts.get(entry.category) || 0;
        categoryCounts.set(entry.category, count + 1);
      }
      
      for (const [category, count] of categoryCounts.entries()) {
        if (count < 3) {
          gaps.push({
            id: `low-coverage-${category}`,
            type: 'low_coverage',
            severity: count === 0 ? 'high' : 'medium',
            description: `Category "${category}" has only ${count} entries`,
            affectedAreas: [category],
            suggestedAction: 'Add more documentation for this category',
            detectedAt: now
          });
        }
      }
      
      // Check for unused entries
      for (const entry of knowledgeStore.entries) {
        const usage = this.usageMetrics.get(entry.id);
        if (!usage || usage.accessCount === 0) {
          gaps.push({
            id: `unused-${entry.id}`,
            type: 'missing_documentation',
            severity: 'low',
            description: `Entry "${entry.title}" has never been accessed`,
            affectedAreas: [entry.category],
            suggestedAction: 'Consider removing or improving discoverability',
            detectedAt: now
          });
        }
      }
      
      this.knowledgeGaps = gaps;
    },

    // Build dependency graph
    async buildDependencyGraph(entries: any[]) {
      const graph = new Map<string, DependencyNode>();
      
      // First pass: create nodes
      for (const entry of entries) {
        const node: DependencyNode = {
          id: entry.id,
          type: entry.type || 'concept',
          name: entry.title,
          dependencies: [],
          dependents: [],
          metrics: {
            coupling: 0,
            cohesion: 0,
            complexity: 0
          }
        };
        
        // Extract dependencies from content
        const references = this.extractReferences(entry.content);
        node.dependencies = references;
        
        graph.set(node.id, node);
      }
      
      // Second pass: build dependents and calculate metrics
      for (const node of graph.values()) {
        for (const depId of node.dependencies) {
          const depNode = graph.get(depId);
          if (depNode) {
            depNode.dependents.push(node.id);
          }
        }
      }
      
      // Calculate metrics
      for (const node of graph.values()) {
        const totalNodes = graph.size;
        node.metrics.coupling = 
          (node.dependencies.length + node.dependents.length) / (totalNodes - 1);
        node.metrics.cohesion = 
          this.calculateCohesion(node, graph);
        node.metrics.complexity = 
          node.dependencies.length * node.dependents.length;
      }
      
      this.dependencyGraph = graph;
    },

    // Helper: Extract references from content
    extractReferences(content: string): string[] {
      const references: string[] = [];
      
      // Look for various reference patterns
      const patterns = [
        /\[\[([^\]]+)\]\]/g, // Wiki-style links
        /ref:\s*(\w+)/g,     // Explicit references
        /@see\s+(\w+)/g,     // Documentation references
        /import\s+.*from\s+['"]([^'"]+)['"]/g // Code imports
      ];
      
      for (const pattern of patterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          references.push(match[1]);
        }
      }
      
      return [...new Set(references)];
    },

    // Helper: Calculate cohesion metric
    calculateCohesion(node: DependencyNode, graph: Map<string, DependencyNode>): number {
      if (node.dependencies.length === 0) return 1;
      
      // Check how many dependencies are related to each other
      let relatedPairs = 0;
      for (let i = 0; i < node.dependencies.length; i++) {
        for (let j = i + 1; j < node.dependencies.length; j++) {
          const dep1 = graph.get(node.dependencies[i]);
          const dep2 = graph.get(node.dependencies[j]);
          
          if (dep1 && dep2) {
            // Check if they reference each other or share dependencies
            if (dep1.dependencies.includes(dep2.id) || 
                dep2.dependencies.includes(dep1.id) ||
                dep1.dependencies.some(d => dep2.dependencies.includes(d))) {
              relatedPairs++;
            }
          }
        }
      }
      
      const maxPairs = (node.dependencies.length * (node.dependencies.length - 1)) / 2;
      return maxPairs > 0 ? relatedPairs / maxPairs : 0;
    },

    // Rate knowledge entry
    rateEntry(entryId: string, rating: number) {
      let metric = this.usageMetrics.get(entryId);
      
      if (!metric) {
        metric = {
          entryId,
          accessCount: 0,
          lastAccessed: new Date(),
          averageRelevanceScore: 0,
          contextInjections: 0,
          userRatings: []
        };
        this.usageMetrics.set(entryId, metric);
      }
      
      metric.userRatings.push(rating);
    },

    // Set timeframe
    setTimeframe(timeframe: 'day' | 'week' | 'month' | 'all') {
      this.timeframes.current = timeframe;
      this.timeframes.custom = null;
    },

    // Set custom timeframe
    setCustomTimeframe(start: Date, end: Date, label: string) {
      this.timeframes.custom = { start, end, label };
    },

    // Export analytics data
    exportAnalytics(format: 'json' | 'csv' = 'json'): string {
      const data = {
        usageMetrics: Array.from(this.usageMetrics.entries()),
        knowledgeGaps: this.knowledgeGaps,
        contextEffectiveness: this.contextEffectiveness,
        dependencyGraph: Array.from(this.dependencyGraph.entries()),
        generatedAt: new Date().toISOString()
      };
      
      if (format === 'json') {
        return JSON.stringify(data, null, 2);
      } else {
        // CSV format - simplified view
        const rows = [
          ['Metric', 'Value'],
          ['Total Entries', this.coverageStats.totalEntries],
          ['Coverage %', this.coverageStats.coveragePercentage.toFixed(2)],
          ['Average Effectiveness', this.averageEffectiveness.toFixed(2)],
          ['Total Tokens Used', this.tokenUsageStats.totalTokens],
          ['Knowledge Gaps', this.knowledgeGaps.length],
          ['High Priority Gaps', this.criticalGaps.length]
        ];
        
        return rows.map(row => row.join(',')).join('\n');
      }
    },

    // Clear analytics data
    clearAnalytics() {
      this.usageMetrics.clear();
      this.knowledgeGaps = [];
      this.contextEffectiveness = [];
      this.dependencyGraph.clear();
    }
  }
});