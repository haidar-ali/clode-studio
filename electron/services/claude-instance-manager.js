import Store from 'electron-store';
class ClaudeInstanceManager {
    instances = new Map();
    store;
    constructor() {
        this.store = new Store();
        // Load persisted instances metadata (not PTY, just metadata for reconnection)
        this.loadPersistedInstances();
    }
    loadPersistedInstances() {
        try {
            const persisted = this.store.get('claudeInstances', {});
            // Mark all persisted instances as disconnected initially
            for (const [id, metadata] of Object.entries(persisted)) {
                if (metadata && typeof metadata === 'object') {
                    // Don't load if already exists (shouldn't happen but just in case)
                    if (!this.instances.has(id)) {
                        this.instances.set(id, {
                            pty: null, // No PTY yet, will be set when reconnected
                            metadata: {
                                ...metadata,
                                status: 'disconnected'
                            }
                        });
                    }
                }
            }
        }
        catch (error) {
            console.error('Failed to load persisted Claude instances:', error);
        }
    }
    persistInstances() {
        try {
            const metadataOnly = {};
            for (const [id, data] of this.instances.entries()) {
                // When persisting, always set status to disconnected
                // since PTY processes don't survive app restarts
                metadataOnly[id] = {
                    ...data.metadata,
                    status: 'disconnected',
                    pid: undefined
                };
            }
            this.store.set('claudeInstances', metadataOnly);
        }
        catch (error) {
            console.error('Failed to persist Claude instances:', error);
        }
    }
    addInstance(id, pty, metadata) {
        const fullMetadata = {
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
    updateInstance(id, updates) {
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
    removeInstance(id) {
        const instance = this.instances.get(id);
        if (instance) {
            // Kill PTY if it exists
            if (instance.pty) {
                try {
                    instance.pty.kill();
                }
                catch (error) {
                    console.error(`Failed to kill PTY for instance ${id}:`, error);
                }
            }
            this.instances.delete(id);
            this.persistInstances();
            return true;
        }
        return false;
    }
    getInstance(id) {
        return this.instances.get(id);
    }
    getPty(id) {
        return this.instances.get(id)?.pty;
    }
    getMetadata(id) {
        return this.instances.get(id)?.metadata;
    }
    getAllInstances() {
        // Return all instances but deduplicate by ID, preferring connected instances
        const instanceMap = new Map();
        for (const data of this.instances.values()) {
            const existing = instanceMap.get(data.metadata.id);
            // If no existing or current is connected (prefer connected over disconnected)
            if (!existing || data.metadata.status === 'connected') {
                instanceMap.set(data.metadata.id, data.metadata);
            }
        }
        return Array.from(instanceMap.values());
    }
    getInstancesByWorkspace(workspacePath) {
        // Filter by workspace and deduplicate by ID, preferring connected instances
        const instanceMap = new Map();
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
    hasInstance(id) {
        return this.instances.has(id);
    }
    reconnectInstance(id, pty) {
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
    disconnectInstance(id) {
        const instance = this.instances.get(id);
        if (instance) {
            // Clear the PTY reference since the process has exited
            instance.pty = null;
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
                }
                catch (error) {
                    console.error(`Failed to kill PTY for instance ${id}:`, error);
                }
            }
        }
        this.instances.clear();
        this.persistInstances();
    }
    // Get the legacy Map for backward compatibility
    getLegacyPtyMap() {
        const ptyMap = new Map();
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
