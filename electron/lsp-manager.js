import { spawn } from 'child_process';
import * as rpc from 'vscode-jsonrpc/node.js';
import * as lsp from 'vscode-languageserver-protocol';
import { v4 as uuidv4 } from 'uuid';

/**
 * Language Server Protocol Manager
 * Manages LSP servers for different languages
 */
export class LSPManager {
  constructor() {
    this.servers = new Map(); // language -> server info
    this.connections = new Map(); // language -> connection
    this.capabilities = new Map(); // language -> server capabilities
    
    // Increase max listeners to prevent warnings when multiple LSP servers start
    process.setMaxListeners(20);
    
    // Language server configurations
    this.serverConfigs = {
      typescript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
        languages: ['typescript', 'javascript', 'tsx', 'jsx'],
        install: 'npm install -g typescript-language-server typescript'
      },
      python: {
        command: 'pylsp',
        args: [],
        languages: ['python'],
        install: 'pip install python-lsp-server[all]'
      },
      rust: {
        command: 'rust-analyzer',
        args: [],
        languages: ['rust'],
        install: 'rustup component add rust-analyzer'
      },
      go: {
        command: 'gopls',
        args: [],
        languages: ['go'],
        install: 'go install golang.org/x/tools/gopls@latest'
      },
      java: {
        command: 'jdtls',
        args: [],
        languages: ['java'],
        install: 'https://download.eclipse.org/jdtls/downloads/'
      },
      cpp: {
        command: 'clangd',
        args: [],
        languages: ['cpp', 'c', 'cc', 'cxx', 'h', 'hpp'],
        install: 'apt-get install clangd / brew install llvm'
      },
      vue: {
        command: 'vue-language-server',
        args: ['--stdio'],
        languages: ['vue'],
        install: 'npm install -g @vue/language-server'
      },
      html: {
        command: 'vscode-html-language-server',
        args: ['--stdio'],
        languages: ['html', 'htm'],
        install: 'npm install -g vscode-langservers-extracted'
      },
      css: {
        command: 'vscode-css-language-server',
        args: ['--stdio'],
        languages: ['css', 'scss', 'less'],
        install: 'npm install -g vscode-langservers-extracted'
      },
      json: {
        command: 'vscode-json-language-server',
        args: ['--stdio'],
        languages: ['json', 'jsonc'],
        install: 'npm install -g vscode-langservers-extracted'
      }
    };
  }

  /**
   * Get language server for a file
   */
  async getServerForFile(filepath) {
    const language = this.detectLanguage(filepath);
    if (!language) return null;
    
    // Check if server is already running
    if (this.connections.has(language)) {
      return this.connections.get(language);
    }
    
    // Start new server
    return await this.startServer(language);
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filepath) {
    const ext = filepath.split('.').pop()?.toLowerCase();
    
    // Map common extensions to languages first
    const extMap = {
      'ts': 'typescript',
      'js': 'typescript', // TypeScript server handles JS too
      'tsx': 'typescript',
      'jsx': 'typescript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'h': 'cpp',
      'hpp': 'cpp',
      'vue': 'vue',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'css',
      'less': 'css',
      'json': 'json',
      'jsonc': 'json'
    };
    
    return extMap[ext] || null;
  }

  /**
   * Start a language server
   */
  async startServer(language) {
    const config = this.serverConfigs[language];
    if (!config) {
      throw new Error(`No language server configured for ${language}`);
    }
    
    console.log(`[LSP] Starting ${language} language server...`);
    
    try {
      // Spawn the language server process
      const serverProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Create connection
      const connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(serverProcess.stdout),
        new rpc.StreamMessageWriter(serverProcess.stdin)
      );
      
      // Handle server errors
      serverProcess.stderr.on('data', (data) => {
        console.error(`[LSP] ${language} server error:`, data.toString());
      });
      
      serverProcess.on('error', (err) => {
        console.error(`[LSP] Failed to start ${language} server:`, err);
        this.handleServerError(language, err);
      });
      
      serverProcess.on('exit', (code) => {
        console.log(`[LSP] ${language} server exited with code ${code}`);
        this.connections.delete(language);
        this.servers.delete(language);
      });
      
      // Start listening
      connection.listen();
      
      // Initialize the server
      const initResult = await connection.sendRequest(lsp.InitializeRequest.type, {
        processId: process.pid,
        clientInfo: {
          name: 'Clode Studio',
          version: '1.0.0'
        },
        rootUri: null, // Will be set per workspace
        capabilities: {
          textDocument: {
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                resolveSupport: {
                  properties: ['documentation', 'detail', 'additionalTextEdits']
                }
              },
              contextSupport: true,
              dynamicRegistration: true
            },
            hover: {
              contentFormat: ['markdown', 'plaintext'],
              dynamicRegistration: true
            },
            signatureHelp: {
              dynamicRegistration: true
            },
            definition: {
              dynamicRegistration: true
            },
            references: {
              dynamicRegistration: true
            },
            documentSymbol: {
              dynamicRegistration: true,
              hierarchicalDocumentSymbolSupport: true
            },
            formatting: {
              dynamicRegistration: true
            }
          },
          workspace: {
            workspaceFolders: true,
            didChangeConfiguration: {
              dynamicRegistration: true
            }
          }
        }
      });
      
      // Store server info
      this.servers.set(language, {
        process: serverProcess,
        config,
        initialized: true
      });
      
      this.connections.set(language, connection);
      this.capabilities.set(language, initResult.capabilities);
      
      // Notify initialized
      await connection.sendNotification(lsp.InitializedNotification.type, {});
      
      console.log(`[LSP] ${language} server initialized successfully`);
      
      return connection;
    } catch (error) {
      console.error(`[LSP] Failed to start ${language} server:`, error);
      throw error;
    }
  }

  /**
   * Handle server startup errors
   */
  handleServerError(language, error) {
    const config = this.serverConfigs[language];
    if (error.code === 'ENOENT') {
      console.error(`[LSP] ${language} server not found. Install with: ${config.install}`);
    }
  }

  /**
   * Get completions from LSP
   */
  async getCompletions(filepath, content, position, triggerCharacter = null) {
    const language = this.detectLanguage(filepath);
    if (!language) return [];
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return [];
    
    try {
      // First, notify the server about the file content
      const uri = `file://${filepath}`;
      const version = Date.now();
      
      // Check if document is already open
      if (!this.openDocuments) {
        this.openDocuments = new Set();
      }
      
      if (!this.openDocuments.has(uri)) {
        // Send document open notification for new document
        await connection.sendNotification(lsp.DidOpenTextDocumentNotification.type, {
          textDocument: {
            uri,
            languageId: language,
            version,
            text: content
          }
        });
        this.openDocuments.add(uri);
      } else {
        // Send document change notification for existing document
        await connection.sendNotification(lsp.DidChangeTextDocumentNotification.type, {
          textDocument: {
            uri,
            version
          },
          contentChanges: [{
            text: content // Full document update
          }]
        });
      }
      
      // Longer delay to let LSP process the file completely
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Build completion context with proper trigger
      let completionContext;
      
      if (triggerCharacter === '.') {
        completionContext = {
          triggerKind: lsp.CompletionTriggerKind.TriggerCharacter,
          triggerCharacter: '.'
        };
      } else {
        completionContext = {
          triggerKind: lsp.CompletionTriggerKind.Invoked
        };
      }
      
      // Request completions
      console.log(`[LSP] Requesting completions at line ${position.line}, char ${position.character}, trigger: ${triggerCharacter}`);
      
      const completions = await connection.sendRequest(lsp.CompletionRequest.type, {
        textDocument: { uri },
        position: {
          line: position.line - 1, // LSP uses 0-based lines
          character: position.character
        },
        context: completionContext
      });
      
      console.log(`[LSP] Received ${Array.isArray(completions) ? completions.length : (completions?.items?.length || 0)} completions for ${language}`);
      
      // Convert LSP completions to our format
      if (Array.isArray(completions)) {
        return completions.map(item => this.convertLSPCompletion(item));
      } else if (completions && completions.items) {
        return completions.items.map(item => this.convertLSPCompletion(item));
      }
      
      return [];
    } catch (error) {
      console.error(`[LSP] Failed to get completions from ${language} server:`, error);
      return [];
    }
  }

  /**
   * Convert LSP completion to our format
   */
  convertLSPCompletion(item) {
    return {
      id: uuidv4(),
      text: item.insertText || item.label,
      label: item.label,
      detail: item.detail,
      documentation: item.documentation?.value || item.documentation,
      source: 'lsp',
      confidence: 90, // LSP completions are high confidence
      insertText: item.insertText || item.label,
      kind: this.mapCompletionKind(item.kind)
    };
  }

  /**
   * Map LSP completion kind to our types
   */
  mapCompletionKind(kind) {
    const kindMap = {
      [lsp.CompletionItemKind.Method]: 'method',
      [lsp.CompletionItemKind.Function]: 'function',
      [lsp.CompletionItemKind.Constructor]: 'constructor',
      [lsp.CompletionItemKind.Field]: 'field',
      [lsp.CompletionItemKind.Variable]: 'variable',
      [lsp.CompletionItemKind.Class]: 'class',
      [lsp.CompletionItemKind.Interface]: 'interface',
      [lsp.CompletionItemKind.Module]: 'module',
      [lsp.CompletionItemKind.Property]: 'property',
      [lsp.CompletionItemKind.Unit]: 'unit',
      [lsp.CompletionItemKind.Value]: 'value',
      [lsp.CompletionItemKind.Enum]: 'enum',
      [lsp.CompletionItemKind.Keyword]: 'keyword',
      [lsp.CompletionItemKind.Snippet]: 'snippet',
      [lsp.CompletionItemKind.Color]: 'color',
      [lsp.CompletionItemKind.File]: 'file',
      [lsp.CompletionItemKind.Reference]: 'reference'
    };
    
    return kindMap[kind] || 'text';
  }

  /**
   * Get hover information
   */
  async getHover(filepath, content, position) {
    const language = this.detectLanguage(filepath);
    if (!language) return null;
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return null;
    
    try {
      const uri = `file://${filepath}`;
      const hover = await connection.sendRequest(lsp.HoverRequest.type, {
        textDocument: { uri },
        position: {
          line: position.line - 1,
          character: position.character
        }
      });
      
      if (hover && hover.contents) {
        return {
          contents: hover.contents.value || hover.contents,
          range: hover.range
        };
      }
      
      return null;
    } catch (error) {
      console.error(`[LSP] Failed to get hover from ${language} server:`, error);
      return null;
    }
  }

  /**
   * Get definition location
   */
  async getDefinition(filepath, content, position) {
    const language = this.detectLanguage(filepath);
    if (!language) return null;
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return null;
    
    try {
      const uri = `file://${filepath}`;
      const definition = await connection.sendRequest(lsp.DefinitionRequest.type, {
        textDocument: { uri },
        position: {
          line: position.line - 1,
          character: position.character
        }
      });
      
      return definition;
    } catch (error) {
      console.error(`[LSP] Failed to get definition from ${language} server:`, error);
      return null;
    }
  }

  /**
   * Get all symbols in a document
   */
  async getDocumentSymbols(filepath, content) {
    const language = this.detectLanguage(filepath);
    if (!language) return [];
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return [];
    
    try {
      const uri = `file://${filepath}`;
      const symbols = await connection.sendRequest(lsp.DocumentSymbolRequest.type, {
        textDocument: { uri }
      });
      
      return symbols || [];
    } catch (error) {
      console.error(`[LSP] Failed to get symbols from ${language} server:`, error);
      return [];
    }
  }

  /**
   * Shutdown all language servers
   */
  async shutdown() {
    console.log('[LSP] Shutting down all language servers...');
    
    for (const [language, connection] of this.connections) {
      try {
        await connection.sendRequest(lsp.ShutdownRequest.type);
        await connection.sendNotification(lsp.ExitNotification.type);
        connection.dispose();
      } catch (error) {
        console.error(`[LSP] Error shutting down ${language} server:`, error);
      }
    }
    
    // Kill any remaining processes
    for (const [language, server] of this.servers) {
      if (server.process && !server.process.killed) {
        server.process.kill();
      }
    }
    
    this.connections.clear();
    this.servers.clear();
    this.capabilities.clear();
  }

  /**
   * Check if a language server is available
   */
  async checkServerAvailable(language) {
    const config = this.serverConfigs[language];
    if (!config) return false;
    
    try {
      const { promisify } = await import('util');
      const exec = promisify((await import('child_process')).exec);
      await exec(`which ${config.command}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get available language servers
   */
  async getAvailableServers() {
    const available = [];
    
    for (const [language, config] of Object.entries(this.serverConfigs)) {
      if (await this.checkServerAvailable(language)) {
        available.push({
          language,
          command: config.command,
          languages: config.languages
        });
      }
    }
    
    return available;
  }
  
  /**
   * Get currently connected servers
   */
  getConnectedServers() {
    return Array.from(this.connections.keys());
  }
}

// Export singleton instance
export const lspManager = new LSPManager();