/**
 * Task Hierarchy System - Epic/Story/Task Management
 * Manages hierarchical task decomposition and dependencies
 */

import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';
import { SimpleTask } from '../orchestrator/pipeline-state-machine';

export type TaskStatus = 
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done'
  | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Epic {
  id: string;
  title: string;
  description: string;
  businessValue: string;
  acceptanceCriteria: string[];
  stories: Story[];
  status: TaskStatus;
  priority: TaskPriority;
  estimatedEffort?: number; // Story points
  actualEffort?: number;
  startDate?: string;
  endDate?: string;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface Story {
  id: string;
  epicId: string;
  title: string;
  description: string;
  userStory: string; // As a... I want... So that...
  acceptanceCriteria: string[];
  tasks: Task[];
  status: TaskStatus;
  priority: TaskPriority;
  estimatedEffort?: number; // Story points
  actualEffort?: number;
  dependencies: string[]; // Other story IDs
  tags: string[];
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  storyId: string;
  epicId: string;
  title: string;
  description: string;
  technicalDetails: string;
  subtasks: Subtask[];
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  estimatedTokens?: number;
  estimatedCost?: number;
  actualTokens?: number;
  actualCost?: number;
  pipelineId?: string; // Link to pipeline execution
  dependencies: string[]; // Other task IDs
  prerequisites: string[]; // Required conditions
  outputs?: TaskOutput[];
  tags: string[];
  metadata?: Record<string, any>;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  checkItems: CheckItem[];
  estimatedMinutes?: number;
  actualMinutes?: number;
}

export interface CheckItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TaskOutput {
  type: 'code' | 'documentation' | 'test' | 'artifact';
  path?: string;
  content?: string;
  summary: string;
}

export interface TaskDecomposition {
  epic: Epic;
  suggestedStories: Story[];
  suggestedTasks: Task[];
  dependencies: DependencyGraph;
  estimatedTotalEffort: number;
  estimatedTotalCost: number;
  risks: Risk[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  type: 'epic' | 'story' | 'task';
  title: string;
  status: TaskStatus;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'blocks' | 'requires' | 'relates';
}

export interface Risk {
  id: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

// Validation schemas
const EpicSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string(),
  businessValue: z.string(),
  acceptanceCriteria: z.array(z.string()),
  stories: z.array(z.any()),
  status: z.enum(['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done', 'cancelled']),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  estimatedEffort: z.number().optional(),
  actualEffort: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tags: z.array(z.string()),
  metadata: z.record(z.any()).optional()
});

export class TaskHierarchyManager {
  private workspacePath: string;
  private epicsDir: string;
  private storiesDir: string;
  private tasksDir: string;
  private epics: Map<string, Epic> = new Map();
  private stories: Map<string, Story> = new Map();
  private tasks: Map<string, Task> = new Map();
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.epicsDir = path.join(workspacePath, '.claude', 'tasks', 'epics');
    this.storiesDir = path.join(workspacePath, '.claude', 'tasks', 'stories');
    this.tasksDir = path.join(workspacePath, '.claude', 'tasks', 'tasks');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.epicsDir);
    await fs.ensureDir(this.storiesDir);
    await fs.ensureDir(this.tasksDir);
    
    // Load existing items
    await this.loadAll();
  }
  
  async createEpic(input: Omit<Epic, 'id' | 'stories'>): Promise<Epic> {
    const epic: Epic = {
      ...input,
      id: this.generateId('epic'),
      stories: []
    };
    
    // Validate
    const validation = EpicSchema.safeParse(epic);
    if (!validation.success) {
      throw new Error(`Invalid epic: ${validation.error.message}`);
    }
    
    // Save
    await this.saveEpic(epic);
    this.epics.set(epic.id, epic);
    
    console.log(`[TaskHierarchy] Created epic: ${epic.title}`);
    return epic;
  }
  
  async decomposeEpic(epic: Epic): Promise<TaskDecomposition> {
    console.log(`[TaskHierarchy] Decomposing epic: ${epic.title}`);
    
    // This would normally use AI to decompose, for now we'll create a template
    const stories = this.suggestStoriesForEpic(epic);
    const tasks: Task[] = [];
    
    for (const story of stories) {
      const storyTasks = this.suggestTasksForStory(story);
      tasks.push(...storyTasks);
    }
    
    // Build dependency graph
    const dependencies = this.buildDependencyGraph(epic, stories, tasks);
    
    // Calculate estimates
    const estimatedTotalEffort = stories.reduce((sum, s) => sum + (s.estimatedEffort || 0), 0);
    const estimatedTotalCost = tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    
    // Identify risks
    const risks = this.identifyRisks(epic, stories, tasks);
    
    return {
      epic,
      suggestedStories: stories,
      suggestedTasks: tasks,
      dependencies,
      estimatedTotalEffort,
      estimatedTotalCost,
      risks
    };
  }
  
  private suggestStoriesForEpic(epic: Epic): Story[] {
    // Template-based story generation
    // In production, this would use AI to analyze the epic
    const stories: Story[] = [];
    
    // Common story patterns based on epic type
    if (epic.title.toLowerCase().includes('authentication')) {
      stories.push(
        this.createStory(epic.id, 'User Registration', 'Enable new users to create accounts'),
        this.createStory(epic.id, 'User Login', 'Allow users to authenticate'),
        this.createStory(epic.id, 'Password Reset', 'Enable password recovery'),
        this.createStory(epic.id, 'Session Management', 'Handle user sessions securely')
      );
    } else if (epic.title.toLowerCase().includes('api')) {
      stories.push(
        this.createStory(epic.id, 'API Design', 'Design RESTful API endpoints'),
        this.createStory(epic.id, 'API Implementation', 'Implement API handlers'),
        this.createStory(epic.id, 'API Documentation', 'Document API endpoints'),
        this.createStory(epic.id, 'API Testing', 'Create comprehensive API tests')
      );
    } else {
      // Generic decomposition
      stories.push(
        this.createStory(epic.id, 'Design Phase', 'Design the solution architecture'),
        this.createStory(epic.id, 'Implementation Phase', 'Implement core functionality'),
        this.createStory(epic.id, 'Testing Phase', 'Test and validate implementation'),
        this.createStory(epic.id, 'Documentation Phase', 'Document the solution')
      );
    }
    
    return stories;
  }
  
  private createStory(epicId: string, title: string, description: string): Story {
    return {
      id: this.generateId('story'),
      epicId,
      title,
      description,
      userStory: `As a user, I want ${title.toLowerCase()}, so that ${description.toLowerCase()}`,
      acceptanceCriteria: [],
      tasks: [],
      status: 'backlog',
      priority: 'normal',
      estimatedEffort: 5,
      dependencies: [],
      tags: [],
      metadata: {}
    };
  }
  
  private suggestTasksForStory(story: Story): Task[] {
    // Template-based task generation
    const tasks: Task[] = [];
    
    // Common task patterns
    tasks.push({
      id: this.generateId('task'),
      storyId: story.id,
      epicId: story.epicId,
      title: `Implement ${story.title}`,
      description: `Technical implementation of ${story.title}`,
      technicalDetails: 'To be determined by architect agent',
      subtasks: [],
      status: 'backlog',
      priority: story.priority,
      assignedAgent: 'developer',
      estimatedTokens: 10000,
      estimatedCost: 0.5,
      dependencies: [],
      prerequisites: [],
      tags: ['implementation'],
      metadata: {}
    });
    
    tasks.push({
      id: this.generateId('task'),
      storyId: story.id,
      epicId: story.epicId,
      title: `Test ${story.title}`,
      description: `Testing and validation of ${story.title}`,
      technicalDetails: 'Unit tests, integration tests, and validation',
      subtasks: [],
      status: 'backlog',
      priority: story.priority,
      assignedAgent: 'qa',
      estimatedTokens: 5000,
      estimatedCost: 0.25,
      dependencies: [tasks[0].id], // Depends on implementation
      prerequisites: ['Implementation complete'],
      tags: ['testing'],
      metadata: {}
    });
    
    return tasks;
  }
  
  private buildDependencyGraph(epic: Epic, stories: Story[], tasks: Task[]): DependencyGraph {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    
    // Add epic node
    nodes.push({
      id: epic.id,
      type: 'epic',
      title: epic.title,
      status: epic.status
    });
    
    // Add story nodes and edges
    for (const story of stories) {
      nodes.push({
        id: story.id,
        type: 'story',
        title: story.title,
        status: story.status
      });
      
      // Epic -> Story edge
      edges.push({
        from: epic.id,
        to: story.id,
        type: 'requires'
      });
      
      // Story dependencies
      for (const depId of story.dependencies) {
        edges.push({
          from: depId,
          to: story.id,
          type: 'blocks'
        });
      }
    }
    
    // Add task nodes and edges
    for (const task of tasks) {
      nodes.push({
        id: task.id,
        type: 'task',
        title: task.title,
        status: task.status
      });
      
      // Story -> Task edge
      edges.push({
        from: task.storyId,
        to: task.id,
        type: 'requires'
      });
      
      // Task dependencies
      for (const depId of task.dependencies) {
        edges.push({
          from: depId,
          to: task.id,
          type: 'blocks'
        });
      }
    }
    
    return { nodes, edges };
  }
  
  private identifyRisks(epic: Epic, stories: Story[], tasks: Task[]): Risk[] {
    const risks: Risk[] = [];
    
    // Check for high complexity
    if (stories.length > 10) {
      risks.push({
        id: this.generateId('risk'),
        description: 'High complexity epic with many stories',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Consider breaking into smaller epics'
      });
    }
    
    // Check for high cost
    const totalCost = tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    if (totalCost > 10) {
      risks.push({
        id: this.generateId('risk'),
        description: 'High estimated cost for implementation',
        probability: 'low',
        impact: 'high',
        mitigation: 'Monitor costs closely and optimize token usage'
      });
    }
    
    // Check for circular dependencies
    if (this.hasCircularDependencies(tasks)) {
      risks.push({
        id: this.generateId('risk'),
        description: 'Circular dependencies detected',
        probability: 'high',
        impact: 'high',
        mitigation: 'Refactor task dependencies'
      });
    }
    
    return risks;
  }
  
  private hasCircularDependencies(tasks: Task[]): boolean {
    // Simple cycle detection using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycle(depId)) return true;
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(taskId);
      return false;
    };
    
    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (hasCycle(task.id)) return true;
      }
    }
    
    return false;
  }
  
  async createStory(epicId: string, input: Omit<Story, 'id' | 'epicId' | 'tasks'>): Promise<Story> {
    const story: Story = {
      ...input,
      id: this.generateId('story'),
      epicId,
      tasks: []
    };
    
    // Save
    await this.saveStory(story);
    this.stories.set(story.id, story);
    
    // Update epic
    const epic = this.epics.get(epicId);
    if (epic) {
      epic.stories.push(story);
      await this.saveEpic(epic);
    }
    
    console.log(`[TaskHierarchy] Created story: ${story.title}`);
    return story;
  }
  
  async createTask(storyId: string, epicId: string, input: Omit<Task, 'id' | 'storyId' | 'epicId'>): Promise<Task> {
    const task: Task = {
      ...input,
      id: this.generateId('task'),
      storyId,
      epicId
    };
    
    // Save
    await this.saveTask(task);
    this.tasks.set(task.id, task);
    
    // Update story
    const story = this.stories.get(storyId);
    if (story) {
      story.tasks.push(task);
      await this.saveStory(story);
    }
    
    console.log(`[TaskHierarchy] Created task: ${task.title}`);
    return task;
  }
  
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    task.status = status;
    await this.saveTask(task);
    
    // Check if story is complete
    const story = this.stories.get(task.storyId);
    if (story) {
      const allTasksDone = story.tasks.every(t => {
        const task = this.tasks.get(t.id);
        return task?.status === 'done';
      });
      
      if (allTasksDone && story.status !== 'done') {
        story.status = 'done';
        await this.saveStory(story);
        
        // Check if epic is complete
        await this.checkEpicCompletion(story.epicId);
      }
    }
  }
  
  private async checkEpicCompletion(epicId: string): Promise<void> {
    const epic = this.epics.get(epicId);
    if (!epic) return;
    
    const allStoriesDone = epic.stories.every(s => {
      const story = this.stories.get(s.id);
      return story?.status === 'done';
    });
    
    if (allStoriesDone && epic.status !== 'done') {
      epic.status = 'done';
      epic.endDate = new Date().toISOString();
      await this.saveEpic(epic);
      console.log(`[TaskHierarchy] Epic completed: ${epic.title}`);
    }
  }
  
  async getTasksForPipeline(priority?: TaskPriority): Promise<SimpleTask[]> {
    const simpleTasks: SimpleTask[] = [];
    
    for (const task of this.tasks.values()) {
      if (task.status === 'ready' || task.status === 'backlog') {
        if (!priority || task.priority === priority) {
          // Check dependencies
          const dependenciesMet = await this.checkDependencies(task);
          if (dependenciesMet) {
            simpleTasks.push(this.convertToSimpleTask(task));
          }
        }
      }
    }
    
    // Sort by priority
    return simpleTasks.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority || 'normal'] - priorityOrder[b.priority || 'normal'];
    });
  }
  
  private async checkDependencies(task: Task): Promise<boolean> {
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== 'done') {
        return false;
      }
    }
    return true;
  }
  
  private convertToSimpleTask(task: Task): SimpleTask {
    return {
      id: task.id,
      epicId: task.epicId,
      storyId: task.storyId,
      title: task.title,
      description: `${task.description}\n\nTechnical Details:\n${task.technicalDetails}`,
      priority: task.priority,
      requirements: task.prerequisites,
      estimatedTokens: task.estimatedTokens,
      estimatedCost: task.estimatedCost,
      dependencies: task.dependencies,
      metadata: {
        ...task.metadata,
        assignedAgent: task.assignedAgent,
        tags: task.tags
      }
    };
  }
  
  private generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}-${timestamp}-${random}`;
  }
  
  private async saveEpic(epic: Epic): Promise<void> {
    const filePath = path.join(this.epicsDir, `${epic.id}.json`);
    await fs.writeJson(filePath, epic, { spaces: 2 });
  }
  
  private async saveStory(story: Story): Promise<void> {
    const filePath = path.join(this.storiesDir, `${story.id}.json`);
    await fs.writeJson(filePath, story, { spaces: 2 });
  }
  
  private async saveTask(task: Task): Promise<void> {
    const filePath = path.join(this.tasksDir, `${task.id}.json`);
    await fs.writeJson(filePath, task, { spaces: 2 });
  }
  
  private async loadAll(): Promise<void> {
    // Load epics
    if (await fs.pathExists(this.epicsDir)) {
      const epicFiles = await fs.readdir(this.epicsDir);
      for (const file of epicFiles) {
        if (file.endsWith('.json')) {
          const epic = await fs.readJson(path.join(this.epicsDir, file));
          this.epics.set(epic.id, epic);
        }
      }
    }
    
    // Load stories
    if (await fs.pathExists(this.storiesDir)) {
      const storyFiles = await fs.readdir(this.storiesDir);
      for (const file of storyFiles) {
        if (file.endsWith('.json')) {
          const story = await fs.readJson(path.join(this.storiesDir, file));
          this.stories.set(story.id, story);
        }
      }
    }
    
    // Load tasks
    if (await fs.pathExists(this.tasksDir)) {
      const taskFiles = await fs.readdir(this.tasksDir);
      for (const file of taskFiles) {
        if (file.endsWith('.json')) {
          const task = await fs.readJson(path.join(this.tasksDir, file));
          this.tasks.set(task.id, task);
        }
      }
    }
    
    console.log(`[TaskHierarchy] Loaded ${this.epics.size} epics, ${this.stories.size} stories, ${this.tasks.size} tasks`);
  }
  
  // Getters
  getEpic(id: string): Epic | undefined {
    return this.epics.get(id);
  }
  
  getStory(id: string): Story | undefined {
    return this.stories.get(id);
  }
  
  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }
  
  getAllEpics(): Epic[] {
    return Array.from(this.epics.values());
  }
  
  getEpicsByStatus(status: TaskStatus): Epic[] {
    return Array.from(this.epics.values()).filter(e => e.status === status);
  }
  
  getStoriesByEpic(epicId: string): Story[] {
    return Array.from(this.stories.values()).filter(s => s.epicId === epicId);
  }
  
  getTasksByStory(storyId: string): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.storyId === storyId);
  }
}