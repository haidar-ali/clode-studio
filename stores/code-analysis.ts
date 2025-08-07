import { defineStore } from 'pinia';
import type { 
  CodeAnalysisResult, 
  CodePattern, 
  Suggestion,
  ArchitectureInsight 
} from '~/electron/claude-analyzer';

interface AnalysisState {
  results: Map<string, CodeAnalysisResult>;
  activeAnalyses: Set<string>;
  history: CodeAnalysisResult[];
  filters: {
    type: string | null;
    category: string | null;
    priority: string | null;
    dateRange: {
      start: Date | null;
      end: Date | null;
    };
  };
  settings: {
    autoAnalyzeOnSave: boolean;
    analyzeOnFileOpen: boolean;
    cacheResults: boolean;
    maxHistorySize: number;
    excludePatterns: string[];
  };
}

export const useCodeAnalysisStore = defineStore('code-analysis', {
  state: (): AnalysisState => ({
    results: new Map(),
    activeAnalyses: new Set(),
    history: [],
    filters: {
      type: null,
      category: null,
      priority: null,
      dateRange: {
        start: null,
        end: null
      }
    },
    settings: {
      autoAnalyzeOnSave: false,
      analyzeOnFileOpen: false,
      cacheResults: true,
      maxHistorySize: 100,
      excludePatterns: ['node_modules', '.git', 'dist', 'build', '.nuxt', '.claude', '.clode', '.claude-checkpoints', '.worktrees', '.output', 'coverage', '.nyc_output', 'tmp', 'temp', '.cache', '.parcel-cache', '.vscode', '.idea', '__pycache__', '.DS_Store']
    }
  }),

  getters: {
    // Get all results as array
    allResults(): CodeAnalysisResult[] {
      return Array.from(this.results.values());
    },

    // Get filtered results
    filteredResults(): CodeAnalysisResult[] {
      return this.allResults.filter(result => {
        // Filter by type
        if (this.filters.type && result.type !== this.filters.type) {
          return false;
        }

        // Filter by date range
        if (this.filters.dateRange.start || this.filters.dateRange.end) {
          const resultDate = new Date(result.timestamp);
          if (this.filters.dateRange.start && resultDate < this.filters.dateRange.start) {
            return false;
          }
          if (this.filters.dateRange.end && resultDate > this.filters.dateRange.end) {
            return false;
          }
        }

        // Filter by category (from patterns or suggestions)
        if (this.filters.category) {
          const hasCategory = 
            result.analysis.patterns?.some(p => p.category === this.filters.category) ||
            result.analysis.suggestions?.some(s => s.category === this.filters.category);
          if (!hasCategory) return false;
        }

        // Filter by priority (from suggestions)
        if (this.filters.priority) {
          const hasPriority = 
            result.analysis.suggestions?.some(s => s.priority === this.filters.priority);
          if (!hasPriority) return false;
        }

        return true;
      });
    },

    // Aggregate all patterns
    allPatterns(): Array<CodePattern & { resultId: string; target: string }> {
      const patterns: Array<CodePattern & { resultId: string; target: string }> = [];
      
      for (const result of this.allResults) {
        if (result.analysis.patterns) {
          for (const pattern of result.analysis.patterns) {
            patterns.push({
              ...pattern,
              resultId: result.id,
              target: result.target
            });
          }
        }
      }
      
      return patterns;
    },

    // Aggregate all suggestions
    allSuggestions(): Array<Suggestion & { resultId: string; target: string }> {
      const suggestions: Array<Suggestion & { resultId: string; target: string }> = [];
      
      for (const result of this.allResults) {
        if (result.analysis.suggestions) {
          for (const suggestion of result.analysis.suggestions) {
            suggestions.push({
              ...suggestion,
              resultId: result.id,
              target: result.target
            });
          }
        }
      }
      
      return suggestions;
    },

    // Get high priority suggestions
    highPrioritySuggestions(): Array<Suggestion & { resultId: string; target: string }> {
      return this.allSuggestions.filter(s => s.priority === 'high');
    },

    // Pattern statistics
    patternStats(): Record<string, { count: number; category: string }> {
      const stats: Record<string, { count: number; category: string }> = {};
      
      for (const pattern of this.allPatterns) {
        if (!stats[pattern.name]) {
          stats[pattern.name] = { count: 0, category: pattern.category };
        }
        stats[pattern.name].count += pattern.occurrences;
      }
      
      return stats;
    },

    // Architecture insights
    architectureInsights(): ArchitectureInsight | null {
      const archResult = this.allResults.find(r => r.type === 'architecture');
      return archResult?.analysis.architecture || null;
    },

    // Complexity metrics
    complexityMetrics() {
      const metricsResults = this.allResults.filter(r => r.analysis.complexity);
      
      if (metricsResults.length === 0) return null;
      
      const totals = metricsResults.reduce((acc, result) => {
        const c = result.analysis.complexity!;
        return {
          cyclomaticComplexity: acc.cyclomaticComplexity + c.cyclomaticComplexity,
          cognitiveComplexity: acc.cognitiveComplexity + c.cognitiveComplexity,
          linesOfCode: acc.linesOfCode + c.linesOfCode,
          maintainabilityIndex: acc.maintainabilityIndex + c.maintainabilityIndex,
          technicalDebt: acc.technicalDebt + c.technicalDebt,
          count: acc.count + 1
        };
      }, {
        cyclomaticComplexity: 0,
        cognitiveComplexity: 0,
        linesOfCode: 0,
        maintainabilityIndex: 0,
        technicalDebt: 0,
        count: 0
      });
      
      return {
        avgCyclomaticComplexity: Math.round(totals.cyclomaticComplexity / totals.count),
        avgCognitiveComplexity: Math.round(totals.cognitiveComplexity / totals.count),
        totalLinesOfCode: totals.linesOfCode,
        avgMaintainabilityIndex: Math.round(totals.maintainabilityIndex / totals.count),
        totalTechnicalDebt: totals.technicalDebt
      };
    },

    // Is analyzing
    isAnalyzing(): boolean {
      return this.activeAnalyses.size > 0;
    },

    // Analysis progress
    analysisProgress(): { active: number; completed: number; total: number } {
      return {
        active: this.activeAnalyses.size,
        completed: this.results.size,
        total: this.activeAnalyses.size + this.results.size
      };
    }
  },

  actions: {
    // Add analysis result
    addResult(result: CodeAnalysisResult) {
      this.results.set(result.id, result);
      this.history.push(result);
      
      // Maintain history size
      if (this.history.length > this.settings.maxHistorySize) {
        const removed = this.history.shift();
        if (removed) {
          this.results.delete(removed.id);
        }
      }
      
      // Remove from active
      this.activeAnalyses.delete(result.id);
    },

    // Start analysis
    startAnalysis(id: string) {
      this.activeAnalyses.add(id);
    },

    // Cancel analysis
    cancelAnalysis(id: string) {
      this.activeAnalyses.delete(id);
    },

    // Remove result
    removeResult(id: string) {
      this.results.delete(id);
      const index = this.history.findIndex(r => r.id === id);
      if (index !== -1) {
        this.history.splice(index, 1);
      }
    },

    // Clear all results
    clearResults() {
      this.results.clear();
      this.history = [];
      this.activeAnalyses.clear();
    },

    // Update filters
    setFilter(filter: keyof AnalysisState['filters'], value: any) {
      (this.filters as any)[filter] = value;
    },

    // Clear filters
    clearFilters() {
      this.filters = {
        type: null,
        category: null,
        priority: null,
        dateRange: {
          start: null,
          end: null
        }
      };
    },

    // Update settings
    updateSettings(settings: Partial<AnalysisState['settings']>) {
      this.settings = { ...this.settings, ...settings };
      this.saveSettings();
    },

    // Save settings to storage
    async saveSettings() {
      try {
        await window.electronAPI.store.set('codeAnalysisSettings', this.settings);
      } catch (error) {
        console.error('Failed to save analysis settings:', error);
      }
    },

    // Load settings from storage
    async loadSettings() {
      try {
        const saved = await window.electronAPI.store.get('codeAnalysisSettings');
        if (saved) {
          this.settings = { ...this.settings, ...saved };
        }
      } catch (error) {
        console.error('Failed to load analysis settings:', error);
      }
    },

    // Load cached results
    async loadCachedResults() {
      if (!this.settings.cacheResults) return;
      
      try {
        const cached = await window.electronAPI.store.get('codeAnalysisCache');
        if (cached && Array.isArray(cached)) {
          for (const result of cached) {
            // Convert timestamp back to Date
            result.timestamp = new Date(result.timestamp);
            this.results.set(result.id, result);
          }
          this.history = cached;
        }
      } catch (error) {
        console.error('Failed to load cached results:', error);
      }
    },

    // Save results to cache
    async saveCachedResults() {
      if (!this.settings.cacheResults) return;
      
      try {
        await window.electronAPI.store.set('codeAnalysisCache', this.history);
      } catch (error) {
        console.error('Failed to save cached results:', error);
      }
    },

    // Check if path should be analyzed
    shouldAnalyzePath(path: string): boolean {
      return !this.settings.excludePatterns.some(pattern => 
        path.includes(pattern)
      );
    },

    // Get results for specific target
    getResultsForTarget(target: string): CodeAnalysisResult[] {
      return this.allResults.filter(r => r.target === target);
    },

    // Get latest result for target
    getLatestResultForTarget(target: string): CodeAnalysisResult | null {
      const results = this.getResultsForTarget(target);
      if (results.length === 0) return null;
      
      return results.reduce((latest, current) => 
        current.timestamp > latest.timestamp ? current : latest
      );
    },

    // Export results
    exportResults(format: 'json' | 'csv' | 'markdown' = 'json'): string {
      const results = this.filteredResults;
      
      switch (format) {
        case 'json':
          return JSON.stringify(results, null, 2);
          
        case 'csv':
          const headers = ['ID', 'Type', 'Target', 'Timestamp', 'Summary', 'Patterns', 'Suggestions', 'Complexity'];
          const rows = results.map(r => [
            r.id,
            r.type,
            r.target,
            r.timestamp.toISOString(),
            r.analysis.summary,
            r.analysis.patterns?.length || 0,
            r.analysis.suggestions?.length || 0,
            r.analysis.complexity?.maintainabilityIndex || 'N/A'
          ]);
          
          return [headers, ...rows].map(row => row.join(',')).join('\n');
          
        case 'markdown':
          let md = '# Code Analysis Results\n\n';
          
          for (const result of results) {
            md += `## ${result.target}\n\n`;
            md += `**Type:** ${result.type}\n`;
            md += `**Date:** ${result.timestamp.toLocaleString()}\n\n`;
            md += `### Summary\n${result.analysis.summary}\n\n`;
            
            if (result.analysis.patterns?.length) {
              md += `### Patterns (${result.analysis.patterns.length})\n`;
              for (const pattern of result.analysis.patterns) {
                md += `- **${pattern.name}** (${pattern.category}): ${pattern.description}\n`;
              }
              md += '\n';
            }
            
            if (result.analysis.suggestions?.length) {
              md += `### Suggestions (${result.analysis.suggestions.length})\n`;
              for (const suggestion of result.analysis.suggestions) {
                md += `- **${suggestion.title}** [${suggestion.priority}]: ${suggestion.description}\n`;
              }
              md += '\n';
            }
            
            md += '---\n\n';
          }
          
          return md;
          
        default:
          return '';
      }
    }
  }
});