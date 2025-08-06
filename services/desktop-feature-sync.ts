/**
 * Desktop Feature Sync Service
 * Syncs desktop-only features (MCP, hooks, Claude commands) to cache
 * for read-only access in remote mode
 */
import type { IPerformanceCache } from './interfaces/IPerformanceCache';
import type { MCPServer } from '~/stores/mcp';
import type { Hook } from '~/stores/hooks';
import type { ClaudeSlashCommand } from '~/stores/claude-commands';

export interface DesktopFeatureData {
  mcp: {
    servers: MCPServer[];
    lastSync: number;
  };
  hooks: {
    items: Hook[];
    lastSync: number;
  };
  commands: {
    projectCommands: ClaudeSlashCommand[];
    personalCommands: ClaudeSlashCommand[];
    lastSync: number;
  };
}

export class DesktopFeatureSync {
  private syncInterval: number | null = null;
  private readonly SYNC_INTERVAL = 30000; // 30 seconds
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  constructor(private cache: IPerformanceCache) {}
  
  /**
   * Start periodic sync of desktop features to cache
   */
  startSync(): void {
    // Initial sync
    this.syncAll().catch(console.error);
    
    // Set up periodic sync
    this.syncInterval = window.setInterval(() => {
      this.syncAll().catch(console.error);
    }, this.SYNC_INTERVAL);
  }
  
  /**
   * Stop syncing
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  /**
   * Sync all desktop features to cache
   */
  async syncAll(): Promise<void> {
    console.log('[DesktopFeatureSync] Starting sync of desktop features to cache');
    const startTime = Date.now();
    
    await Promise.all([
      this.syncMCPServers(),
      this.syncHooks(),
      this.syncClaudeCommands()
    ]);
    
    console.log(`[DesktopFeatureSync] Sync completed in ${Date.now() - startTime}ms`);
  }
  
  /**
   * Sync MCP servers to cache
   */
  private async syncMCPServers(): Promise<void> {
    try {
      if (!window.electronAPI?.mcp?.list) return;
      
      const { useEditorStore } = await import('~/stores/editor');
      const editorStore = useEditorStore();
      const workspacePath = editorStore.workspacePath;
      
      const result = await window.electronAPI.mcp.list(workspacePath);
      if (result.success && result.servers) {
        const servers: MCPServer[] = result.servers.map((server: any) => ({
          name: server.name,
          type: server.transport?.toLowerCase() || 'stdio',
          command: server.command,
          url: server.url,
          status: 'connected',
          env: server.env || {}
        }));
        
        const mcpData = {
          servers,
          lastSync: Date.now()
        };
        
        await this.cache.cache('desktop:mcp:servers', mcpData, {
          ttl: this.CACHE_TTL,
          priority: 'high'
        });
        
        // Also store in localStorage for cross-mode access
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('desktop:mcp:servers', JSON.stringify(mcpData));
        }
        
        console.log(`[DesktopFeatureSync] Cached ${servers.length} MCP servers`);
      }
    } catch (error) {
      console.error('[DesktopFeatureSync] Failed to sync MCP servers:', error);
    }
  }
  
  /**
   * Sync hooks to cache
   */
  private async syncHooks(): Promise<void> {
    try {
      if (!window.electronAPI?.claude?.getHooks) {
       
        return;
      }
      
      const result = await window.electronAPI.claude.getHooks();
      let hooks: Hook[] = [];
      
      // Handle both direct array response and wrapped response
      if (Array.isArray(result)) {
        hooks = result;
      } else if (result && result.success && Array.isArray(result.hooks)) {
        hooks = result.hooks;
      }
      
      const hooksData = {
        items: hooks,
        lastSync: Date.now()
      };
      
      await this.cache.cache('desktop:hooks:items', hooksData, {
        ttl: this.CACHE_TTL,
        priority: 'high'
      });
      
      // Also store in localStorage for cross-mode access
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('desktop:hooks:items', JSON.stringify(hooksData));
      }
      
      console.log(`[DesktopFeatureSync] Cached ${hooks.length} hooks`);
    } catch (error) {
      console.error('[DesktopFeatureSync] Failed to sync hooks:', error);
    }
  }
  
  /**
   * Sync Claude commands to cache
   */
  private async syncClaudeCommands(): Promise<void> {
    try {
      if (!window.electronAPI?.fs) return;
      
      const { useClaudeCommandsStore } = await import('~/stores/claude-commands');
      const { useEditorStore } = await import('~/stores/editor');
      const commandsStore = useClaudeCommandsStore();
      const editorStore = useEditorStore();
      
      // Initialize with workspace path
      if (editorStore.workspacePath) {
        await commandsStore.initialize(editorStore.workspacePath);
      }
      
      // Get project commands (will use the workspace path from the store)
      const projectCommands = await commandsStore.loadProjectCommands();
      
      // Get personal commands
      const personalCommands = await commandsStore.loadPersonalCommands();
      
      const commandsData = {
        projectCommands,
        personalCommands,
        lastSync: Date.now()
      };
      
      await this.cache.cache('desktop:commands:all', commandsData, {
        ttl: this.CACHE_TTL,
        priority: 'high'
      });
      
      // Also store in localStorage for cross-mode access
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('desktop:commands:all', JSON.stringify(commandsData));
      }
      
      console.log(`[DesktopFeatureSync] Cached ${projectCommands.length} project commands, ${personalCommands.length} personal commands`);
    } catch (error) {
      console.error('[DesktopFeatureSync] Failed to sync Claude commands:', error);
    }
  }
  
  /**
   * Get cached desktop features (for remote mode)
   */
  static async getCachedFeatures(cache: IPerformanceCache): Promise<Partial<DesktopFeatureData>> {
    // Try localStorage first (for cross-mode access)
    console.log('[DesktopFeatureSync] Checking localStorage for cached features...');
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const hooksStr = localStorage.getItem('desktop:hooks:items');
        const commandsStr = localStorage.getItem('desktop:commands:all');
        const mcpStr = localStorage.getItem('desktop:mcp:servers');
        
        console.log('[DesktopFeatureSync] localStorage data:', {
          hasHooks: !!hooksStr,
          hasCommands: !!commandsStr,
          hasMcp: !!mcpStr
        });
        
        const hooks = hooksStr ? JSON.parse(hooksStr) : null;
        const commands = commandsStr ? JSON.parse(commandsStr) : null;
        const mcp = mcpStr ? JSON.parse(mcpStr) : null;
        
        if (hooks || commands || mcp) {
          console.log('[DesktopFeatureSync] Found cached features in localStorage');
          return {
            mcp: mcp || { servers: [], lastSync: 0 },
            hooks: hooks || { items: [], lastSync: 0 },
            commands: commands || { projectCommands: [], personalCommands: [], lastSync: 0 }
          };
        }
      } catch (error) {
        console.error('[DesktopFeatureSync] Failed to read from localStorage:', error);
      }
    }
    
    // Fallback to cache (for same-mode access)
    const [mcp, hooks, commands] = await Promise.all([
      cache.get<DesktopFeatureData['mcp']>('desktop:mcp:servers'),
      cache.get<DesktopFeatureData['hooks']>('desktop:hooks:items'),
      cache.get<DesktopFeatureData['commands']>('desktop:commands:all')
    ]);
    
    return {
      mcp: mcp || { servers: [], lastSync: 0 },
      hooks: hooks || { items: [], lastSync: 0 },
      commands: commands || { projectCommands: [], personalCommands: [], lastSync: 0 }
    };
  }
}