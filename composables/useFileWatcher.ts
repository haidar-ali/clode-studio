import { onMounted, onUnmounted } from 'vue';
import { useEditorStore } from '~/stores/editor';

export const useFileWatcher = () => {
  const editorStore = useEditorStore();
  
  const handleFileChange = (data: { path: string; content: string }) => {
    console.log('File changed externally:', data.path);
    editorStore.updateFileContent(data.path, data.content);
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