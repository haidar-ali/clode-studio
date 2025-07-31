export interface AutocompleteService {
  initialize(): Promise<void>;
  getCompletion(request: any): Promise<any>;
  streamCompletion(request: any): AsyncGenerator<any>;
  clearCache(): void;
  cancelRequest(requestId: string): void;
  preloadFileContext(filepath: string): Promise<void>;
  checkHealth(): Promise<{ available: boolean; status: string; error?: string }>;
  initializeProject(projectPath: string): Promise<void>;
  shutdown(): Promise<void>;
}

export declare const autocompleteService: AutocompleteService;