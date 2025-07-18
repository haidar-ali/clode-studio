import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface ClaudeHook {
  type: 'command';
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: ClaudeHook[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
    Notification?: HookMatcher[];
    Stop?: HookMatcher[];
    SubagentStop?: HookMatcher[];
  };
  // Store our hook format with IDs for the IDE
  ideHooks?: Array<{
    id: string;
    event: string;
    matcher: string;
    command: string;
    disabled?: boolean;
  }>;
  [key: string]: any;
}

export class ClaudeSettingsManager {
  private userSettingsPath: string;
  
  constructor() {
    this.userSettingsPath = join(homedir(), '.claude', 'settings.json');
  }
  
  private async ensureClaudeDir(): Promise<void> {
    const claudeDir = join(homedir(), '.claude');
    if (!existsSync(claudeDir)) {
      await mkdir(claudeDir, { recursive: true });
    }
  }
  
  async loadSettings(): Promise<ClaudeSettings> {
    try {
      if (existsSync(this.userSettingsPath)) {
        const content = await readFile(this.userSettingsPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load Claude settings:', error);
    }
    return {};
  }
  
  async saveSettings(settings: ClaudeSettings): Promise<void> {
    try {
      await this.ensureClaudeDir();
      await writeFile(this.userSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      console.log('Saved Claude settings to:', this.userSettingsPath);
    } catch (error) {
      console.error('Failed to save Claude settings:', error);
      throw error;
    }
  }
  
  // Convert our simplified hook format to Claude's format
  convertToClaudeFormat(hooks: Array<{
    id: string;
    event: string;
    matcher: string;
    command: string;
    disabled?: boolean;
  }>): ClaudeSettings['hooks'] {
    const claudeHooks: ClaudeSettings['hooks'] = {};
    
    // Group hooks by event
    hooks.filter(h => !h.disabled).forEach(hook => {
      const event = hook.event as keyof NonNullable<ClaudeSettings['hooks']>;
      if (!claudeHooks) return;
      
      if (!claudeHooks[event]) {
        claudeHooks[event] = [];
      }
      
      // Find or create matcher group
      const eventHooks = claudeHooks[event];
      if (!eventHooks) return;
      
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
  convertFromClaudeFormat(claudeHooks: ClaudeSettings['hooks']): Array<{
    id: string;
    event: string;
    matcher: string;
    command: string;
    disabled: boolean;
  }> {
    const hooks: Array<{
      id: string;
      event: string;
      matcher: string;
      command: string;
      disabled: boolean;
    }> = [];
    
    if (!claudeHooks) return hooks;
    
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
    const settings = await this.loadSettings();
    // Return our ideHooks format if it exists, otherwise convert from Claude format
    return settings.ideHooks || this.convertFromClaudeFormat(settings.hooks);
  }
  
  async saveHooks(hooks: Array<{
    id: string;
    event: string;
    matcher: string;
    command: string;
    disabled?: boolean;
  }>) {
    console.log('saveHooks called with:', hooks);
    const settings = await this.loadSettings();
    const convertedHooks = this.convertToClaudeFormat(hooks);
    console.log('Converted hooks to Claude format:', JSON.stringify(convertedHooks, null, 2));
    settings.hooks = convertedHooks;
    // Also save our format with IDs for the IDE
    settings.ideHooks = hooks;
    console.log('Final settings to save:', JSON.stringify(settings, null, 2));
    await this.saveSettings(settings);
  }
  
  // Test a hook by creating a temporary command that logs output
  createTestCommand(hook: {
    event: string;
    matcher: string;
    command: string;
  }): string {
    // Wrap the command to capture output
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

# Execute the command
${hook.command}

echo ""
echo "✅ Hook test completed"
`.trim();
  }
}

export const claudeSettingsManager = new ClaudeSettingsManager();