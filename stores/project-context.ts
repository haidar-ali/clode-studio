import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  language: string;
  lastModified: Date;
  isDirectory: boolean;
  relevanceScore?: number;
}

export interface ProjectInfo {
  type: string;
  framework?: string;
  languages: string[];
  entryPoints: string[];
  configFiles: string[];
  totalFiles: number;
  languageDistribution: Record<string, number>;
}

export interface SearchResult {
  files: FileInfo[];
  query: string;
  timestamp: number;
}

export const useProjectContextStore = defineStore('projectContext', () => {
  // State
  const isInitialized = ref(false);
  const isScanning = ref(false);
  const scanProgress = ref(0);
  const currentWorkspace = ref<string | null>(null);
  const projectInfo = ref<ProjectInfo | null>(null);
  const lastSearchResults = ref<SearchResult | null>(null);
  const recentFiles = ref<FileInfo[]>([]);
  const workingFiles = ref<string[]>([]);
  const watchingEnabled = ref(false);

  // Computed
  const statistics = computed(() => {
    if (!projectInfo.value) {
      return {
        totalFiles: 0,
        languageDistribution: {},
        languages: []
      };
    }
    
    return {
      totalFiles: projectInfo.value.totalFiles,
      languageDistribution: projectInfo.value.languageDistribution,
      languages: projectInfo.value.languages
    };
  });

  const hasResults = computed(() => {
    return lastSearchResults.value !== null && lastSearchResults.value.files.length > 0;
  });

  // Actions
  const initialize = async (workspacePath: string) => {
    try {
      isScanning.value = true;
      currentWorkspace.value = workspacePath;
      
      const result = await window.electronAPI.context.initialize(workspacePath);
      
      if (result.success) {
        isInitialized.value = true;
        
        // Load persisted workspace data
        const persistedData = await window.electronAPI.workspace.loadContext(workspacePath);
        if (persistedData.success && persistedData.data) {
          // Restore working files
          if (persistedData.data.workingFiles && persistedData.data.workingFiles.length > 0) {
            workingFiles.value = persistedData.data.workingFiles;
            
          }
        }
        
        await refreshStatistics();
        await refreshRecentFiles();
        await startFileWatching();
      } else {
        throw new Error(result.error || 'Failed to initialize context');
      }
    } catch (error) {
      console.error('Failed to initialize context:', error);
      throw error;
    } finally {
      isScanning.value = false;
    }
  };

  const searchFiles = async (query: string, limit: number = 20) => {
    if (!isInitialized.value) {
      throw new Error('Context not initialized');
    }

    try {
      const result = await window.electronAPI.context.searchFiles(query, limit);
      
      if (result.success) {
        lastSearchResults.value = {
          files: result.results,
          query,
          timestamp: Date.now()
        };
        return result.results;
      } else {
        throw new Error(result.error || 'Failed to search files');
      }
    } catch (error) {
      console.error('Failed to search files:', error);
      throw error;
    }
  };

  const buildContext = async (query: string, maxTokens: number = 2000) => {
    if (!isInitialized.value) {
      throw new Error('Context not initialized');
    }

    try {
      // Clone the working files array to avoid serialization issues
      const files = [...workingFiles.value];
      const result = await window.electronAPI.context.buildContext(query, files, maxTokens);
      
      if (result.success) {
        return result.context;
      } else {
        throw new Error(result.error || 'Failed to build context');
      }
    } catch (error) {
      console.error('Failed to build context:', error);
      throw error;
    }
  };

  const getFileContent = async (filePath: string) => {
    try {
      const result = await window.electronAPI.context.getFileContent(filePath);
      
      if (result.success) {
        return result.content;
      } else {
        throw new Error(result.error || 'Failed to get file content');
      }
    } catch (error) {
      console.error('Failed to get file content:', error);
      throw error;
    }
  };

  const refreshStatistics = async () => {
    if (!isInitialized.value) return;

    try {
      const result = await window.electronAPI.context.getStatistics();
      
      if (result.success) {
        projectInfo.value = result.statistics;
      } else {
        console.warn('Failed to get statistics:', result.error);
      }
    } catch (error) {
      console.error('Failed to refresh statistics:', error);
    }
  };

  const refreshRecentFiles = async (hours: number = 24) => {
    if (!isInitialized.value) return;

    try {
      const result = await window.electronAPI.context.getRecentFiles(hours);
      
      if (result.success) {
        recentFiles.value = result.files;
      } else {
        console.warn('Failed to get recent files:', result.error);
      }
    } catch (error) {
      console.error('Failed to get recent files:', error);
    }
  };

  const rescanWorkspace = async () => {
    if (!isInitialized.value) return;

    try {
      isScanning.value = true;
      
      const result = await window.electronAPI.context.rescan();
      
      if (result.success) {
        await refreshStatistics();
        await refreshRecentFiles();
      } else {
        throw new Error(result.error || 'Failed to rescan workspace');
      }
    } catch (error) {
      console.error('Failed to rescan workspace:', error);
      throw error;
    } finally {
      isScanning.value = false;
    }
  };

  const addWorkingFile = async (filePath: string) => {
    if (!workingFiles.value.includes(filePath)) {
      workingFiles.value.push(filePath);
      
      // Persist working files
      if (currentWorkspace.value) {
        try {
          await window.electronAPI.workspace.updateWorkingFiles(
            currentWorkspace.value, 
            [...workingFiles.value] // Clone the array to avoid IPC serialization issues
          );
        } catch (error) {
          console.error('Failed to persist working files:', error);
        }
      }
    }
  };

  const removeWorkingFile = async (filePath: string) => {
    const index = workingFiles.value.indexOf(filePath);
    if (index > -1) {
      workingFiles.value.splice(index, 1);
      
      // Persist working files
      if (currentWorkspace.value) {
        try {
          await window.electronAPI.workspace.updateWorkingFiles(
            currentWorkspace.value, 
            [...workingFiles.value] // Clone the array to avoid IPC serialization issues
          );
        } catch (error) {
          console.error('Failed to persist working files:', error);
        }
      }
    }
  };

  const clearWorkingFiles = async () => {
    workingFiles.value = [];
    
    // Persist empty working files
    if (currentWorkspace.value) {
      try {
        await window.electronAPI.workspace.updateWorkingFiles(
          currentWorkspace.value, 
          [...workingFiles.value] // Clone the array to avoid IPC serialization issues
        );
      } catch (error) {
        console.error('Failed to persist working files:', error);
      }
    }
  };

  const clearSearchResults = () => {
    lastSearchResults.value = null;
  };

  const startFileWatching = async () => {
    if (!isInitialized.value) return;

    try {
      const result = await window.electronAPI.context.startWatching();
      if (result.success) {
        watchingEnabled.value = true;
        
        // Set up file change listener
        window.electronAPI.context.onFileChange((event, filePath) => {
          
          
          // Refresh statistics to update file counts
          refreshStatistics();
          
          // If it's a recent change, refresh recent files too
          if (event === 'add' || event === 'change') {
            refreshRecentFiles();
          }
        });
      }
    } catch (error) {
      console.error('Failed to start file watching:', error);
    }
  };

  const stopFileWatching = async () => {
    try {
      const result = await window.electronAPI.context.stopWatching();
      if (result.success) {
        watchingEnabled.value = false;
      }
    } catch (error) {
      console.error('Failed to stop file watching:', error);
    }
  };

  const cleanup = async () => {
    await stopFileWatching();
    isInitialized.value = false;
    isScanning.value = false;
    scanProgress.value = 0;
    currentWorkspace.value = null;
    projectInfo.value = null;
    lastSearchResults.value = null;
    recentFiles.value = [];
    workingFiles.value = [];
    watchingEnabled.value = false;
  };

  return {
    // State
    isInitialized,
    isScanning,
    scanProgress,
    currentWorkspace,
    projectInfo,
    lastSearchResults,
    recentFiles,
    workingFiles,
    watchingEnabled,

    // Computed
    statistics,
    hasResults,

    // Actions
    initialize,
    searchFiles,
    buildContext,
    getFileContent,
    refreshStatistics,
    refreshRecentFiles,
    rescanWorkspace,
    addWorkingFile,
    removeWorkingFile,
    clearWorkingFiles,
    clearSearchResults,
    startFileWatching,
    stopFileWatching,
    cleanup
  };
});