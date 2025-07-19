# MCP Server Configuration Examples

This directory contains example configurations for MCP (Model Context Protocol) servers in the Claude Code IDE.

## Files

### mcp-remote-example.json
Example configuration showing how to set up both local (stdio) and remote (SSE/HTTP) MCP servers.

## Transport Types

### 1. **stdio** (Local Servers)
Local servers that run on your machine as child processes.

```json
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"]
}
```

### 2. **sse** (Server-Sent Events)
Remote servers using SSE for real-time communication.

```json
{
  "name": "context7",
  "type": "sse",
  "url": "https://mcp.context7.com/sse"
}
```

### 3. **http** (Streamable HTTP)
Modern remote servers using streamable HTTP transport.

```json
{
  "name": "context7-http",
  "type": "http",
  "url": "https://mcp.context7.com/mcp"
}
```

## Authentication

Remote servers often require authentication. You can add headers:

```json
{
  "name": "authenticated-server",
  "type": "http",
  "url": "https://api.example.com/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN",
    "X-API-Key": "YOUR_API_KEY"
  }
}
```

## Popular Remote Servers

### Context7
Provides real-time documentation for any library:
- SSE endpoint: `https://mcp.context7.com/sse`
- HTTP endpoint: `https://mcp.context7.com/mcp`

### Custom Deployments
You can deploy your own MCP servers on:
- Cloudflare Workers
- Azure Container Apps
- AWS Lambda (with API Gateway)
- Any HTTP server with SSE support

## Tips

1. **No Installation**: Remote servers don't require any local installation
2. **Instant Access**: Connect immediately without setup
3. **Authentication**: Most production servers require API keys
4. **Performance**: HTTP transport is generally faster than SSE
5. **Compatibility**: Check which transport your Claude client supports

## Testing

To test a remote MCP server:
1. Add it through the Quick Add interface in the IDE
2. Or manually edit your Claude configuration
3. The server should appear in your MCP connections list
4. Claude will automatically discover available tools

## Security

- Never commit API keys or tokens
- Use environment variables for sensitive values
- Verify SSL certificates for remote endpoints
- Only connect to trusted MCP servers