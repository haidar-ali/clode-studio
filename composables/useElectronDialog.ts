export function useElectronDialog() {
  const isElectron = process.client && window.electronAPI;
  
  const showMessage = async (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    if (isElectron) {
      try {
        await window.electronAPI.dialog.showMessageBox({
          type,
          message,
          buttons: ['OK']
        });
      } catch (error) {
        console.error('Dialog error:', error);
      }
    } else {
      console.log(`[${type}] ${message}`);
    }
  };

  const showConfirm = async (message: string, title = 'Confirm'): Promise<boolean> => {
    if (isElectron) {
      try {
        const result = await window.electronAPI.dialog.showMessageBox({
          type: 'question',
          title,
          message,
          buttons: ['Yes', 'No'],
          defaultId: 0,
          cancelId: 1
        });
        return result.response === 0;
      } catch (error) {
        console.error('Dialog error:', error);
        return false;
      }
    }
    // Fallback for development
    return false;
  };

  const showPrompt = async (message: string, defaultValue = ''): Promise<string | null> => {
    // Electron doesn't have a built-in prompt dialog, so we'll use a simple input modal
    // For now, return null and we'll need to implement a custom modal component
    if (isElectron) {
      // TODO: Implement a custom input modal component
      console.log(`Prompt requested: ${message}`);
      return defaultValue || null;
    }
    return null;
  };

  const showSaveDialog = async (options?: any): Promise<string | null> => {
    if (isElectron) {
      try {
        const result = await window.electronAPI.dialog.showSaveDialog(options || {});
        return result.canceled ? null : result.filePath || null;
      } catch (error) {
        console.error('Dialog error:', error);
        return null;
      }
    }
    return null;
  };

  const showOpenDialog = async (options?: any): Promise<string[] | null> => {
    if (isElectron) {
      try {
        const result = await window.electronAPI.dialog.showOpenDialog(options || {});
        return result.canceled ? null : result.filePaths;
      } catch (error) {
        console.error('Dialog error:', error);
        return null;
      }
    }
    return null;
  };

  return {
    showMessage,
    showConfirm,
    showPrompt,
    showSaveDialog,
    showOpenDialog
  };
}