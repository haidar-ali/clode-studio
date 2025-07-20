import { ref, computed } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type { 
  CodeAnalysisRequest, 
  CodeAnalysisResult,
  CodePattern,
  Suggestion
} from '~/electron/claude-analyzer';

export function useClaudeAnalysis() {
  const analysisResults = ref<Map<string, CodeAnalysisResult>>(new Map());
  const pendingAnalyses = ref<Set<string>>(new Set());
  const analysisHistory = ref<CodeAnalysisResult[]>([]);
  const isAnalyzing = ref(false);
  const currentAnalysisId = ref<string | null>(null);

  // Computed properties
  const hasResults = computed(() => analysisResults.value.size > 0);
  
  const latestResult = computed(() => {
    if (analysisHistory.value.length === 0) return null;
    return analysisHistory.value[analysisHistory.value.length - 1];
  });

  const patternsSummary = computed(() => {
    const patterns = new Map<string, { count: number; examples: Set<string> }>();
    
    for (const result of analysisResults.value.values()) {
      if (result.analysis.patterns) {
        for (const pattern of result.analysis.patterns) {
          const existing = patterns.get(pattern.name) || { count: 0, examples: new Set() };
          existing.count += pattern.occurrences;
          pattern.examples.forEach(ex => existing.examples.add(ex));
          patterns.set(pattern.name, existing);
        }
      }
    }
    
    return Array.from(patterns.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        examples: Array.from(data.examples).slice(0, 3)
      }))
      .sort((a, b) => b.count - a.count);
  });

  const suggestionsSummary = computed(() => {
    const suggestions = new Map<string, Suggestion & { frequency: number }>();
    
    for (const result of analysisResults.value.values()) {
      if (result.analysis.suggestions) {
        for (const suggestion of result.analysis.suggestions) {
          const key = `${suggestion.category}:${suggestion.title}`;
          const existing = suggestions.get(key);
          if (existing) {
            existing.frequency++;
          } else {
            suggestions.set(key, { ...suggestion, frequency: 1 });
          }
        }
      }
    }
    
    return Array.from(suggestions.values())
      .sort((a, b) => {
        // Sort by priority first, then frequency
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.frequency - a.frequency;
      });
  });

  const overallComplexity = computed(() => {
    const results = Array.from(analysisResults.value.values())
      .filter(r => r.analysis.complexity);
    
    if (results.length === 0) return null;
    
    const total = results.reduce((acc, result) => {
      const c = result.analysis.complexity!;
      return {
        cyclomaticComplexity: acc.cyclomaticComplexity + c.cyclomaticComplexity,
        cognitiveComplexity: acc.cognitiveComplexity + c.cognitiveComplexity,
        linesOfCode: acc.linesOfCode + c.linesOfCode,
        maintainabilityIndex: acc.maintainabilityIndex + c.maintainabilityIndex,
        technicalDebt: acc.technicalDebt + c.technicalDebt
      };
    }, {
      cyclomaticComplexity: 0,
      cognitiveComplexity: 0,
      linesOfCode: 0,
      maintainabilityIndex: 0,
      technicalDebt: 0
    });
    
    return {
      cyclomaticComplexity: Math.round(total.cyclomaticComplexity / results.length),
      cognitiveComplexity: Math.round(total.cognitiveComplexity / results.length),
      linesOfCode: total.linesOfCode,
      maintainabilityIndex: Math.round(total.maintainabilityIndex / results.length),
      technicalDebt: total.technicalDebt
    };
  });

  // Methods
  async function analyzeFile(filePath: string, options?: any) {
    const request: CodeAnalysisRequest = {
      id: uuidv4(),
      type: 'file',
      target: filePath,
      options
    };
    
    return performAnalysis(request);
  }

  async function analyzeDirectory(dirPath: string, options?: any) {
    const request: CodeAnalysisRequest = {
      id: uuidv4(),
      type: 'directory',
      target: dirPath,
      options
    };
    
    return performAnalysis(request);
  }

  async function analyzePattern(pattern: string, options?: any) {
    const request: CodeAnalysisRequest = {
      id: uuidv4(),
      type: 'pattern',
      target: pattern,
      options
    };
    
    return performAnalysis(request);
  }

  async function analyzeArchitecture(options?: any) {
    const request: CodeAnalysisRequest = {
      id: uuidv4(),
      type: 'architecture',
      target: window.electronAPI.store.get('currentWorkspace') || '.',
      options
    };
    
    return performAnalysis(request);
  }

  async function performAnalysis(request: CodeAnalysisRequest): Promise<CodeAnalysisResult> {
    pendingAnalyses.value.add(request.id);
    isAnalyzing.value = true;
    currentAnalysisId.value = request.id;
    
    try {
      // In a real implementation, this would call the IPC API
      // For now, we'll simulate it
      const result = await simulateAnalysis(request);
      
      // Store result
      analysisResults.value.set(result.id, result);
      analysisHistory.value.push(result);
      
      // Keep history limited
      if (analysisHistory.value.length > 100) {
        analysisHistory.value = analysisHistory.value.slice(-100);
      }
      
      return result;
    } finally {
      pendingAnalyses.value.delete(request.id);
      if (pendingAnalyses.value.size === 0) {
        isAnalyzing.value = false;
      }
      if (currentAnalysisId.value === request.id) {
        currentAnalysisId.value = null;
      }
    }
  }

  // Simulate analysis for development
  async function simulateAnalysis(request: CodeAnalysisRequest): Promise<CodeAnalysisResult> {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockPatterns: CodePattern[] = [
      {
        name: "Async/Await Pattern",
        description: "Modern asynchronous code using async/await",
        occurrences: 15,
        examples: ["async function fetchData() { ... }"],
        category: "design"
      },
      {
        name: "Error Handling",
        description: "Proper try-catch blocks for error handling",
        occurrences: 8,
        examples: ["try { ... } catch (error) { ... }"],
        category: "design"
      }
    ];
    
    const mockSuggestions: Suggestion[] = [
      {
        title: "Add TypeScript types",
        description: "Several functions lack proper TypeScript type annotations",
        category: "maintainability",
        priority: "medium",
        effort: "low"
      },
      {
        title: "Extract magic numbers",
        description: "Replace magic numbers with named constants",
        category: "refactoring",
        priority: "low",
        effort: "low"
      }
    ];
    
    return {
      id: request.id,
      type: request.type,
      target: request.target,
      timestamp: new Date(),
      analysis: {
        summary: `Analysis of ${request.target} completed successfully. The code shows good structure with some areas for improvement.`,
        patterns: mockPatterns,
        suggestions: mockSuggestions,
        complexity: {
          cyclomaticComplexity: 12,
          cognitiveComplexity: 18,
          linesOfCode: 450,
          maintainabilityIndex: 72,
          technicalDebt: 3.5
        }
      },
      metadata: {
        tokensUsed: 2500,
        analysisTime: 2000,
        confidence: 0.85
      }
    };
  }

  function getAnalysisResult(id: string): CodeAnalysisResult | undefined {
    return analysisResults.value.get(id);
  }

  function getResultsForTarget(target: string): CodeAnalysisResult[] {
    return Array.from(analysisResults.value.values())
      .filter(result => result.target === target)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  function clearResults() {
    analysisResults.value.clear();
    analysisHistory.value = [];
  }

  function removeResult(id: string) {
    analysisResults.value.delete(id);
    const index = analysisHistory.value.findIndex(r => r.id === id);
    if (index !== -1) {
      analysisHistory.value.splice(index, 1);
    }
  }

  return {
    // State
    analysisResults: computed(() => Array.from(analysisResults.value.values())),
    pendingAnalyses: computed(() => Array.from(pendingAnalyses.value)),
    analysisHistory: computed(() => analysisHistory.value),
    isAnalyzing,
    currentAnalysisId,
    hasResults,
    latestResult,
    patternsSummary,
    suggestionsSummary,
    overallComplexity,
    
    // Methods
    analyzeFile,
    analyzeDirectory,
    analyzePattern,
    analyzeArchitecture,
    getAnalysisResult,
    getResultsForTarget,
    clearResults,
    removeResult
  };
}