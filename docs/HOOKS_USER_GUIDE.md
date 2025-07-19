# Claude Hooks User Guide

## Overview

Hooks allow you to automate actions based on Claude's activities. You can run commands, scripts, or notifications when Claude uses tools, completes tasks, or specific events occur.

## Quick Start

### Opening Hook Manager

1. Press **Cmd/Ctrl + Shift + H** to open Hook Manager
2. Or click **Settings** → **Hooks** in the menu
3. Or use the command `/hooks` in Claude

### Creating Your First Hook

1. Click **Add Hook** in the Hook Manager
2. Choose an event type:
   - **PreToolUse**: Before Claude uses a tool
   - **PostToolUse**: After Claude uses a tool
   - **Notification**: When Claude shows notifications
   - **Stop**: When conversation is stopped
   - **SubagentStop**: When subagent is stopped
3. Set a matcher (regex pattern or leave empty for all)
4. Enter your command
5. Click **Save**

## Hook Events Explained

### PreToolUse
Triggers before Claude executes a tool (read_file, write_file, etc.)

**Use cases**:
- Create backups before file modifications
- Log tool usage
- Validate operations

**Example**:
```bash
# Backup files before editing
cp {{file}} {{file}}.backup
```

### PostToolUse
Triggers after Claude completes a tool operation

**Use cases**:
- Run tests after code changes
- Format code after writing
- Commit changes automatically

**Example**:
```bash
# Auto-format Python files after editing
if [[ "{{file}}" == *.py ]]; then
  black "{{file}}"
fi
```

### Notification
Triggers when Claude displays notifications

**Use cases**:
- Desktop notifications
- Slack/Discord alerts
- Sound alerts

**Example**:
```bash
# macOS notification
osascript -e 'display notification "{{message}}" with title "Claude"'
```

### Stop
Triggers when you stop Claude's execution

**Use cases**:
- Cleanup operations
- Save state
- Reset environment

### SubagentStop
Triggers when a subagent operation is stopped

**Use cases**:
- Cancel long-running processes
- Clean temporary files

## Matcher Patterns

### Basic Matching
- Leave empty to match all events
- Use exact text: `write_file`
- Use wildcards: `*.py`

### Regex Patterns
- File patterns: `.*\.js$` (all JavaScript files)
- Path patterns: `.*/tests/.*` (files in tests folders)
- Tool names: `^(read|write)_file$`

### Examples

**Match Python files**:
```regex
.*\.py$
```

**Match test files**:
```regex
.*test.*\.(js|ts|py)$
```

**Match specific tools**:
```regex
^(write_file|create_file)$
```

## Command Variables

### Available Variables
- `{{file}}` - Current file path
- `{{tool}}` - Tool name being used
- `{{message}}` - Notification message
- `{{content}}` - File content (PostToolUse)
- `{{CLAUDE_INSTANCE_ID}}` - Current instance ID
- `{{CLAUDE_INSTANCE_NAME}}` - Instance name

### Environment Variables
- `$HOME` - User home directory
- `$PWD` - Current working directory
- `$USER` - Current user

## Practical Examples

### 1. Auto-commit Changes
**Event**: PostToolUse  
**Matcher**: `write_file`  
**Command**:
```bash
git add "{{file}}" && git commit -m "Auto-commit: Updated {{file}}"
```

### 2. Run Tests on Save
**Event**: PostToolUse  
**Matcher**: `.*\.test\.js$`  
**Command**:
```bash
npm test -- "{{file}}"
```

### 3. Backup Before Delete
**Event**: PreToolUse  
**Matcher**: `delete_file`  
**Command**:
```bash
mkdir -p ~/.claude-backups && cp "{{file}}" ~/.claude-backups/
```

### 4. Notify on Long Tasks
**Event**: Notification  
**Matcher**: `.*completed.*`  
**Command**:
```bash
say "Task completed" # macOS text-to-speech
```

### 5. Format on Save
**Event**: PostToolUse  
**Matcher**: `.*\.(js|ts|jsx|tsx)$`  
**Command**:
```bash
prettier --write "{{file}}"
```

## Hook Management

### Testing Hooks
1. Click **Test** button next to any hook
2. Simulates the event with sample data
3. Shows command output
4. Helps debug before enabling

### Enabling/Disabling
- Toggle the switch to enable/disable
- Disabled hooks remain saved but don't execute
- Useful for temporary deactivation

### Editing Hooks
1. Click on any hook to edit
2. Modify event, matcher, or command
3. Click **Update** to save changes

### Deleting Hooks
1. Click the trash icon
2. Confirm deletion
3. Hook is permanently removed

## Advanced Usage

### Chaining Commands
Use `&&` to chain multiple commands:
```bash
prettier --write "{{file}}" && eslint --fix "{{file}}"
```

### Conditional Execution
Use bash conditionals:
```bash
if [[ "{{file}}" == *.test.* ]]; then
  npm test "{{file}}"
fi
```

### Background Tasks
Run commands in background:
```bash
(sleep 5 && npm run build) &
```

### Logging
Create audit logs:
```bash
echo "[$(date)] {{tool}} used on {{file}}" >> ~/.claude-audit.log
```

## Best Practices

### 1. Start Simple
- Test with `echo` commands first
- Gradually add complexity
- Use the Test feature

### 2. Be Specific
- Use precise matchers
- Avoid overly broad patterns
- Target specific file types

### 3. Handle Errors
- Add error checking to commands
- Use `|| true` to prevent failures
- Log errors for debugging

### 4. Performance
- Keep commands fast
- Use background tasks for long operations
- Avoid blocking Claude's workflow

### 5. Security
- Be cautious with file operations
- Validate inputs when possible
- Don't expose sensitive data

## Troubleshooting

### Hook Not Firing
1. Check if hook is enabled
2. Verify matcher pattern
3. Test with empty matcher
4. Check Hook Manager for errors

### Command Failing
1. Test command in terminal first
2. Check variable substitution
3. Verify file paths exist
4. Look for permission issues

### Performance Issues
1. Simplify complex commands
2. Use background execution
3. Disable unnecessary hooks
4. Check system resources

## Platform-Specific Notes

### macOS
- Use `osascript` for notifications
- Use `say` for text-to-speech
- Use `open` to launch applications

### Linux
- Use `notify-send` for notifications
- Use `espeak` for text-to-speech
- Check if commands exist first

### Windows
- Use PowerShell for advanced features
- Escape paths with spaces
- Use forward slashes in paths

## Integration Tips

### With Git
```bash
# Auto-stage changes
git add "{{file}}"

# Create feature branches
git checkout -b "claude-edit-$(date +%s)"
```

### With Build Tools
```bash
# Trigger webpack rebuild
touch webpack.config.js

# Run specific npm scripts
npm run lint:fix -- "{{file}}"
```

### With IDEs
```bash
# Open in VS Code
code "{{file}}"

# Refresh IntelliJ
touch .idea/workspace.xml
```

Remember: Hooks are powerful but should enhance, not hinder, your workflow. Start small and build up as you discover useful patterns!