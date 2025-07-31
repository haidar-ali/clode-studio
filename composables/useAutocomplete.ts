import { ref, computed, shallowRef } from 'vue';
import { autocompletion, type CompletionContext as CMCompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import { useAutocompleteStore } from '~/stores/autocomplete';
import { useEditorStore } from '~/stores/editor';
import type { CompletionContext, CompletionRequest, CompletionItem } from '~/types/autocomplete';
import { v4 as uuidv4 } from 'uuid';

export function useAutocomplete() {
  const autocompleteStore = useAutocompleteStore();
  const editorStore = useEditorStore();
  
  // State
  const isLoading = ref(false);
  const currentRequest = shallowRef<CompletionRequest | null>(null);
  const activeAbortController = shallowRef<AbortController | null>(null);
  const lastCompletionResult = shallowRef<CompletionResult | null>(null);
  
  // Convert CodeMirror context to our extended context
  const createCompletionContext = (cmContext: CMCompletionContext): CompletionContext => {
    const activeTab = editorStore.activeTab;
    console.log('[Autocomplete] Active tab:', activeTab ? { id: activeTab.id, path: activeTab.path, filepath: activeTab.filepath, language: activeTab.language } : 'none');
    const pos = cmContext.pos;
    const line = cmContext.state.doc.lineAt(pos);
    const lineNumber = line.number;
    const column = pos - line.from;
    
    // Get prefix and suffix
    const prefix = cmContext.state.doc.sliceString(Math.max(0, pos - 1000), pos);
    const suffix = cmContext.state.doc.sliceString(pos, Math.min(cmContext.state.doc.length, pos + 1000));
    
    // Detect language from file extension or tab metadata
    // Note: EditorTab uses 'path' not 'filepath'
    const filepath = activeTab?.path || activeTab?.filepath || '';
    let language = detectLanguage(filepath);
    
    // If no language detected from filepath, try tab's language property
    if (language === 'text' && activeTab?.language) {
      // Map common language names to our expected format
      const langMap: Record<string, string> = {
        'TypeScript': 'typescript',
        'JavaScript': 'typescript', // TypeScript server handles JS
        'Python': 'python',
        'Rust': 'rust',
        'Go': 'go',
        'Vue': 'vue',
        'HTML': 'html',
        'CSS': 'css',
        'JSON': 'json'
      };
      language = langMap[activeTab.language] || activeTab.language.toLowerCase();
    }
    
    return {
      state: cmContext.state,
      pos: cmContext.pos,
      explicit: cmContext.explicit,
      language,
      filepath,
      prefix,
      suffix,
      line: lineNumber,
      column,
      triggerKind: cmContext.explicit ? 'manual' : 'automatic'
    };
  };
  
  // Main completion source for CodeMirror
  const completionSource = async (cmContext: CMCompletionContext): Promise<CompletionResult | null> => {
    if (!autocompleteStore.settings.enabled) {
      return null;
    }
    
    // Cancel any pending request
    if (activeAbortController.value) {
      activeAbortController.value.abort();
      activeAbortController.value = null;
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    activeAbortController.value = abortController;
    
    // Create context
    const context = createCompletionContext(cmContext);
    
    // Debug logging only in development
    if (process.dev) {
      console.log('[Autocomplete] Completion triggered:', {
        language: context.language,
        position: context.pos,
        explicit: context.explicit,
        filepath: context.filepath
      });
    }
    
    // Check cache first
    const cacheKey = autocompleteStore.cacheKey(context.language, context.prefix, context.suffix);
    const cached = autocompleteStore.getCachedCompletion(cacheKey);
    if (cached && cached.length > 0) {
      console.log('[Autocomplete] Found cached completions:', cached.length);
      // Calculate the correct 'from' position for cached results too
      const lineText = context.prefix.split('\n').pop() || '';
      const wordMatch = lineText.match(/(\w*)$/);
      const currentWord = wordMatch ? wordMatch[1] : '';
      const fromPos = context.pos - currentWord.length;
      
      return {
        from: fromPos,
        options: cached.map(item => convertToCodeMirrorCompletion(item)),
        filter: false,
        validFor: /^[\w.]*$/ // Keep showing for word characters and dots
      };
    }
    
    // Create request - exclude non-serializable properties for IPC
    const request: CompletionRequest = {
      id: uuidv4(),
      context: {
        // Don't send the CodeMirror state object
        pos: context.pos,
        explicit: context.explicit,
        language: context.language,
        filepath: context.filepath,
        prefix: context.prefix,
        suffix: context.suffix,
        line: context.line,
        column: context.column,
        triggerKind: context.triggerKind
      },
      // Filter out Claude since it's now handled by ghost text
      providers: autocompleteStore.enabledProviders.filter(p => p !== 'claude'),
      timeout: 1000 // Shorter timeout for LSP-only completions
      // Don't send signal - it's not serializable
    };
    
    currentRequest.value = request;
    isLoading.value = true;
    autocompleteStore.setActive(true);
    autocompleteStore.updateLastRequestTime();
    
    // Claude is now handled by ghost text, not in dropdown
    
    try {
      console.log('[Autocomplete] Requesting completions with providers:', request.providers);
      
      // Use the full completion service for now - progressive loading will be handled there
      const completions = await getCompletions(request);
      
      if (completions.length === 0) {
        console.log('[Autocomplete] No completions available');
        return null;
      }
      
      console.log('[Autocomplete] Got completions:', completions.length);
      
      // Cache successful completions
      if (completions.length > 0) {
        autocompleteStore.setCachedCompletion(cacheKey, completions, {
          language: context.language,
          fileHash: '',
          position: context.pos
        });
      }
      
      // Update active completions in store
      autocompleteStore.setActiveCompletions(completions);
      
      // Convert to CodeMirror format
      const cmCompletions = completions.map(item => convertToCodeMirrorCompletion(item));
      
      // Calculate the correct 'from' position by finding the start of the current word
      const lineText = context.prefix.split('\n').pop() || '';
      const wordMatch = lineText.match(/(\w*)$/);
      const currentWord = wordMatch ? wordMatch[1] : '';
      const fromPos = context.pos - currentWord.length;
      
      console.log('[Autocomplete] Current word:', currentWord, 'from position:', fromPos, 'to:', context.pos);
      
      const result = {
        from: fromPos, // Start of current word, not cursor position
        options: cmCompletions,
        filter: false, // We handle our own filtering
        validFor: /^[\w.]*$/ // Keep showing for word characters and dots
      };
      
      // Store the result for potential reuse
      lastCompletionResult.value = result;
      
      console.log('[Autocomplete] Returning completion result with', cmCompletions.length, 'options');
      return result;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[Autocomplete] Completion error:', error);
        return null;
      } else {
        console.log('[Autocomplete] Request aborted, returning last result if available');
        // Return the last successful result to keep the dropdown open
        return lastCompletionResult.value;
      }
    } finally {
      isLoading.value = false;
      currentRequest.value = null;
      activeAbortController.value = null;
      autocompleteStore.setActive(false);
    }
  };
  
  // Get completions from all enabled providers
  const getCompletions = async (request: CompletionRequest): Promise<CompletionItem[]> => {
    console.log('[Autocomplete] getCompletions called with providers:', request.providers);
    
    if (!window.electronAPI?.autocomplete) {
      console.warn('[Autocomplete] Autocomplete API not available');
      return [];
    }
    
    try {
      const response = await window.electronAPI.autocomplete.getCompletion(request);
      console.log('[Autocomplete] Service response:', response);
      return response.items || [];
    } catch (error) {
      console.error('[Autocomplete] Service error:', error);
      return [];
    }
    
    
    // Final deduplication and ranking
    return rankAndDeduplicate(results);
  };
  
  // Get LSP completions directly (fast path)
  const getLSPCompletions = async (request: CompletionRequest): Promise<CompletionItem[]> => {
    if (!window.electronAPI?.autocomplete) {
      return [];
    }
    
    try {
      // Direct LSP-only request
      const lspRequest = {
        ...request,
        providers: ['lsp'], // Only LSP
        timeout: 500 // Short timeout for instant response
      };
      
      const response = await window.electronAPI.autocomplete.getCompletion(lspRequest);
      return response.items?.filter(item => item.source === 'lsp') || [];
    } catch (error) {
      console.error('[Autocomplete] LSP completion error:', error);
      return [];
    }
  };
  
  // Get Claude completions
  const getClaudeCompletions = async (request: CompletionRequest): Promise<CompletionItem[]> => {
    console.log('[Autocomplete] Getting Claude completions for:', request.context.language, 'at position', request.context.pos);
    
    if (!window.electronAPI?.autocomplete) {
      console.warn('[Autocomplete] Autocomplete API not available in window.electronAPI');
      return [];
    }
    
    const startTime = Date.now();
    
    try {
      const response = await window.electronAPI.autocomplete.getCompletion(request);
      console.log('[Autocomplete] Claude response:', response);
      
      // Track metrics
      const latency = Date.now() - startTime;
      autocompleteStore.updateMetrics('claude-streaming', latency, true);
      
      if (!response.items || response.items.length === 0) {
        console.log('[Autocomplete] No completion items returned from Claude');
      }
      
      return response.items || [];
    } catch (error) {
      console.error('[Autocomplete] Claude completion error:', error);
      // Track failure
      const latency = Date.now() - startTime;
      autocompleteStore.updateMetrics('claude-streaming', latency, false);
      throw error;
    }
  };
  
  // Convert our completion item to CodeMirror completion
  const convertToCodeMirrorCompletion = (item: CompletionItem): Completion => {
    return {
      label: item.label || item.text,
      type: getCompletionType(item),
      apply: item.insertText || item.label || item.text, // Use the full completion text
      detail: item.detail,
      info: item.documentation,
      boost: item.confidence ? item.confidence / 100 : 0,
      // Pass through custom properties
      source: item.source
    } as Completion & { source?: string };
  };
  
  // Get completion type for icon
  const getCompletionType = (item: CompletionItem): string => {
    // Map sources to CodeMirror completion types
    switch (item.source) {
      case 'lsp':
        return 'variable'; // Will be more specific when LSP is implemented
      case 'claude-streaming':
      case 'claude-cached':
        return 'text';
      case 'local-cache':
        return 'keyword';
      default:
        return 'text';
    }
  };
  
  // Rank and deduplicate completions
  const rankAndDeduplicate = (items: CompletionItem[]): CompletionItem[] => {
    // Remove exact duplicates
    const seen = new Set<string>();
    const unique = items.filter(item => {
      const key = item.text;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Sort by confidence and source priority
    const sourcePriority = {
      'lsp': 3,
      'claude-cached': 2,
      'claude-streaming': 1,
      'local-cache': 0
    };
    
    return unique.sort((a, b) => {
      // First by confidence if available
      if (a.confidence !== undefined && b.confidence !== undefined) {
        return b.confidence - a.confidence;
      }
      
      // Then by source priority
      return (sourcePriority[b.source] || 0) - (sourcePriority[a.source] || 0);
    }).slice(0, autocompleteStore.settings.ui.maxSuggestions);
  };
  
  // Detect language from filepath
  const detectLanguage = (filepath: string): string => {
    const ext = filepath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'js': 'typescript', // TypeScript server handles JS too
      'jsx': 'typescript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'r': 'r',
      'lua': 'lua',
      'dart': 'dart',
      'vue': 'vue',
      'md': 'markdown',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'fish': 'bash',
      'ps1': 'powershell',
      'yml': 'yaml',
      'yaml': 'yaml',
      'toml': 'toml',
      'ini': 'ini',
      'cfg': 'ini',
      'conf': 'ini'
    };
    
    return languageMap[ext] || 'text';
  };
  
  // Create CodeMirror extension
  const createAutocompleteExtension = () => {
    console.log('[Autocomplete] Creating autocomplete extension');
    return autocompletion({
      override: [completionSource],
      defaultKeymap: true, // Enable default keymap for arrow key navigation
      closeOnBlur: false, // Keep popup open when clicking inside the editor
      activateOnTyping: true,
      selectOnOpen: true,
      aboveCursor: false,
      icons: true,
      activateOnTypingDelay: 0, // Instant activation
      interactionDelay: 0, // No delay for interaction
      updateSyncTime: 100, // Update every 100ms
      addToOptions: [
        {
          render: (completion: Completion) => {
            const container = document.createElement('div');
            container.className = 'cm-completion-custom';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.width = '100%';
            container.style.gap = '8px';
            
            // Add label
            const labelEl = document.createElement('span');
            labelEl.className = 'cm-completionLabel';
            labelEl.textContent = completion.label;
            labelEl.style.flex = '1';
            container.appendChild(labelEl);
            
            // Add source indicator if enabled
            if (autocompleteStore.settings.ui.showSource && (completion as any).source) {
              const sourceEl = document.createElement('span');
              sourceEl.className = 'cm-completion-source';
              const source = (completion as any).source;
              
              // Format source display
              const sourceText = source === 'lsp' ? 'LSP' : 
                                source === 'claude-streaming' ? 'Claude' :
                                source === 'claude-cached' ? 'Claude (cached)' :
                                source === 'local-cache' ? 'Local' : source;
              sourceEl.textContent = sourceText;
              
              // Style the source badge
              sourceEl.style.fontSize = '10px';
              sourceEl.style.padding = '2px 6px';
              sourceEl.style.borderRadius = '3px';
              sourceEl.style.background = source === 'lsp' ? '#4ec9b0' : 
                                         source.includes('claude') ? '#007acc' : 
                                         '#6c757d';
              sourceEl.style.color = 'white';
              sourceEl.style.fontWeight = '500';
              
              container.appendChild(sourceEl);
            }
            
            // Add confidence indicator if enabled
            if (autocompleteStore.settings.ui.showConfidence && (completion as any).confidence) {
              const confEl = document.createElement('span');
              confEl.className = 'cm-completion-confidence';
              confEl.textContent = `${(completion as any).confidence}%`;
              confEl.style.fontSize = '10px';
              confEl.style.opacity = '0.7';
              confEl.style.marginLeft = '4px';
              container.appendChild(confEl);
            }
            
            return container;
          },
          position: 100
        }
      ]
    });
  };
  
  return {
    isLoading: computed(() => isLoading.value),
    currentRequest: computed(() => currentRequest.value),
    completionSource,
    createAutocompleteExtension,
    
    // Utilities
    detectLanguage
  };
}