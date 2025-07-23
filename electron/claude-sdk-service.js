import { query } from '@anthropic-ai/claude-code';

/**
 * Claude Code SDK Service
 * Provides integration with Claude Code SDK for todo management and MCP support
 */
export class ClaudeCodeService {
  constructor() {
    this.currentSession = null;
    this.todos = [];
    this.mcpServers = {};
  }

  /**
   * Initialize Claude Code session with MCP support
   */
  async initializeSession(options = {}) {
    const defaultOptions = {
      cwd: process.cwd(),
      allowedTools: ['TodoRead', 'TodoWrite', 'Read', 'Write'],
      permissionMode: 'acceptEdits',
      maxTurns: 10,
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', options.cwd || process.cwd()]
        }
      }
    };

    return { ...defaultOptions, ...options };
  }

  /**
   * Get current todos from Claude using SDK
   */
  async getCurrentTodos(cwd = process.cwd()) {
    try {
      const options = await this.initializeSession({ cwd });
      
      const response = query({
        prompt: 'Please show me your current todo list using TodoRead. If you don\'t have any todos, just say "No todos found".',
        options
      });

      const todos = [];
      let fullResponse = '';

      for await (const message of response) {
        if (message.type === 'assistant') {
          fullResponse += message.message.content[0]?.text || '';
        } else if (message.type === 'result' && message.subtype === 'success') {
          // Parse the result for todos
          const extractedTodos = this.parseClaudeTodos(fullResponse);
          todos.push(...extractedTodos);
          break;
        }
      }

      this.todos = todos;
      return { success: true, todos };
    } catch (error) {
      console.error('Error getting todos from Claude SDK:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ask Claude to create todos for a specific task
   */
  async createTodosForTask(taskDescription, cwd = process.cwd()) {
    try {
      console.log('Creating todos with Claude SDK for:', taskDescription, 'in', cwd);
      
      const options = await this.initializeSession({ cwd });
      
      const response = query({
        prompt: `Please create a todo list for: "${taskDescription}". Use TodoWrite to create the todos with appropriate priorities and statuses.`,
        options
      });

      const todos = [];
      let fullResponse = '';
      let toolUseFound = false;

      for await (const message of response) {
        console.log('Claude SDK message type:', message.type, 'subtype:', message.subtype);
        
        if (message.type === 'assistant') {
          fullResponse += message.message.content[0]?.text || '';
          console.log('Assistant response:', fullResponse);
        } else if (message.type === 'tool_use' && message.name === 'TodoWrite') {
          // Handle TodoWrite tool use directly
          toolUseFound = true;
          console.log('TodoWrite tool use found:', message);
          if (message.input && message.input.todos) {
            todos.push(...message.input.todos);
          }
        } else if (message.type === 'result') {
          console.log('Result message:', message);
          if (!toolUseFound) {
            // Fallback to parsing if no tool use was found
            const extractedTodos = this.parseClaudeTodos(fullResponse);
            todos.push(...extractedTodos);
          }
          break;
        }
      }

      console.log('Final todos extracted:', todos);
      this.todos = todos;
      return { success: true, todos };
    } catch (error) {
      console.error('Error creating todos with Claude SDK:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a todo status using Claude SDK
   */
  async updateTodoStatus(todoId, newStatus, cwd = process.cwd()) {
    try {
      const options = await this.initializeSession({ cwd });
      
      const response = query({
        prompt: `Please update the todo with ID "${todoId}" to status "${newStatus}" using TodoWrite.`,
        options
      });

      for await (const message of response) {
        if (message.type === 'result' && message.subtype === 'success') {
          // Refresh todos after update
          return await this.getCurrentTodos(cwd);
        }
      }

      return { success: false, error: 'Failed to update todo' };
    } catch (error) {
      console.error('Error updating todo with Claude SDK:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse Claude's todo output into structured format
   */
  parseClaudeTodos(text) {
    const todos = [];
    console.log('Parsing Claude response for todos:', text);
    
    // Look for TodoWrite/TodoRead tool usage with various formats
    const patterns = [
      /TodoWrite.*?todos.*?\[(.*?)\]/s,
      /todos":\s*\[(.*?)\]/s,
      /"todos":\s*\[(.*?)\]/s,
      /\btodos\b[:\s]*\[(.*?)\]/s
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const todosJson = `[${match[1]}]`;
          console.log('Attempting to parse JSON:', todosJson);
          const parsedTodos = JSON.parse(todosJson);
          
          const mappedTodos = parsedTodos.map(todo => ({
            id: todo.id || `claude-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            content: todo.content,
            status: this.mapClaudeStatus(todo.status),
            priority: this.mapClaudePriority(todo.priority)
          }));
          
          console.log('Successfully parsed todos:', mappedTodos);
          return mappedTodos;
        } catch (error) {
          console.error('Error parsing TodoWrite JSON with pattern:', pattern, error);
        }
      }
    }

    // Fallback: Parse numbered list or checkbox format
    const lines = text.split('\n');
    let todoIdCounter = 0;
    
    for (const line of lines) {
      // Match checkbox format: ☐ Task or - [ ] Task
      const checkboxMatch = line.match(/^[\s]*[-*]?\s*\[[ x]\]\s+(.+)$/i) || 
                           line.match(/^[\s]*[☐☒✓✅]\s+(.+)$/);
      if (checkboxMatch) {
        const content = checkboxMatch[1].trim();
        const isCompleted = line.includes('[x]') || line.includes('[X]') || 
                           line.includes('☒') || line.includes('✅') || line.includes('✓');
        
        todos.push({
          id: `claude-${Date.now()}-${todoIdCounter++}`,
          content,
          status: isCompleted ? 'completed' : 'pending',
          priority: 'medium'
        });
        continue;
      }
      
      // Match numbered list: 1. Task or 1) Task
      const numberedMatch = line.match(/^[\s]*\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        todos.push({
          id: `claude-${Date.now()}-${todoIdCounter++}`,
          content: numberedMatch[1].trim(),
          status: 'pending',
          priority: 'medium'
        });
        continue;
      }
      
      // Match bullet points: • Task or - Task or * Task
      const bulletMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);
      if (bulletMatch && !line.includes('[')) {
        todos.push({
          id: `claude-${Date.now()}-${todoIdCounter++}`,
          content: bulletMatch[1].trim(),
          status: 'pending',
          priority: 'medium'
        });
      }
    }

    console.log('Fallback parsing found todos:', todos);
    return todos;
  }

  /**
   * Map Claude's status to our format
   */
  mapClaudeStatus(status) {
    switch (status) {
      case 'in_progress': return 'in_progress';
      case 'completed': return 'completed';
      case 'pending': return 'pending';
      default: return 'pending';
    }
  }

  /**
   * Map Claude's priority to our format
   */
  mapClaudePriority(priority) {
    switch (priority) {
      case 'high': return 'high';
      case 'low': return 'low';
      case 'medium': return 'medium';
      default: return 'medium';
    }
  }

  /**
   * Set up MCP server for enhanced functionality
   */
  async setupMCPServer(serverName, config) {
    this.mcpServers[serverName] = config;
    return { success: true, serverName, config };
  }
}

// Export singleton instance
export const claudeCodeService = new ClaudeCodeService();