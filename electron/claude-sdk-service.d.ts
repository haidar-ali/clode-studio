export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export interface TodoResult {
  success: boolean;
  todos?: Todo[];
  error?: string;
}

export interface ClaudeCodeService {
  getCurrentTodos(cwd?: string): Promise<TodoResult>;
  createTodosForTask(taskDescription: string, cwd?: string): Promise<TodoResult>;
  updateTodoStatus(todoId: string, newStatus: string, cwd?: string): Promise<TodoResult>;
}

export const claudeCodeService: ClaudeCodeService;