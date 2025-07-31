export interface CompletionContext {
  // Editor state
  state?: any; // CodeMirror EditorState - optional for IPC
  pos: number;
  explicit: boolean;
  
  // Extended context
  language: string;
  filepath: string;
  prefix: string;
  suffix: string;
  line: number;
  column: number;
  
  // Additional metadata
  triggerCharacter?: string;
  triggerKind?: 'automatic' | 'manual';
}

export interface CompletionRequest {
  id: string;
  context: CompletionContext;
  providers: string[];
  timeout: number;
  signal?: AbortSignal; // Optional - not serializable for IPC
}

export interface CompletionResponse {
  id: string;
  items: CompletionItem[];
  isIncomplete?: boolean;
  duration: number;
  provider: string;
}

export interface StreamingCompletionChunk {
  id: string;
  delta: string;
  isComplete: boolean;
  confidence?: number;
}

export interface ClaudeCompletionOptions {
  model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  streaming?: boolean;
  cacheKey?: string;
  contextWindow?: number;
}

export interface LSPCompletionOptions {
  serverUrl: string;
  language: string;
  capabilities?: string[];
}

export interface AutocompleteProvider {
  id: string;
  name: string;
  priority: number;
  
  // Check if provider can handle this context
  canProvide(context: CompletionContext): boolean;
  
  // Get completions
  getCompletions(request: CompletionRequest): Promise<CompletionResponse>;
  
  // Optional streaming support
  streamCompletions?(request: CompletionRequest): AsyncIterable<StreamingCompletionChunk>;
  
  // Lifecycle
  initialize?(): Promise<void>;
  dispose?(): void;
}

export interface AutocompleteService {
  // Provider management
  registerProvider(provider: AutocompleteProvider): void;
  unregisterProvider(providerId: string): void;
  
  // Get completions
  getCompletions(context: CompletionContext): Promise<CompletionItem[]>;
  
  // Settings
  updateSettings(settings: any): void;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): void;
}

// Re-export types from store
export type { CompletionItem, CompletionProvider, CompletionSource } from '~/stores/autocomplete';

// Electron API extensions
declare global {
  interface Window {
    electronAPI: {
      autocomplete: {
        getCompletion: (request: CompletionRequest) => Promise<CompletionResponse>;
        streamCompletion: (request: CompletionRequest) => Promise<{ success: boolean; chunks?: any[]; error?: string }>;
        clearCache: () => Promise<{ success: boolean; error?: string }>;
        preloadFileContext: (filepath: string) => Promise<{ success: boolean; error?: string }>;
        cancelRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
        checkHealth: () => Promise<{ available: boolean; status: string; error?: string }>;
        onChunk: (requestId: string, callback: (chunk: any) => void) => () => void;
      };
    };
  }
}