# Clode Studio Remote MCP Server

This MCP server provides remote collaboration features for Clode Studio, allowing Claude to interact with remote Clode Studio instances.

## Features

- Remote file operations (read, write, list)
- Remote terminal management
- Remote workspace synchronization
- Seamless integration with Clode Studio's remote infrastructure

## Installation

```bash
cd mcp-servers/clode-remote
npm install
```

## Configuration

### Method 1: Add to Claude Desktop config

Add the following to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "clode-remote": {
      "command": "node",
      "args": ["/path/to/clode-studio/mcp-servers/clode-remote/index.js"],
      "env": {}
    }
  }
}
```

### Method 2: Use with npm link

```bash
# In the MCP server directory
npm link

# Then add to Claude config
{
  "mcpServers": {
    "clode-remote": {
      "command": "clode-remote-mcp"
    }
  }
}
```

## Remote Configuration

The server looks for configuration in `~/.clode-studio/remote-config.json`:

```json
{
  "serverUrl": "http://localhost:3789",
  "auth": {
    "token": "your-auth-token"
  },
  "connectionTimeout": 30000
}
```

## Available Tools

### remote_connect
Connect to a remote Clode Studio server.
```
Arguments:
- serverUrl: Server URL (optional, default: http://localhost:3789)
- token: Authentication token (optional)
```

### remote_read_file
Read a file from the remote server.
```
Arguments:
- path: File path to read (required)
```

### remote_write_file
Write a file on the remote server.
```
Arguments:
- path: File path to write (required)
- content: File content (required)
```

### remote_list_directory
List contents of a remote directory.
```
Arguments:
- path: Directory path (optional, default: /)
```

### remote_create_terminal
Create a remote terminal session.
```
Arguments:
- workingDirectory: Working directory for the terminal (optional)
```

### remote_execute_command
Execute a command in a remote terminal.
```
Arguments:
- terminalId: Terminal ID from create_terminal (required)
- command: Command to execute (required)
```

### remote_sync_push
Push sync patches to remote server.
```
Arguments:
- patches: Array of sync patches (required)
```

### remote_sync_pull
Pull sync patches from remote server.
```
Arguments:
- since: ISO date string to pull patches since (optional)
- types: Entity types to filter (optional)
```

### remote_workspace_info
Get information about the remote workspace.

## Example Usage in Claude

Once configured, you can use these commands in Claude:

```
# Connect to a remote server
Use the remote_connect tool to connect to http://my-server.com:3789

# Read a remote file
Use the remote_read_file tool to read /home/user/project/src/main.ts

# Create and use a terminal
Use the remote_create_terminal tool with workingDirectory /home/user/project
Then use remote_execute_command to run "npm test" in that terminal
```

## Development

To test the MCP server locally:

```bash
# Run in stdio mode for testing
node index.js

# The server expects JSON-RPC messages on stdin
# and sends responses on stdout
```

## Troubleshooting

1. **Connection issues**: Check that the remote Clode Studio server is running and accessible
2. **Authentication errors**: Ensure your token is valid in the remote-config.json
3. **Tool errors**: Check the server logs for detailed error messages