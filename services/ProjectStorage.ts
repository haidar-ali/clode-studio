/**
 * ProjectStorage Service
 * Handles distributed JSON storage for epics, stories, and tasks
 * Optimized for minimal token consumption and efficient file operations
 */

import type { Epic, Story, SimpleTask } from '~/stores/tasks';

export interface ProjectManifest {
  version: string;
  projectId: string;
  lastSync: Date;
  counts: {
    epics: { total: number; active: number; completed: number };
    stories: { total: number; active: number; completed: number };
    tasks: { total: number; active: number; completed: number };
  };
  activeWork: {
    currentEpic?: string;
    currentStories: string[];
    inProgressTasks: string[];
  };
  settings: {
    autoArchiveAfterDays: number;
    taskIdPrefix: string;
    epicIdPrefix: string;
    storyIdPrefix: string;
  };
}

export interface StorageFile<T> {
  version: string;
  lastModified: Date;
  items: T[];
}

export class ProjectStorage {
  private basePath: string;
  private projectPath: string;
  private archivePath: string;
  
  constructor(workingDirectory: string) {
    this.basePath = `${workingDirectory}/.clode`;
    this.projectPath = `${this.basePath}/project`;
    this.archivePath = `${this.basePath}/archives`;
  }
  
  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    // Create directories if they don't exist
    await this.ensureDirectory(this.basePath);
    await this.ensureDirectory(this.projectPath);
    await this.ensureDirectory(this.archivePath);
    
    // Create initial files if they don't exist
    await this.ensureFile(`${this.projectPath}/epics.json`, { version: '1.0.0', lastModified: new Date(), items: [] });
    await this.ensureFile(`${this.projectPath}/stories.json`, { version: '1.0.0', lastModified: new Date(), items: [] });
    await this.ensureFile(`${this.projectPath}/tasks.json`, { version: '1.0.0', lastModified: new Date(), items: [] });
    await this.ensureFile(`${this.projectPath}/manifest.json`, this.createDefaultManifest());
  }
  
  /**
   * Load all project data
   */
  async loadAll(): Promise<{ epics: Epic[], stories: Story[], tasks: SimpleTask[], manifest: ProjectManifest }> {
    const [epics, stories, tasks, manifest] = await Promise.all([
      this.loadEpics(),
      this.loadStories(),
      this.loadTasks(),
      this.loadManifest()
    ]);
    
    return { epics, stories, tasks, manifest };
  }
  
  /**
   * Load epics from JSON
   */
  async loadEpics(): Promise<Epic[]> {
    try {
      const content = await this.readFile(`${this.projectPath}/epics.json`);
      const data: StorageFile<Epic> = JSON.parse(content);
      return data.items || [];
    } catch (error) {
      console.error('[ProjectStorage] Failed to load epics:', error);
      return [];
    }
  }
  
  /**
   * Save epics to JSON
   */
  async saveEpics(epics: Epic[]): Promise<void> {
    const data: StorageFile<Epic> = {
      version: '1.0.0',
      lastModified: new Date(),
      items: epics
    };
    
    await this.writeFile(`${this.projectPath}/epics.json`, JSON.stringify(data, null, 2));
    await this.updateManifestCounts('epics', epics);
  }
  
  /**
   * Load stories from JSON
   */
  async loadStories(): Promise<Story[]> {
    try {
      const content = await this.readFile(`${this.projectPath}/stories.json`);
      const data: StorageFile<Story> = JSON.parse(content);
      return data.items || [];
    } catch (error) {
      console.error('[ProjectStorage] Failed to load stories:', error);
      return [];
    }
  }
  
  /**
   * Save stories to JSON
   */
  async saveStories(stories: Story[]): Promise<void> {
    const data: StorageFile<Story> = {
      version: '1.0.0',
      lastModified: new Date(),
      items: stories
    };
    
    await this.writeFile(`${this.projectPath}/stories.json`, JSON.stringify(data, null, 2));
    await this.updateManifestCounts('stories', stories);
  }
  
  /**
   * Load tasks from JSON
   */
  async loadTasks(): Promise<SimpleTask[]> {
    try {
      const content = await this.readFile(`${this.projectPath}/tasks.json`);
      const data: StorageFile<SimpleTask> = JSON.parse(content);
      return data.items || [];
    } catch (error) {
      console.error('[ProjectStorage] Failed to load tasks:', error);
      return [];
    }
  }
  
  /**
   * Save tasks to JSON
   */
  async saveTasks(tasks: SimpleTask[]): Promise<void> {
    const data: StorageFile<SimpleTask> = {
      version: '1.0.0',
      lastModified: new Date(),
      items: tasks
    };
    
    await this.writeFile(`${this.projectPath}/tasks.json`, JSON.stringify(data, null, 2));
    await this.updateManifestCounts('tasks', tasks);
  }
  
  /**
   * Load manifest
   */
  async loadManifest(): Promise<ProjectManifest> {
    try {
      const content = await this.readFile(`${this.projectPath}/manifest.json`);
      // Try to parse the content
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[ProjectStorage] Invalid manifest JSON, creating new one:', parseError);
        // If parsing fails, create a new default manifest
        const defaultManifest = this.createDefaultManifest();
        await this.saveManifest(defaultManifest);
        return defaultManifest;
      }
    } catch (error) {
      console.error('[ProjectStorage] Manifest file not found, creating default:', error);
      // If file doesn't exist, create it
      const defaultManifest = this.createDefaultManifest();
      try {
        await this.ensureDirectory(this.projectPath);
        await this.saveManifest(defaultManifest);
      } catch (saveError) {
        console.error('[ProjectStorage] Failed to save default manifest:', saveError);
      }
      return defaultManifest;
    }
  }
  
  /**
   * Save manifest
   */
  async saveManifest(manifest: ProjectManifest): Promise<void> {
    manifest.lastSync = new Date();
    await this.writeFile(`${this.projectPath}/manifest.json`, JSON.stringify(manifest, null, 2));
  }
  
  /**
   * Generate lightweight TASKS.md reference
   */
  async generateTasksReference(epics: Epic[], stories: Story[], tasks: SimpleTask[]): Promise<string> {
    const now = new Date().toISOString();
    const activeEpics = epics.filter(e => e.status === 'in_progress');
    const activeStories = stories.filter(s => s.status === 'in_progress');
    const activeTasks = tasks.filter(t => t.status === 'in_progress');
    const completedTasks = tasks.filter(t => t.status === 'completed');
    
    let markdown = `# Project Tasks\n\n`;
    markdown += `*Last updated: ${now}*\n`;
    markdown += `*Full details in: .clode/project/*\n\n`;
    
    // Current Focus
    if (activeEpics.length > 0) {
      markdown += `## 🎯 Current Focus\n\n`;
      for (const epic of activeEpics) {
        const epicStories = stories.filter(s => s.epicId === epic.id);
        const epicTasks = tasks.filter(t => t.epicId === epic.id);
        const completedCount = epicTasks.filter(t => t.status === 'completed').length;
        const progress = epicTasks.length > 0 ? Math.round((completedCount / epicTasks.length) * 100) : 0;
        
        markdown += `### [${epic.id}] ${epic.title}\n`;
        markdown += `**Status:** ${epic.status} | **Priority:** ${epic.priority} | **Progress:** ${progress}%\n`;
        
        for (const story of epicStories) {
          const storyTasks = tasks.filter(t => t.storyId === story.id);
          const storyCompleted = storyTasks.filter(t => t.status === 'completed').length;
          markdown += `- [${story.id}] ${story.title} (${storyCompleted}/${storyTasks.length} tasks done)\n`;
        }
        markdown += '\n';
      }
    }
    
    // Overview
    markdown += `## 📊 Overview\n\n`;
    markdown += `**Epics:** ${epics.length} total (${activeEpics.length} active)\n`;
    markdown += `**Stories:** ${stories.length} total (${activeStories.length} in progress)\n`;
    markdown += `**Tasks:** ${tasks.length} total (${completedTasks.length} done, ${activeTasks.length} active)\n\n`;
    
    // Active Tasks
    if (activeTasks.length > 0) {
      markdown += `## ⚡ Active Tasks\n\n`;
      for (const task of activeTasks.slice(0, 10)) { // Show max 10
        const story = stories.find(s => s.id === task.storyId);
        markdown += `- [${task.id || task.identifier}] ${task.content}`;
        if (story) markdown += ` → ${story.id}`;
        markdown += '\n';
      }
      if (activeTasks.length > 10) {
        markdown += `- ... and ${activeTasks.length - 10} more\n`;
      }
      markdown += '\n';
    }
    
    // Recent Completions
    const recentCompleted = completedTasks
      .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0))
      .slice(0, 5);
    
    if (recentCompleted.length > 0) {
      markdown += `## 📈 Recent Completions\n\n`;
      for (const task of recentCompleted) {
        markdown += `- ✓ [${task.id || task.identifier}] ${task.content}\n`;
      }
      markdown += '\n';
    }
    
    markdown += `---\n*Use Clode Studio Kanban board to manage tasks*\n`;
    
    return markdown;
  }
  
  /**
   * Archive old completed items
   */
  async archiveOldItems(daysOld: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    // Load current data
    const { epics, stories, tasks } = await this.loadAll();
    
    // Filter items to archive
    const epicsToArchive = epics.filter(e => 
      e.status === 'done' && e.updatedAt < cutoffDate
    );
    const storiesToArchive = stories.filter(s => 
      s.status === 'done' && s.updatedAt < cutoffDate
    );
    const tasksToArchive = tasks.filter(t => 
      t.status === 'completed' && t.updatedAt && t.updatedAt < cutoffDate
    );
    
    if (epicsToArchive.length === 0 && storiesToArchive.length === 0 && tasksToArchive.length === 0) {
      return; // Nothing to archive
    }
    
    // Create archive file
    const quarter = this.getQuarter(new Date());
    const archiveFile = `${this.archivePath}/${quarter}.json`;
    
    // Load existing archive or create new
    let archive: any = { epics: [], stories: [], tasks: [] };
    try {
      const existing = await this.readFile(archiveFile);
      archive = JSON.parse(existing);
    } catch (error) {
      // File doesn't exist, use empty archive
    }
    
    // Add items to archive
    archive.epics.push(...epicsToArchive);
    archive.stories.push(...storiesToArchive);
    archive.tasks.push(...tasksToArchive);
    
    // Save archive
    await this.writeFile(archiveFile, JSON.stringify(archive, null, 2));
    
    // Remove archived items from current data
    const remainingEpics = epics.filter(e => !epicsToArchive.includes(e));
    const remainingStories = stories.filter(s => !storiesToArchive.includes(s));
    const remainingTasks = tasks.filter(t => !tasksToArchive.includes(t));
    
    // Save updated data
    await this.saveEpics(remainingEpics);
    await this.saveStories(remainingStories);
    await this.saveTasks(remainingTasks);
    
    console.log(`[ProjectStorage] Archived ${epicsToArchive.length} epics, ${storiesToArchive.length} stories, ${tasksToArchive.length} tasks to ${quarter}`);
  }
  
  /**
   * Migrate from old TASKS.md format to new JSON format
   */
  async migrateFromTasksMd(content: string, epics: Epic[], stories: Story[], tasks: SimpleTask[]): Promise<void> {
    console.log('[ProjectStorage] Migrating from TASKS.md to JSON storage');
    
    // Save the data to JSON files
    await this.saveEpics(epics);
    await this.saveStories(stories);
    await this.saveTasks(tasks);
    
    // Generate and save the lightweight reference
    const reference = await this.generateTasksReference(epics, stories, tasks);
    await this.writeFile(`${this.basePath}/../TASKS.md`, reference);
    
    console.log('[ProjectStorage] Migration complete');
  }
  
  // Helper methods
  
  private createDefaultManifest(): ProjectManifest {
    return {
      version: '1.0.0',
      projectId: `project-${Date.now()}`,
      lastSync: new Date(),
      counts: {
        epics: { total: 0, active: 0, completed: 0 },
        stories: { total: 0, active: 0, completed: 0 },
        tasks: { total: 0, active: 0, completed: 0 }
      },
      activeWork: {
        currentStories: [],
        inProgressTasks: []
      },
      settings: {
        autoArchiveAfterDays: 90,
        taskIdPrefix: 'TASK',
        epicIdPrefix: 'EPIC',
        storyIdPrefix: 'STORY'
      }
    };
  }
  
  private async updateManifestCounts(type: 'epics' | 'stories' | 'tasks', items: any[]): Promise<void> {
    const manifest = await this.loadManifest();
    
    const activeStatuses = ['in_progress', 'ready', 'pending'];
    const completedStatuses = ['done', 'completed', 'cancelled'];
    
    manifest.counts[type] = {
      total: items.length,
      active: items.filter(i => activeStatuses.includes(i.status)).length,
      completed: items.filter(i => completedStatuses.includes(i.status)).length
    };
    
    await this.saveManifest(manifest);
  }
  
  private getQuarter(date: Date): string {
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }
  
  private async ensureDirectory(path: string): Promise<void> {
    if (window.electronAPI?.fs) {
      const result = await window.electronAPI.fs.ensureDir(path);
      if (!result.success) {
        console.error(`[ProjectStorage] Failed to ensure directory ${path}:`, result.error);
      }
    }
  }
  
  private async ensureFile(path: string, defaultContent: any): Promise<void> {
    if (window.electronAPI?.fs) {
      // Check if file exists
      const result = await window.electronAPI.fs.readFile(path);
      if (!result.success) {
        // File doesn't exist, create it with default content
        console.log(`[ProjectStorage] Creating file: ${path}`);
        await this.writeFile(path, JSON.stringify(defaultContent, null, 2));
      }
    }
  }
  
  private async readFile(path: string): Promise<string> {
    if (window.electronAPI?.fs) {
      const result = await window.electronAPI.fs.readFile(path);
      if (result.success) {
        return result.content;
      }
      // Return empty default based on file type
      if (path.includes('manifest.json')) {
        return JSON.stringify(this.createDefaultManifest());
      } else {
        return JSON.stringify({ version: '1.0.0', lastModified: new Date(), items: [] });
      }
    }
    throw new Error('File system API not available');
  }
  
  private async writeFile(path: string, content: string): Promise<void> {
    if (window.electronAPI?.fs) {
      const result = await window.electronAPI.fs.writeFile(path, content);
      if (!result.success) {
        throw new Error(`Failed to write file: ${path}`);
      }
    } else {
      throw new Error('File system API not available');
    }
  }
}

// Singleton instance
let storageInstance: ProjectStorage | null = null;

export function getProjectStorage(workingDirectory: string): ProjectStorage {
  if (!storageInstance || storageInstance['basePath'] !== `${workingDirectory}/.clode`) {
    storageInstance = new ProjectStorage(workingDirectory);
  }
  return storageInstance;
}