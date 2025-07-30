export interface GhostTextService {
  initialize(): Promise<void>;
  checkHealth(): Promise<{ available: boolean; status: string; error?: string }>;
  initializeProject(projectPath: string): Promise<void>;
  getGhostTextSuggestion(prefix: string, suffix: string): Promise<string>;
  cancelRequest(): void;
  shutdown(): Promise<void>;
}

export declare const ghostTextService: GhostTextService;