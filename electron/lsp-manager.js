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
    this.documentVersions = new Map(); // uri -> version number
    this.diagnostics = new Map(); // uri -> diagnostics array
    this.openDocuments = new Map(); // uri -> { version, language }
    this.unavailableServers = new Set(); // Track servers that failed to start
    
    // Increase max listeners to prevent warnings when multiple LSP servers start
    process.setMaxListeners(20);
    
    // Language server configurations
    this.serverConfigs = {
      typescript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
        languages: ['typescript', 'javascript', 'tsx', 'jsx'],
        install: 'npm install -g typescript-language-server typescript',
        // TypeScript-specific initialization options
        initOptions: {
          preferences: {
            includeCompletionsForModuleExports: false,
            includeCompletionsForImportStatements: true,
            includeCompletionsWithSnippetText: true,
            includeCompletionsWithInsertText: true,
            includeAutomaticOptionalChainCompletions: true,
            includeCompletionsWithClassMemberSnippets: true,
            includeCompletionsWithObjectLiteralMethodSnippets: true,
            allowIncompleteCompletions: true,
            importModuleSpecifierPreference: 'shortest',
            importModuleSpecifierEnding: 'auto',
            includePackageJsonAutoImports: 'auto',
            providePrefixAndSuffixTextForRename: true,
            allowRenameOfImportPath: true,
            quotePreference: 'auto',
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
        }
      },
      python: {
        command: 'pylsp',
        args: [],
        languages: ['python'],
        install: 'pip install python-lsp-server[all]',
        initOptions: {}
      },
      rust: {
        command: 'rust-analyzer',
        args: [],
        languages: ['rust'],
        install: 'rustup component add rust-analyzer',
        initOptions: {}
      },
      go: {
        command: 'gopls',
        args: [],
        languages: ['go'],
        install: 'go install golang.org/x/tools/gopls@latest',
        initOptions: {}
      },
      java: {
        command: 'jdtls',
        args: [],
        languages: ['java'],
        install: 'https://download.eclipse.org/jdtls/downloads/',
        initOptions: {}
      },
      cpp: {
        command: 'clangd',
        args: [],
        languages: ['cpp', 'c', 'cc', 'cxx', 'h', 'hpp'],
        install: 'apt-get install clangd / brew install llvm',
        initOptions: {}
      },
      vue: {
        command: 'vue-language-server',
        args: ['--stdio'],
        languages: ['vue'],
        install: 'npm install -g @vue/language-server @vue/typescript-plugin',
        // Vue Language Server v3 specific configuration
        initOptions: {
          typescript: {
            tsdk: null, // Will be set dynamically
            // Enable TypeScript plugin for Vue files
            enablePlugin: true
          },
          vue: {
            // Hybrid mode is now always on in v3 (Vue handles template/style, TS handles script)
            hybridMode: false, // Vue v2 doesn't use hybrid mode
            // Enable all features
            inlayHints: {
              missingProps: true,
              inlineHandlerLeading: true,
              optionsWrapper: true
            },
            // Additional Vue-specific settings
            includeLanguages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
            additionalExtensions: ['.vue'],
            defaultFormatterOptions: {
              'js-beautify-html': {
                wrap_attributes: 'force-expand-multiline'
              }
            }
          },
          // Additional options for better completion support
          documentFeatures: {
            documentColor: false,
            documentFormatting: {
              defaultPrintWidth: 100
            },
            documentSymbol: true,
            foldingRange: true,
            linkedEditingRange: true,
            selectionRange: true
          }
        }
      },
      html: {
        command: 'vscode-html-language-server',
        args: ['--stdio'],
        languages: ['html', 'htm'],
        install: 'npm install -g vscode-langservers-extracted',
        initOptions: {}
      },
      css: {
        command: 'vscode-css-language-server',
        args: ['--stdio'],
        languages: ['css', 'scss', 'less'],
        install: 'npm install -g vscode-langservers-extracted',
        initOptions: {}
      },
      json: {
        command: 'vscode-json-language-server',
        args: ['--stdio'],
        languages: ['json', 'jsonc'],
        install: 'npm install -g vscode-langservers-extracted',
        initOptions: {}
      }
    };
  }

  /**
   * Get language server for a file
   */
  async getServerForFile(filepath) {
    const language = this.detectLanguage(filepath);
    if (!language) return null;
    
    // Skip if we know this server is unavailable
    if (this.unavailableServers.has(language)) {
      return null;
    }
    
    // Check if server is already running
    if (this.connections.has(language)) {
      return this.connections.get(language);
    }
    
    // Start new server with workspace URI
    const workspaceUri = await this.findWorkspaceRoot(filepath);
  
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
    // Skip if we know this server is unavailable
    if (this.unavailableServers.has(language)) {
      return null;
    }
    
    const config = this.serverConfigs[language];
    if (!config) {
      throw new Error(`No language server configured for ${language}`);
    }
    
  
    
    // For Vue, dynamically find TypeScript SDK and ensure TypeScript server is also running
    if (language === 'vue') {
      if (!config.initOptions.typescript.tsdk) {
        try {
          const { execSync } = await import('child_process');
          const npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
          const tsdk = `${npmRoot}/typescript/lib`;
          config.initOptions.typescript.tsdk = tsdk;
        
        } catch (e) {
          console.warn('[LSP] Could not find TypeScript SDK, Vue completions might not work');
        }
      }
      
      // Skip TypeScript server for now - let's test Vue server alone
    
    }
    
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
        const errorMsg = data.toString();
        console.error(`[LSP] ${language} server error:`, errorMsg);
        
        // Log Vue-specific errors in detail
        if (language === 'vue' && errorMsg.includes('Error')) {
          console.error(`[LSP] Vue server detailed error:`, errorMsg);
        }
      });
      
      serverProcess.on('error', (err) => {
        // Only log error once, not repeatedly
        if (!this.servers.has(language)) {
          return; // Already handled
        }
        console.error(`[LSP] Failed to start ${language} server:`, err);
        this.handleServerError(language, err);
      });
      
      serverProcess.on('exit', (code) => {
      
        this.connections.delete(language);
        this.servers.delete(language);
      });
      
      // Handle requests from the server
      connection.onRequest((method, params) => {
      
        
        // Handle Vue-specific requests
        if (method === '_vue:projectInfo') {
        
          // Vue LS needs detailed project info for completions to work
          return {
            version: 1,
            appInfo: {
              name: 'Clode Studio',
              version: '1.0.0'
            }
          };
        }
        
        switch (method) {
          case 'client/registerCapability':
            // Vue Language Server wants to register capabilities dynamically
            // We'll accept all capability registrations
          
            return {}; // Empty response indicates success
            
          case 'window/showMessage':
          
            return null;
            
          case 'window/showMessageRequest':
          
            // Return the first action if available
            return params.actions ? params.actions[0] : null;
            
          case 'window/logMessage':
          
            return null;
            
          case 'window/showMessage':
          
            return null;
            
          case 'workspace/configuration':
          
            // Return configuration based on what's requested
            if (params.items) {
              return params.items.map(item => {
              
                
                // Vue Language Server might request specific configurations
                if (item.section === 'vue' || item.section === 'volar') {
                  return {
                    // Basic Vue/Volar configuration
                    hybridMode: false,
                    completion: {
                      autoImportComponent: true,
                      scaffoldSnippets: {
                        vueTemplate: true,
                        vueScript: true,
                        vueStyle: true
                      }
                    }
                  };
                } else if (item.section === 'http') {
                  // Vue server requests http configuration for downloading TypeScript lib files
                  return {
                    proxy: '',
                    proxyStrictSSL: true
                  };
                } else if (item.section === 'html.customData') {
                  // Vue Language Server v2 expects an array
                  return [];
                } else if (item.section === 'html.completion') {
                  // HTML completion settings
                  return {
                    attributeDefaultValue: 'doublequotes',
                    autoClosingTags: true
                  };
                } else if (item.section === 'html') {
                  // General HTML settings
                  return {
                    customData: [],
                    completion: {
                      attributeDefaultValue: 'doublequotes',
                      autoClosingTags: true
                    }
                  };
                } else if (item.section === 'vue.complete.casing.props') {
                  // Vue completion casing for props
                  return 'kebab';
                } else if (item.section === 'vue.complete.casing.tags') {
                  // Vue completion casing for tags
                  return 'kebab';
                } else if (item.section === 'vue') {
                  // General Vue configuration
                  return {
                    complete: {
                      casing: {
                        props: 'kebab',
                        tags: 'kebab'
                      }
                    },
                    autoInsert: {
                      dotValue: true,
                      bracketSpacing: true
                    }
                  };
                } else if (item.section === 'javascript' || item.section === 'js/ts') {
                  // JavaScript/TypeScript configuration for Vue script blocks
                  return {
                    suggest: {
                      completeFunctionCalls: true,
                      includeCompletionsForModuleExports: true,
                      names: true,
                      paths: true,
                      autoImports: true,
                      includeAutomaticOptionalChainCompletions: true
                    },
                    preferences: {
                      importModuleSpecifier: 'shortest',
                      includePackageJsonAutoImports: 'auto',
                      quoteStyle: 'single'
                    }
                  };
                } else if (item.section === 'css.customData') {
                  // CSS custom data for Vue style blocks - must be an array
                  return [];
                } else if (item.section === 'css.completion') {
                  // CSS completion settings
                  return {
                    triggerPropertyValueCompletion: true,
                    completePropertyWithSemicolon: true
                  };
                } else if (item.section === 'css') {
                  // General CSS settings
                  return {
                    customData: [],
                    completion: {
                      triggerPropertyValueCompletion: true,
                      completePropertyWithSemicolon: true
                    },
                    validate: true
                  };
                } else if (item.section === 'scss.customData') {
                  // SCSS custom data - must be an array
                  return [];
                } else if (item.section === 'scss') {
                  // SCSS settings
                  return {
                    customData: [],
                    validate: true
                  };
                } else if (item.section === 'less.customData') {
                  // LESS custom data - must be an array
                  return [];
                } else if (item.section === 'less') {
                  // LESS settings
                  return {
                    customData: [],
                    validate: true
                  };
                } else if (item.section === 'typescript') {
                  return {
                    tsdk: config.initOptions?.typescript?.tsdk || null,
                    inlayHints: {
                      includeInlayParameterNameHints: 'none',
                      includeInlayParameterNameHintsWhenArgumentMatchesName: false,
                      includeInlayFunctionParameterTypeHints: false,
                      includeInlayVariableTypeHints: false,
                      includeInlayPropertyDeclarationTypeHints: false,
                      includeInlayFunctionLikeReturnTypeHints: false,
                      includeInlayEnumMemberValueHints: false
                    },
                    preferences: {
                      includeCompletionsForModuleExports: true,
                      includeCompletionsWithInsertText: true
                    }
                  };
                } else if (item.section === 'javascript') {
                  return {
                    preferences: {
                      includeCompletionsForModuleExports: true,
                      includeCompletionsWithInsertText: true
                    }
                  };
                }
                return {};
              });
            }
            return [];
            
          case 'workspace/applyEdit':
          
            // Accept the edit
            return { applied: true };
            
          default:
            console.warn(`[LSP] Unhandled request method: ${method}`, params);
            // For unhandled methods, return appropriate response
            if (method.startsWith('vue/') || method.startsWith('volar/')) {
              // Vue-specific methods - return empty object
              return {};
            }
            // Return null for other unhandled methods
            return null;
        }
      });
      
      // Handle notifications from the server
      connection.onNotification((method, params) => {
        // Only log non-diagnostic notifications to reduce spam
        if (method !== 'textDocument/publishDiagnostics') {
        
        }
        
        switch (method) {
          case 'textDocument/publishDiagnostics':
            // Store diagnostics
            const prevDiagnostics = this.diagnostics.get(params.uri);
            const newDiagnostics = params.diagnostics || [];
            
            // Only log if diagnostics changed
            const changed = !prevDiagnostics || 
                          prevDiagnostics.length !== newDiagnostics.length ||
                          JSON.stringify(prevDiagnostics) !== JSON.stringify(newDiagnostics);
            
            if (changed) {
            
              
              // Log detailed diagnostic info for Vue files with errors
              if (params.uri.endsWith('.vue') && newDiagnostics.length > 0) {
                 console.log('[LSP] Vue diagnostics details:', newDiagnostics.map(d => ({
                  message: d.message,
                  line: d.range.start.line,
                  character: d.range.start.character,
                  source: d.source
                })));
              }
            }
            
            this.diagnostics.set(params.uri, newDiagnostics);
            break;
            
          case 'window/logMessage':
          
            break;
            
          case '$/progress':
            // Handle progress notifications
          
            break;
            
          default:
            // Only log Vue-specific unhandled notifications in detail
            if (language === 'vue' && !method.startsWith('$/')) {
            
            } else if (!method.startsWith('$/') && !method.startsWith('tsserver/')) {
            
            }
        }
      });
      
      // Start listening
      connection.listen();
      
      // Initialize the server with server-specific options
      const initResult = await connection.sendRequest(lsp.InitializeRequest.type, {
        processId: process.pid,
        clientInfo: {
          name: 'Clode Studio',
          version: '1.0.0'
        },
        rootUri: workspaceUri || null,
        rootPath: workspaceUri ? new URL(workspaceUri).pathname : null,
        // Use server-specific initialization options
        initializationOptions: language === 'vue' ? {
          ...config.initOptions,
          // Vue Language Server v3 specific initialization
          serverMode: 0, // 0 = Semantic, 1 = Syntactic, 2 = PartialSemantic
          diagnosticMode: 1, // 0 = None, 1 = Semantic, 2 = Syntactic
          textDocumentSync: 2,
          typescript: {
            tsdk: config.initOptions.typescript.tsdk,
            serverPath: config.initOptions.typescript.tsdk ? `${config.initOptions.typescript.tsdk}/tsserver.js` : undefined
          }
        } : (config.initOptions || {}),
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
            },
            synchronization: {
              dynamicRegistration: true,
              willSave: true,
              willSaveWaitUntil: true,
              didSave: true
            }
          },
          workspace: {
            workspaceFolders: true,
            didChangeConfiguration: {
              dynamicRegistration: true
            },
            configuration: true,
            didChangeWatchedFiles: {
              dynamicRegistration: true
            }
          }
        },
        // Add workspace folders if available
        workspaceFolders: workspaceUri ? [{
          uri: workspaceUri,
          name: workspaceUri.split('/').pop() || 'workspace'
        }] : null
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
      
    
      
      // For Vue, send a didChangeConfiguration notification to trigger full initialization
      if (language === 'vue') {
        await connection.sendNotification('workspace/didChangeConfiguration', {
          settings: {
            vue: {
              inlayHints: {
                missingProps: true,
                inlineHandlerLeading: true,
                optionsWrapper: true
              }
            },
            typescript: {
              tsdk: config.initOptions.typescript.tsdk,
              preferences: {
                includeCompletionsForModuleExports: true,
                includeCompletionsWithInsertText: true
              }
            },
            volar: {
              autoCompleteRefs: true,
              codeLens: {
                pugTools: true,
                scriptSetupTools: true
              }
            }
          }
        });
      
        
        // Try to trigger Vue server initialization with a command
        try {
          await connection.sendRequest('workspace/executeCommand', {
            command: 'volar.action.restartServer'
          });
        
        } catch (e) {
          // Command might not exist, that's ok
        }
        
        // Give Vue server more time to initialize with TypeScript
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Debug Vue server capabilities
      if (language === 'vue') {
        // console.log(`[LSP] Vue server capabilities:`, {
        //   hasCompletion: !!initResult.capabilities.completionProvider,
        //   completionTriggerChars: initResult.capabilities.completionProvider?.triggerCharacters,
        //   hasHover: !!initResult.capabilities.hoverProvider,
        //   hasDefinition: !!initResult.capabilities.definitionProvider
        // });
      }
      
      return connection;
    } catch (error) {
      // Clean up and mark as unavailable
      this.handleServerError(language, error);
      return null; // Return null instead of throwing to prevent cascading errors
    }
  }

  /**
   * Handle server startup errors
   */
  handleServerError(language, error) {
    const config = this.serverConfigs[language];
    
    // Clean up any existing connection/server to prevent stream errors
    const connection = this.connections.get(language);
    if (connection) {
      try {
        connection.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
      this.connections.delete(language);
    }
    
    const server = this.servers.get(language);
    if (server) {
      try {
        server.kill();
      } catch (e) {
        // Ignore kill errors
      }
      this.servers.delete(language);
    }
    
    if (error.code === 'ENOENT') {
      console.log(`[LSP] ${language} server not found. Install with: ${config.install}`);
      // Mark this language as unavailable to prevent repeated attempts
      this.unavailableServers.add(language);
    }
  }

  /**
   * Get completions from LSP
   */
  async getCompletions(filepath, content, position, context = null) {
    // Extract triggerCharacter from context if provided, otherwise use the parameter
    const triggerCharacter = context?.triggerCharacter || null;
    const language = this.detectLanguage(filepath);
    if (!language) return [];
    
    // Ensure we have content
    if (!content) {
      console.warn('[LSP] No content provided for completions');
      return [];
    }
    
    // Debug logging for Vue files
    if (language === 'vue') {
      // console.log(`[LSP] Vue file completion request:`, {
      //   filepath,
      //   position,
      //   triggerCharacter,
      //   contentLength: content.length,
      //   contentPreview: content.substring(0, 200)
      // });
    }
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return [];
    
    try {
      // First, notify the server about the file content
      const uri = `file://${filepath}`;
      
      // Get or initialize document version
      let version = this.documentVersions.get(uri) || 0;
      version++;
      this.documentVersions.set(uri, version);
      
      const docInfo = this.openDocuments.get(uri);
      
      if (!docInfo || docInfo.language !== language) {
        // Close old document if it was open with different language
        if (docInfo) {
          await connection.sendNotification(lsp.DidCloseTextDocumentNotification.type, {
            textDocument: { uri }
          });
        }
        
        // Send document open notification for new document
        await connection.sendNotification(lsp.DidOpenTextDocumentNotification.type, {
          textDocument: {
            uri,
            languageId: language === 'vue' ? 'vue' : language,
            version,
            text: content
          }
        });
        this.openDocuments.set(uri, { version, language });
        
        // For Vue files, wait longer for initial processing
        if (language === 'vue') {
        
          await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms
        }
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
        this.openDocuments.set(uri, { version, language });
      }
      
      // Give LSP time to process the changes
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Build completion context with proper trigger
      let completionContext;
      
      // Common trigger characters - expand for Vue templates
      const triggerChars = ['.', '(', '[', '{', '"', "'", ':', '/', '<', '>', '@', '#', ' ', '-', '='];
      
      // Check if we have a trigger character
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
      // For Vue directives and HTML attributes, include hyphens in the word match
      const currentWord = beforeCursor.match(/([\w-]+)$/)?.[1] || '';
      
      // Debug logging for completion context (commented out to reduce noise)
      // console.log('[LSP Manager] Completion context:', {
      //   filepath,
      //   position,
      //   triggerCharacter,
      //   beforeCursor,
      //   currentWord,
      //   completionContext
      // });
      
      // Log the request details for Vue (commented out to reduce noise)
      if (language === 'vue') {
        // console.log(`[LSP] Sending Vue completion request:`, {
        //   uri,
        //   originalPosition: position,
        //   lspPosition: {
        //     line: position.line - 1,
        //     character: position.character
        //   },
        //   context: completionContext,
        //   currentLine: currentLine.substring(0, 50) + '...',
        //   currentWord
        // });
      }
      
      // Add timeout for completion request
      // For Vue, try using the raw method name instead of the typed request
      const completionPromise = language === 'vue' 
        ? connection.sendRequest('textDocument/completion', {
            textDocument: { uri },
            position: {
              line: position.line - 1, // LSP uses 0-based lines
              character: position.character
            },
            context: completionContext
          })
        : connection.sendRequest(lsp.CompletionRequest.type, {
            textDocument: { uri },
            position: {
              line: position.line - 1, // LSP uses 0-based lines
              character: position.character
            },
            context: completionContext
          });
      
      // Set a longer timeout for Vue files as they need more processing
      const timeout = language === 'vue' ? 10000 : 2000; // 10s for Vue, 2s for others
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Completion request timeout')), timeout)
      );
      
      let completions;
      try {
        completions = await Promise.race([completionPromise, timeoutPromise]);
      } catch (timeoutError) {
        if (language === 'vue') {
        
        }
        // Return empty completions on timeout
        completions = [];
      }
      
      // Debug Vue completions
      if (language === 'vue') {
        // console.log(`[LSP] Vue completions received:`, {
        //   hasCompletions: !!completions,
        //   isArray: Array.isArray(completions),
        //   hasItems: !!(completions && completions.items),
        //   count: Array.isArray(completions) ? completions.length : (completions?.items?.length || 0),
        //   firstFew: completions?.items ? completions.items.slice(0, 3).map(i => i.label) : 
        //             Array.isArray(completions) ? completions.slice(0, 3).map(i => i.label) : [],
        //   raw: completions // Log raw response to see what we're getting
        // });
        
        // If we got timeout, try a simple hover request to test if server is responsive
        if (completions.length === 0) {
        
          try {
            const hoverTest = await connection.sendRequest(lsp.HoverRequest.type, {
              textDocument: { uri },
              position: {
                line: position.line - 1,
                character: position.character
              }
            });
          
          } catch (e) {
          
          }
        }
      }
      
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
      
      const result = limitedItems.map(item => this.convertLSPCompletion(item));
      
      // Debug final result for Vue
      if (language === 'vue') {
        // console.log(`[LSP] Vue completions final result:`, {
          //count: result.length,
        //  firstFew: result.slice(0, 3).map(r => ({ label: r.label, kind: r.kind }))
        //});
      }
      
      return result;
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
      
      // Check if document is already open
      const isOpen = this.openDocuments.has(uri);
      
      if (!isOpen) {
        // Open the document
        await connection.sendNotification(lsp.DidOpenTextDocumentNotification.type, {
          textDocument: {
            uri,
            languageId: language,
            version: 1,
            text: content
          }
        });
        this.openDocuments.set(uri, { version: 1, language });
        this.documentVersions.set(uri, 1);
      } else {
        // Update the document content
        const currentVersion = this.documentVersions.get(uri) || 1;
        const newVersion = currentVersion + 1;
        
        await connection.sendNotification(lsp.DidChangeTextDocumentNotification.type, {
          textDocument: {
            uri,
            version: newVersion
          },
          contentChanges: [{
            text: content
          }]
        });
        
        this.documentVersions.set(uri, newVersion);
      }
      
      // Give the server a moment to process and send diagnostics
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Return stored diagnostics for this file
      // LSP servers send diagnostics via notifications after document changes
      const diagnostics = this.diagnostics.get(uri) || [];
    
      
      return diagnostics;
    } catch (error) {
      console.error(`[LSP] Failed to get diagnostics from ${language} server:`, error);
      return [];
    }
  }

  /**
   * Close a document
   */
  async closeDocument(filepath) {
    const language = this.detectLanguage(filepath);
    if (!language) return;
    
    const connection = this.connections.get(language);
    if (!connection) return;
    
    try {
      const uri = `file://${filepath}`;
      
      // Remove from open documents
      this.openDocuments.delete(uri);
      
      // Send close notification to LSP
      await connection.sendNotification(lsp.DidCloseTextDocumentNotification.type, {
        textDocument: { uri }
      });
      
      // Clear diagnostics for this file
      this.diagnostics.delete(uri);
      
    
    } catch (error) {
      console.error(`[LSP] Failed to close document:`, error);
    }
  }

  /**
   * Execute a code action
   */
  async executeCodeAction(filepath, action) {
    const language = this.detectLanguage(filepath);
    if (!language) return null;
    
    const connection = await this.getServerForFile(filepath);
    if (!connection) return null;
    
    try {
      // Execute the code action
      const result = await connection.sendRequest('workspace/executeCommand', {
        command: action.command,
        arguments: action.arguments
      });
      
      return result;
    } catch (error) {
      console.error(`[LSP] Failed to execute code action:`, error);
      return null;
    }
  }

  /**
   * Shutdown all language servers
   */
  async shutdown() {
  
    
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
        
          return workspaceUri;
        } catch {
          // Marker not found, continue
        }
      }
      currentDir = path.dirname(currentDir);
    }
    
    // No workspace root found, use file's directory
    const fallbackUri = `file://${path.dirname(filepath)}`;
  
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
  
  /**
   * Find npm global root directory
   */
  async findNpmRoot() {
    try {
      const { execSync } = await import('child_process');
      return execSync('npm root -g', { encoding: 'utf8' }).trim();
    } catch (e) {
      // Fallback to common locations
      const path = await import('path');
      const os = await import('os');
      const platform = os.platform();
      
      if (platform === 'win32') {
        return path.join(process.env.APPDATA || '', 'npm', 'node_modules');
      } else {
        return '/usr/local/lib/node_modules';
      }
    }
  }
}

// Export singleton instance
export const lspManager = new LSPManager();