import { ref, computed, watch } from 'vue';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useKnowledgeAnalyticsStore } from '~/stores/knowledge-analytics';
import type { KnowledgeGap, DependencyNode } from '~/stores/knowledge-analytics';

export function useKnowledgeInsights() {
  const knowledgeStore = useKnowledgeStore();
  const analyticsStore = useKnowledgeAnalyticsStore();

  const isAnalyzing = ref(false);
  const lastAnalysisTime = ref<Date | null>(null);
  const selectedTimeframe = ref<'day' | 'week' | 'month' | 'all'>('week');

  // Reactive insights
  const insights = computed(() => {
    const coverage = analyticsStore.coverageStats;
    const effectiveness = analyticsStore.averageEffectiveness;
    const gaps = analyticsStore.knowledgeGaps;
    const usage = analyticsStore.mostUsedEntries;

    return {
      summary: {
        totalEntries: coverage.totalEntries,
        coveragePercentage: coverage.coveragePercentage,
        effectiveness: effectiveness,
        criticalGaps: gaps.filter(g => g.severity === 'high').length,
        lastUpdated: lastAnalysisTime.value
      },
      recommendations: generateRecommendations(coverage, effectiveness, gaps),
      trends: calculateTrends(),
      health: calculateHealthScore(coverage, effectiveness, gaps)
    };
  });

  // Generate actionable recommendations
  function generateRecommendations(coverage: any, effectiveness: number, gaps: KnowledgeGap[]) {
    const recommendations = [];

    // Coverage recommendations
    if (coverage.coveragePercentage < 50) {
      recommendations.push({
        type: 'coverage',
        priority: 'high',
        title: 'Increase Documentation Coverage',
        description: `Only ${coverage.coveragePercentage.toFixed(1)}% of files are documented. Consider adding knowledge entries for key components.`,
        action: 'Add documentation for undocumented files'
      });
    }

    // Effectiveness recommendations
    if (effectiveness < 0.5) {
      recommendations.push({
        type: 'quality',
        priority: 'medium',
        title: 'Improve Content Quality',
        description: 'Knowledge entries have low relevance scores. Review and update content for better context matching.',
        action: 'Review low-scoring entries'
      });
    }

    // Gap recommendations
    const highPriorityGaps = gaps.filter(g => g.severity === 'high');
    if (highPriorityGaps.length > 0) {
      recommendations.push({
        type: 'gaps',
        priority: 'high',
        title: 'Address Critical Knowledge Gaps',
        description: `${highPriorityGaps.length} critical gaps detected that need immediate attention.`,
        action: 'Fix high-priority gaps'
      });
    }

    // Usage recommendations
    const unusedEntries = analyticsStore.leastUsedEntries;
    if (unusedEntries.length > 5) {
      recommendations.push({
        type: 'maintenance',
        priority: 'low',
        title: 'Clean Up Unused Entries',
        description: `${unusedEntries.length} entries have very low usage. Consider archiving or improving their discoverability.`,
        action: 'Review unused entries'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Calculate trend data
  function calculateTrends() {
    const effectiveness = analyticsStore.contextEffectiveness;
    const timeRange = getTimeRange(selectedTimeframe.value);
    
    // Group by day
    const dailyData = new Map<string, { queries: number; tokens: number; relevance: number }>();
    
    for (const ce of effectiveness) {
      if (ce.timestamp >= timeRange.start) {
        const dateKey = ce.timestamp.toISOString().split('T')[0];
        const existing = dailyData.get(dateKey) || { queries: 0, tokens: 0, relevance: 0 };
        
        existing.queries++;
        existing.tokens += ce.tokensUsed;
        existing.relevance += ce.relevanceScore;
        
        dailyData.set(dateKey, existing);
      }
    }
    
    // Convert to array
    const trends = Array.from(dailyData.entries()).map(([date, data]) => ({
      date: new Date(date),
      queries: data.queries,
      tokensPerQuery: data.tokens / data.queries,
      averageRelevance: data.relevance / data.queries
    }));
    
    return trends.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // Calculate overall health score
  function calculateHealthScore(coverage: any, effectiveness: number, gaps: KnowledgeGap[]): number {
    let score = 100;
    
    // Coverage impact (max -30)
    if (coverage.coveragePercentage < 80) {
      score -= (80 - coverage.coveragePercentage) * 0.3;
    }
    
    // Effectiveness impact (max -30)
    if (effectiveness < 0.8) {
      score -= (0.8 - effectiveness) * 30;
    }
    
    // Gaps impact (max -40)
    const gapPenalty = gaps.reduce((penalty, gap) => {
      switch (gap.severity) {
        case 'high': return penalty + 10;
        case 'medium': return penalty + 5;
        case 'low': return penalty + 2;
        default: return penalty;
      }
    }, 0);
    
    score -= Math.min(gapPenalty, 40);
    
    return Math.max(0, Math.round(score));
  }

  // Get time range for filtering
  function getTimeRange(timeframe: 'day' | 'week' | 'month' | 'all') {
    const now = new Date();
    const start = new Date();
    
    switch (timeframe) {
      case 'day':
        start.setDate(now.getDate() - 1);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setDate(now.getDate() - 30);
        break;
      case 'all':
        start.setTime(0);
        break;
    }
    
    return { start, end: now };
  }

  // Analyze knowledge base
  async function analyzeKnowledgeBase() {
    isAnalyzing.value = true;
    
    try {
      // Detect knowledge gaps
      await analyticsStore.detectKnowledgeGaps();
      
      // Build dependency graph
      await analyticsStore.buildDependencyGraph(knowledgeStore.entries);
      
      lastAnalysisTime.value = new Date();
    } finally {
      isAnalyzing.value = false;
    }
  }

  // Get visualization data for dependency graph
  function getDependencyGraphData() {
    const nodes = Array.from(analyticsStore.dependencyGraph.values());
    const links = [];
    
    for (const node of nodes) {
      for (const depId of node.dependencies) {
        links.push({
          source: node.id,
          target: depId,
          type: 'dependency'
        });
      }
    }
    
    return {
      nodes: nodes.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        metrics: node.metrics,
        group: getCategoryGroup(node.type)
      })),
      links
    };
  }

  // Get category group for visualization
  function getCategoryGroup(type: string): number {
    const groups: Record<string, number> = {
      file: 1,
      module: 2,
      concept: 3,
      external: 4
    };
    return groups[type] || 0;
  }

  // Get gap distribution
  function getGapDistribution() {
    const distribution = {
      missing_documentation: 0,
      outdated_content: 0,
      low_coverage: 0,
      ambiguous_references: 0
    };
    
    for (const gap of analyticsStore.knowledgeGaps) {
      distribution[gap.type]++;
    }
    
    return Object.entries(distribution).map(([type, count]) => ({
      type: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count,
      percentage: (count / analyticsStore.knowledgeGaps.length) * 100 || 0
    }));
  }

  // Get token usage by source
  function getTokenUsageBySource() {
    const usage = analyticsStore.tokenUsageStats;
    const sources = Array.from(usage.tokensBySource.entries());
    
    return sources
      .map(([source, tokens]) => ({
        source,
        tokens,
        percentage: (tokens / usage.totalTokens) * 100
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  // Export insights report
  function exportInsightsReport(format: 'markdown' | 'json' = 'markdown'): string {
    const data = {
      generated: new Date().toISOString(),
      summary: insights.value.summary,
      recommendations: insights.value.recommendations,
      gaps: analyticsStore.knowledgeGaps,
      usage: {
        mostUsed: analyticsStore.mostUsedEntries.slice(0, 5),
        leastUsed: analyticsStore.leastUsedEntries.slice(0, 5)
      },
      metrics: {
        coverage: analyticsStore.coverageStats,
        effectiveness: analyticsStore.averageEffectiveness,
        tokens: analyticsStore.tokenUsageStats
      }
    };
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
    
    // Markdown format
    let report = `# Knowledge Base Insights Report
Generated: ${new Date().toLocaleString()}

## Summary
- **Total Entries**: ${data.summary.totalEntries}
- **Coverage**: ${data.summary.coveragePercentage.toFixed(1)}%
- **Effectiveness**: ${(data.summary.effectiveness * 100).toFixed(1)}%
- **Critical Gaps**: ${data.summary.criticalGaps}
- **Health Score**: ${insights.value.health}/100

## Recommendations
`;
    
    for (const rec of data.recommendations) {
      report += `
### ${rec.title} [${rec.priority.toUpperCase()}]
${rec.description}
**Action**: ${rec.action}
`;
    }
    
    report += `
## Knowledge Gaps (${data.gaps.length})
`;
    
    for (const gap of data.gaps.slice(0, 10)) {
      report += `- **${gap.type}** [${gap.severity}]: ${gap.description}\n`;
    }
    
    if (data.gaps.length > 10) {
      report += `\n...and ${data.gaps.length - 10} more\n`;
    }
    
    report += `
## Usage Statistics

### Most Used Entries
`;
    
    for (const { entry, usage } of data.usage.mostUsed) {
      report += `1. **${entry.title}** - ${usage.accessCount} accesses\n`;
    }
    
    report += `
### Least Used Entries
`;
    
    for (const { entry, usage } of data.usage.leastUsed) {
      report += `1. **${entry.title}** - ${usage.accessCount} accesses\n`;
    }
    
    return report;
  }

  // Watch for timeframe changes
  watch(selectedTimeframe, (newTimeframe) => {
    analyticsStore.setTimeframe(newTimeframe);
  });

  return {
    // State
    isAnalyzing,
    lastAnalysisTime,
    selectedTimeframe,
    insights,
    
    // Analytics data
    gaps: computed(() => analyticsStore.knowledgeGaps),
    mostUsed: computed(() => analyticsStore.mostUsedEntries),
    leastUsed: computed(() => analyticsStore.leastUsedEntries),
    coverage: computed(() => analyticsStore.coverageStats),
    effectiveness: computed(() => analyticsStore.averageEffectiveness),
    dependencyInsights: computed(() => analyticsStore.dependencyInsights),
    
    // Methods
    analyzeKnowledgeBase,
    getDependencyGraphData,
    getGapDistribution,
    getTokenUsageBySource,
    exportInsightsReport,
    
    // Analytics methods from store
    trackUsage: analyticsStore.trackUsage,
    trackContextEffectiveness: analyticsStore.trackContextEffectiveness,
    rateEntry: analyticsStore.rateEntry
  };
}