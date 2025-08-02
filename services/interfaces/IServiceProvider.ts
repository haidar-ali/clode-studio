/**
 * Base interface for service providers
 * Aggregates all service interfaces to provide a unified API
 */
export interface IServiceProvider {
  file: IFileService;
  claude: IClaudeService;
  git: IGitService;
  terminal: ITerminalService;
  knowledge: IKnowledgeService;
  mcp: IMCPService;
  storage: IStorageService;
  
  // App mode for provider-specific logic
  mode: AppMode;
  
  // Initialize the provider (async setup if needed)
  initialize(): Promise<void>;
  
  // Cleanup resources
  dispose(): Promise<void>;
}

/**
 * Application operation modes
 */
export enum AppMode {
  DESKTOP = 'desktop',  // Pure local - current behavior
  SERVER = 'server',    // Headless server only
  HYBRID = 'hybrid'     // Desktop + remote capabilities
}

// Import service interfaces
export * from './IFileService';
export * from './IClaudeService';
export * from './IGitService';
export * from './ITerminalService';
export * from './IKnowledgeService';
export * from './IMCPService';
export * from './IStorageService';