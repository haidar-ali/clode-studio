export interface SimpleTask {
  id: string;
  identifier?: string;
  content: string;
  status: 'backlog' | 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  type?: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  assignee?: 'claude' | 'user' | 'both';
  description?: string;
  resources?: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TasksData {
  tasks: SimpleTask[];
  version: string;
  lastUpdated: string;
}

export interface ITasksService {
  loadTasks(projectPath: string): Promise<SimpleTask[]>;
  saveTasks(projectPath: string, tasks: SimpleTask[]): Promise<void>;
  saveTasksToMarkdown(projectPath: string, tasks: SimpleTask[]): Promise<void>;
}