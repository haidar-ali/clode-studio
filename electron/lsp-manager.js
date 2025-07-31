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
    this.workspaceRoots = new Map(); // cache workspace roots
    
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
    
    // Start new server with workspace URI
    const workspaceUri = await this.findWorkspaceRoot(filepath);
    console.log(`[LSP] Starting server for ${filepath} with workspace: ${workspaceUri}`);
    return await this.startServer(language, workspaceUri);
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
  async startServer(language, workspaceUri = null) {
    const config = this.serverConfigs[language];
    if (!config) {
      throw new Error(`No language server configured for ${language}`);
    }
    
    console.log(`[LSP] Starting ${language} language server with workspace: ${workspaceUri || 'none'}`);
    
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
        rootUri: workspaceUri || null,
        rootPath: workspaceUri ? new URL(workspaceUri).pathname : null,
        initializationOptions: {
          preferences: {
            // Completion preferences
            includeCompletionsForModuleExports: false, // Disable auto-imports to reduce noise
            includeCompletionsForImportStatements: true,
            includeCompletionsWithSnippetText: true,
            includeCompletionsWithInsertText: true,
            includeAutomaticOptionalChainCompletions: true,
            includeCompletionsWithClassMemberSnippets: true,
            includeCompletionsWithObjectLiteralMethodSnippets: true,
            allowIncompleteCompletions: true,
            
            // Import preferences
            importModuleSpecifierPreference: 'shortest',
            importModuleSpecifierEnding: 'auto',
            includePackageJsonAutoImports: 'auto',
            
            // Other preferences
            providePrefixAndSuffixTextForRename: true,
            allowRenameOfImportPath: true,
            quotePreference: 'auto',
            
            // Disable some suggestions to reduce noise
            includeInlayParameterNameHints: 'none',
            includeInlayParameterNameHintsWhenArgumentMatchesName: false,
            includeInlayFunctionParameterTypeHints: false,
            includeInlayVariableTypeHints: false,
            includeInlayPropertyDeclarationTypeHints: false,
            includeInlayFunctionLikeReturnTypeHints: false,
            includeInlayEnumMemberValueHints: false
          },
          maxTsServerMemory: 4096,
          tsserver: {
            logDirectory: null,
            logVerbosity: 'off',
            trace: 'off'
          },
          completions: {
            completeFunctionCalls: true
          }
        },
        capabilities: {
          textDocument: {
            completion: {
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                deprecatedSupport: true,
                preselectSupport: true,
                tagSupport: {
                  valueSet: [1] // Deprecated
                },
                insertReplaceSupport: true,
                resolveSupport: {
                  properties: ['documentation', 'detail', 'additionalTextEdits', 'command']
                },
                insertTextModeSupport: {
                  valueSet: [1, 2]
                },
                labelDetailsSupport: true
              },
              contextSupport: true,
              dynamicRegistration: true,
              insertTextMode: 2
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
      
      // Common trigger characters for TypeScript
      const triggerChars = ['.', '(', '[', '{', '"', "'", ':', '/', '<', '>', '@', '#'];
      
      if (triggerCharacter && triggerChars.includes(triggerCharacter)) {
        completionContext = {
          triggerKind: lsp.CompletionTriggerKind.TriggerCharacter,
          triggerCharacter: triggerCharacter
        };
      } else {
        // Regular typing, not a trigger character
        completionContext = {
          triggerKind: lsp.CompletionTriggerKind.Invoked
        };
      }
      
      // Get the current line text to understand what the user is typing
      const lines = content.split('\n');
      const currentLine = lines[position.line - 1] || '';
      const beforeCursor = currentLine.substring(0, position.character);
      const currentWord = beforeCursor.match(/(\w+)$/)?.[1] || '';
      
      const completions = await connection.sendRequest(lsp.CompletionRequest.type, {
        textDocument: { uri },
        position: {
          line: position.line - 1, // LSP uses 0-based lines
          character: position.character
        },
        context: completionContext
      });
      
      // Convert LSP completions to our format
      let items = [];
      if (Array.isArray(completions)) {
        items = completions;
      } else if (completions && completions.items) {
        items = completions.items;
      }
      
      // Simple approach: Trust the language server's ordering
      // Just apply a reasonable limit to prevent UI overload
      const MAX_COMPLETIONS = 200;
      
      // Sort with intelligent ordering prioritizing relevant matches
      items.sort((a, b) => {
        const aSortText = a.sortText || a.label;
        const bSortText = b.sortText || b.label;
        
        // STRONG preference for prefix matches when user is typing
        if (currentWord && currentWord.length > 0) {
          const aStartsWith = a.label.toLowerCase().startsWith(currentWord.toLowerCase());
          const bStartsWith = b.label.toLowerCase().startsWith(currentWord.toLowerCase());
          
          // If only one matches prefix, it wins regardless of sortText
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          
          // If both match prefix, prioritize exact match
          if (aStartsWith && bStartsWith) {
            const aExact = a.label.toLowerCase() === currentWord.toLowerCase();
            const bExact = b.label.toLowerCase() === currentWord.toLowerCase();
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Both are prefix matches, use regular sorting
            return regularSort(a, b, aSortText, bSortText);
          }
          
          // Neither matches prefix - de-prioritize auto-imports (sortText 11)
          const aMatch = aSortText.match(/^(\d+)(.*)$/);
          const bMatch = bSortText.match(/^(\d+)(.*)$/);
          
          if (aMatch && bMatch) {
            const aNum = parseInt(aMatch[1], 10);
            const bNum = parseInt(bMatch[1], 10);
            
            // Auto-imports (11) go to bottom when no prefix match
            if (aNum === 11 && bNum !== 11) return 1;
            if (aNum !== 11 && bNum === 11) return -1;
          }
        }
        
        return regularSort(a, b, aSortText, bSortText);
      });
      
      function regularSort(a, b, aSortText, bSortText) {
        // Check if both start with numbers
        const aMatch = aSortText.match(/^(\d+)(.*)$/);
        const bMatch = bSortText.match(/^(\d+)(.*)$/);
        
        if (aMatch && bMatch) {
          // Compare numbers first
          const aNum = parseInt(aMatch[1], 10);
          const bNum = parseInt(bMatch[1], 10);
          
          if (aNum !== bNum) {
            return aNum - bNum; // Lower numbers come first
          }
          
          // If numbers are equal, compare the rest
          return aMatch[2].localeCompare(bMatch[2]);
        }
        
        // Fallback to string comparison
        return aSortText.localeCompare(bSortText);
      }
      
      // Take only the first MAX_COMPLETIONS items
      const limitedItems = items.slice(0, MAX_COMPLETIONS);
      
      return limitedItems.map(item => this.convertLSPCompletion(item));
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
      insertTextFormat: item.insertTextFormat,
      kind: this.mapCompletionKind(item.kind),
      sortText: item.sortText || item.label,
      filterText: item.filterText || item.label,
      preselect: item.preselect,
      commitCharacters: item.commitCharacters,
      additionalTextEdits: item.additionalTextEdits,
      command: item.command,
      data: item.data // Keep data for completion resolve
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
   * Resolve a completion item for additional details
   */
  async resolveCompletion(filepath, item) {
    const language = this.detectLanguage(filepath);
    if (!language) return item;
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return item;
    
    try {
      console.log(`[LSP] Resolving completion item: ${item.label}`);
      
      const resolved = await connection.sendRequest(lsp.CompletionResolveRequest.type, item);
      
      if (resolved) {
        // Merge resolved data back into the item
        return { ...item, ...resolved };
      }
      
      return item;
    } catch (error) {
      console.error(`[LSP] Failed to resolve completion from ${language} server:`, error);
      return item;
    }
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
   * Get diagnostics for a document
   */
  async getDiagnostics(filepath, content) {
    const language = this.detectLanguage(filepath);
    if (!language) return [];
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return [];
    
    try {
      const uri = `file://${filepath}`;
      
      // First, ensure the document is open and synced
      await connection.sendNotification(lsp.DidOpenTextDocumentNotification.type, {
        textDocument: {
          uri,
          languageId: language,
          version: 1,
          text: content
        }
      });
      
      // Request diagnostics - note that many LSP servers send diagnostics
      // via notifications rather than request/response
      // For now, we'll return empty array as diagnostics are usually pushed
      console.log(`[LSP] Diagnostics requested for ${language} file`);
      
      // TODO: Implement proper diagnostic handling with notification listeners
      return [];
    } catch (error) {
      console.error(`[LSP] Failed to get diagnostics from ${language} server:`, error);
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
   * Find workspace root by looking for project markers
   */
  async findWorkspaceRoot(filepath) {
    const path = await import('path');
    const fs = await import('fs').then(m => m.promises);
    
    let currentDir = path.dirname(filepath);
    const root = path.parse(currentDir).root;
    
    // Look for common project markers
    const markers = [
      'package.json', 'tsconfig.json', '.git', 
      'pom.xml', 'build.gradle', 'build.gradle.kts', // Java
      'Cargo.toml', // Rust
      'go.mod', // Go
      'requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', // Python
      'composer.json', // PHP
      'Gemfile', // Ruby
      '.vscode', '.idea' // IDE folders
    ];
    
    while (currentDir !== root) {
      for (const marker of markers) {
        try {
          const markerPath = path.join(currentDir, marker);
          await fs.access(markerPath);
          // Found a project marker
          const workspaceUri = `file://${currentDir}`;
          this.workspaceRoots.set(filepath, workspaceUri);
          console.log(`[LSP] Found workspace root at ${currentDir}`);
          return workspaceUri;
        } catch {
          // Marker not found, continue
        }
      }
      currentDir = path.dirname(currentDir);
    }
    
    // No workspace root found, use file's directory
    const fallbackUri = `file://${path.dirname(filepath)}`;
    console.log(`[LSP] No workspace root found, using file directory`);
    return fallbackUri;
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