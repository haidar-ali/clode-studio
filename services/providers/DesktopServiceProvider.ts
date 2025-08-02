/**
 * Desktop service provider implementation
 * Wraps existing Electron IPC APIs to implement service interfaces
 */
import type {
  IServiceProvider,
  AppMode,
  IFileService,
  IClaudeService,
  IGitService,
  ITerminalService,
  IKnowledgeService,
  IMCPService,
  IStorageService
} from '../interfaces';

import { DesktopFileService } from './desktop/DesktopFileService';
import { DesktopClaudeService } from './desktop/DesktopClaudeService';
import { DesktopGitService } from './desktop/DesktopGitService';
import { DesktopTerminalService } from './desktop/DesktopTerminalService';
import { DesktopKnowledgeService } from './desktop/DesktopKnowledgeService';
import { DesktopMCPService } from './desktop/DesktopMCPService';
import { DesktopStorageService } from './desktop/DesktopStorageService';

export class DesktopServiceProvider implements IServiceProvider {
  public readonly mode = AppMode.DESKTOP;
  
  public readonly file: IFileService;
  public readonly claude: IClaudeService;
  public readonly git: IGitService;
  public readonly terminal: ITerminalService;
  public readonly knowledge: IKnowledgeService;
  public readonly mcp: IMCPService;
  public readonly storage: IStorageService;
  
  constructor() {
    // Initialize all services wrapping existing Electron APIs
    this.file = new DesktopFileService();
    this.claude = new DesktopClaudeService();
    this.git = new DesktopGitService();
    this.terminal = new DesktopTerminalService();
    this.knowledge = new DesktopKnowledgeService();
    this.mcp = new DesktopMCPService();
    this.storage = new DesktopStorageService();
  }
  
  async initialize(): Promise<void> {
    // Desktop mode doesn't need special initialization
    // All services use existing Electron IPC
  }
  
  async dispose(): Promise<void> {
    // Clean up any resources if needed
    // Most cleanup happens in Electron main process
  }
}