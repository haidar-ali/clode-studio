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
    // Listen for file changes only if Electron API is available
    if (window.electronAPI?.fs?.onFileChanged) {
      window.electronAPI.fs.onFileChanged(handleFileChange);
    }
  });
  
  onUnmounted(() => {
    // Clean up listener only if Electron API is available
    if (window.electronAPI?.fs?.removeFileChangeListener) {
      window.electronAPI.fs.removeFileChangeListener();
    }
  });
};