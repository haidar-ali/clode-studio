import { ref, computed, watch } from 'vue';
import { useProjectContextStore, type FileInfo, type ProjectInfo } from '~/stores/project-context';
import { useContextStore } from '~/stores/context';

export function useContextManager() {
  const contextStore = useProjectContextStore();
  const tokenStore = useContextStore();
  
  // Local state for UI
  const isSearching = ref(false);
  const searchQuery = ref('');
  const searchResults = ref<FileInfo[]>([]);
  
  // Computed properties
  const isReady = computed(() => contextStore.isInitialized);
  const isScanning = computed(() => contextStore.isScanning);
  const statistics = computed(() => contextStore.statistics);
  const hasResults = computed(() => contextStore.hasResults);
  const recentFiles = computed(() => contextStore.recentFiles);
  
  // Methods
  const initialize = async (workspacePath: string): Promise<boolean> => {
    try {
      await contextStore.initialize(workspacePath);
      return true;
    } catch (error) {
      console.error('Failed to initialize context manager:', error);
      return false;
    }
  };
  
  const searchFiles = async (query: string, limit: number = 20): Promise<FileInfo[]> => {
    if (!query.trim()) {
      searchResults.value = [];
      return [];
    }
    
    try {
      isSearching.value = true;
      const results = await contextStore.searchFiles(query, limit);
      searchResults.value = results;
      return results;
    } catch (error) {
      console.error('Failed to search files:', error);
      searchResults.value = [];
      return [];
    } finally {
      isSearching.value = false;
    }
  };
  
  const buildContextForClaude = async (query: string, maxTokens: number = 2000): Promise<string> => {
    if (!isReady.value) return '';
    
    try {
      // Use optimized context building - clone the array to avoid serialization issues
      const workingFiles = [...contextStore.workingFiles];
      const result = await window.electronAPI.context.buildOptimized(
        query, 
        workingFiles, 
        maxTokens
      );
      
      if (result.success) {
        // Check if we should inject context based on token budget
        const tokenEstimate = result.tokens || 0;
        const decision = await window.electronAPI.context.shouldInject(
          query,
          tokenStore.currentTokens,
          tokenEstimate
        );
        
        if (decision.success && decision.decision) {
          // Record the decision for analytics
          tokenStore.recordContextDecision({
            shouldInject: decision.decision.shouldInject,
            contextTypes: ['project', 'files'],
            confidenceScore: decision.decision.confidence,
            tokenBudget: tokenEstimate,
            reasoning: decision.decision.reasoning
          }, query);
          
          if (decision.decision.shouldInject) {
            return result.context || '';
          }
        }
        
        return ''; // Don't inject if not recommended
      }
      
      // Fallback to simple context building
      return await contextStore.buildContext(query, maxTokens);
    } catch (error) {
      console.error('Failed to build optimized context:', error);
      // Fallback to simple context
      return await contextStore.buildContext(query, maxTokens);
    }
  };
  
  const getFileContent = async (filePath: string): Promise<string | null> => {
    try {
      return await contextStore.getFileContent(filePath);
    } catch (error) {
      console.error('Failed to get file content:', error);
      return null;
    }
  };
  
  const refreshWorkspace = async (): Promise<void> => {
    try {
      await contextStore.rescanWorkspace();
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
    }
  };
  
  const addWorkingFile = (filePath: string): void => {
    contextStore.addWorkingFile(filePath);
  };
  
  const removeWorkingFile = (filePath: string): void => {
    contextStore.removeWorkingFile(filePath);
  };
  
  const clearWorkingFiles = (): void => {
    contextStore.clearWorkingFiles();
  };
  
  const cleanup = (): void => {
    contextStore.cleanup();
    searchResults.value = [];
    searchQuery.value = '';
    isSearching.value = false;
  };
  
  // Auto-search when query changes (debounced)
  let searchTimeout: NodeJS.Timeout | null = null;
  watch(searchQuery, (newQuery) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
      if (newQuery.trim()) {
        searchFiles(newQuery);
      } else {
        searchResults.value = [];
      }
    }, 300);
  });
  
  return {
    // State
    isReady,
    isScanning,
    isSearching,
    searchQuery,
    searchResults,
    statistics,
    hasResults,
    recentFiles,
    
    // Methods
    initialize,
    searchFiles,
    buildContextForClaude,
    getFileContent,
    refreshWorkspace,
    addWorkingFile,
    removeWorkingFile,
    clearWorkingFiles,
    cleanup
  };
}