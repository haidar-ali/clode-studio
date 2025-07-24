import { ref, onMounted, onUnmounted } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useChatStore } from '~/stores/chat';

export const useTaskMonitor = () => {
  const tasksStore = useTasksStore();
  const chatStore = useChatStore();
  
  // Buffer to collect Claude's output
  const outputBuffer = ref('');
  let bufferTimeout: NodeJS.Timeout | null = null;
  
  // Process the buffer and extract tasks
  const processBuffer = () => {
    if (!outputBuffer.value.trim()) return;
    
    // Check if Claude mentioned tasks or to-dos
    const taskKeywords = [
      'task', 'todo', 'to-do', 'implement', 'feature', 
      'requirement', 'need to', 'should', 'must'
    ];
    
    const hasTaskContent = taskKeywords.some(keyword => 
      outputBuffer.value.toLowerCase().includes(keyword)
    );
    
    if (hasTaskContent) {
      // Parse and import tasks
      const imported = tasksStore.importTasksFromClaude(outputBuffer.value);
      
      if (imported > 0) {
        
        
        // Show notification (could be improved with a toast component)
        setTimeout(() => {
          if (confirm(`Claude mentioned ${imported} new task(s). Would you like to view them in the Kanban board?`)) {
            // Could switch to the tasks tab here
          }
        }, 500);
      }
    }
    
    // Clear buffer
    outputBuffer.value = '';
  };
  
  // Handle Claude's output
  const handleClaudeOutput = (data: string) => {
    // Add to buffer
    outputBuffer.value += data;
    
    // Clear existing timeout
    if (bufferTimeout) {
      clearTimeout(bufferTimeout);
    }
    
    // Set new timeout to process buffer after Claude stops outputting
    bufferTimeout = setTimeout(() => {
      processBuffer();
    }, 2000); // Wait 2 seconds of silence before processing
  };
  
  onMounted(() => {
    // Listen to Claude's output
    window.electronAPI.claude.onOutput(handleClaudeOutput);
  });
  
  onUnmounted(() => {
    // Clean up
    if (bufferTimeout) {
      clearTimeout(bufferTimeout);
    }
    
    // Process any remaining buffer
    processBuffer();
  });
  
  return {
    outputBuffer
  };
};