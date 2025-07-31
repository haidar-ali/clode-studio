import { defineStore } from 'pinia';

export type CompletionProvider = 'lsp' | 'claude' | 'cache' | 'hybrid';
export type CompletionSource = 'lsp' | 'claude-streaming' | 'claude-cached' | 'local-cache';

export interface CompletionItem {
  id: string;
  text: string;
  label?: string;
  detail?: string;
  documentation?: string;
  source: CompletionSource;
  confidence?: number;
  latency?: number;
  insertText?: string;
  range?: {
    from: number;
    to: number;
  };
}

export interface AutocompleteSettings {
  enabled: boolean;
  providers: {
    lsp: {
      enabled: boolean;
      timeout: number;
      servers: Map<string, LSPServerConfig>;
    };
    claude: {
      enabled: boolean;
      timeout: number;
      streaming: boolean;
      contextLines: number;
      useCache: boolean;
      cacheTTL: number;
      model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';
    };
    cache: {
      enabled: boolean;
      maxSize: number;
      ttl: number;
    };
  };
  ui: {
    maxSuggestions: number;
    showSource: boolean;
    showConfidence: boolean;
    showLatency: boolean;
    debounceDelay: number;
  };
  privacy: {
    mode: 'offline' | 'selective' | 'full';
    fileWhitelist: string[];
    neverSendPatterns: string[];
  };
}

export interface LSPServerConfig {
  name: string;
  url: string;
  languages: string[];
  capabilities: string[];
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
}

export interface PerformanceMetrics {
  avgLatency: {
    lsp: number;
    claude: number;
    cache: number;
  };
  hitRate: {
    cache: number;
    claude: number;
  };
  successRate: {
    lsp: number;
    claude: number;
  };
  totalCompletions: number;
  lastUpdated: string;
}

interface CompletionCache {
  key: string;
  items: CompletionItem[];
  timestamp: number;
  context: {
    language: string;
    fileHash: string;
    position: number;
  };
}

export const useAutocompleteStore = defineStore('autocomplete', {
  state: () => ({
    // Settings
    settings: {
      enabled: true,
      providers: {
        lsp: {
          enabled: true,
          timeout: 50,
          servers: new Map<string, LSPServerConfig>()
        },
        claude: {
          enabled: false, // Disabled by default - user can enable if needed
          timeout: 5000, // 5 seconds for quality completions
          streaming: true,
          contextLines: 100, // Industry standard for semantic understanding
          useCache: true,
          cacheTTL: 300000, // 5 minutes
          model: 'claude-sonnet-4-20250514' as const,
          includeImports: true, // Include file imports in context
          includeTypes: true, // Include type definitions
          semanticBoundaries: true // Use function/class boundaries instead of line counts
        },
        cache: {
          enabled: true,
          maxSize: 1000,
          ttl: 300000 // 5 minutes
        }
      },
      ui: {
        maxSuggestions: 10,
        showSource: true,
        showConfidence: false,
        showLatency: false,
        debounceDelay: 300,
        fontSize: 14
      },
      performance: {
        maxConcurrentRequests: 3,
        requestTimeout: 5000,
        cacheSize: 100,
        enablePrefetch: false
      },
      privacy: {
        mode: 'full' as const,
        fileWhitelist: [],
        neverSendPatterns: ['*.env', '*.key', '*.pem', '*secret*', '*password*']
      }
    } as AutocompleteSettings,

    // Runtime state
    isActive: false,
    currentProvider: null as CompletionProvider | null,
    activeCompletions: [] as CompletionItem[],
    lastRequestTime: 0, // Track when last completion was requested
    
    // Cache
    cache: new Map<string, CompletionCache>(),
    
    // Performance metrics
    metrics: {
      avgLatency: {
        lsp: 0,
        claude: 0,
        cache: 0
      },
      hitRate: {
        cache: 0,
        claude: 0
      },
      successRate: {
        lsp: 0,
        claude: 0
      },
      totalCompletions: 0,
      lastUpdated: new Date().toISOString()
    } as PerformanceMetrics,
    
    // Claude autocomplete instance state
    claudeInstanceId: null as string | null,
    claudeInstanceStatus: 'disconnected' as 'connected' | 'connecting' | 'disconnected' | 'error',
    
    // Claude SDK health status
    claudeSDKHealth: {
      available: false,
      status: 'unchecked' as 'unchecked' | 'ready' | 'error' | 'sdk-error',
      lastChecked: null as Date | null,
      error: null as string | null
    },
    
    // Session tracking
    sessionMetrics: {
      startTime: Date.now(),
      completionCounts: new Map<CompletionSource, number>(),
      errorCounts: new Map<CompletionSource, number>()
    },
    
    // LSP status
    lspStatus: {
      availableServers: [] as string[],
      activeServers: new Map<string, boolean>(), // language -> connected
      connectedServers: [] as string[], // List of connected server languages
      lastChecked: null as Date | null
    }
  }),

  getters: {
    isClaudeEnabled: (state) => state.settings.providers.claude.enabled,
    isLSPEnabled: (state) => state.settings.providers.lsp.enabled,
    isCacheEnabled: (state) => state.settings.providers.cache.enabled,
    
    isOfflineMode: (state) => state.settings.privacy.mode === 'offline',
    
    enabledProviders: (state) => {
      const providers: CompletionProvider[] = [];
      if (state.settings.providers.cache.enabled) providers.push('cache');
      if (state.settings.providers.lsp.enabled) providers.push('lsp');
      if (state.settings.providers.claude.enabled && state.settings.privacy.mode !== 'offline') {
        providers.push('claude');
      }
      return providers;
    },
    
    canUseClaudeForFile: (state) => (filepath: string) => {
      if (state.settings.privacy.mode === 'offline') return false;
      if (state.settings.privacy.mode === 'full') return true;
      
      // Allow empty filepath (scratch buffers, new files)
      if (!filepath || filepath === '') {
        return state.settings.privacy.mode !== 'selective';
      }
      
      // Check whitelist and blacklist patterns
      const filename = filepath.split('/').pop() || '';
      
      // Check never send patterns
      for (const pattern of state.settings.privacy.neverSendPatterns) {
        if (filename.match(new RegExp(pattern.replace('*', '.*')))) {
          return false;
        }
      }
      
      // Check whitelist if in selective mode
      if (state.settings.privacy.mode === 'selective') {
        return state.settings.privacy.fileWhitelist.some(pattern => 
          filepath.includes(pattern)
        );
      }
      
      return true;
    },
    
    cacheKey: () => (language: string, prefix: string, suffix: string) => {
      // Create a stable cache key
      const contextHash = `${language}:${prefix.slice(-50)}:${suffix.slice(0, 50)}`;
      return btoa(contextHash).replace(/[^a-zA-Z0-9]/g, '');
    }
  },

  actions: {
    // Initialization
    async init() {
      // Load settings from storage if available
      if (typeof window !== 'undefined' && window.electronAPI?.store) {
        try {
          const savedSettings = await window.electronAPI.store.get('autocompleteSettings');
          if (savedSettings) {
            // Convert servers object back to Map if it exists, otherwise create empty Map
            if (savedSettings.providers?.lsp?.servers && typeof savedSettings.providers.lsp.servers === 'object' && !Array.isArray(savedSettings.providers.lsp.servers)) {
              savedSettings.providers.lsp.servers = new Map(Object.entries(savedSettings.providers.lsp.servers));
            } else if (savedSettings.providers?.lsp) {
              savedSettings.providers.lsp.servers = new Map();
            }
            this.settings = { ...this.settings, ...savedSettings };
          }
        } catch (error) {
          console.error('[Autocomplete] Failed to load settings:', error);
        }
      }
      
      // Check Claude SDK health if Claude provider is enabled
      if (this.settings.providers.claude.enabled) {
        await this.checkClaudeSDKHealth();
      }
      
      // Check LSP servers if LSP provider is enabled
      if (this.settings.providers.lsp.enabled) {
        await this.checkLSPServers();
      }
    },
    
    // Check available LSP servers
    async updateLSPConnectedServers() {
      if (window.electronAPI?.autocomplete?.getLSPStatus) {
        try {
          const statusResult = await window.electronAPI.autocomplete.getLSPStatus();
          if (statusResult.success && statusResult.status) {
            this.lspStatus.connectedServers = statusResult.status.connected || [];
            // Update active servers map
            for (const [lang, _] of this.lspStatus.activeServers) {
              this.lspStatus.activeServers.set(lang, this.lspStatus.connectedServers.includes(lang));
            }
          }
        } catch (error) {
          console.error('[Autocomplete] Failed to update LSP connected servers:', error);
        }
      }
    },
    
    async checkLSPServers() {
      if (typeof window === 'undefined' || !window.electronAPI?.autocomplete?.checkLSPServers) {
        return;
      }
      
      try {
        const result = await window.electronAPI.autocomplete.checkLSPServers();
        
        if (result.success && result.servers) {
          this.lspStatus.availableServers = result.servers.map(s => s.language);
          this.lspStatus.lastChecked = new Date();
          
          // Update active servers map
          for (const server of result.servers) {
            this.lspStatus.activeServers.set(server.language, false); // Initially not connected
          }
          
          // Also check which servers are currently connected
          if (window.electronAPI?.autocomplete?.getLSPStatus) {
            const statusResult = await window.electronAPI.autocomplete.getLSPStatus();
            if (statusResult.success && statusResult.status) {
              this.lspStatus.connectedServers = statusResult.status.connected || [];
              // Update active servers map
              for (const connectedLang of this.lspStatus.connectedServers) {
                this.lspStatus.activeServers.set(connectedLang, true);
              }
            }
          }
        }
      } catch (error) {
        console.error('[Autocomplete] LSP servers check failed:', error);
      }
    },
    
    // Check Claude SDK health
    async checkClaudeSDKHealth() {
      if (typeof window === 'undefined' || !window.electronAPI?.autocomplete?.checkHealth) {
        this.claudeSDKHealth = {
          available: false,
          status: 'error',
          lastChecked: new Date(),
          error: 'Autocomplete API not available'
        };
        return;
      }
      
      try {
        const health = await window.electronAPI.autocomplete.checkHealth();
        
        this.claudeSDKHealth = {
          available: health.available,
          status: health.status as any,
          lastChecked: new Date(),
          error: health.error || null
        };
      } catch (error) {
        console.error('[Autocomplete] Claude SDK health check failed:', error);
        this.claudeSDKHealth = {
          available: false,
          status: 'error',
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },

    // Settings management
    async updateSettings(updates: Partial<AutocompleteSettings>) {
      this.settings = { ...this.settings, ...updates };
      
      // Persist to storage
      if (typeof window !== 'undefined' && window.electronAPI?.store) {
        try {
          // Create a deep serializable copy of settings
          const serializableSettings = this.createSerializableSettings(this.settings);
          await window.electronAPI.store.set('autocompleteSettings', serializableSettings);
        } catch (error) {
          console.error('Failed to save autocomplete settings:', error);
        }
      }
    },

    // Helper method to create a serializable version of settings
    createSerializableSettings(settings: AutocompleteSettings) {
      return {
        enabled: settings.enabled,
        providers: {
          lsp: {
            enabled: settings.providers.lsp.enabled,
            timeout: settings.providers.lsp.timeout,
            servers: {} // Don't persist servers for now
          },
          claude: {
            enabled: settings.providers.claude.enabled,
            timeout: settings.providers.claude.timeout,
            streaming: settings.providers.claude.streaming,
            contextLines: settings.providers.claude.contextLines,
            useCache: settings.providers.claude.useCache,
            cacheTTL: settings.providers.claude.cacheTTL,
            model: settings.providers.claude.model
          },
          cache: {
            enabled: settings.providers.cache.enabled,
            maxSize: settings.providers.cache.maxSize,
            ttl: settings.providers.cache.ttl
          }
        },
        ui: {
          maxSuggestions: settings.ui?.maxSuggestions || 10,
          showSource: settings.ui?.showSource || true,
          showConfidence: settings.ui?.showConfidence || false,
          showLatency: settings.ui?.showLatency || false,
          debounceDelay: settings.ui?.debounceDelay || 300,
          fontSize: settings.ui?.fontSize || 14
        },
        performance: {
          maxConcurrentRequests: settings.performance?.maxConcurrentRequests || 3,
          requestTimeout: settings.performance?.requestTimeout || 5000,
          cacheSize: settings.performance?.cacheSize || 100,
          enablePrefetch: settings.performance?.enablePrefetch || false
        }
      };
    },

    // Provider management
    setProviderEnabled(provider: 'lsp' | 'claude' | 'cache', enabled: boolean) {
      this.settings.providers[provider].enabled = enabled;
      this.updateSettings(this.settings);
    },

    // LSP server management
    addLSPServer(config: LSPServerConfig) {
      this.settings.providers.lsp.servers.set(config.url, config);
    },

    removeLSPServer(url: string) {
      this.settings.providers.lsp.servers.delete(url);
    },

    updateLSPServerStatus(url: string, status: LSPServerConfig['status']) {
      const server = this.settings.providers.lsp.servers.get(url);
      if (server) {
        server.status = status;
      }
    },

    // Cache management
    getCachedCompletion(key: string): CompletionItem[] | null {
      const cached = this.cache.get(key);
      if (!cached) return null;
      
      // Check if cache is still valid
      const now = Date.now();
      if (now - cached.timestamp > this.settings.providers.cache.ttl) {
        this.cache.delete(key);
        return null;
      }
      
      // Update cache hit metrics
      this.updateMetrics('cache', 0, true);
      
      return cached.items;
    },

    setCachedCompletion(key: string, items: CompletionItem[], context: CompletionCache['context']) {
      // Enforce cache size limit
      if (this.cache.size >= this.settings.providers.cache.maxSize) {
        // Remove oldest entry
        const oldestKey = Array.from(this.cache.entries())
          .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0]?.[0];
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
      
      this.cache.set(key, {
        key,
        items,
        timestamp: Date.now(),
        context
      });
    },

    clearCache() {
      this.cache.clear();
    },

    // Claude instance management
    setClaudeInstanceId(id: string | null) {
      this.claudeInstanceId = id;
    },

    setClaudeInstanceStatus(status: typeof this.claudeInstanceStatus) {
      this.claudeInstanceStatus = status;
    },

    // Completion state management
    setActiveCompletions(completions: CompletionItem[]) {
      this.activeCompletions = completions;
    },

    clearActiveCompletions() {
      this.activeCompletions = [];
    },
    
    setActive(active: boolean) {
      this.isActive = active;
    },

    // Request timing
    updateLastRequestTime() {
      this.lastRequestTime = Date.now();
    },
    
    // Metrics tracking
    updateMetrics(source: CompletionSource, latency: number, success: boolean) {
      const provider = source.startsWith('claude') ? 'claude' : 
                      source === 'lsp' ? 'lsp' : 'cache';
      
      // Update session metrics
      const count = this.sessionMetrics.completionCounts.get(source) || 0;
      this.sessionMetrics.completionCounts.set(source, count + 1);
      
      if (!success) {
        const errorCount = this.sessionMetrics.errorCounts.get(source) || 0;
        this.sessionMetrics.errorCounts.set(source, errorCount + 1);
      }
      
      // Update aggregated metrics
      if (provider === 'cache' || provider === 'lsp' || provider === 'claude') {
        // Update average latency (rolling average)
        const currentAvg = this.metrics.avgLatency[provider];
        const newCount = (this.sessionMetrics.completionCounts.get(source) || 0);
        this.metrics.avgLatency[provider] = (currentAvg * (newCount - 1) + latency) / newCount;
        
        // Update success rate
        const totalAttempts = newCount;
        const failures = this.sessionMetrics.errorCounts.get(source) || 0;
        this.metrics.successRate[provider] = ((totalAttempts - failures) / totalAttempts) * 100;
      }
      
      this.metrics.totalCompletions++;
      this.metrics.lastUpdated = new Date().toISOString();
    },

    // Privacy management
    addFileToWhitelist(filepath: string) {
      if (!this.settings.privacy.fileWhitelist.includes(filepath)) {
        this.settings.privacy.fileWhitelist.push(filepath);
        this.updateSettings(this.settings);
      }
    },

    removeFileFromWhitelist(filepath: string) {
      this.settings.privacy.fileWhitelist = this.settings.privacy.fileWhitelist.filter(
        f => f !== filepath
      );
      this.updateSettings(this.settings);
    },

    setPrivacyMode(mode: AutocompleteSettings['privacy']['mode']) {
      this.settings.privacy.mode = mode;
      this.updateSettings(this.settings);
    },

    // Reset metrics
    resetMetrics() {
      this.metrics = {
        avgLatency: { lsp: 0, claude: 0, cache: 0 },
        hitRate: { cache: 0, claude: 0 },
        successRate: { lsp: 0, claude: 0 },
        totalCompletions: 0,
        lastUpdated: new Date().toISOString()
      };
      this.sessionMetrics = {
        startTime: Date.now(),
        completionCounts: new Map(),
        errorCounts: new Map()
      };
    },
    
    // Debug method to get autocomplete state
    getDebugState() {
      return {
        enabled: this.settings.enabled,
        active: this.active,
        providers: {
          claude: {
            enabled: this.settings.providers.claude.enabled,
            available: this.claudeSDKAvailable,
            lastCheck: this.lastClaudeHealthCheck
          },
          lsp: {
            enabled: this.settings.providers.lsp.enabled,
            connected: this.lspStatus.connectedServers,
            available: this.lspStatus.availableServers.map(s => s.language)
          }
        },
        activeCompletions: this.activeCompletions.length,
        cacheSize: this.completionCache.size,
        settings: {
          timeout: this.settings.claude.timeout,
          contextLines: this.settings.claude.contextLines,
          model: this.settings.claude.model
        }
      };
    }
  }
});