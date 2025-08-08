# Clode Studio Integration MCP Server

This MCP server provides Claude instances spawned by Clode Studio with tools to interact with the Clode Studio environment.

## Features

This MCP server gives Claude access to:

- **File Operations**: Read, write, and list files in the workspace
- **Command Execution**: Run shell commands in the workspace context
- **Git Integration**: Check git status
- **Workspace Information**: Get context about the current workspace
- **Task Management**: Access Clode Studio tasks (planned)
- **Knowledge Base**: Search knowledge entries (planned)

## How It Works

1. When Clode Studio spawns a Claude instance, it automatically configures this MCP server in Claude's settings
2. The MCP server runs with environment variables that provide context (instance ID, working directory, user ID)
3. Claude can then use the provided tools to interact with the Clode Studio environment

## Available Tools

### clode_read_file
Read a file in the current workspace.
```
Arguments:
- path: Relative or absolute file path
```

### clode_write_file
Write a file in the current workspace.
```
Arguments:
- path: Relative or absolute file path
- content: File content to write
```

### clode_list_files
List files in a directory.
```
Arguments:
- path: Directory path (optional, defaults to working directory)
```

### clode_execute_command
Execute a shell command in the workspace.
```
Arguments:
- command: Command to execute
- timeout: Timeout in milliseconds (optional, default: 30000)
```

### clode_workspace_info
Get information about the current workspace and context.

### clode_git_status
Get git status of the current workspace.

### clode_list_tasks
List tasks from Clode Studio task board (integration pending).

### clode_search_knowledge
Search the Clode Studio knowledge base (integration pending).

## Development

### Installation
```bash
cd mcp-servers/clode-integration
npm install
```

### Testing
The MCP server is automatically configured when Claude instances are spawned by Clode Studio. To test manually:

```bash
CLAUDE_INSTANCE_ID=test-123 \
WORKSPACE_ID=/path/to/workspace \
USER_ID=testuser \
node index.js
```

## Architecture

This MCP server is integrated into Clode Studio's Claude spawning process:

1. `ClaudeSettingsManager` configures the MCP server in `~/.claude/settings.json`
2. When Claude starts, it reads the settings and loads the MCP server
3. The MCP server provides tools that Claude can use
4. When Claude exits, the configuration is cleaned up

## Security

- File operations are scoped to the workspace directory
- Commands execute with the same permissions as the Claude instance
- No network access or external API calls (all operations are local)