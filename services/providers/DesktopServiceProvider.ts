/**
 * Desktop service provider implementation
 * Wraps existing Electron IPC APIs to implement service interfaces
 */
import type {
  IServiceProvider,
  IFileService,
  IClaudeService,
  IGitService,
  ITerminalService,
  IKnowledgeService,
  IMCPService,
  IStorageService,
  IPerformanceCache,
  ITasksService
} from '../interfaces/index.js';
import { AppMode } from '../interfaces/index.js';

import { DesktopFileService } from './desktop/DesktopFileService.js';
import { DesktopClaudeService } from './desktop/DesktopClaudeService.js';
import { DesktopGitService } from './desktop/DesktopGitService.js';
import { DesktopTerminalService } from './desktop/DesktopTerminalService.js';
import { DesktopKnowledgeService } from './desktop/DesktopKnowledgeService.js';
import { DesktopMCPService } from './desktop/DesktopMCPService.js';
import { DesktopStorageService } from './desktop/DesktopStorageService.js';
// Use browser-safe cache in renderer process, full SQLite cache in main process
import { BrowserSafePerformanceCache } from './desktop/BrowserSafePerformanceCache.js';
import { DesktopTasksService } from './desktop/DesktopTasksService.js';

export class DesktopServiceProvider implements IServiceProvider {
  public readonly mode = AppMode.DESKTOP;
  
  public readonly file: IFileService;
  public readonly claude: IClaudeService;
  public readonly git: IGitService;
  public readonly terminal: ITerminalService;
  public readonly knowledge: IKnowledgeService;
  public readonly mcp: IMCPService;
  public readonly storage: IStorageService;
  public readonly cache: IPerformanceCache;
  public readonly tasks: ITasksService;
  
  constructor() {
    // Initialize all services wrapping existing Electron APIs
    this.file = new DesktopFileService();
    this.claude = new DesktopClaudeService();
    this.git = new DesktopGitService();
    this.terminal = new DesktopTerminalService();
    this.knowledge = new DesktopKnowledgeService();
    this.mcp = new DesktopMCPService();
    this.storage = new DesktopStorageService();
    this.tasks = new DesktopTasksService();
    
    // Initialize performance cache
    // In renderer process, use browser-safe implementation
    const dbPath = this.getPerformanceCachePath();
    this.cache = new BrowserSafePerformanceCache(dbPath);
  }
  
  private getPerformanceCachePath(): string {
    // In Electron, use app.getPath('userData')
    // For now, use a default path that will be overridden by Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      // This will be replaced with actual path from Electron
      return 'clode-performance.db';
    }
    return ':memory:'; // In-memory for testing
  }
  
  async initialize(): Promise<void> {
    // Desktop mode doesn't need special initialization
    // All services use existing Electron IPC
  }
  
  async dispose(): Promise<void> {
    // Clean up any resources if needed
    if (this.cache && 'destroy' in this.cache) {
      (this.cache as any).destroy();
    }
    // Most cleanup happens in Electron main process
  }
}