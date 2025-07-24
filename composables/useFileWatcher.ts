import { onMounted, onUnmounted } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useProjectContextStore } from '~/stores/project-context';

export const useFileWatcher = () => {
  const editorStore = useEditorStore();
  const contextStore = useProjectContextStore();
  
  const handleFileChange = async (data: { path: string; content: string }) => {
    
    
    // Update editor content
    editorStore.updateFileContent(data.path, data.content);
    
    // Add to working files for context tracking
    contextStore.addWorkingFile(data.path);
  };
  
  onMounted(() => {
    // Listen for file changes
    window.electronAPI.fs.onFileChanged(handleFileChange);
  });
  
  onUnmounted(() => {
    // Clean up listener
    window.electronAPI.fs.removeFileChangeListener();
  });
};