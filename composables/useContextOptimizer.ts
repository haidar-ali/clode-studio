import { ref, computed } from 'vue';
import { useContextStore } from '~/stores/context';
import { useTokenCounter } from '~/composables/useTokenCounter';

export interface OptimizationStrategy {
  id: string;
  name: string;
  description: string;
  estimatedSaving: number;
  priority: number;
  execute: () => Promise<number>;
}

export interface ContextSegment {
  id: string;
  type: 'chat' | 'code' | 'knowledge' | 'system';
  content: string;
  tokens: number;
  timestamp: string;
  importance: number; // 0-100
  metadata?: any;
}

export function useContextOptimizer() {
  const contextStore = useContextStore();
  const tokenCounter = useTokenCounter();
  
  const segments = ref<ContextSegment[]>([]);
  const isAnalyzing = ref(false);
  const lastAnalysis = ref<string | null>(null);
  
  /**
   * Analyze current context and identify segments
   */
  const analyzeContext = async (messages: any[], files?: any[], knowledge?: any[]) => {
    isAnalyzing.value = true;
    segments.value = [];
    
    try {
      // Analyze chat messages
      if (messages && messages.length > 0) {
        messages.forEach((message, index) => {
          const tokens = tokenCounter.countMessageTokens(message.content);
          const age = Date.now() - new Date(message.timestamp).getTime();
          const ageHours = age / (1000 * 60 * 60);
          
          segments.value.push({
            id: `chat-${message.id || index}`,
            type: 'chat',
            content: message.content,
            tokens,
            timestamp: message.timestamp,
            importance: calculateMessageImportance(message, index, messages.length, ageHours),
            metadata: {
              role: message.role,
              hasCode: message.content.includes('```'),
              hasError: message.content.toLowerCase().includes('error'),
              isQuestion: message.content.includes('?'),
              isAnswer: message.role === 'assistant'
            }
          });
        });
      }
      
      // Analyze code files
      if (files && files.length > 0) {
        files.forEach((file, index) => {
          const tokens = tokenCounter.countFileTokens(file.content, file.path);
          
          segments.value.push({
            id: `code-${file.path}`,
            type: 'code',
            content: file.content,
            tokens,
            timestamp: file.lastModified || new Date().toISOString(),
            importance: calculateFileImportance(file),
            metadata: {
              path: file.path,
              language: file.language,
              isActive: file.isActive,
              hasChanges: file.hasChanges
            }
          });
        });
      }
      
      // Analyze knowledge context
      if (knowledge && knowledge.length > 0) {
        knowledge.forEach((item, index) => {
          const tokens = tokenCounter.countMessageTokens(item.content);
          
          segments.value.push({
            id: `knowledge-${index}`,
            type: 'knowledge',
            content: item.content,
            tokens,
            timestamp: item.timestamp || new Date().toISOString(),
            importance: calculateKnowledgeImportance(item),
            metadata: {
              source: item.source,
              relevance: item.relevance || 0.5
            }
          });
        });
      }
      
      lastAnalysis.value = new Date().toISOString();
      return segments.value;
    } finally {
      isAnalyzing.value = false;
    }
  };
  
  /**
   * Calculate importance score for a message
   */
  const calculateMessageImportance = (
    message: any, 
    index: number, 
    totalMessages: number,
    ageHours: number
  ): number => {
    let importance = 50; // Base importance
    
    // Recent messages are more important
    if (index >= totalMessages - 5) importance += 20;
    if (index >= totalMessages - 3) importance += 10;
    
    // Very old messages are less important
    if (ageHours > 24) importance -= 20;
    if (ageHours > 72) importance -= 20;
    
    // Error messages are important
    if (message.content.toLowerCase().includes('error')) importance += 15;
    
    // Code blocks are moderately important
    if (message.content.includes('```')) importance += 10;
    
    // Questions from user are important
    if (message.role === 'user' && message.content.includes('?')) importance += 10;
    
    // System messages are very important
    if (message.role === 'system') importance += 30;
    
    return Math.max(0, Math.min(100, importance));
  };
  
  /**
   * Calculate importance score for a file
   */
  const calculateFileImportance = (file: any): number => {
    let importance = 40; // Base importance for files
    
    // Active file is very important
    if (file.isActive) importance += 30;
    
    // Files with unsaved changes are important
    if (file.hasChanges) importance += 20;
    
    // Recently modified files are more important
    const age = Date.now() - new Date(file.lastModified).getTime();
    const ageMinutes = age / (1000 * 60);
    if (ageMinutes < 10) importance += 20;
    if (ageMinutes < 30) importance += 10;
    
    // Entry points and config files are important
    const importantFiles = ['main', 'index', 'app', 'config', 'package.json', 'tsconfig'];
    if (importantFiles.some(name => file.path.toLowerCase().includes(name))) {
      importance += 15;
    }
    
    return Math.max(0, Math.min(100, importance));
  };
  
  /**
   * Calculate importance score for knowledge
   */
  const calculateKnowledgeImportance = (item: any): number => {
    let importance = 30; // Base importance for knowledge
    
    // High relevance items are more important
    if (item.relevance > 0.8) importance += 30;
    else if (item.relevance > 0.6) importance += 20;
    else if (item.relevance > 0.4) importance += 10;
    
    // Recent queries are more important
    const age = Date.now() - new Date(item.timestamp).getTime();
    const ageMinutes = age / (1000 * 60);
    if (ageMinutes < 5) importance += 20;
    if (ageMinutes < 15) importance += 10;
    
    return Math.max(0, Math.min(100, importance));
  };
  
  /**
   * Get optimization strategies based on current context
   */
  const getOptimizationStrategies = (): OptimizationStrategy[] => {
    const strategies: OptimizationStrategy[] = [];
    
    // Strategy 1: Remove old, low-importance messages
    const oldMessages = segments.value.filter(s => 
      s.type === 'chat' && s.importance < 40
    );
    if (oldMessages.length > 0) {
      const tokensToSave = oldMessages.reduce((sum, s) => sum + s.tokens, 0);
      strategies.push({
        id: 'remove-old-messages',
        name: 'Remove Old Messages',
        description: `Remove ${oldMessages.length} old messages with low importance`,
        estimatedSaving: tokensToSave,
        priority: 1,
        execute: async () => {
          const saved = removeSegments(oldMessages.map(s => s.id));
          contextStore.removeTokens(saved, 'chat');
          return saved;
        }
      });
    }
    
    // Strategy 2: Summarize verbose content
    const verboseSegments = segments.value.filter(s => 
      s.tokens > 1000 && s.importance < 70
    );
    if (verboseSegments.length > 0) {
      const potentialSaving = verboseSegments.reduce((sum, s) => sum + s.tokens * 0.6, 0);
      strategies.push({
        id: 'summarize-verbose',
        name: 'Summarize Verbose Content',
        description: `Summarize ${verboseSegments.length} verbose segments`,
        estimatedSaving: Math.round(potentialSaving),
        priority: 2,
        execute: async () => {
          const saved = await summarizeSegments(verboseSegments);
          contextStore.removeTokens(saved, 'chat');
          return saved;
        }
      });
    }
    
    // Strategy 3: Remove duplicate code context
    const codeSegments = segments.value.filter(s => s.type === 'code');
    const duplicates = findDuplicateCode(codeSegments);
    if (duplicates.length > 0) {
      const tokensToSave = duplicates.reduce((sum, s) => sum + s.tokens, 0);
      strategies.push({
        id: 'remove-duplicate-code',
        name: 'Remove Duplicate Code',
        description: `Remove ${duplicates.length} duplicate code segments`,
        estimatedSaving: tokensToSave,
        priority: 3,
        execute: async () => {
          const saved = removeSegments(duplicates.map(s => s.id));
          contextStore.removeTokens(saved, 'code');
          return saved;
        }
      });
    }
    
    // Strategy 4: Reduce knowledge context
    const knowledgeSegments = segments.value.filter(s => 
      s.type === 'knowledge' && s.importance < 50
    );
    if (knowledgeSegments.length > 0) {
      const tokensToSave = knowledgeSegments.reduce((sum, s) => sum + s.tokens, 0);
      strategies.push({
        id: 'reduce-knowledge',
        name: 'Reduce Knowledge Context',
        description: `Remove ${knowledgeSegments.length} low-relevance knowledge items`,
        estimatedSaving: tokensToSave,
        priority: 4,
        execute: async () => {
          const saved = removeSegments(knowledgeSegments.map(s => s.id));
          contextStore.removeTokens(saved, 'knowledge');
          return saved;
        }
      });
    }
    
    // Sort by priority and potential savings
    return strategies.sort((a, b) => {
      const scoreA = a.estimatedSaving / a.priority;
      const scoreB = b.estimatedSaving / b.priority;
      return scoreB - scoreA;
    });
  };
  
  /**
   * Remove segments from context
   */
  const removeSegments = (segmentIds: string[]): number => {
    let totalTokens = 0;
    
    segmentIds.forEach(id => {
      const index = segments.value.findIndex(s => s.id === id);
      if (index !== -1) {
        totalTokens += segments.value[index].tokens;
        segments.value.splice(index, 1);
      }
    });
    
    return totalTokens;
  };
  
  /**
   * Summarize segments (simulated)
   */
  const summarizeSegments = async (segmentsToSummarize: ContextSegment[]): Promise<number> => {
    let savedTokens = 0;
    
    for (const segment of segmentsToSummarize) {
      const originalTokens = segment.tokens;
      // Simulate summarization - reduce content by 60%
      const summaryLength = Math.round(segment.content.length * 0.4);
      segment.content = segment.content.substring(0, summaryLength) + '... [summarized]';
      segment.tokens = tokenCounter.countMessageTokens(segment.content);
      savedTokens += originalTokens - segment.tokens;
    }
    
    return savedTokens;
  };
  
  /**
   * Find duplicate code segments
   */
  const findDuplicateCode = (codeSegments: ContextSegment[]): ContextSegment[] => {
    const duplicates: ContextSegment[] = [];
    const seen = new Set<string>();
    
    codeSegments.forEach(segment => {
      // Simple duplicate detection based on content hash
      const contentHash = simpleHash(segment.content);
      if (seen.has(contentHash)) {
        duplicates.push(segment);
      } else {
        seen.add(contentHash);
      }
    });
    
    return duplicates;
  };
  
  /**
   * Simple hash function for duplicate detection
   */
  const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  };
  
  /**
   * Get context pruning recommendations
   */
  const getRecommendations = () => {
    const recommendations = [];
    const usage = contextStore.contextUsage;
    
    if (usage.percentage > 90) {
      recommendations.push({
        level: 'critical',
        message: 'Context is critically full. Immediate optimization required.',
        action: 'Optimize Now'
      });
    } else if (usage.percentage > 70) {
      recommendations.push({
        level: 'warning',
        message: 'Context usage is high. Consider optimization.',
        action: 'Review Strategies'
      });
    }
    
    // Check token distribution
    if (usage.breakdown.chat > usage.breakdown.code * 2) {
      recommendations.push({
        level: 'info',
        message: 'Chat history is using significant context.',
        action: 'Prune Old Messages'
      });
    }
    
    if (usage.breakdown.knowledge > 20000) {
      recommendations.push({
        level: 'info',
        message: 'Knowledge context is large. Consider reducing scope.',
        action: 'Refine Knowledge'
      });
    }
    
    return recommendations;
  };
  
  /**
   * Create a smart context checkpoint
   */
  const createSmartCheckpoint = (name: string, messages: any[]) => {
    // Include only important segments in checkpoint
    const importantMessages = messages.filter((msg, index) => {
      const segment = segments.value.find(s => 
        s.type === 'chat' && s.metadata?.role === msg.role
      );
      return !segment || segment.importance >= 50;
    });
    
    const description = `Smart checkpoint with ${importantMessages.length}/${messages.length} messages`;
    return contextStore.createCheckpoint(name, importantMessages, description);
  };
  
  return {
    // State
    segments,
    isAnalyzing,
    lastAnalysis,
    
    // Methods
    analyzeContext,
    getOptimizationStrategies,
    removeSegments,
    summarizeSegments,
    getRecommendations,
    createSmartCheckpoint,
    
    // Computed
    totalSegments: computed(() => segments.value.length),
    totalTokensInSegments: computed(() => 
      segments.value.reduce((sum, s) => sum + s.tokens, 0)
    ),
    averageImportance: computed(() => {
      if (segments.value.length === 0) return 0;
      const sum = segments.value.reduce((total, s) => total + s.importance, 0);
      return Math.round(sum / segments.value.length);
    })
  };
}