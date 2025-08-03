/**
 * Base interface for service providers
 * Aggregates all service interfaces to provide a unified API
 */
import type { IFileService } from './IFileService.js';
import type { IClaudeService } from './IClaudeService.js';
import type { IGitService } from './IGitService.js';
import type { ITerminalService } from './ITerminalService.js';
import type { IKnowledgeService } from './IKnowledgeService.js';
import type { IMCPService } from './IMCPService.js';
import type { IStorageService } from './IStorageService.js';
import type { IPerformanceCache } from './IPerformanceCache.js';

export interface IServiceProvider {
  file: IFileService;
  claude: IClaudeService;
  git: IGitService;
  terminal: ITerminalService;
  knowledge: IKnowledgeService;
  mcp: IMCPService;
  storage: IStorageService;
  cache: IPerformanceCache;  // Changed from queue to performance cache
  
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
  HYBRID = 'hybrid',    // Desktop + remote capabilities
  REMOTE = 'remote'     // Remote client only (browser)
}

