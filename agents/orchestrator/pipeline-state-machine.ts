/**
 * Pipeline State Machine - JSON-safe state management with atomic persistence
 * Manages agent execution flow with checkpoints and recovery
 */

import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';
import { AgentDefinition, AgentOutput, Decision } from '../providers/types';

// JSON-safe types (no Maps, all Dates as ISO strings)
export interface PipelineState {
  pipelineId: string;
  taskId: string;
  epicId?: string;        // Epic-level integration
  storyId?: string;       // Story-level integration  
  projectId?: string;
  
  // State machine
  currentPhase: PipelinePhase;
  completedPhases: string[];
  remainingPhases: string[];
  status: PipelineStatus;
  
  // Outputs and decisions (JSON-safe)
  outputs: Record<string, AgentOutput>;
  decisions: Record<string, Decision[]>;
  handoffs: AgentHandoff[];
  
  // Execution metadata
  timestamps: {
    started: string;
    updated: string;
    completed?: string;
    paused?: string;
    resumed?: string;
  };
  
  // Error handling
  retryCount: Record<string, number>;
  errors: ErrorLog[];
  
  // Resource tracking
  metrics: {
    totalTokensUsed: number;
    totalCost: number;
    kbEntriesCreated: number;
    executionTimeMs: number;
  };
  
  // Task decomposition
  subtasks?: SimpleTask[];
  dependencies?: string[];
  
  // Checksum for integrity
  checksum?: string;
}

export type PipelinePhase = 
  | 'idle' 
  | 'analyzing' 
  | 'architect' 
  | 'developer' 
  | 'qa' 
  | 'kb_builder'
  | 'waiting_approval'
  | 'complete' 
  | 'error'
  | 'budget_exceeded'
  | 'paused';

export type PipelineStatus = 
  | 'running' 
  | 'paused' 
  | 'waiting_approval'
  | 'complete' 
  | 'failed'
  | 'budget_exceeded';

export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  timestamp: string;
  data: any;
  decisions: Decision[];
}

export interface ErrorLog {
  phase: string;
  message: string;
  timestamp: string;
  type: ErrorType;
  stack?: string;
}

export type ErrorType = 
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'budget_exceeded'
  | 'validation'
  | 'permission'
  | 'unknown';

export interface PipelineContext {
  workspacePath: string;
  forceRerun?: boolean;
  dryRun?: boolean;
  skipApprovals?: boolean;
  maxCost?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface PipelineResult {
  pipelineId: string;
  status: PipelineStatus;
  outputs: Record<string, AgentOutput>;
  decisions: Record<string, Decision[]>;
  metrics: PipelineState['metrics'];
  errors: ErrorLog[];
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface SimpleTask {
  id: string;
  epicId?: string;
  storyId?: string;
  title: string;
  description: string;
  projectId?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  requirements?: string[];
  metadata?: Record<string, any>;
  estimatedTokens?: number;
  estimatedCost?: number;
  dependencies?: string[];
}

// Validation schemas
const DecisionSchema = z.object({
  id: z.string(),
  type: z.enum(['action', 'recommendation', 'warning', 'error']),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional()
});

const PipelineStateSchema = z.object({
  pipelineId: z.string(),
  taskId: z.string(),
  epicId: z.string().optional(),
  storyId: z.string().optional(),
  projectId: z.string().optional(),
  currentPhase: z.enum([
    'idle', 'analyzing', 'architect', 'developer', 'qa', 'kb_builder',
    'waiting_approval', 'complete', 'error', 'budget_exceeded', 'paused'
  ]),
  completedPhases: z.array(z.string()),
  remainingPhases: z.array(z.string()),
  status: z.enum([
    'running', 'paused', 'waiting_approval', 'complete', 'failed', 'budget_exceeded'
  ]),
  outputs: z.record(z.any()),
  decisions: z.record(z.array(DecisionSchema)),
  handoffs: z.array(z.object({
    fromAgent: z.string(),
    toAgent: z.string(),
    timestamp: z.string(),
    data: z.any(),
    decisions: z.array(DecisionSchema)
  })),
  timestamps: z.object({
    started: z.string(),
    updated: z.string(),
    completed: z.string().optional(),
    paused: z.string().optional(),
    resumed: z.string().optional()
  }),
  retryCount: z.record(z.number()),
  errors: z.array(z.object({
    phase: z.string(),
    message: z.string(),
    timestamp: z.string(),
    type: z.enum(['rate_limit', 'timeout', 'network', 'budget_exceeded', 'validation', 'permission', 'unknown']),
    stack: z.string().optional()
  })),
  metrics: z.object({
    totalTokensUsed: z.number(),
    totalCost: z.number(),
    kbEntriesCreated: z.number(),
    executionTimeMs: z.number()
  }),
  subtasks: z.array(z.any()).optional(),
  dependencies: z.array(z.string()).optional(),
  checksum: z.string().optional()
}).strict();

export class PipelineStateMachine {
  private stateDir: string;
  private workspacePath: string;
  private snapshotDir: string;
  private maxStateFileSize = 10 * 1024 * 1024; // 10MB limit
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.stateDir = path.join(workspacePath, '.claude', 'agent-state');
    this.snapshotDir = path.join(workspacePath, '.claude', 'agent-state', 'snapshots');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.stateDir);
    await fs.ensureDir(this.snapshotDir);
    
    // Clean up old state files
    await this.cleanupOldStates();
  }
  
  async executePipeline(
    task: SimpleTask,
    agents: AgentDefinition[],
    context: PipelineContext
  ): Promise<PipelineResult> {
    const pipelineId = this.generatePipelineId(task);
    
    // Load or create state
    let state = await this.loadState(pipelineId) || this.createInitialState(pipelineId, task);
    
    try {
      // Check dependencies first
      if (task.dependencies && task.dependencies.length > 0) {
        const unmetDeps = await this.checkDependencies(task.dependencies);
        if (unmetDeps.length > 0) {
          throw new Error(`Unmet dependencies: ${unmetDeps.join(', ')}`);
        }
      }
      
      // Pre-execution checks
      await this.validatePreconditions(state, context);
      
      // Check budget before starting
      if (await this.isBudgetExceeded(state, context)) {
        state.status = 'budget_exceeded';
        state.currentPhase = 'budget_exceeded';
        await this.persistState(state);
        throw new Error('Budget exceeded for pipeline');
      }
      
      // Execute phases sequentially with state persistence
      for (const agent of agents) {
        // Check for pause conditions
        if (await this.shouldPause(state, context)) {
          state.status = 'paused';
          state.currentPhase = 'paused';
          state.timestamps.paused = new Date().toISOString();
          await this.persistState(state);
          break;
        }
        
        // Check for approval gates
        if (await this.requiresApproval(agent, state, context)) {
          state.status = 'waiting_approval';
          state.currentPhase = 'waiting_approval';
          await this.persistState(state);
          break;
        }
        
        // Execute agent phase
        state = await this.executePhase(agent, state, context);
        
        // Create handoff to next agent
        if (agents.indexOf(agent) < agents.length - 1) {
          const nextAgent = agents[agents.indexOf(agent) + 1];
          state.handoffs.push({
            fromAgent: agent.id,
            toAgent: nextAgent.id,
            timestamp: new Date().toISOString(),
            data: state.outputs[agent.id],
            decisions: state.decisions[agent.id] || []
          });
        }
        
        // Persist after each phase
        await this.persistState(state);
      }
      
      // Mark complete if all phases executed
      if (state.completedPhases.length === agents.length) {
        state.status = 'complete';
        state.currentPhase = 'complete';
        state.timestamps.completed = new Date().toISOString();
        await this.persistState(state);
      }
      
      return this.buildResult(state);
      
    } catch (error: any) {
      state.status = 'failed';
      state.currentPhase = 'error';
      state.errors.push({
        phase: state.currentPhase,
        message: error.message,
        timestamp: new Date().toISOString(),
        type: this.classifyError(error),
        stack: error.stack
      });
      await this.persistState(state);
      throw error;
    }
  }
  
  async resumePipeline(
    pipelineId: string,
    context: PipelineContext
  ): Promise<PipelineResult> {
    const state = await this.loadState(pipelineId);
    if (!state) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (state.status !== 'paused' && state.status !== 'waiting_approval') {
      throw new Error(`Pipeline ${pipelineId} is not in a resumable state`);
    }
    
    state.status = 'running';
    state.timestamps.resumed = new Date().toISOString();
    await this.persistState(state);
    
    // Continue from where we left off
    const remainingAgents = state.remainingPhases.map(id => ({ id } as AgentDefinition));
    
    let currentState = state;
    for (const agent of remainingAgents) {
      currentState = await this.executePhase(agent, currentState, context);
      await this.persistState(currentState);
    }
    
    return this.buildResult(currentState);
  }
  
  async approveAndContinue(
    pipelineId: string,
    approval: { approved: boolean; reason?: string }
  ): Promise<PipelineResult> {
    const state = await this.loadState(pipelineId);
    if (!state) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (state.status !== 'waiting_approval') {
      throw new Error(`Pipeline ${pipelineId} is not waiting for approval`);
    }
    
    if (!approval.approved) {
      state.status = 'failed';
      state.errors.push({
        phase: state.currentPhase,
        message: `Approval denied: ${approval.reason || 'No reason provided'}`,
        timestamp: new Date().toISOString(),
        type: 'validation'
      });
      await this.persistState(state);
      return this.buildResult(state);
    }
    
    // Resume execution
    return this.resumePipeline(pipelineId, { 
      workspacePath: this.workspacePath,
      skipApprovals: true 
    });
  }
  
  private async executePhase(
    agent: AgentDefinition,
    state: PipelineState,
    context: PipelineContext
  ): Promise<PipelineState> {
    const outputKey = `${state.pipelineId}-${agent.id}`;
    
    // Check for existing output (idempotency)
    const existingOutput = await this.loadAgentOutput(outputKey);
    if (existingOutput && !context.forceRerun) {
      console.log(`[Pipeline] Using cached output for ${agent.id}`);
      state.outputs[agent.id] = existingOutput;
      state.completedPhases.push(agent.id);
      state.remainingPhases = state.remainingPhases.filter(id => id !== agent.id);
      return state;
    }
    
    // Execute with retry logic
    const output = await this.executeWithRetry(
      agent,
      state,
      context,
      this.getRetryPolicy(agent)
    );
    
    // Create snapshot of output
    await this.snapshotAgentOutput(agent, output, state);
    
    // Update state
    state.outputs[agent.id] = output;
    state.completedPhases.push(agent.id);
    state.remainingPhases = state.remainingPhases.filter(id => id !== agent.id);
    state.currentPhase = agent.id as PipelinePhase;
    state.timestamps.updated = new Date().toISOString();
    
    // Extract and store decisions
    if (output.decisions) {
      state.decisions[agent.id] = output.decisions;
    }
    
    // Update metrics
    state.metrics.totalTokensUsed += output.tokensUsed || 0;
    state.metrics.totalCost += output.cost || 0;
    state.metrics.executionTimeMs += output.executionTimeMs || 0;
    
    return state;
  }
  
  private async executeWithRetry(
    agent: AgentDefinition,
    state: PipelineState,
    context: PipelineContext,
    retryPolicy: RetryPolicy
  ): Promise<AgentOutput> {
    let attempt = 0;
    const maxAttempts = retryPolicy.maxRetries + 1;
    
    while (attempt < maxAttempts) {
      try {
        // Track attempt
        if (!state.retryCount[agent.id]) {
          state.retryCount[agent.id] = 0;
        }
        state.retryCount[agent.id] = attempt;
        
        // Execute agent (placeholder - actual implementation would call the agent)
        const output = await this.runAgent(agent, state, context);
        
        // Validate output
        this.validateAgentOutput(output, agent);
        
        return output;
        
      } catch (error: any) {
        attempt++;
        
        // Classify error
        const errorType = this.classifyError(error);
        
        // Don't retry on non-transient errors
        if (!this.isTransientError(errorType)) {
          throw error;
        }
        
        // Check if we should retry
        if (attempt >= maxAttempts) {
          throw new Error(`Agent ${agent.id} failed after ${maxAttempts} attempts: ${error.message}`);
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(
          retryPolicy.baseDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempt - 1),
          retryPolicy.maxDelayMs
        );
        const jitter = Math.random() * 0.1 * delay;
        
        console.log(`[Pipeline] Retrying ${agent.id} after ${delay + jitter}ms (attempt ${attempt + 1}/${maxAttempts})`);
        await this.delay(delay + jitter);
      }
    }
    
    throw new Error(`Agent ${agent.id} failed after all retry attempts`);
  }
  
  private async persistState(state: PipelineState): Promise<void> {
    // Calculate checksum
    state.checksum = this.calculateChecksum(state);
    
    // Validate state
    const validation = PipelineStateSchema.safeParse(state);
    if (!validation.success) {
      throw new Error(`Invalid state: ${validation.error.message}`);
    }
    
    // Check state size
    const stateJson = JSON.stringify(state);
    if (stateJson.length > this.maxStateFileSize) {
      // Archive old outputs to reduce size
      await this.archiveOldOutputs(state);
    }
    
    // Atomic write with temp file
    const statePath = path.join(this.stateDir, `${state.pipelineId}.json`);
    const tempPath = `${statePath}.tmp`;
    
    await fs.writeJson(tempPath, state, { spaces: 2 });
    await fs.rename(tempPath, statePath);
    
    // Also backup to snapshots
    await this.createStateSnapshot(state);
  }
  
  private async loadState(pipelineId: string): Promise<PipelineState | null> {
    const statePath = path.join(this.stateDir, `${pipelineId}.json`);
    
    if (!await fs.pathExists(statePath)) {
      return null;
    }
    
    const state = await fs.readJson(statePath);
    
    // Validate checksum
    const expectedChecksum = state.checksum;
    delete state.checksum;
    const actualChecksum = this.calculateChecksum(state);
    
    if (expectedChecksum !== actualChecksum) {
      console.warn(`[Pipeline] State checksum mismatch for ${pipelineId}`);
      // Try to recover from snapshot
      const snapshot = await this.loadLatestSnapshot(pipelineId);
      if (snapshot) {
        console.log(`[Pipeline] Recovered state from snapshot`);
        return snapshot;
      }
    }
    
    state.checksum = expectedChecksum;
    return state;
  }
  
  private calculateChecksum(state: PipelineState): string {
    const stateWithoutChecksum = { ...state };
    delete stateWithoutChecksum.checksum;
    
    // Sort keys for consistent hashing
    const json = JSON.stringify(stateWithoutChecksum, Object.keys(stateWithoutChecksum).sort());
    return createHash('sha256').update(json).digest('hex');
  }
  
  private createInitialState(pipelineId: string, task: SimpleTask): PipelineState {
    return {
      pipelineId,
      taskId: task.id,
      epicId: task.epicId,
      storyId: task.storyId,
      projectId: task.projectId,
      currentPhase: 'idle',
      completedPhases: [],
      remainingPhases: ['architect', 'developer', 'qa', 'kb_builder'],
      status: 'running',
      outputs: {},
      decisions: {},
      handoffs: [],
      timestamps: {
        started: new Date().toISOString(),
        updated: new Date().toISOString()
      },
      retryCount: {},
      errors: [],
      metrics: {
        totalTokensUsed: 0,
        totalCost: 0,
        kbEntriesCreated: 0,
        executionTimeMs: 0
      },
      subtasks: task.metadata?.subtasks,
      dependencies: task.dependencies
    };
  }
  
  private generatePipelineId(task: SimpleTask): string {
    const timestamp = Date.now();
    const hash = createHash('sha256')
      .update(`${task.id}-${timestamp}`)
      .digest('hex')
      .slice(0, 8);
    return `pipeline-${task.id}-${hash}`;
  }
  
  private classifyError(error: any): ErrorType {
    const message = error.message || '';
    
    if (message.includes('rate limit') || error.status === 429) return 'rate_limit';
    if (message.includes('timeout') || error.code === 'ETIMEDOUT') return 'timeout';
    if (message.includes('network') || error.code === 'ECONNREFUSED') return 'network';
    if (message.includes('budget')) return 'budget_exceeded';
    if (message.includes('validation')) return 'validation';
    if (message.includes('permission')) return 'permission';
    
    return 'unknown';
  }
  
  private isTransientError(type: ErrorType): boolean {
    return ['rate_limit', 'timeout', 'network'].includes(type);
  }
  
  private async requiresApproval(
    agent: AgentDefinition,
    state: PipelineState,
    context: PipelineContext
  ): Promise<boolean> {
    if (context.skipApprovals) return false;
    
    // Check pre-phase approval gates (before execution)
    // Architect outputs require approval for expensive tasks
    if (agent.id === 'developer' && state.metrics.totalCost > 1.0) {
      return true;
    }
    
    // Post-phase approvals handled after execution
    return false;
  }
  
  private async requiresPostPhaseApproval(
    agent: AgentDefinition,
    state: PipelineState,
    context: PipelineContext
  ): Promise<boolean> {
    if (context.skipApprovals) return false;
    
    // QA failures require approval to continue
    if (agent.id === 'qa' && state.outputs['qa']?.decisions?.some(d => d.type === 'error')) {
      return true;
    }
    
    return false;
  }
  
  private async isBudgetExceeded(
    state: PipelineState,
    context: PipelineContext
  ): Promise<boolean> {
    const maxCost = context.maxCost || Infinity;
    return state.metrics.totalCost >= maxCost;
  }
  
  private async shouldPause(
    state: PipelineState,
    context: PipelineContext
  ): Promise<boolean> {
    // Check for pause conditions
    if (context.timeout) {
      const elapsed = Date.now() - new Date(state.timestamps.started).getTime();
      if (elapsed > context.timeout) {
        return true;
      }
    }
    
    return false;
  }
  
  private validateAgentOutput(output: AgentOutput, agent: AgentDefinition): void {
    if (!output) {
      throw new Error(`Agent ${agent.id} returned no output`);
    }
    
    if (!output.content && !output.summary) {
      throw new Error(`Agent ${agent.id} returned empty output`);
    }
    
    // Additional validation based on agent type
    if (agent.id === 'developer' && !output.decisions) {
      console.warn(`[Pipeline] Developer agent returned no decisions`);
    }
  }
  
  private buildResult(state: PipelineState): PipelineResult {
    return {
      pipelineId: state.pipelineId,
      status: state.status,
      outputs: state.outputs,
      decisions: state.decisions,
      metrics: state.metrics,
      errors: state.errors
    };
  }
  
  private getRetryPolicy(agent: AgentDefinition): RetryPolicy {
    return {
      maxRetries: agent.maxRetries || 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2
    };
  }
  
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private async runAgent(
    agent: AgentDefinition,
    state: PipelineState,
    context: PipelineContext
  ): Promise<AgentOutput> {
    console.log(`[Pipeline] Running agent ${agent.id}`);
    
    // Get the orchestration system to access executors
    const orchestrationPath = path.join(__dirname, '..', 'index');
    const { getOrchestrationSystem } = await import(orchestrationPath);
    const orchestration = getOrchestrationSystem(this.workspacePath);
    
    // Prepare input based on agent type
    let input: any;
    
    switch (agent.id) {
      case 'developer':
        // Prepare input for ClaudeCodeExecutor
        input = {
          planStepId: state.pipelineId,
          objective: this.getTaskObjective(state),
          repoSummary: await this.getRepoSummary(),
          targetFiles: await this.getTargetFiles(state),
          constraints: this.getConstraints(state),
          tests: this.getTests(state),
          budget: {
            maxTokens: agent.maxTokens || 32000,
            maxCostUSD: context.maxCost || 1.0,
            timeoutMs: agent.timeout || 60000
          },
          previousOutputs: this.getPreviousOutputs(state),
          kbEntries: [], // Will be populated by Context Budgeter later
          maxIterations: 10
        };
        break;
        
      case 'architect':
        input = {
          task: this.getTaskFromState(state),
          context: {
            previousOutputs: this.getPreviousOutputs(state),
            projectContext: await this.getProjectContext()
          }
        };
        break;
        
      case 'qa':
        input = {
          task: this.getTaskFromState(state),
          developerOutput: state.outputs['developer'],
          architectOutput: state.outputs['architect']
        };
        break;
        
      default:
        input = {
          task: this.getTaskFromState(state),
          previousOutputs: this.getPreviousOutputs(state)
        };
    }
    
    try {
      // Execute agent through the orchestration system
      const result = await orchestration.executeAgent(agent.id, input, context);
      
      // Normalize result to AgentOutput format
      const output: AgentOutput = {
        content: result.content || result.summary || '',
        summary: result.summary || this.extractSummary(result.content),
        decisions: result.decisions || [],
        tokensUsed: result.usage?.totalTokens || result.tokensUsed || 0,
        cost: result.usage?.costUSD || result.cost || 0,
        executionTimeMs: result.executionTimeMs || Date.now() - new Date(state.timestamps.updated).getTime(),
        worktreeChanges: result.worktreeChanges,
        prompt: result.prompt
      };
      
      return output;
      
    } catch (error: any) {
      console.error(`[Pipeline] Agent ${agent.id} execution failed:`, error);
      throw error;
    }
  }
  
  // Helper methods for preparing agent inputs
  private getTaskObjective(state: PipelineState): string {
    const task = this.getTaskFromState(state);
    return `${task.title}\n\n${task.description}`;
  }
  
  private getTaskFromState(state: PipelineState): SimpleTask {
    return {
      id: state.taskId,
      epicId: state.epicId,
      storyId: state.storyId,
      title: state.subtasks?.[0]?.title || 'Task',
      description: state.subtasks?.[0]?.description || '',
      projectId: state.projectId,
      priority: 'normal',
      requirements: state.subtasks?.[0]?.requirements,
      dependencies: state.dependencies
    };
  }
  
  private async getRepoSummary(): Promise<string> {
    // Basic repo summary - will be enhanced later
    const packageJsonPath = path.join(this.workspacePath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const pkg = await fs.readJson(packageJsonPath);
      return `Project: ${pkg.name || 'Unknown'}\nDescription: ${pkg.description || 'No description'}\nMain: ${pkg.main || 'index.js'}`;
    }
    return 'Repository summary not available';
  }
  
  private async getTargetFiles(state: PipelineState): Promise<string[]> {
    // Get relevant files - will be enhanced with Context Budgeter
    const files: string[] = [];
    
    // Add files mentioned in previous outputs
    for (const output of Object.values(state.outputs)) {
      if (output.worktreeChanges?.modified) {
        files.push(...output.worktreeChanges.modified);
      }
    }
    
    return files;
  }
  
  private getConstraints(state: PipelineState): string[] {
    const constraints: string[] = [];
    
    // Add constraints from task
    const task = this.getTaskFromState(state);
    if (task.requirements) {
      constraints.push(...task.requirements);
    }
    
    // Add constraints from previous decisions
    for (const [agentId, decisions] of Object.entries(state.decisions)) {
      for (const decision of decisions) {
        if (decision.type === 'recommendation' || decision.type === 'warning') {
          constraints.push(`${agentId}: ${decision.content}`);
        }
      }
    }
    
    return constraints;
  }
  
  private getTests(state: PipelineState): any[] {
    // Extract test commands from task or previous outputs
    const tests: any[] = [];
    
    // Look for test commands in architect output
    const architectOutput = state.outputs['architect'];
    if (architectOutput?.content?.includes('test')) {
      // Simple extraction - will be enhanced
      tests.push({
        command: 'npm test',
        successRegex: 'passing',
        timeoutMs: 30000
      });
    }
    
    return tests;
  }
  
  private getPreviousOutputs(state: PipelineState): any[] {
    return Object.entries(state.outputs).map(([agentId, output]) => ({
      agent: agentId,
      summary: output.summary || '',
      decisions: output.decisions || []
    }));
  }
  
  private async getProjectContext(): Promise<any> {
    // Basic project context - will be enhanced
    return {
      workspacePath: this.workspacePath,
      hasPackageJson: await fs.pathExists(path.join(this.workspacePath, 'package.json')),
      hasTsConfig: await fs.pathExists(path.join(this.workspacePath, 'tsconfig.json')),
      hasGitRepo: await fs.pathExists(path.join(this.workspacePath, '.git'))
    };
  }
  
  private extractSummary(content: string): string {
    // Extract first paragraph or first 200 characters as summary
    const firstParagraph = content.split('\n\n')[0];
    if (firstParagraph.length <= 200) {
      return firstParagraph;
    }
    return firstParagraph.substring(0, 197) + '...';
  }
  
  private async loadAgentOutput(outputKey: string): Promise<AgentOutput | null> {
    const outputPath = path.join(this.stateDir, 'outputs', `${outputKey}.json`);
    if (await fs.pathExists(outputPath)) {
      return fs.readJson(outputPath);
    }
    return null;
  }
  
  private async snapshotAgentOutput(
    agent: AgentDefinition,
    output: AgentOutput,
    state: PipelineState
  ): Promise<void> {
    const outputKey = `${state.pipelineId}-${agent.id}`;
    const outputPath = path.join(this.stateDir, 'outputs', `${outputKey}.json`);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, output, { spaces: 2 });
  }
  
  private async createStateSnapshot(state: PipelineState): Promise<void> {
    const timestamp = Date.now();
    const snapshotPath = path.join(
      this.snapshotDir,
      `${state.pipelineId}-${timestamp}.json`
    );
    await fs.writeJson(snapshotPath, state, { spaces: 2 });
  }
  
  private async loadLatestSnapshot(pipelineId: string): Promise<PipelineState | null> {
    const files = await fs.readdir(this.snapshotDir);
    const snapshots = files
      .filter(f => f.startsWith(pipelineId))
      .sort()
      .reverse();
    
    if (snapshots.length > 0) {
      const latestPath = path.join(this.snapshotDir, snapshots[0]);
      return fs.readJson(latestPath);
    }
    
    return null;
  }
  
  private async archiveOldOutputs(state: PipelineState): Promise<void> {
    // Archive older outputs to reduce state size
    const archivePath = path.join(
      this.stateDir,
      'archives',
      `${state.pipelineId}-outputs.json`
    );
    await fs.ensureDir(path.dirname(archivePath));
    
    // Move older outputs to archive
    const oldOutputs = { ...state.outputs };
    state.outputs = {};
    
    // Keep only the latest output
    const latestPhase = state.completedPhases[state.completedPhases.length - 1];
    if (latestPhase && oldOutputs[latestPhase]) {
      state.outputs[latestPhase] = oldOutputs[latestPhase];
    }
    
    await fs.writeJson(archivePath, oldOutputs, { spaces: 2 });
  }
  
  private async cleanupOldStates(): Promise<void> {
    const files = await fs.readdir(this.stateDir);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(this.stateDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.remove(filePath);
        console.log(`[Pipeline] Cleaned up old state file: ${file}`);
      }
    }
  }
  
  async getActivePipelines(): Promise<PipelineState[]> {
    const files = await fs.readdir(this.stateDir);
    const pipelines: PipelineState[] = [];
    
    for (const file of files) {
      if (!file.endsWith('.json') || file.includes('.tmp')) continue;
      
      const state = await fs.readJson(path.join(this.stateDir, file));
      if (state.status === 'running' || state.status === 'paused' || state.status === 'waiting_approval') {
        pipelines.push(state);
      }
    }
    
    return pipelines;
  }
  
  private async checkDependencies(dependencies: string[]): Promise<string[]> {
    const unmet: string[] = [];
    
    for (const dep of dependencies) {
      // Check if dependency task is complete
      const depState = await this.loadState(dep);
      if (!depState || depState.status !== 'complete') {
        unmet.push(dep);
      }
    }
    
    return unmet;
  }
  
  private async validatePreconditions(state: PipelineState, context: PipelineContext): Promise<void> {
    // Validate workspace exists
    if (!await fs.pathExists(context.workspacePath)) {
      throw new Error(`Workspace path does not exist: ${context.workspacePath}`);
    }
    
    // Validate state directory is writable
    try {
      await fs.access(this.stateDir, fs.constants.W_OK);
    } catch {
      throw new Error(`State directory is not writable: ${this.stateDir}`);
    }
    
    // Check for resource limits
    if (context.maxTokens && state.metrics.totalTokensUsed >= context.maxTokens) {
      throw new Error(`Token limit exceeded: ${state.metrics.totalTokensUsed}/${context.maxTokens}`);
    }
  }
}