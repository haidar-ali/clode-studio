import * as pty from 'node-pty';
import Store from 'electron-store';

export interface ClaudeInstanceMetadata {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  workingDirectory: string;
  pid?: number;
  createdAt: string;
  lastActiveAt: string;
  personalityId?: string;
  color?: string;
  sessionId?: string;
  isHeadless?: boolean; // Track if created in headless mode
}

export interface ClaudeInstanceData {
  pty: pty.IPty;
  metadata: ClaudeInstanceMetadata;
}

class ClaudeInstanceManager {
  private instances: Map<string, ClaudeInstanceData> = new Map();
  private store: Store;

  constructor() {
    this.store = new Store();
    // Load persisted instances metadata (not PTY, just metadata for reconnection)
    this.loadPersistedInstances();
  }

  private loadPersistedInstances() {
    try {
      const persisted = (this.store as any).get('claudeInstances', {}) as Record<string, ClaudeInstanceMetadata>;
      console.log('[ClaudeInstanceManager] Loading persisted instances:', Object.keys(persisted));
      
      // Mark all persisted instances as disconnected initially
      for (const [id, metadata] of Object.entries(persisted)) {
        if (metadata && typeof metadata === 'object') {
          // Don't load if already exists (shouldn't happen but just in case)
          if (!this.instances.has(id)) {
            this.instances.set(id, {
              pty: null as any, // No PTY yet, will be set when reconnected
              metadata: {
                ...metadata,
                status: 'disconnected'
              }
            });
          }
        }
      }
      console.log('[ClaudeInstanceManager] Loaded instances:', Array.from(this.instances.keys()));
    } catch (error) {
      console.error('Failed to load persisted Claude instances:', error);
    }
  }

  private persistInstances() {
    try {
      const metadataOnly: Record<string, ClaudeInstanceMetadata> = {};
      for (const [id, data] of this.instances.entries()) {
        // When persisting, always set status to disconnected
        // since PTY processes don't survive app restarts
        metadataOnly[id] = {
          ...data.metadata,
          status: 'disconnected',
          pid: undefined
        };
      }
      (this.store as any).set('claudeInstances', metadataOnly);
    } catch (error) {
      console.error('Failed to persist Claude instances:', error);
    }
  }

  addInstance(id: string, pty: pty.IPty, metadata: Partial<ClaudeInstanceMetadata>) {
    const fullMetadata: ClaudeInstanceMetadata = {
      id,
      name: metadata.name || `Claude ${id.slice(0, 8)}`,
      status: 'connected',
      workingDirectory: metadata.workingDirectory || process.cwd(),
      pid: pty.pid,
      createdAt: metadata.createdAt || new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      personalityId: metadata.personalityId,
      color: metadata.color,
      sessionId: metadata.sessionId,
      isHeadless: metadata.isHeadless
    };

    this.instances.set(id, { pty, metadata: fullMetadata });
    this.persistInstances();
    return fullMetadata;
  }

  updateInstance(id: string, updates: Partial<ClaudeInstanceMetadata>) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.metadata = {
        ...instance.metadata,
        ...updates,
        lastActiveAt: new Date().toISOString()
      };
      this.persistInstances();
      return instance.metadata;
    }
    return null;
  }

  removeInstance(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
      // Kill PTY if it exists
      if (instance.pty) {
        try {
          instance.pty.kill();
        } catch (error) {
          console.error(`Failed to kill PTY for instance ${id}:`, error);
        }
      }
      this.instances.delete(id);
      this.persistInstances();
      return true;
    }
    return false;
  }

  getInstance(id: string): ClaudeInstanceData | undefined {
    return this.instances.get(id);
  }

  getPty(id: string): pty.IPty | undefined {
    return this.instances.get(id)?.pty;
  }

  getMetadata(id: string): ClaudeInstanceMetadata | undefined {
    return this.instances.get(id)?.metadata;
  }

  getAllInstances(): ClaudeInstanceMetadata[] {
    // Return all instances but deduplicate by ID, preferring connected instances
    const instanceMap = new Map<string, ClaudeInstanceMetadata>();
    
    for (const data of this.instances.values()) {
      const existing = instanceMap.get(data.metadata.id);
      // If no existing or current is connected (prefer connected over disconnected)
      if (!existing || data.metadata.status === 'connected') {
        instanceMap.set(data.metadata.id, data.metadata);
      }
    }
    
    return Array.from(instanceMap.values());
  }

  getInstancesByWorkspace(workspacePath: string): ClaudeInstanceMetadata[] {
    // Filter by workspace and deduplicate by ID, preferring connected instances
    const instanceMap = new Map<string, ClaudeInstanceMetadata>();
    
    for (const data of this.instances.values()) {
      if (data.metadata.workingDirectory === workspacePath) {
        const existing = instanceMap.get(data.metadata.id);
        // If no existing or current is connected (prefer connected over disconnected)
        if (!existing || data.metadata.status === 'connected') {
          instanceMap.set(data.metadata.id, data.metadata);
        }
      }
    }
    
    return Array.from(instanceMap.values());
  }

  hasInstance(id: string): boolean {
    return this.instances.has(id);
  }

  reconnectInstance(id: string, pty: pty.IPty) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.pty = pty;
      instance.metadata.status = 'connected';
      instance.metadata.pid = pty.pid;
      instance.metadata.lastActiveAt = new Date().toISOString();
      this.persistInstances();
      return instance.metadata;
    }
    return null;
  }

  disconnectInstance(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
      // Clear the PTY reference since the process has exited
      instance.pty = null as any;
      instance.metadata.status = 'disconnected';
      instance.metadata.pid = undefined;
      this.persistInstances();
      return instance.metadata;
    }
    return null;
  }

  clearAll() {
    // Kill all PTYs
    for (const [id, data] of this.instances.entries()) {
      if (data.pty) {
        try {
          data.pty.kill();
        } catch (error) {
          console.error(`Failed to kill PTY for instance ${id}:`, error);
        }
      }
    }
    this.instances.clear();
    this.persistInstances();
  }

  // Get the legacy Map for backward compatibility
  getLegacyPtyMap(): Map<string, pty.IPty> {
    const ptyMap = new Map<string, pty.IPty>();
    for (const [id, data] of this.instances.entries()) {
      if (data.pty) {
        ptyMap.set(id, data.pty);
      }
    }
    return ptyMap;
  }
}

// Singleton instance
export const claudeInstanceManager = new ClaudeInstanceManager();