import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface ContextUsage {
  current: number;
  maximum: number;
  percentage: number;
  breakdown: {
    chat: number;
    code: number;
    knowledge: number;
    system: number;
  };
}

export interface ContextDecisionMetrics {
  totalDecisions: number;
  injectedCount: number;
  rejectedCount: number;
  averageRelevanceScore: number;
  averageTokenBudget: number;
  effectivenessScore: number;
}

export interface ContextInjection {
  id: string;
  timestamp: string;
  message: string;
  decision: {
    shouldInject: boolean;
    contextTypes: string[];
    confidenceScore: number;
    tokenBudget: number;
    reasoning: string;
  };
  userFeedback?: 'helpful' | 'unhelpful' | null;
  effectiveness?: number;
}

export interface ContextCheckpoint {
  id: string;
  name: string;
  timestamp: string;
  tokens: number;
  messages: any[];
  description?: string;
}

export interface TokenMetadata {
  count: number;
  type: 'chat' | 'code' | 'knowledge' | 'system';
  timestamp: string;
}

export const useContextStore = defineStore('context', () => {
  // State
  const currentTokens = ref(0);
  const maxTokens = ref(200000); // Claude's approximate context window
  const tokenHistory = ref<TokenMetadata[]>([]);
  const checkpoints = ref<ContextCheckpoint[]>([]);
  const isOptimizing = ref(false);
  const lastOptimization = ref<string | null>(null);
  
  // Context decision tracking
  const contextInjections = ref<ContextInjection[]>([]);
  const contextDecisionMetrics = ref<ContextDecisionMetrics>({
    totalDecisions: 0,
    injectedCount: 0,
    rejectedCount: 0,
    averageRelevanceScore: 0,
    averageTokenBudget: 0,
    effectivenessScore: 0
  });
  
  // Token breakdown
  const tokenBreakdown = ref({
    chat: 0,
    code: 0,
    knowledge: 0,
    system: 0
  });

  // Optimization settings
  const optimizationSettings = ref({
    autoOptimize: true,
    warningThreshold: 70,
    criticalThreshold: 85,
    dangerThreshold: 95,
    pruneOldMessages: true,
    summarizeVerbose: true,
    preserveCodeContext: true
  });

  // Computed
  const contextUsage = computed<ContextUsage>(() => ({
    current: currentTokens.value,
    maximum: maxTokens.value,
    percentage: Math.round((currentTokens.value / maxTokens.value) * 100),
    breakdown: tokenBreakdown.value
  }));

  const contextStatus = computed(() => {
    const percentage = contextUsage.value.percentage;
    if (percentage >= optimizationSettings.value.dangerThreshold) return 'danger';
    if (percentage >= optimizationSettings.value.criticalThreshold) return 'critical';
    if (percentage >= optimizationSettings.value.warningThreshold) return 'warning';
    return 'normal';
  });

  const shouldOptimize = computed(() => {
    return optimizationSettings.value.autoOptimize && 
           contextUsage.value.percentage >= optimizationSettings.value.warningThreshold;
  });
  
  const recentContextInjections = computed(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return contextInjections.value.filter(injection => 
      new Date(injection.timestamp) >= oneHourAgo
    );
  });
  
  const contextEffectiveness = computed(() => {
    const recent = recentContextInjections.value;
    const withFeedback = recent.filter(inj => inj.userFeedback !== null);
    
    if (withFeedback.length === 0) return 0;
    
    const helpful = withFeedback.filter(inj => inj.userFeedback === 'helpful').length;
    return (helpful / withFeedback.length) * 100;
  });

  const availableOptimizations = computed(() => {
    const optimizations = [];
    
    if (tokenBreakdown.value.chat > 50000) {
      optimizations.push({
        type: 'prune-chat',
        description: 'Remove old chat messages',
        estimatedSaving: Math.round(tokenBreakdown.value.chat * 0.3)
      });
    }
    
    if (tokenBreakdown.value.code > 30000) {
      optimizations.push({
        type: 'summarize-code',
        description: 'Summarize code context',
        estimatedSaving: Math.round(tokenBreakdown.value.code * 0.4)
      });
    }
    
    if (tokenBreakdown.value.knowledge > 20000) {
      optimizations.push({
        type: 'reduce-knowledge',
        description: 'Reduce knowledge base context',
        estimatedSaving: Math.round(tokenBreakdown.value.knowledge * 0.5)
      });
    }
    
    return optimizations;
  });

  // Methods
  const addTokens = (count: number, type: 'chat' | 'code' | 'knowledge' | 'system' = 'chat') => {
    currentTokens.value += count;
    tokenBreakdown.value[type] += count;
    
    tokenHistory.value.push({
      count,
      type,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 200 history entries to prevent memory leaks
    if (tokenHistory.value.length > 200) {
      tokenHistory.value = tokenHistory.value.slice(-200);
    }
  };

  const removeTokens = (count: number, type: 'chat' | 'code' | 'knowledge' | 'system' = 'chat') => {
    currentTokens.value = Math.max(0, currentTokens.value - count);
    tokenBreakdown.value[type] = Math.max(0, tokenBreakdown.value[type] - count);
  };

  const resetContext = () => {
    currentTokens.value = 0;
    tokenBreakdown.value = {
      chat: 0,
      code: 0,
      knowledge: 0,
      system: 0
    };
    tokenHistory.value = [];
  };

  const createCheckpoint = (name: string, messages: any[], description?: string): string => {
    const checkpoint: ContextCheckpoint = {
      id: `checkpoint-${Date.now()}`,
      name,
      timestamp: new Date().toISOString(),
      tokens: currentTokens.value,
      messages: JSON.parse(JSON.stringify(messages)), // Deep copy
      description
    };
    
    checkpoints.value.push(checkpoint);
    
    // Keep only last 5 checkpoints to prevent memory leaks
    if (checkpoints.value.length > 5) {
      checkpoints.value = checkpoints.value.slice(-5);
    }
    
    return checkpoint.id;
  };

  const restoreCheckpoint = (checkpointId: string) => {
    const checkpoint = checkpoints.value.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    
    // Reset to checkpoint state
    currentTokens.value = checkpoint.tokens;
    
    // Recalculate breakdown (simplified)
    const messageRatio = checkpoint.tokens / (checkpoint.messages.length || 1);
    tokenBreakdown.value = {
      chat: Math.round(checkpoint.tokens * 0.6),
      code: Math.round(checkpoint.tokens * 0.2),
      knowledge: Math.round(checkpoint.tokens * 0.1),
      system: Math.round(checkpoint.tokens * 0.1)
    };
    
    return checkpoint;
  };

  const deleteCheckpoint = (checkpointId: string) => {
    const index = checkpoints.value.findIndex(cp => cp.id === checkpointId);
    if (index !== -1) {
      checkpoints.value.splice(index, 1);
    }
  };

  const optimizeContext = async (type?: string) => {
    isOptimizing.value = true;
    
    try {
      let savedTokens = 0;
      
      if (!type || type === 'prune-chat') {
        // Simulate pruning old messages
        const reduction = Math.round(tokenBreakdown.value.chat * 0.3);
        removeTokens(reduction, 'chat');
        savedTokens += reduction;
      }
      
      if (!type || type === 'summarize-code') {
        // Simulate code summarization
        const reduction = Math.round(tokenBreakdown.value.code * 0.4);
        removeTokens(reduction, 'code');
        savedTokens += reduction;
      }
      
      if (!type || type === 'reduce-knowledge') {
        // Simulate knowledge reduction
        const reduction = Math.round(tokenBreakdown.value.knowledge * 0.5);
        removeTokens(reduction, 'knowledge');
        savedTokens += reduction;
      }
      
      lastOptimization.value = new Date().toISOString();
      
      return {
        success: true,
        savedTokens,
        newPercentage: contextUsage.value.percentage
      };
    } finally {
      isOptimizing.value = false;
    }
  };

  const getTokenHistory = (minutes: number = 60) => {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return tokenHistory.value.filter(entry => 
      new Date(entry.timestamp) >= cutoff
    );
  };

  const getUsageTrend = () => {
    const recentHistory = getTokenHistory(30);
    if (recentHistory.length < 2) return 'stable';
    
    const oldTotal = recentHistory.slice(0, Math.floor(recentHistory.length / 2))
      .reduce((sum, entry) => sum + entry.count, 0);
    const newTotal = recentHistory.slice(Math.floor(recentHistory.length / 2))
      .reduce((sum, entry) => sum + entry.count, 0);
    
    const change = ((newTotal - oldTotal) / (oldTotal || 1)) * 100;
    
    if (change > 20) return 'increasing';
    if (change < -20) return 'decreasing';
    return 'stable';
  };

  const updateSettings = (settings: Partial<typeof optimizationSettings.value>) => {
    optimizationSettings.value = {
      ...optimizationSettings.value,
      ...settings
    };
  };
  
  // Context decision tracking methods
  const recordContextDecision = (decision: ContextInjection['decision'], message: string) => {
    const injection: ContextInjection = {
      id: `injection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message,
      decision,
      userFeedback: null
    };
    
    contextInjections.value.push(injection);
    
    // Update metrics
    contextDecisionMetrics.value.totalDecisions++;
    if (decision.shouldInject) {
      contextDecisionMetrics.value.injectedCount++;
    } else {
      contextDecisionMetrics.value.rejectedCount++;
    }
    
    // Recalculate averages
    const recent = recentContextInjections.value;
    const injected = recent.filter(inj => inj.decision.shouldInject);
    
    if (injected.length > 0) {
      contextDecisionMetrics.value.averageRelevanceScore = 
        injected.reduce((sum, inj) => sum + inj.decision.confidenceScore, 0) / injected.length;
      contextDecisionMetrics.value.averageTokenBudget = 
        injected.reduce((sum, inj) => sum + inj.decision.tokenBudget, 0) / injected.length;
    }
    
    // Keep only last 50 injections to prevent memory leaks
    if (contextInjections.value.length > 50) {
      contextInjections.value = contextInjections.value.slice(-50);
    }
    
    return injection.id;
  };
  
  const recordUserFeedback = (injectionId: string, feedback: 'helpful' | 'unhelpful') => {
    const injection = contextInjections.value.find(inj => inj.id === injectionId);
    if (injection) {
      injection.userFeedback = feedback;
      
      // Update effectiveness score
      const withFeedback = contextInjections.value.filter(inj => inj.userFeedback !== null);
      const helpful = withFeedback.filter(inj => inj.userFeedback === 'helpful').length;
      contextDecisionMetrics.value.effectivenessScore = 
        withFeedback.length > 0 ? (helpful / withFeedback.length) * 100 : 0;
    }
  };
  
  const getContextAnalytics = () => {
    const recent = recentContextInjections.value;
    const injected = recent.filter(inj => inj.decision.shouldInject);
    
    return {
      totalDecisions: recent.length,
      injectionRate: recent.length > 0 ? (injected.length / recent.length) * 100 : 0,
      averageConfidence: injected.length > 0 ? 
        injected.reduce((sum, inj) => sum + inj.decision.confidenceScore, 0) / injected.length : 0,
      averageTokens: injected.length > 0 ? 
        injected.reduce((sum, inj) => sum + inj.decision.tokenBudget, 0) / injected.length : 0,
      effectiveness: contextEffectiveness.value,
      contextTypeBreakdown: injected.reduce((acc, inj) => {
        inj.decision.contextTypes.forEach(type => {
          acc[type] = (acc[type] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>)
    };
  };
  
  const clearContextHistory = () => {
    contextInjections.value = [];
    contextDecisionMetrics.value = {
      totalDecisions: 0,
      injectedCount: 0,
      rejectedCount: 0,
      averageRelevanceScore: 0,
      averageTokenBudget: 0,
      effectivenessScore: 0
    };
  };

  return {
    // State
    currentTokens,
    maxTokens,
    tokenHistory,
    checkpoints,
    isOptimizing,
    lastOptimization,
    tokenBreakdown,
    optimizationSettings,
    contextInjections,
    contextDecisionMetrics,
    
    // Computed
    contextUsage,
    contextStatus,
    shouldOptimize,
    availableOptimizations,
    recentContextInjections,
    contextEffectiveness,
    
    // Methods
    addTokens,
    removeTokens,
    resetContext,
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
    optimizeContext,
    getTokenHistory,
    getUsageTrend,
    updateSettings,
    
    // Context decision methods
    recordContextDecision,
    recordUserFeedback,
    getContextAnalytics,
    clearContextHistory
  };
});