# MCP Troubleshooting Guide

## Common Issues

### MCP Servers Not Showing After Adding

If you've added MCP servers through the Quick Add interface but they don't appear in your Claude instance, here are some things to check:

### 1. Workspace-Specific Configuration
MCP servers are stored **per workspace**. When you change workspaces in the IDE, you're working with a different set of MCP configurations.

**Solution**: Make sure you're adding servers in the correct workspace.

### 2. Verify Installation
Test if servers are properly configured:

```bash
# In your workspace directory
claude mcp list
```

If servers show here but not in Claude, the issue is with the Claude instance connection.

### 3. Manual Testing
You can manually add a server to test:

```bash
# For SSE servers
claude mcp add --transport sse "context7" "https://mcp.context7.com/sse"

# For HTTP servers  
claude mcp add --transport http "context7-http" "https://mcp.context7.com/mcp"

# For stdio servers
claude mcp add --transport stdio "filesystem" "npx" "-y" "@modelcontextprotocol/server-filesystem"
```

### 4. Check Claude Instance
When starting a Claude instance through the IDE:
1. The instance should be started in the correct workspace directory
2. Check the console logs for the working directory
3. Verify Claude is detecting the correct path

### 5. Debugging Steps

1. **Check Console Output**: Look for messages like:
   ```
   Adding MCP server with command: /path/to/claude mcp add --transport sse "server-name" "url"
   ```

2. **Verify Success**: After adding, you should see:
   ```
   Added [TYPE] MCP server [NAME] with [URL/COMMAND] to local config
   ```

3. **List Servers**: Run in terminal:
   ```bash
   cd /your/workspace/path
   claude mcp list
   ```

### 6. Known Limitations

- MCP servers are stored in a "local config" which is workspace-specific
- Different Claude installations may have different configuration locations
- The IDE uses the Claude CLI to manage servers, not direct API access

### 7. Manual Configuration

If the Quick Add doesn't work, you can manually configure MCP servers:

1. Navigate to your workspace directory
2. Use the Claude CLI directly:
   ```bash
   claude mcp add --help  # See all options
   ```

### 8. Environment Variables

For servers requiring API keys, make sure to:
1. Replace `${ENV_VAR}` placeholders with actual values
2. Or set the environment variables before starting Claude
3. Some servers won't work without proper authentication

## Testing MCP Servers

Once added, test your MCP servers in Claude:

1. Start a new Claude instance in the workspace
2. Type a message that would use the MCP server
3. For Context7: Try "use context7 to explain React hooks"
4. For filesystem: Try "read the package.json file"

## Reporting Issues

If you continue to have issues:
1. Check the Electron console for errors (Cmd+Option+I in the IDE)
2. Look for error messages in the Terminal tab
3. Verify your Claude CLI version: `claude --version`
4. Make sure you're using Claude Code CLI, not the API