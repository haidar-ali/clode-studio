/**
 * Agent Orchestration System - Main Entry Point
 * Coordinates multi-agent execution with monitoring, state management, and cost control
 */

import { PipelineStateMachine, SimpleTask, PipelineResult, PipelineContext } from './orchestrator/pipeline-state-machine';
import { LLMRouter, RouterConfig, RoutePolicy } from './orchestrator/router';
import { ProviderRegistry } from './providers/registry';
import { WorktreeManager } from './worktrees/manager';
import { ClaudeCodeExecutor } from './developer/claude-code-executor';
import { TaskHierarchyManager, Epic, Story, Task as HierarchyTask } from './tasks/task-hierarchy';
import { AgentDefinition, PricingEntry } from './providers/types';
import * as yaml from 'js-yaml';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ProcessOptions {
  forceRerun?: boolean;
  skipApprovals?: boolean;
  dryRun?: boolean;
  maxCost?: number;
  maxTokens?: number;
  timeout?: number;
  agents?: string[]; // Specific agents to run
}

export interface SystemStatus {
  pipelines: any[];
  metrics: any;
  budget: BudgetStatus;
  alerts: any[];
}

export interface BudgetStatus {
  daily: {
    spent: number;
    limit: number;
    remaining: number;
  };
  monthly: {
    spent: number;
    limit: number;
    remaining: number;
  };
}

export class AgentOrchestrationSystem {
  private stateMachine: PipelineStateMachine;
  private router: LLMRouter;
  private registry: ProviderRegistry;
  private worktreeManager: WorktreeManager;
  private claudeCodeExecutor: ClaudeCodeExecutor;
  private taskHierarchy: TaskHierarchyManager;
  private config: any;
  private agents: Map<string, AgentDefinition>;
  private isInitialized = false;
  
  constructor(private workspacePath: string) {
    this.stateMachine = new PipelineStateMachine(workspacePath);
    this.registry = new ProviderRegistry();
    this.worktreeManager = new WorktreeManager(workspacePath);
    this.taskHierarchy = new TaskHierarchyManager(workspacePath);
    this.agents = new Map();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('[Orchestration] Initializing agent orchestration system...');
    
    try {
      // Load configuration
      await this.loadConfiguration();
      
      // Initialize components
      await this.stateMachine.initialize();
      await this.registry.initialize();
      await this.worktreeManager.initialize();
      await this.taskHierarchy.initialize();
      
      // Setup router
      this.router = new LLMRouter(
        this.registry,
        this.config.routing.default,
        this.buildRouterConfig()
      );
      
      // Initialize Claude Code executor
      this.claudeCodeExecutor = new ClaudeCodeExecutor(
        this.workspacePath,
        this.router,
        this.worktreeManager,
        null as any, // Snapshot service to be added
        'auto'
      );
      
      await this.claudeCodeExecutor.initialize();
      
      // Register default agents
      this.registerDefaultAgents();
      
      // Validate providers
      await this.validateProviders();
      
      this.isInitialized = true;
      console.log('[Orchestration] System initialized successfully');
      
    } catch (error) {
      console.error('[Orchestration] Initialization failed:', error);
      throw error;
    }
  }
  
  private async loadConfiguration(): Promise<void> {
    const configPath = path.join(
      this.workspacePath,
      '.claude',
      'agents',
      'config',
      'providers.yaml'
    );
    
    if (!await fs.pathExists(configPath)) {
      throw new Error(`Configuration not found: ${configPath}`);
    }
    
    const content = await fs.readFile(configPath, 'utf-8');
    this.config = yaml.load(content) as any;
  }
  
  private buildRouterConfig(): RouterConfig {
    // Build pricing map
    const pricing = new Map<string, PricingEntry>();
    
    for (const [providerName, providerConfig] of Object.entries(this.config.providers)) {
      const provider = providerConfig as any;
      for (const [modelName, modelConfig] of Object.entries(provider.models)) {
        const model = modelConfig as any;
        const key = `${providerName}:${modelName}`;
        pricing.set(key, model.pricing);
      }
    }
    
    return {
      pricing,
      limits: this.config.limits,
      fallbacks: this.config.routing.fallbacks,
      maxFallbackAttempts: 3,
      providerConfigs: Object.keys(this.config.providers).reduce((acc, name) => {
        acc[name] = this.registry.getConfig(name) || {};
        return acc;
      }, {} as Record<string, any>)
    };
  }
  
  private registerDefaultAgents(): void {
    const defaultAgents: AgentDefinition[] = [
      {
        id: 'taskmaster',
        name: 'Task Master',
        type: 'orchestrator',
        description: 'Coordinates overall task execution and agent handoffs',
        maxTokens: 8000,
        maxRetries: 3,
        timeout: 30000
      },
      {
        id: 'architect',
        name: 'Architect',
        type: 'designer',
        description: 'Designs system architecture and high-level solutions',
        maxTokens: 20000,
        maxRetries: 3,
        timeout: 45000
      },
      {
        id: 'developer',
        name: 'Developer',
        type: 'implementer',
        description: 'Implements code changes and features',
        useWorktree: true,
        maxTokens: 32000,
        maxRetries: 3,
        timeout: 60000,
        capabilities: ['tools', 'structuredJson', 'computerUse']
      },
      {
        id: 'qa',
        name: 'Quality Assurance',
        type: 'validator',
        description: 'Tests and validates implementations',
        maxTokens: 16000,
        maxRetries: 2,
        timeout: 30000,
        capabilities: ['tools', 'structuredJson']
      },
      {
        id: 'kb-builder',
        name: 'Knowledge Builder',
        type: 'documenter',
        description: 'Extracts and documents learned patterns',
        maxTokens: 4000,
        maxRetries: 2,
        timeout: 20000
      }
    ];
    
    for (const agent of defaultAgents) {
      this.agents.set(agent.id, agent);
    }
  }
  
  private async validateProviders(): Promise<void> {
    console.log('[Orchestration] Validating providers...');
    
    const validations = await this.registry.validateAll();
    const failures: string[] = [];
    
    for (const [name, valid] of validations) {
      if (valid) {
        console.log(`  ✓ Provider ${name} validated`);
      } else {
        console.warn(`  ✗ Provider ${name} validation failed`);
        failures.push(name);
      }
    }
    
    if (failures.length === validations.size) {
      throw new Error('All providers failed validation');
    }
    
    if (failures.length > 0) {
      console.warn(`[Orchestration] Some providers failed validation: ${failures.join(', ')}`);
    }
  }
  
  async processTask(
    task: SimpleTask,
    options: ProcessOptions = {}
  ): Promise<PipelineResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Check daily budget before starting
    const dailyCost = await this.router.getDailyCost();
    const dailyLimit = this.config.limits.perProvider.anthropic.dailyBudgetUSD +
                      this.config.limits.perProvider.openai.dailyBudgetUSD;
    
    if (dailyCost >= dailyLimit) {
      throw new Error(`Daily budget of $${dailyLimit} exceeded (spent: $${dailyCost.toFixed(2)})`);
    }
    
    // Determine which agents to run
    const agentsToRun = options.agents 
      ? options.agents.map(id => this.agents.get(id)).filter(Boolean) as AgentDefinition[]
      : Array.from(this.agents.values());
    
    // Build pipeline context
    const context: PipelineContext = {
      workspacePath: this.workspacePath,
      forceRerun: options.forceRerun,
      dryRun: options.dryRun,
      skipApprovals: options.skipApprovals,
      maxCost: options.maxCost,
      maxTokens: options.maxTokens,
      timeout: options.timeout
    };
    
    console.log(`[Orchestration] Processing task: ${task.title}`);
    console.log(`  Agents: ${agentsToRun.map(a => a.id).join(', ')}`);
    console.log(`  Budget remaining: $${(dailyLimit - dailyCost).toFixed(2)}`);
    
    try {
      // Execute pipeline
      const result = await this.stateMachine.executePipeline(
        task,
        agentsToRun,
        context
      );
      
      console.log(`[Orchestration] Task completed: ${result.status}`);
      console.log(`  Total cost: $${result.metrics.totalCost.toFixed(2)}`);
      console.log(`  Total tokens: ${result.metrics.totalTokensUsed}`);
      console.log(`  Execution time: ${result.metrics.executionTimeMs}ms`);
      
      return result;
      
    } catch (error) {
      console.error('[Orchestration] Task processing failed:', error);
      throw error;
    }
  }
  
  async resumePipeline(pipelineId: string): Promise<PipelineResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.stateMachine.resumePipeline(pipelineId, {
      workspacePath: this.workspacePath
    });
  }
  
  async approvePipeline(
    pipelineId: string,
    approved: boolean,
    reason?: string
  ): Promise<PipelineResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.stateMachine.approveAndContinue(pipelineId, {
      approved,
      reason
    });
  }
  
  async getStatus(): Promise<SystemStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const pipelines = await this.stateMachine.getActivePipelines();
    const dailyCost = await this.router.getDailyCost();
    const dailyLimit = this.config.limits.perProvider.anthropic.dailyBudgetUSD +
                      this.config.limits.perProvider.openai.dailyBudgetUSD;
    
    // Calculate monthly cost (simplified - in production would query actual data)
    const monthlyCost = dailyCost * 30;
    const monthlyLimit = this.config.alerts.thresholds.monthlyCost;
    
    return {
      pipelines,
      metrics: {
        activePipelines: pipelines.length,
        providersAvailable: this.registry.getAllProviders().size,
        dailyCost,
        routeHistory: this.router.getRouteHistory().slice(-10)
      },
      budget: {
        daily: {
          spent: dailyCost,
          limit: dailyLimit,
          remaining: Math.max(0, dailyLimit - dailyCost)
        },
        monthly: {
          spent: monthlyCost,
          limit: monthlyLimit,
          remaining: Math.max(0, monthlyLimit - monthlyCost)
        }
      },
      alerts: this.checkAlerts(dailyCost, dailyLimit)
    };
  }
  
  private checkAlerts(dailyCost: number, dailyLimit: number): any[] {
    const alerts: any[] = [];
    const thresholds = this.config.alerts.thresholds;
    
    if (dailyCost >= dailyLimit) {
      alerts.push({
        level: 'error',
        message: `Daily budget exceeded: $${dailyCost.toFixed(2)} / $${dailyLimit}`,
        timestamp: new Date().toISOString()
      });
    } else if (dailyCost >= dailyLimit * 0.8) {
      alerts.push({
        level: 'warning',
        message: `Approaching daily budget limit: $${dailyCost.toFixed(2)} / $${dailyLimit}`,
        timestamp: new Date().toISOString()
      });
    }
    
    return alerts;
  }
  
  async executeAgent(
    agentId: string,
    input: any,
    context?: any
  ): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    // Special handling for developer agent
    if (agentId === 'developer') {
      const result = await this.claudeCodeExecutor.execute(input);
      return result;
    }
    
    // Generic agent execution (to be implemented for other agents)
    console.log(`[Orchestration] Executing agent: ${agentId}`);
    
    // For now, other agents return mock data
    // TODO: Implement Architect, QA, and KB-Builder executors
    return {
      content: `Output from ${agentId}`,
      summary: `Executed ${agentId} successfully`,
      tokensUsed: 1000,
      cost: 0.1,
      decisions: [],
      executionTimeMs: 1000
    };
  }
  
  async getProviderStats(provider: string): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.router.getProviderStats(provider);
  }
  
  async getDailyCost(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.router.getDailyCost();
  }
  
  getAgents(): Map<string, AgentDefinition> {
    return this.agents;
  }
  
  registerAgent(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
    console.log(`[Orchestration] Registered agent: ${agent.id}`);
  }
  
  // Epic/Story/Task Management Methods
  
  async createEpic(input: Omit<Epic, 'id' | 'stories'>): Promise<Epic> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.taskHierarchy.createEpic(input);
  }
  
  async decomposeEpic(epicId: string): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const epic = this.taskHierarchy.getEpic(epicId);
    if (!epic) {
      throw new Error(`Epic ${epicId} not found`);
    }
    
    return this.taskHierarchy.decomposeEpic(epic);
  }
  
  async createStory(epicId: string, input: Omit<Story, 'id' | 'epicId' | 'tasks'>): Promise<Story> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.taskHierarchy.createStory(epicId, input);
  }
  
  async createHierarchyTask(
    storyId: string, 
    epicId: string, 
    input: Omit<HierarchyTask, 'id' | 'storyId' | 'epicId'>
  ): Promise<HierarchyTask> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.taskHierarchy.createTask(storyId, epicId, input);
  }
  
  async getReadyTasks(priority?: 'low' | 'normal' | 'high' | 'critical'): Promise<SimpleTask[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.taskHierarchy.getTasksForPipeline(priority);
  }
  
  async updateTaskStatus(taskId: string, status: 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled'): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.taskHierarchy.updateTaskStatus(taskId, status);
  }
  
  getEpics(): Epic[] {
    return this.taskHierarchy.getAllEpics();
  }
  
  getEpic(id: string): Epic | undefined {
    return this.taskHierarchy.getEpic(id);
  }
  
  getStoriesByEpic(epicId: string): Story[] {
    return this.taskHierarchy.getStoriesByEpic(epicId);
  }
  
  getTasksByStory(storyId: string): HierarchyTask[] {
    return this.taskHierarchy.getTasksByStory(storyId);
  }
  
  async shutdown(): Promise<void> {
    console.log('[Orchestration] Shutting down...');
    
    // Clean up any active worktrees
    for (const [agentId] of this.worktreeManager.getActiveWorktrees()) {
      await this.worktreeManager.cleanupWorktree(agentId);
    }
    
    console.log('[Orchestration] Shutdown complete');
  }
}

// Singleton instance
let orchestrationInstance: AgentOrchestrationSystem | null = null;

export function getOrchestrationSystem(workspacePath: string): AgentOrchestrationSystem {
  if (!orchestrationInstance) {
    orchestrationInstance = new AgentOrchestrationSystem(workspacePath);
  }
  return orchestrationInstance;
}

// Export for use in Clode Studio
export default AgentOrchestrationSystem;