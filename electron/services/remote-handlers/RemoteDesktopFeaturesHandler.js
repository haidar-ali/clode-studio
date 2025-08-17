export class RemoteDesktopFeaturesHandler {
    mainWindow;
    sessionManager;
    constructor(mainWindow, sessionManager) {
        this.mainWindow = mainWindow;
        this.sessionManager = sessionManager;
    }
    registerHandlers(socket) {
        // Get desktop features
        socket.on('desktop:features:get', async (request, callback) => {
            try {
                const features = await this.getDesktopFeatures();
                const response = {
                    id: request.id,
                    success: true,
                    data: features
                };
                callback(response);
            }
            catch (error) {
                const response = {
                    id: request.id,
                    success: false,
                    error: {
                        code: 'FEATURES_ERROR',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
                callback(response);
            }
        });
        // Store desktop features (for desktop to share with remote)
        socket.on('desktop:features:store', async (request, callback) => {
            try {
                // Store in memory for other clients to access
                this.storeDesktopFeatures(request.payload);
                const response = {
                    id: request.id,
                    success: true
                };
                callback(response);
            }
            catch (error) {
                const response = {
                    id: request.id,
                    success: false,
                    error: {
                        code: 'STORE_ERROR',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
                callback(response);
            }
        });
    }
    storedFeatures = null;
    storeDesktopFeatures(features) {
        this.storedFeatures = {
            ...features,
            lastSync: Date.now()
        };
    }
    async getDesktopFeatures() {
        // If we have stored features, return them
        if (this.storedFeatures) {
            return this.storedFeatures;
        }
        // Otherwise, get them directly from the main process
        try {
            // Get the actual data from Claude settings and file system
            const { claudeSettingsManager } = await import('../../claude-settings-manager.js');
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const fs = (await import('fs')).promises;
            const path = await import('path');
            const os = await import('os');
            const matter = await import('gray-matter');
            const { default: Store } = await import('electron-store');
            const execAsync = promisify(exec);
            const store = new Store();
            const workspacePath = store.get('workspacePath') || process.cwd();
            // Get hooks from Claude settings
            const hooks = await claudeSettingsManager.getHooks();
            // Get MCP servers by running claude mcp list
            let mcpServers = [];
            try {
                const { stdout } = await execAsync('claude mcp list', {
                    cwd: workspacePath,
                    env: process.env
                });
                // Parse MCP output
                if (!stdout.includes('No MCP servers configured')) {
                    const lines = stdout.trim().split('\n');
                    for (const line of lines) {
                        if (line.includes(':')) {
                            const colonIndex = line.indexOf(':');
                            const name = line.substring(0, colonIndex).trim();
                            const rest = line.substring(colonIndex + 1).trim();
                            const parenIndex = rest.lastIndexOf('(');
                            let url = rest;
                            let transport = 'stdio';
                            if (parenIndex > -1) {
                                url = rest.substring(0, parenIndex).trim();
                                transport = rest.substring(parenIndex + 1, rest.length - 1).trim().toLowerCase();
                            }
                            else if (url.startsWith('http://') || url.startsWith('https://')) {
                                transport = 'http';
                            }
                            mcpServers.push({
                                name,
                                url: url.trim(),
                                type: transport === 'http' || transport === 'sse' ? transport : 'stdio',
                                status: 'connected',
                                capabilities: {}
                            });
                        }
                    }
                }
            }
            catch (error) {
                console.error('Failed to get MCP servers:', error);
            }
            // Get commands from file system
            const commands = [];
            // Load project commands
            if (workspacePath) {
                const projectCommandsPath = path.join(workspacePath, '.claude', 'commands');
                try {
                    await fs.access(projectCommandsPath);
                    const files = await fs.readdir(projectCommandsPath, { withFileTypes: true });
                    const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md'));
                    for (const file of mdFiles) {
                        const filePath = path.join(projectCommandsPath, file.name);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const { data, content: commandContent } = matter.default(content);
                        commands.push({
                            id: data.id || file.name.replace('.md', ''),
                            name: data.name || file.name.replace('.md', ''),
                            description: data.description || '',
                            content: commandContent,
                            template: commandContent,
                            category: data.category || 'custom',
                            icon: data.icon || 'mdi:slash-forward',
                            scope: 'project',
                            metadata: data
                        });
                    }
                }
                catch (error) {
                    console.debug('Project commands directory not found:', error);
                }
            }
            // Load personal commands
            const homeDir = os.homedir();
            const personalCommandsPath = path.join(homeDir, '.claude', 'commands');
            try {
                await fs.access(personalCommandsPath);
                const files = await fs.readdir(personalCommandsPath, { withFileTypes: true });
                const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md'));
                for (const file of mdFiles) {
                    const filePath = path.join(personalCommandsPath, file.name);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const { data, content: commandContent } = matter.default(content);
                    commands.push({
                        id: data.id || `personal-${file.name.replace('.md', '')}`,
                        name: data.name || file.name.replace('.md', ''),
                        description: data.description || '',
                        content: commandContent,
                        template: commandContent,
                        category: data.category || 'custom',
                        icon: data.icon || 'mdi:slash-forward',
                        scope: 'personal',
                        metadata: data
                    });
                }
            }
            catch (error) {
                console.debug('Personal commands directory not found:', error);
            }
            const features = {
                hooks,
                mcp: {
                    servers: mcpServers
                },
                commands: {
                    projectCommands: commands.filter(c => c.scope === 'project'),
                    personalCommands: commands.filter(c => c.scope === 'personal')
                },
                lastSync: Date.now()
            };
            console.log('[RemoteDesktopFeaturesHandler] Final features:', {
                hooks: features.hooks?.length || 0,
                mcpServers: features.mcp.servers?.length || 0,
                projectCommands: features.commands.projectCommands?.length || 0,
                personalCommands: features.commands.personalCommands?.length || 0
            });
            // Store for future requests
            this.storedFeatures = features;
            return features;
        }
        catch (error) {
            console.error('[RemoteDesktopFeaturesHandler] Error getting desktop features:', error);
            throw error;
        }
    }
}
