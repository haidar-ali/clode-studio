import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface ContextCheckpoint {
  id: string;
  name: string;
  timestamp: string;
  messages: any[];
  description?: string;
}

export interface ContextInjection {
  id: string;
  timestamp: string;
  message: string;
  decision: {
    shouldInject: boolean;
    contextTypes: string[];
    confidenceScore: number;
    reasoning: string;
  };
  userFeedback?: 'helpful' | 'unhelpful' | null;
  effectiveness?: number;
}

export const useContextStore = defineStore('context', () => {
  // State
  const checkpoints = ref<ContextCheckpoint[]>([]);
  const contextInjections = ref<ContextInjection[]>([]);
  const isOptimizing = ref(false);
  const lastOptimization = ref<string | null>(null);
  
  // Optimization settings
  const optimizationSettings = ref({
    autoOptimize: false,
    warningThreshold: 70,
    criticalThreshold: 85,
    strategies: {
      pruneOldMessages: true,
      consolidateContext: true,
      removeRedundantKnowledge: true
    }
  });

  // Checkpoints
  const createCheckpoint = async (name: string = '', description: string = '') => {
    const { useChatStore } = await import('./chat');
    const chatStore = useChatStore();
    
    const checkpoint: ContextCheckpoint = {
      id: `checkpoint-${Date.now()}`,
      name: name || `Checkpoint ${new Date().toLocaleString()}`,
      timestamp: new Date().toISOString(),
      messages: [...chatStore.messages],
      description
    };
    
    checkpoints.value.push(checkpoint);
    
    // Persist checkpoint
    const { useTasksStore } = await import('./tasks');
    const tasksStore = useTasksStore();
    if (tasksStore.projectPath) {
      await window.electronAPI.workspace.addCheckpoint(tasksStore.projectPath, checkpoint);
    }
    
    return checkpoint;
  };

  const restoreCheckpoint = async (checkpointId: string) => {
    const checkpoint = checkpoints.value.find(cp => cp.id === checkpointId);
    if (!checkpoint) return;
    
    const { useChatStore } = await import('./chat');
    const chatStore = useChatStore();
    
    // Restore messages
    chatStore.messages = [...checkpoint.messages];
    
    // Update last optimization time
    lastOptimization.value = new Date().toISOString();
  };

  const deleteCheckpoint = async (checkpointId: string) => {
    const index = checkpoints.value.findIndex(cp => cp.id === checkpointId);
    if (index !== -1) {
      checkpoints.value.splice(index, 1);
      
      // Remove from persistence
      const { useTasksStore } = await import('./tasks');
      const tasksStore = useTasksStore();
      if (tasksStore.projectPath) {
        await window.electronAPI.workspace.removeCheckpoint(tasksStore.projectPath, checkpointId);
      }
    }
  };

  // Context optimization (simplified without token counting)
  const optimizeContext = async (strategy: string = 'all') => {
    isOptimizing.value = true;
    
    try {
      const { useChatStore } = await import('./chat');
      const chatStore = useChatStore();
      
      if (strategy === 'all' || strategy === 'pruneOldMessages') {
        chatStore.pruneOldMessages(20);
      }
      
      lastOptimization.value = new Date().toISOString();
      
      // Update persistence
      const { useTasksStore } = await import('./tasks');
      const tasksStore = useTasksStore();
      if (tasksStore.projectPath) {
        await window.electronAPI.workspace.updateOptimizationTime(
          tasksStore.projectPath,
          lastOptimization.value
        );
      }
      
      return {
        success: true,
        newPercentage: 0 // No longer tracking tokens
      };
    } catch (error) {
      console.error('Failed to optimize context:', error);
      return { success: false, error };
    } finally {
      isOptimizing.value = false;
    }
  };

  // Context decision tracking
  const recordContextDecision = (injection: ContextInjection) => {
    contextInjections.value.push(injection);
    
    // Keep only recent injections
    if (contextInjections.value.length > 100) {
      contextInjections.value = contextInjections.value.slice(-100);
    }
  };

  const provideFeedback = (injectionId: string, feedback: 'helpful' | 'unhelpful') => {
    const injection = contextInjections.value.find(inj => inj.id === injectionId);
    if (injection) {
      injection.userFeedback = feedback;
      injection.effectiveness = feedback === 'helpful' ? 1 : 0;
    }
  };

  const getContextAnalytics = () => {
    const injected = contextInjections.value.filter(inj => inj.decision.shouldInject);
    const rejected = contextInjections.value.filter(inj => !inj.decision.shouldInject);
    
    const feedbackCount = injected.filter(inj => inj.userFeedback !== null).length;
    const helpfulCount = injected.filter(inj => inj.userFeedback === 'helpful').length;
    
    return {
      injectionRate: contextInjections.value.length > 0 
        ? (injected.length / contextInjections.value.length) * 100 
        : 0,
      averageConfidence: injected.length > 0 
        ? injected.reduce((sum, inj) => sum + inj.decision.confidenceScore, 0) / injected.length 
        : 0,
      effectiveness: feedbackCount > 0 
        ? (helpfulCount / feedbackCount) * 100 
        : 50,
      recentDecisions: contextInjections.value.slice(-10)
    };
  };

  // Load persisted checkpoints
  const loadPersistedCheckpoints = async () => {
    try {
      const { useTasksStore } = await import('~/stores/tasks');
      const tasksStore = useTasksStore();
      
      if (tasksStore.projectPath) {
        const persistedData = await window.electronAPI.workspace.loadContext(tasksStore.projectPath);
        if (persistedData.success && persistedData.data && persistedData.data.checkpoints) {
          checkpoints.value = persistedData.data.checkpoints || [];
          console.log('Loaded persisted checkpoints:', checkpoints.value.length);
        }
      }
    } catch (error) {
      console.error('Failed to load persisted checkpoints:', error);
    }
  };

  // Initialize
  loadPersistedCheckpoints();

  return {
    // State
    checkpoints,
    contextInjections,
    isOptimizing,
    lastOptimization,
    optimizationSettings,
    
    // Actions
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
    optimizeContext,
    recordContextDecision,
    provideFeedback,
    getContextAnalytics,
    loadPersistedCheckpoints,
  };
});