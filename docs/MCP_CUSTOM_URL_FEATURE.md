# Custom URL Feature for MCP Remote Servers

## Overview

Added the ability for users to customize the endpoint URL for remote MCP servers (HTTP and SSE) directly in the Quick Add interface.

## Changes Made

### 1. Added Two New Server Templates

#### Custom HTTP MCP
```javascript
{
  id: 'custom-http',
  name: 'Custom HTTP MCP',
  description: 'Connect to any HTTP MCP server',
  type: 'http',
  url: 'https://api.example.com/mcp', // placeholder
  customizable: true
}
```

#### Custom SSE MCP
```javascript
{
  id: 'custom-sse',
  name: 'Custom SSE MCP',
  description: 'Connect to any SSE MCP server',
  type: 'sse',
  url: 'https://api.example.com/sse', // placeholder
  customizable: true
}
```

### 2. Added `customizable` Field

- Added `customizable?: boolean` to the `MCPServerTemplate` interface
- When `true`, displays a custom URL input field instead of a static endpoint

### 3. UI Implementation

#### Custom URL Input
- Shows when `selectedServer.customizable` is `true`
- Replaces the static endpoint display with an input field
- Includes helpful placeholder and description
- Styled consistently with other inputs

#### Validation
- Updated `canInstall` computed property to check:
  - Custom URL is required for customizable remote servers
  - URL must not be empty
  - All environment variables must be filled

### 4. Installation Logic

- When installing a customizable server:
  - Uses the user-provided URL instead of the default
  - Validates the URL is not empty
  - Properly serializes the config for IPC

## User Experience

1. User selects "Custom HTTP MCP" or "Custom SSE MCP" from the Remote Services category
2. Modal shows a custom URL input field with placeholder
3. User enters their MCP server endpoint URL
4. User can also add any required headers/authentication via environment variables
5. Click "Add to Project" to save the configuration

## Benefits

- **Flexibility**: Users can connect to any HTTP or SSE MCP server
- **Development**: Developers can test their own MCP servers locally
- **Enterprise**: Companies can use internal MCP servers
- **Experimentation**: Easy to try new MCP servers without code changes

## Example Use Cases

1. **Local Development**
   - URL: `http://localhost:3000/mcp`
   - Test MCP servers during development

2. **Internal Company Servers**
   - URL: `https://mcp.company.internal/api`
   - Connect to private MCP servers

3. **Custom Implementations**
   - URL: `https://my-custom-mcp.herokuapp.com/sse`
   - Use custom MCP server implementations

## Technical Details

- State management: Added `customUrl` ref to track user input
- Cleared on modal close and server selection
- Integrated with existing validation flow
- Properly handles both HTTP and SSE transport types