import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useChatStore } from '~/stores/chat';

export const useTasksFileWatcher = () => {
  const tasksStore = useTasksStore();
  const chatStore = useChatStore();
  
  const isWatching = ref(false);
  const watchedFiles = ref<string[]>([]);
  
  // Paths for new JSON storage
  const jsonPaths = computed(() => {
    if (!chatStore.workingDirectory) return null;
    return {
      epics: `${chatStore.workingDirectory}/.clode/project/epics.json`,
      stories: `${chatStore.workingDirectory}/.clode/project/stories.json`,
      tasks: `${chatStore.workingDirectory}/.clode/project/tasks.json`,
      tasksMarkdown: `${chatStore.workingDirectory}/TASKS.md`
    };
  });
  
  // Debounce timer
  let debounceTimer: NodeJS.Timeout | null = null;
  
  // Handle JSON file changes with debouncing
  const handleFileChange = async (data: { path: string; content: string }) => {
    if (!jsonPaths.value) return;
    
    // Only handle JSON file changes (not TASKS.md which is just a reference)
    const isJsonFile = Object.values(jsonPaths.value).some(p => 
      p !== jsonPaths.value.tasksMarkdown && data.path === p
    );
    
    if (!isJsonFile) return;
    
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set new timer to debounce rapid changes
    debounceTimer = setTimeout(async () => {
      console.log('[FileWatcher] JSON file changed:', data.path);
      
      try {
        // Skip reload if we just saved (within 1 second) to avoid overwriting in-memory changes
        if (tasksStore.lastSaveTime) {
          const timeSinceLastSave = Date.now() - tasksStore.lastSaveTime.getTime();
          if (timeSinceLastSave < 1000) {
            console.log('[FileWatcher] Skipping reload - just saved', timeSinceLastSave, 'ms ago');
            return;
          }
        }
        
        // Reload all data from JSON storage
        await tasksStore.loadTasksFromProject();
        
        // Update last synced time
        tasksStore.lastSyncedWithClaude = new Date();
        
      } catch (error) {
        console.error('Failed to reload from JSON storage:', error);
      }
    }, 500); // 500ms debounce
  };
  
  // Start watching JSON files
  const startWatching = async () => {
    if (!jsonPaths.value || isWatching.value) return;
    
    try {
      // Initialize storage and ensure directories exist
      await tasksStore.setProjectPath(chatStore.workingDirectory!);
      
      // Watch all JSON files
      const filesToWatch = [
        jsonPaths.value.epics,
        jsonPaths.value.stories,
        jsonPaths.value.tasks
      ];
      
      for (const filePath of filesToWatch) {
        try {
          await window.electronAPI.fs.watchFile(filePath);
          watchedFiles.value.push(filePath);
          console.log('[FileWatcher] Watching file:', filePath);
        } catch (error) {
          console.error(`Failed to watch ${filePath}:`, error);
        }
      }
      
      isWatching.value = watchedFiles.value.length > 0;
      
      // Initial load
      await tasksStore.loadTasksFromProject();
      
    } catch (error) {
      console.error('Failed to start watching JSON files:', error);
    }
  };
  
  // Stop watching
  const stopWatching = async () => {
    if (!isWatching.value) return;
    
    try {
      // Unwatch all files
      for (const filePath of watchedFiles.value) {
        try {
          await window.electronAPI.fs.unwatchFile(filePath);
          console.log('[FileWatcher] Stopped watching:', filePath);
        } catch (error) {
          console.error(`Failed to unwatch ${filePath}:`, error);
        }
      }
      
      watchedFiles.value = [];
      isWatching.value = false;
      
    } catch (error) {
      console.error('Failed to stop watching files:', error);
    }
  };
  
  onMounted(() => {
    // Listen for file changes
    window.electronAPI.fs.onFileChanged(handleFileChange);
    
    // Start watching if we have a working directory
    if (chatStore.workingDirectory) {
      startWatching();
    }
    
    // Watch for workspace changes
    const stopWatchingWorkspace = watch(
      () => chatStore.workingDirectory,
      async (newPath, oldPath) => {
        if (oldPath && oldPath !== newPath) {
          // Stop watching old file
          await stopWatching();
        }
        
        if (newPath) {
          // Set the tasks store project path
          tasksStore.setProjectPath(newPath);
          // Start watching new file
          await startWatching();
        }
      }
    );
    
    onUnmounted(() => {
      stopWatchingWorkspace();
    });
  });
  
  onUnmounted(() => {
    stopWatching();
    // Clean up debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });
  
  return {
    isWatching,
    startWatching,
    stopWatching
  };
};