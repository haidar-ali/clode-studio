/**
 * LSP Proxy for Remote Editor
 * Bridges browser clients to desktop LSP servers via Socket.IO
 */

import type { Socket } from 'socket.io';

export interface LSPRequest {
  method: string;
  params: any;
  requestId: string;
}

export interface LSPResponse {
  requestId: string;
  result?: any;
  error?: any;
}

export class LSPProxy {
  private activeSessions: Map<string, any> = new Map();
  
  /**
   * Initialize LSP proxy for a socket connection
   */
  initializeSocket(socket: Socket) {
    const sessionId = socket.id;
    
    // Handle LSP requests from client
    socket.on('lsp:request', async (request: LSPRequest) => {
      try {
        const result = await this.handleLSPRequest(sessionId, request);
        
        // Send response back to client
        socket.emit('lsp:response', {
          requestId: request.requestId,
          result
        } as LSPResponse);
      } catch (error) {
        socket.emit('lsp:response', {
          requestId: request.requestId,
          error: error.message
        } as LSPResponse);
      }
    });
    
    // Handle document open/close for proper LSP lifecycle
    socket.on('lsp:didOpen', (params: { uri: string; content: string; languageId: string }) => {
      this.handleDocumentOpen(sessionId, params);
    });
    
    socket.on('lsp:didChange', (params: { uri: string; content: string }) => {
      this.handleDocumentChange(sessionId, params);
    });
    
    socket.on('lsp:didClose', (params: { uri: string }) => {
      this.handleDocumentClose(sessionId, params);
    });
    
    // Clean up on disconnect
    socket.on('disconnect', () => {
      this.cleanupSession(sessionId);
    });
  }
  
  /**
   * Handle LSP request based on method
   */
  private async handleLSPRequest(sessionId: string, request: LSPRequest): Promise<any> {
    const { method, params } = request;
    
    switch (method) {
      case 'textDocument/completion':
        return this.getCompletions(sessionId, params);
        
      case 'textDocument/hover':
        return this.getHover(sessionId, params);
        
      case 'textDocument/definition':
        return this.getDefinition(sessionId, params);
        
      case 'textDocument/references':
        return this.getReferences(sessionId, params);
        
      case 'textDocument/documentSymbol':
        return this.getDocumentSymbols(sessionId, params);
        
      case 'textDocument/formatting':
        return this.formatDocument(sessionId, params);
        
      default:
        throw new Error(`Unsupported LSP method: ${method}`);
    }
  }
  
  /**
   * Get completions from LSP server
   */
  private async getCompletions(sessionId: string, params: any): Promise<any> {
    // In production, this would call the actual LSP server
    // For now, return mock completions based on file type
    const { uri, position } = params;
    const ext = uri.split('.').pop();
    
    // Mock completions based on file type
    const completions = {
      ts: [
        { label: 'console', kind: 'property', detail: 'Console API' },
        { label: 'document', kind: 'property', detail: 'Document API' },
        { label: 'window', kind: 'property', detail: 'Window API' },
        { label: 'Promise', kind: 'class', detail: 'Promise<T>' },
        { label: 'async', kind: 'keyword' },
        { label: 'await', kind: 'keyword' },
        { label: 'function', kind: 'keyword' },
        { label: 'const', kind: 'keyword' },
        { label: 'let', kind: 'keyword' },
      ],
      js: [
        { label: 'console', kind: 'property' },
        { label: 'document', kind: 'property' },
        { label: 'window', kind: 'property' },
        { label: 'function', kind: 'keyword' },
        { label: 'const', kind: 'keyword' },
        { label: 'let', kind: 'keyword' },
      ],
      vue: [
        { label: 'ref', kind: 'function', detail: 'ref<T>(value: T)' },
        { label: 'computed', kind: 'function', detail: 'computed()' },
        { label: 'watch', kind: 'function', detail: 'watch()' },
        { label: 'onMounted', kind: 'function', detail: 'onMounted()' },
        { label: 'defineProps', kind: 'function' },
        { label: 'defineEmits', kind: 'function' },
      ],
      py: [
        { label: 'def', kind: 'keyword' },
        { label: 'class', kind: 'keyword' },
        { label: 'import', kind: 'keyword' },
        { label: 'from', kind: 'keyword' },
        { label: 'print', kind: 'function' },
        { label: 'len', kind: 'function' },
        { label: 'range', kind: 'function' },
      ]
    };
    
    return {
      isIncomplete: false,
      items: completions[ext] || []
    };
  }
  
  /**
   * Get hover information
   */
  private async getHover(sessionId: string, params: any): Promise<any> {
    // Mock hover information
    return {
      contents: {
        kind: 'markdown',
        value: '**Function**: `console.log`\n\nOutputs a message to the console.'
      }
    };
  }
  
  /**
   * Get definition location
   */
  private async getDefinition(sessionId: string, params: any): Promise<any> {
    // Mock definition
    return null;
  }
  
  /**
   * Get references
   */
  private async getReferences(sessionId: string, params: any): Promise<any> {
    // Mock references
    return [];
  }
  
  /**
   * Get document symbols
   */
  private async getDocumentSymbols(sessionId: string, params: any): Promise<any> {
    // Mock symbols
    return [];
  }
  
  /**
   * Format document
   */
  private async formatDocument(sessionId: string, params: any): Promise<any> {
    // Mock formatting
    return [];
  }
  
  /**
   * Handle document lifecycle
   */
  private handleDocumentOpen(sessionId: string, params: any) {
    // Track open documents per session
    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, { documents: new Map() });
    }
    
    const session = this.activeSessions.get(sessionId);
    session.documents.set(params.uri, {
      content: params.content,
      languageId: params.languageId,
      version: 1
    });
  }
  
  private handleDocumentChange(sessionId: string, params: any) {
    const session = this.activeSessions.get(sessionId);
    if (session?.documents.has(params.uri)) {
      const doc = session.documents.get(params.uri);
      doc.content = params.content;
      doc.version++;
    }
  }
  
  private handleDocumentClose(sessionId: string, params: any) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.documents.delete(params.uri);
    }
  }
  
  private cleanupSession(sessionId: string) {
    this.activeSessions.delete(sessionId);
  }
}

// Export singleton instance
export const lspProxy = new LSPProxy();