/**
 * Remote LSP Bridge via Socket.IO
 * Provides LSP features for remote editor through WebSocket connection
 */

import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { remoteConnection } from '~/services/remote-client/RemoteConnectionSingleton';
import { useEditorStore } from '~/stores/editor';
import { ref } from 'vue';

// Cache for pending LSP requests
const pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

// Cache the workspace path for the remote session
const remoteWorkspacePath = ref<string>('');

// Fetch workspace path on initialization
async function fetchWorkspacePath() {
  try {
    const response = await $fetch('/api/workspace/current');
    if (response?.path) {
      remoteWorkspacePath.value = response.path;
    }
  } catch (error) {
    console.error('[Remote LSP] Failed to fetch workspace path:', error);
  }
}

export function useRemoteLSP() {
  const editorStore = useEditorStore();
  
  // Fetch workspace path if not already fetched
  if (!remoteWorkspacePath.value) {
    fetchWorkspacePath();
  }
  
  // Get the socket from the singleton
  const socketInstance = remoteConnection.getSocket();
  
  // Initialize Socket.IO listeners once
  // Check if socket exists and if it's a Socket.IO client instance
  if (socketInstance && typeof socketInstance.on === 'function') {
    // Check if listener already exists by trying to add it
    // Socket.IO doesn't have hasListeners, but we can track it ourselves
    const listenerKey = 'lsp:response';
    if (!(socketInstance as any)._lspListenerAdded) {
      socketInstance.on(listenerKey, (response: any) => {
        const pending = pendingRequests.get(response.requestId);
        if (pending) {
          if (response.error) {
            pending.reject(new Error(response.error));
          } else {
            pending.resolve(response.result);
          }
          pendingRequests.delete(response.requestId);
        }
      });
      // Mark that we've added the listener
      (socketInstance as any)._lspListenerAdded = true;
    }
  }
  
  /**
   * Send LSP request via Socket.IO
   */
  const sendLSPRequest = (method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const currentSocket = remoteConnection.getSocket();
      
      // If no socket yet, just return null (graceful degradation)
      if (!currentSocket) {
        resolve(null);
        return;
      }
      
      // If socket exists but not connected, also return null
      if (!currentSocket.connected) {
        resolve(null);
        return;
      }
      
      const requestId = `${method}-${Date.now()}-${Math.random()}`;
      
      // Store pending request
      pendingRequests.set(requestId, { resolve, reject });
      
      // Send request
      currentSocket.emit('lsp:request', {
        method,
        params,
        requestId
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('LSP request timeout'));
        }
      }, 5000);
    });
  };
  
  /**
   * Create CodeMirror completion source for remote LSP
   */
  const createRemoteLSPCompletionSource = () => {
    return async (context: CompletionContext): Promise<CompletionResult | null> => {
      try {
        const activeTab = editorStore.activeTab;
        if (!activeTab?.path) {
          return null;
        }
        
        // Get the current word being typed
        const match = context.matchBefore(/[\w-]*/);
        if (!match || (match.text === "" && !context.explicit)) {
          return null;
        }
        
        const doc = context.state.doc;
        const line = doc.lineAt(context.pos);
        
        // Get the full document content
        const content = doc.toString();
        
        // Convert relative path to absolute path for LSP
        const absolutePath = toAbsolutePath(activeTab.path);
        
        // Detect trigger character
        let triggerCharacter: string | undefined;
        if (context.pos > 0) {
          const charBefore = doc.sliceString(context.pos - 1, context.pos);
          // Common trigger characters that should provide context-aware completions
          const triggerChars = ['.', '(', '[', '{', '"', "'", ':', '/', '<', '>', '@', '#', ' ', '-', '='];
          if (triggerChars.includes(charBefore)) {
            triggerCharacter = charBefore;
          }
        }
        
        // Send completion request via Socket.IO
        const response = await sendLSPRequest('textDocument/completion', {
          uri: absolutePath, // Use absolute path for LSP
          content: content, // Include file content for LSP
          position: {
            line: line.number, // Keep 1-based to match desktop
            character: context.pos - line.from
          },
          context: {
            triggerKind: triggerCharacter ? 2 : (context.explicit ? 1 : 0),
            triggerCharacter: triggerCharacter
          }
        });
        
        // Check for completions in the response
        const completions = response?.completions || response?.items || [];
        if (!completions || completions.length === 0) {
          return null;
        }
        
        // Convert LSP completions to CodeMirror format
        const options = completions.map((item: any) => ({
          label: item.label,
          type: item.kind?.toLowerCase() || 'text',
          detail: item.detail,
          info: item.documentation,
          apply: item.insertText || item.label
        }));
        
        return {
          from: match.from,
          to: context.pos,
          options,
          validFor: /^[\w-]*$/
        };
      } catch (error) {
        // Silently fail for LSP errors (graceful degradation)
        // console.debug('[Remote LSP] Completion unavailable:', error.message);
        return null;
      }
    };
  };
  
  /**
   * Create hover tooltip for remote LSP
   */
  const createRemoteLSPHover = () => {
    return async (view: any, pos: number) => {
      try {
        const activeTab = editorStore.activeTab;
        if (!activeTab?.path) {
          return null;
        }
        
        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        
        // Convert relative path to absolute path for LSP
        const absolutePath = toAbsolutePath(activeTab.path);
        
        const response = await sendLSPRequest('textDocument/hover', {
          uri: absolutePath, // Use absolute path for LSP
          position: {
            line: line.number - 1,
            character: pos - line.from
          }
        });
        
        if (!response?.contents) {
          return null;
        }
        
        return {
          pos,
          end: pos,
          create: () => {
            const dom = document.createElement('div');
            dom.className = 'cm-tooltip-hover';
            dom.textContent = response.contents.value || response.contents;
            return { dom };
          }
        };
      } catch (error) {
        // Silently fail for LSP errors (graceful degradation)
        // console.debug('[Remote LSP] Hover unavailable:', error.message);
        return null;
      }
    };
  };
  
  /**
   * Convert relative path to absolute
   */
  const toAbsolutePath = (path: string): string => {
    const workspacePath = remoteWorkspacePath.value || '';
    // If path already starts with workspace path, use as-is
    if (path.startsWith(workspacePath)) {
      return path;
    }
    // If it's a relative path, join with workspace
    if (!path.startsWith('/')) {
      return `${workspacePath}/${path}`.replace(/\/+/g, '/');
    }
    // If it's an absolute path, return as-is
    return path;
  };
  
  /**
   * Notify server about document changes
   */
  const notifyDocumentOpen = (uri: string, content: string, languageId: string) => {
    const currentSocket = remoteConnection.getSocket();
    if (currentSocket?.connected) {
      const absolutePath = toAbsolutePath(uri);
      currentSocket.emit('lsp:didOpen', { uri: absolutePath, content, languageId });
    }
  };
  
  const notifyDocumentChange = (uri: string, content: string) => {
    const currentSocket = remoteConnection.getSocket();
    if (currentSocket?.connected) {
      const absolutePath = toAbsolutePath(uri);
      currentSocket.emit('lsp:didChange', { uri: absolutePath, content });
    }
  };
  
  const notifyDocumentClose = (uri: string) => {
    const currentSocket = remoteConnection.getSocket();
    if (currentSocket?.connected) {
      const absolutePath = toAbsolutePath(uri);
      currentSocket.emit('lsp:didClose', { uri: absolutePath });
    }
  };
  
  return {
    createRemoteLSPCompletionSource,
    createRemoteLSPHover,
    notifyDocumentOpen,
    notifyDocumentChange,
    notifyDocumentClose,
    sendLSPRequest
  };
}