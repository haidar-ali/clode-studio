/**
 * Service interfaces for Clode Studio
 * Provides abstraction layer for desktop/remote/hybrid modes
 */

// Use explicit named exports to avoid Vite module resolution issues
export type { IServiceProvider } from './IServiceProvider.js';
export { AppMode } from './IServiceProvider.js';
export type { IFileService, FileInfo, FileSearchResult } from './IFileService.js';
export type { IClaudeService, ClaudeInstance, ClaudeSpawnOptions, ClaudeStatus } from './IClaudeService.js';
export type { IGitService, GitStatus, GitBranch, GitCommit, GitFileStatus } from './IGitService.js';
export type { ITerminalService, TerminalInstance, TerminalSpawnOptions } from './ITerminalService.js';
export type { IKnowledgeService, KnowledgeEntry, KnowledgeSearchResult } from './IKnowledgeService.js';
export type { IMCPService, MCPServer, MCPServerConfig, MCPServerStatus } from './IMCPService.js';
export type { IStorageService } from './IStorageService.js';
export type { 
  IPerformanceCache, 
  CacheOptions, 
  CacheStats, 
  PerformanceMetrics, 
  SessionState,
  CacheEntry,
  CacheQueryOptions 
} from './IPerformanceCache.js';