/**
 * Toast notification composable
 * Simple implementation for notifications
 */

interface ToastOptions {
  duration?: number;
  position?: 'top' | 'bottom' | 'top-right' | 'bottom-right';
}

class ToastManager {
  info(message: string, options?: ToastOptions) {
    console.info('[Toast]', message);
    // In a real implementation, this would show a toast UI
  }
  
  success(message: string, options?: ToastOptions) {
    console.log('[Toast Success]', message);
  }
  
  error(message: string, options?: ToastOptions) {
    console.error('[Toast Error]', message);
  }
  
  warning(message: string, options?: ToastOptions) {
    console.warn('[Toast Warning]', message);
  }
}

let toastManager: ToastManager | null = null;

export function useToast() {
  if (!toastManager) {
    toastManager = new ToastManager();
  }
  return toastManager;
}