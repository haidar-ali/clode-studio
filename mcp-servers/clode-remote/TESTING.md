# Testing the Clode Studio Remote MCP Server

## Quick Test

1. **Install dependencies**:
   ```bash
   cd mcp-servers/clode-remote
   npm install
   ```

2. **Run the test script**:
   ```bash
   node test.js
   ```

   This will:
   - Spawn the MCP server
   - Send test JSON-RPC messages
   - Display responses
   - Verify the protocol is working

## Manual Testing

1. **Start your Clode Studio app in hybrid mode**:
   ```bash
   CLODE_MODE=hybrid npm run electron:dev
   ```

2. **Configure Claude Desktop**:
   - Run `node setup.js` to see configuration instructions
   - Or run `node setup.js --auto-config` to automatically add the config

3. **Test in Claude Desktop**:
   Once configured, you can test by asking Claude:
   - "Use the clode-remote MCP server to connect to localhost:3789"
   - "Use remote_workspace_info to get workspace information"
   - "Use remote_list_directory to list the root directory"

## Testing Individual Tools

### Without Claude Desktop

You can test the MCP server directly using the JSON-RPC protocol:

```bash
# Start the server
node index.js

# In another terminal, send JSON-RPC messages
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | node index.js
```

### With Environment Variables

```bash
# Set server URL via environment
CLODE_REMOTE_URL=http://my-server:3789 node index.js

# Or with authentication
CLODE_REMOTE_TOKEN=my-token node index.js
```

## Debugging

1. **Check logs**: The server logs to stderr, which you can see in Claude Desktop's logs
2. **Connection issues**: Ensure the Clode Studio remote server is running on the expected port
3. **Tool errors**: Each tool returns detailed error messages if something goes wrong

## Expected Responses

When working correctly, you should see:

- **tools/list**: Returns array of 9 available tools
- **remote_connect**: "Connected to remote server at [URL]"
- **remote_workspace_info**: JSON object with sync statistics
- **remote_list_directory**: Array of files and directories