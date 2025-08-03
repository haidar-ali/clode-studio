import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
export class ClaudeSettingsManager {
    userSettingsPath;
    constructor() {
        this.userSettingsPath = join(homedir(), '.claude', 'settings.json');
    }
    async ensureClaudeDir() {
        const claudeDir = join(homedir(), '.claude');
        if (!existsSync(claudeDir)) {
            await mkdir(claudeDir, { recursive: true });
        }
    }
    async loadSettings() {
        try {
            if (existsSync(this.userSettingsPath)) {
                const content = await readFile(this.userSettingsPath, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch (error) {
            console.error('Failed to load Claude settings:', error);
        }
        return {};
    }
    async saveSettings(settings) {
        try {
            await this.ensureClaudeDir();
            await writeFile(this.userSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('Failed to save Claude settings:', error);
            throw error;
        }
    }
    // Convert our simplified hook format to Claude's format
    convertToClaudeFormat(hooks) {
        const claudeHooks = {};
        // Group hooks by event
        hooks.filter(h => !h.disabled).forEach(hook => {
            const event = hook.event;
            if (!claudeHooks)
                return;
            if (!claudeHooks[event]) {
                claudeHooks[event] = [];
            }
            // Find or create matcher group
            const eventHooks = claudeHooks[event];
            if (!eventHooks)
                return;
            let matcherGroup = eventHooks.find(m => m.matcher === (hook.matcher || ''));
            if (!matcherGroup) {
                matcherGroup = {
                    matcher: hook.matcher || '',
                    hooks: []
                };
                eventHooks.push(matcherGroup);
            }
            matcherGroup.hooks.push({
                type: 'command',
                command: hook.command
            });
        });
        return claudeHooks;
    }
    // Convert Claude's format to our simplified format
    convertFromClaudeFormat(claudeHooks) {
        const hooks = [];
        if (!claudeHooks)
            return hooks;
        Object.entries(claudeHooks).forEach(([event, matchers]) => {
            matchers?.forEach(matcherGroup => {
                matcherGroup.hooks.forEach(hook => {
                    hooks.push({
                        id: `hook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        event,
                        matcher: matcherGroup.matcher,
                        command: hook.command,
                        disabled: false
                    });
                });
            });
        });
        return hooks;
    }
    async getHooks() {
        // Load hooks from our separate IDE file
        const ideHooks = await this.loadIDEHooks();
        if (ideHooks.length > 0) {
            return ideHooks;
        }
        // Otherwise convert from Claude format
        const settings = await this.loadSettings();
        return this.convertFromClaudeFormat(settings.hooks);
    }
    async loadIDEHooks() {
        try {
            const ideHooksPath = join(homedir(), '.claude', 'ide-hooks.json');
            if (existsSync(ideHooksPath)) {
                const content = await readFile(ideHooksPath, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch (error) {
            console.error('Failed to load IDE hooks:', error);
        }
        return [];
    }
    async saveIDEHooks(hooks) {
        try {
            const ideHooksPath = join(homedir(), '.claude', 'ide-hooks.json');
            await this.ensureClaudeDir();
            await writeFile(ideHooksPath, JSON.stringify(hooks, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('Failed to save IDE hooks:', error);
        }
    }
    async saveHooks(hooks) {
        // Save IDE hooks separately
        await this.saveIDEHooks(hooks);
        // Save Claude format (without ideHooks field)
        const settings = await this.loadSettings();
        const convertedHooks = this.convertToClaudeFormat(hooks);
        // Remove ideHooks if it exists from old version
        delete settings.ideHooks;
        settings.hooks = convertedHooks;
        await this.saveSettings(settings);
    }
    // Test a hook by creating a temporary command that logs output
    createTestCommand(hook) {
        // Return a command that sets up environment variables and runs the hook
        return `
echo "🧪 Testing hook: ${hook.event} (${hook.matcher || 'all tools'})"
echo "📝 Command: ${hook.command}"
echo "▶️  Executing..."
echo ""

# Set up test environment variables
export FILE_PATH="/test/example.ts"
export COMMAND="echo 'test command'"
export TOOL_NAME="${hook.matcher || 'TestTool'}"
export NOTIFICATION_TYPE="test"
export CLAUDE_INSTANCE_NAME="Test Instance"
export CLAUDE_INSTANCE_ID="test-123"

# Execute the command
${hook.command}

echo ""
echo "✅ Hook test completed"
`.trim();
    }
    async configureClodeIntegration(instanceId, workingDirectory) {
        // Configure Claude to work with Clode Studio
        console.log('Configuring Claude integration for instance:', instanceId, 'in', workingDirectory);
        // Implementation would go here if needed
    }
    async cleanupClodeIntegration() {
        // Clean up Claude integration
        console.log('Cleaning up Claude integration');
        // Implementation would go here if needed
    }
}
export const claudeSettingsManager = new ClaudeSettingsManager();
