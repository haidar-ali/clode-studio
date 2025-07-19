# Multi-Instance Claude Guide

## Overview

Claude Code IDE supports running multiple Claude instances simultaneously, allowing you to work on different tasks or contexts in parallel. Each instance maintains its own context, personality, and working directory.

## Features

### 1. Instance Management
- Create unlimited Claude instances
- Each instance runs in its own terminal tab
- Custom naming for easy identification
- Visual status indicators (starting, running, stopped)
- Independent context for each instance

### 2. Personality System
Each Claude instance can have a different personality/role:

- **Full Stack (Default)**: General-purpose development
- **Plumber**: System administration and operations
- **Frontend**: UI/UX focused development
- **Backend**: Server and API development
- **Jester**: Creative and playful approach
- **Architect**: System design and architecture
- **Theorist**: Algorithm and theory expert
- **Pedagogue**: Teaching and explanation focused

### 3. Workspace Persistence
- Instance configurations saved per workspace
- Automatic restoration on workspace reload
- Personality preferences remembered
- Working directory preserved

## Getting Started

### Creating a New Instance

1. Click the **+** button in the Claude terminal tabs
2. (Optional) Enter a custom name for the instance
3. Select a personality from the dropdown
4. The new instance starts automatically

### Managing Instances

**Switching Between Instances**:
- Click on the terminal tab to switch
- Each tab shows the instance name and status

**Stopping an Instance**:
- Click the stop button (■) in the terminal
- Or close the tab with the × button

**Renaming an Instance**:
- Right-click on the tab (feature coming soon)
- Or use the instance settings

### Setting Personalities

1. Click the personality dropdown in the terminal header
2. Select from available personalities
3. The change takes effect immediately
4. Claude acknowledges the personality change

## Use Cases

### 1. Parallel Development
Run separate instances for:
- Frontend development (Frontend personality)
- Backend API work (Backend personality)
- Database operations (Plumber personality)

### 2. Context Isolation
Keep different features isolated:
- One instance per feature branch
- Separate instances for debugging
- Isolated testing environments

### 3. Specialized Assistance
Use personalities for specific tasks:
- **Architect**: System design discussions
- **Pedagogue**: Learning new concepts
- **Theorist**: Algorithm optimization
- **Jester**: Creative problem solving

## Best Practices

### 1. Naming Conventions
Use descriptive names:
- `frontend-auth`: Frontend authentication work
- `api-v2`: API version 2 development
- `debug-memory`: Memory leak debugging

### 2. Personality Selection
Match personality to task:
- Complex algorithms → Theorist
- UI components → Frontend
- System scripts → Plumber
- Code reviews → Architect

### 3. Resource Management
- Close unused instances to free memory
- Limit to 3-4 active instances
- Use focused contexts per instance

## Advanced Features

### Instance-Specific Commands
Some commands work within instance context:
- `/clear` - Clears current instance terminal
- `/personality <name>` - Changes personality
- Working directory commands affect only that instance

### Hooks Integration
Hooks can be instance-aware:
- Use `CLAUDE_INSTANCE_ID` in hook commands
- Instance-specific notifications
- Targeted tool execution

### Session Resume
- Each instance maintains its own session
- Resume previous conversations per instance
- Context preserved across restarts

## Keyboard Shortcuts

- **Cmd/Ctrl + T**: New Claude instance
- **Cmd/Ctrl + W**: Close current instance
- **Cmd/Ctrl + 1-9**: Switch to instance N
- **Cmd/Ctrl + Tab**: Cycle through instances

## Status Indicators

- 🟡 **Starting**: Instance is initializing
- 🟢 **Running**: Instance is ready
- 🔴 **Stopped**: Instance has terminated
- ⚡ **Busy**: Instance is processing

## Tips

### Efficient Multi-Tasking
1. Use one instance per major task
2. Name instances by feature/ticket
3. Close completed task instances
4. Keep a "main" instance for general work

### Context Management
1. Each instance maintains separate context
2. Share files between instances via filesystem
3. Use knowledge base for shared information
4. Checkpoint important contexts

### Performance Optimization
1. Monitor system resources with multiple instances
2. Close inactive instances
3. Use lighter personalities for simple tasks
4. Restart instances if they become sluggish

## Troubleshooting

### Instance Won't Start
- Check if Claude CLI is installed
- Verify no port conflicts
- Check system resources
- Try restarting the IDE

### Personality Not Changing
- Ensure instance is running
- Try sending a message after change
- Restart instance if needed

### High Memory Usage
- Close unused instances
- Clear long conversation histories
- Restart instances periodically
- Monitor system resources

## Integration with Other Features

### Task Management
- Assign tasks to specific instances
- Track progress per instance
- Use instance names in task descriptions

### Knowledge Base
- Shared across all instances
- Document instance-specific findings
- Create per-instance documentation

### MCP Servers
- Available to all instances
- Configure per-workspace
- Share tools across instances