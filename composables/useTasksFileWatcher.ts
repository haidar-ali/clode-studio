import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useChatStore } from '~/stores/chat';

export const useTasksFileWatcher = () => {
  const tasksStore = useTasksStore();
  const chatStore = useChatStore();
  
  const isWatching = ref(false);
  const tasksFilePath = computed(() => {
    if (!chatStore.workingDirectory) return null;
    return `${chatStore.workingDirectory}/TASKS.md`;
  });
  
  // Debounce timer
  let debounceTimer: NodeJS.Timeout | null = null;
  
  // Handle TASKS.md file changes with debouncing
  const handleTasksFileChange = async (data: { path: string; content: string }) => {
    if (!tasksFilePath.value || data.path !== tasksFilePath.value) return;
    
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set new timer to debounce rapid changes
    debounceTimer = setTimeout(async () => {
      console.log('TASKS.md changed externally');
      
      try {
        // Replace all tasks with the content from TASKS.md
        const imported = tasksStore.importTasksFromFile(data.content);
        console.log(`Synced ${imported} tasks from TASKS.md`);
        
        // Update last synced time
        tasksStore.lastSyncedWithClaude = new Date();
        
      } catch (error) {
        console.error('Failed to parse TASKS.md:', error);
      }
    }, 500); // 500ms debounce
  };
  
  // Start watching TASKS.md
  const startWatching = async () => {
    if (!tasksFilePath.value || isWatching.value) return;
    
    try {
      // Check if TASKS.md exists
      const result = await window.electronAPI.fs.readFile(tasksFilePath.value);
      if (result.success) {
        // Watch the file
        await window.electronAPI.fs.watchFile(tasksFilePath.value);
        isWatching.value = true;
        console.log('Started watching TASKS.md');
        
        // Initial import
        handleTasksFileChange({ path: tasksFilePath.value, content: result.content });
      } else {
        // Create initial TASKS.md
        await tasksStore.updateTasksMarkdown();
        // Then watch it
        await window.electronAPI.fs.watchFile(tasksFilePath.value);
        isWatching.value = true;
      }
    } catch (error) {
      console.error('Failed to start watching TASKS.md:', error);
    }
  };
  
  // Stop watching
  const stopWatching = async () => {
    if (!tasksFilePath.value || !isWatching.value) return;
    
    try {
      await window.electronAPI.fs.unwatchFile(tasksFilePath.value);
      isWatching.value = false;
      console.log('Stopped watching TASKS.md');
    } catch (error) {
      console.error('Failed to stop watching TASKS.md:', error);
    }
  };
  
  onMounted(() => {
    // Listen for file changes
    window.electronAPI.fs.onFileChanged(handleTasksFileChange);
    
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