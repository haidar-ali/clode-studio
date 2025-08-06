/**
 * Remote AI Services via Socket.IO
 * Provides ghost text and code generation for remote mode
 */

import { remoteConnection } from '~/services/remote-client/RemoteConnectionSingleton';

// Cache for pending AI requests
const pendingGhostTextRequests = new Map<string, { resolve: Function; reject: Function }>();
const pendingCodeGenRequests = new Map<string, { resolve: Function; reject: Function }>();

// Initialize Socket.IO listeners once
let listenersInitialized = false;

function initializeListeners() {
  if (listenersInitialized) return;
  
  const socketInstance = remoteConnection.getSocket();
  if (socketInstance && typeof socketInstance.on === 'function') {
    // Ghost text response listener
    socketInstance.on('ai:ghost-text-response', (response: any) => {
      const pending = pendingGhostTextRequests.get(response.requestId);
      if (pending) {
        if (response.result?.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.result?.error || 'Ghost text request failed'));
        }
        pendingGhostTextRequests.delete(response.requestId);
      }
    });
    
    // Code generation response listener
    socketInstance.on('ai:code-generation-response', (response: any) => {
      const pending = pendingCodeGenRequests.get(response.requestId);
      if (pending) {
        if (response.result?.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.result?.error || 'Code generation request failed'));
        }
        pendingCodeGenRequests.delete(response.requestId);
      }
    });
    
    listenersInitialized = true;
  }
}

export function useRemoteAI() {
  // Initialize listeners when composable is used
  initializeListeners();
  
  /**
   * Get ghost text suggestion via Socket.IO
   */
  const getGhostText = (params: { prefix: string; suffix: string; forceManual?: boolean }): Promise<any> => {
    return new Promise((resolve, reject) => {
      const currentSocket = remoteConnection.getSocket();
      
      // If no socket yet, return failed result
      if (!currentSocket || !currentSocket.connected) {
        resolve({ success: false, error: 'No connection to desktop' });
        return;
      }
      
      const requestId = `ghost-text-${Date.now()}-${Math.random()}`;
      
      // Store pending request
      pendingGhostTextRequests.set(requestId, { resolve, reject });
      
      // Send request
      currentSocket.emit('ai:ghost-text', {
        requestId,
        prefix: params.prefix,
        suffix: params.suffix,
        forceManual: params.forceManual || false
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingGhostTextRequests.has(requestId)) {
          pendingGhostTextRequests.delete(requestId);
          resolve({ success: false, error: 'Ghost text request timeout' });
        }
      }, 10000);
    });
  };
  
  /**
   * Generate code via Socket.IO
   */
  const generateCode = (params: {
    prompt: string;
    fileContent: string;
    filePath: string;
    language?: string;
    resources?: any[];
  }): Promise<any> => {
    return new Promise((resolve, reject) => {
      const currentSocket = remoteConnection.getSocket();
      
      // If no socket yet, return failed result
      if (!currentSocket || !currentSocket.connected) {
        resolve({ success: false, error: 'No connection to desktop' });
        return;
      }
      
      const requestId = `code-gen-${Date.now()}-${Math.random()}`;
      
      // Store pending request
      pendingCodeGenRequests.set(requestId, { resolve, reject });
      
      // Send request
      currentSocket.emit('ai:code-generation', {
        requestId,
        prompt: params.prompt,
        fileContent: params.fileContent,
        filePath: params.filePath,
        language: params.language || 'text',
        resources: params.resources || []
      });
      
      // Timeout after 30 seconds (code generation takes longer)
      setTimeout(() => {
        if (pendingCodeGenRequests.has(requestId)) {
          pendingCodeGenRequests.delete(requestId);
          resolve({ success: false, error: 'Code generation request timeout' });
        }
      }, 30000);
    });
  };
  
  return {
    getGhostText,
    generateCode
  };
}