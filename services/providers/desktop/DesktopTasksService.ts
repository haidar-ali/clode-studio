import type { ITasksService, SimpleTask, TasksData } from '../../interfaces/ITasksService';

export class DesktopTasksService implements ITasksService {
  async loadTasks(projectPath: string): Promise<SimpleTask[]> {
    const filePath = `${projectPath}/.claude/simple-tasks.json`;
    
    try {
      const result = await window.electronAPI.fs.readFile(filePath);
      if (result.success && result.content) {
        const data: TasksData = JSON.parse(result.content);
        return data.tasks.map((task: any) => ({
          ...task,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt)
        }));
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
    
    return [];
  }

  async saveTasks(projectPath: string, tasks: SimpleTask[]): Promise<void> {
    const filePath = `${projectPath}/.claude/simple-tasks.json`;
    const data: TasksData = {
      tasks,
      version: '1.0.0',
      lastUpdated: new Date().toISOString()
    };
    
    // Ensure .claude directory exists
    const claudeDir = `${projectPath}/.claude`;
    await window.electronAPI.fs.ensureDir(claudeDir);
    
    await window.electronAPI.fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async saveTasksToMarkdown(projectPath: string, tasks: SimpleTask[]): Promise<void> {
    const tasksPath = `${projectPath}/TASKS.md`;
    
    // Group tasks by status
    const backlog = tasks.filter(t => t.status === 'backlog');
    const todo = tasks.filter(t => t.status === 'pending');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const completed = tasks.filter(t => t.status === 'completed');
    
    // Build markdown content
    let content = `# Project Tasks\n\n`;
    content += `*This file is synced with Clode Studio and Claude's native TodoWrite system.*  \n`;
    content += `*Last updated: ${new Date().toLocaleString()}*\n\n`;
    
    // Helper function to format a task
    const formatTask = (task: SimpleTask, isCompleted = false) => {
      const checkbox = isCompleted ? '[x]' : '[ ]';
      const strikethrough = isCompleted ? '~~' : '';
      
      let taskLine = `- ${checkbox} ${strikethrough}**${task.content}**${strikethrough}`;
      if (task.status === 'in_progress') taskLine += ' ⏳';
      taskLine += '\n';
      
      if (task.identifier) taskLine += `  - ${strikethrough}ID: ${task.identifier}${strikethrough}\n`;
      if (task.assignee) taskLine += `  - ${strikethrough}Assignee: ${task.assignee.charAt(0).toUpperCase() + task.assignee.slice(1)}${strikethrough}\n`;
      if (task.type) taskLine += `  - ${strikethrough}Type: ${task.type}${strikethrough}\n`;
      taskLine += `  - ${strikethrough}Priority: ${task.priority}${strikethrough}\n`;
      if (task.description) taskLine += `  - ${strikethrough}Description: ${task.description}${strikethrough}\n`;
      
      if (task.resources && task.resources.length > 0) {
        const resourcesList = task.resources.map(r => {
          if (typeof r === 'string') return r;
          return `${r.type.charAt(0).toUpperCase() + r.type.slice(1)}: ${r.name || r.id}`;
        }).join(', ');
        taskLine += `  - ${strikethrough}Resources: ${resourcesList}${strikethrough}\n`;
      }
      
      return taskLine;
    };
    
    // Add sections
    if (backlog.length > 0) {
      content += `## Backlog (${backlog.length})\n\n`;
      backlog.forEach(task => content += formatTask(task));
      content += '\n';
    }
    
    if (todo.length > 0) {
      content += `## To Do (${todo.length})\n\n`;
      todo.forEach(task => content += formatTask(task));
      content += '\n';
    }
    
    if (inProgress.length > 0) {
      content += `## In Progress (${inProgress.length})\n\n`;
      inProgress.forEach(task => content += formatTask(task));
      content += '\n';
    }
    
    if (completed.length > 0) {
      content += `## Completed (${completed.length})\n\n`;
      completed.forEach(task => content += formatTask(task, true));
    }
    
    await window.electronAPI.fs.writeFile(tasksPath, content);
  }
}