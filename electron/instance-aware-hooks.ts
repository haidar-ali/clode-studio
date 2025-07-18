import { homedir } from 'os';
import { join } from 'path';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

interface InstanceAwareHook {
  id: string;
  event: string;
  matcher: string;
  command: string;
  disabled?: boolean;
  instanceFilter?: {
    instanceIds?: string[];
    instanceNames?: string[];
    allInstances?: boolean;
  };
}

export class InstanceAwareHooksManager {
  private hookStateFile: string;
  
  constructor() {
    this.hookStateFile = join(homedir(), '.claude', 'ide-hook-state.json');
  }
  
  /**
   * Creates instance-aware notification hooks that can track which instance triggered them
   */
  async createInstanceAwareHooks(): Promise<InstanceAwareHook[]> {
    const hooks: InstanceAwareHook[] = [
      {
        id: 'notify-finished-instance',
        event: 'Stop',
        matcher: '',
        command: this.createNotificationCommand(
          'Claude Finished', 
          'Response complete in $CLAUDE_INSTANCE_NAME'
        ),
        disabled: false,
        instanceFilter: { allInstances: true }
      },
      {
        id: 'notify-input-needed-instance',
        event: 'Notification',
        matcher: '',
        command: this.createNotificationCommand(
          'Claude Needs Input',
          'Input required in $CLAUDE_INSTANCE_NAME'
        ),
        disabled: false,
        instanceFilter: { allInstances: true }
      },
      {
        id: 'track-instance-state',
        event: 'Stop',
        matcher: '',
        command: this.createStateTrackingCommand(),
        disabled: false,
        instanceFilter: { allInstances: true }
      }
    ];
    
    return hooks;
  }
  
  /**
   * Creates a cross-platform notification command
   */
  private createNotificationCommand(title: string, message: string): string {
    // Escape the message for shell
    const escapedMessage = message.replace(/"/g, '\\"');
    const escapedTitle = title.replace(/"/g, '\\"');
    
    return `
#!/bin/bash
# Instance-aware notification hook
INSTANCE_ID="\${CLAUDE_INSTANCE_ID:-unknown}"
INSTANCE_NAME="\${CLAUDE_INSTANCE_NAME:-Claude}"

# Replace placeholders in message
MESSAGE="${escapedMessage}"
MESSAGE=\${MESSAGE//\\$CLAUDE_INSTANCE_NAME/\$INSTANCE_NAME}
MESSAGE=\${MESSAGE//\\$CLAUDE_INSTANCE_ID/\$INSTANCE_ID}

# Try macOS notification
if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \\"\$MESSAGE\\" with title \\"${escapedTitle}\\""
# Try Linux notification
elif command -v notify-send >/dev/null 2>&1; then
  notify-send "${escapedTitle}" "\$MESSAGE"
# Fallback to terminal bell and echo
else
  echo -e "\\a[${escapedTitle}] \$MESSAGE"
fi

# Log to IDE state file for tracking
echo "{\\"event\\": \\"${title}\\", \\"instanceId\\": \\"\$INSTANCE_ID\\", \\"instanceName\\": \\"\$INSTANCE_NAME\\", \\"timestamp\\": \\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}" >> ~/.claude/ide-hook-events.jsonl
`.trim();
  }
  
  /**
   * Creates a command to track instance state
   */
  private createStateTrackingCommand(): string {
    return `
#!/bin/bash
# Track which instance finished responding
INSTANCE_ID="\${CLAUDE_INSTANCE_ID:-unknown}"
INSTANCE_NAME="\${CLAUDE_INSTANCE_NAME:-Claude}"
STATE_FILE=~/.claude/ide-hook-state.json

# Create directory if it doesn't exist
mkdir -p ~/.claude

# Update state file with instance status
if [ -f "\$STATE_FILE" ]; then
  # Read existing state
  CURRENT_STATE=$(cat "\$STATE_FILE" 2>/dev/null || echo "{}")
else
  CURRENT_STATE="{}"
fi

# Update state using a simple approach (without jq dependency)
echo "{\\"lastStopEvent\\": {\\"instanceId\\": \\"\$INSTANCE_ID\\", \\"instanceName\\": \\"\$INSTANCE_NAME\\", \\"timestamp\\": \\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}}" > "\$STATE_FILE"
`.trim();
  }
  
  /**
   * Get the last instance that triggered a Stop event
   */
  async getLastStopInstance(): Promise<{ instanceId: string; instanceName: string; timestamp: string } | null> {
    try {
      if (!existsSync(this.hookStateFile)) {
        return null;
      }
      
      const content = await readFile(this.hookStateFile, 'utf-8');
      const state = JSON.parse(content);
      
      return state.lastStopEvent || null;
    } catch (error) {
      console.error('Failed to read hook state:', error);
      return null;
    }
  }
  
  /**
   * Convert instance-aware hooks to Claude format
   */
  convertToClaudeFormat(hooks: InstanceAwareHook[]): any {
    const claudeHooks: any = {};
    
    hooks.filter(h => !h.disabled).forEach(hook => {
      const event = hook.event;
      if (!claudeHooks[event]) {
        claudeHooks[event] = [];
      }
      
      let matcherGroup = claudeHooks[event].find((m: any) => m.matcher === (hook.matcher || ''));
      if (!matcherGroup) {
        matcherGroup = {
          matcher: hook.matcher || '',
          hooks: []
        };
        claudeHooks[event].push(matcherGroup);
      }
      
      matcherGroup.hooks.push({
        type: 'command',
        command: hook.command
      });
    });
    
    return claudeHooks;
  }
}

export const instanceAwareHooks = new InstanceAwareHooksManager();