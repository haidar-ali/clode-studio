import { ref } from 'vue';
import { createSharedComposable } from '@vueuse/core';

// Create a simple modal state for text input
const isModalOpen = ref(false);
const modalConfig = ref({
  title: '',
  message: '',
  defaultValue: '',
  placeholder: '',
  resolve: null as ((value: string | null) => void) | null
});

export const useDialogs = createSharedComposable(() => {
  // Show text input dialog
  async function showInputDialog(options: {
    title?: string;
    message: string;
    defaultValue?: string;
    placeholder?: string;
  }): Promise<string | null> {
  
    
    // Try Electron dialog first
    if (window.electronAPI?.dialog?.showInputBox) {
      try {
      
        const result = await window.electronAPI.dialog.showInputBox({
          title: options.title || 'Input',
          message: options.message,
          defaultValue: options.defaultValue || '',
          placeholder: options.placeholder
        });
      
        
        // If Electron returns canceled, fall through to Vue modal
        if (!result.canceled && result.value !== undefined) {
          return result.value;
        }
      } catch (error) {
        console.warn('[useDialogs] Electron dialog failed:', error);
      }
    }
    
    // Fallback to Vue modal
  
    return new Promise((resolve) => {
      modalConfig.value = {
        title: options.title || 'Input',
        message: options.message,
        defaultValue: options.defaultValue || '',
        placeholder: options.placeholder || '',
        resolve
      };
      isModalOpen.value = true;
    });
  }
  
  // Show confirmation dialog
  async function showConfirmDialog(message: string, title?: string): Promise<boolean> {
    // Try Electron dialog first
    if (window.electronAPI?.dialog?.showMessageBox) {
      try {
        const result = await window.electronAPI.dialog.showMessageBox({
          type: 'question',
          buttons: ['Cancel', 'OK'],
          defaultId: 1,
          cancelId: 0,
          title: title || 'Confirm',
          message
        });
        return result.response === 1;
      } catch (error) {
        console.warn('Electron dialog failed:', error);
      }
    }
    
    // Fallback to browser's native confirm dialog
    return window.confirm(message);
  }
  
  // Show info/error message
  async function showMessageDialog(message: string, type: 'info' | 'error' = 'info', title?: string): Promise<void> {
    // Try Electron dialog first
    if (window.electronAPI?.dialog?.showMessageBox) {
      try {
        await window.electronAPI.dialog.showMessageBox({
          type,
          buttons: ['OK'],
          title: title || (type === 'error' ? 'Error' : 'Information'),
          message
        });
        return;
      } catch (error) {
        console.warn('Electron dialog failed:', error);
      }
    }
    
    // Fallback to browser's native alert
    window.alert(`${title || (type === 'error' ? 'Error' : 'Information')}: ${message}`);
  }
  
  // Handle modal submit
  function submitModal(value: string | null) {
    if (modalConfig.value.resolve) {
      modalConfig.value.resolve(value);
      modalConfig.value.resolve = null;
    }
    isModalOpen.value = false;
  }
  
  // Handle modal cancel
  function cancelModal() {
    submitModal(null);
  }
  
  // Convenience methods with additional fallbacks
  const prompt = async (options: string | { message: string; defaultValue?: string; placeholder?: string; title?: string }) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    const result = await showInputDialog(opts);
    
    // If Vue modal was cancelled, use browser prompt as final fallback
    if (result === null && !window.electronAPI) {
      return window.prompt(opts.message, opts.defaultValue || '');
    }
    return result;
  };
  
  return {
    // State for Vue modal fallback
    isModalOpen,
    modalConfig,
    submitModal,
    cancelModal,
    
    // Dialog methods
    prompt,
    confirm: showConfirmDialog,
    alert: (message: string, title?: string) => showMessageDialog(message, 'info', title),
    error: (message: string, title?: string) => showMessageDialog(message, 'error', title),
    info: (message: string, title?: string) => showMessageDialog(message, 'info', title)
  };
});