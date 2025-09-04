/**
 * Pipeline Executor Service
 * Handles execution of agent orchestrator pipelines
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  Pipeline,
  AgentNode,
  AgentStatus,
  ExecutionContext,
  AgentTrigger,
  AgentOutput,
  PipelineEvent,
  AgentInstance
} from '../types/agent-orchestrator';

const execAsync = promisify(exec);

export class PipelineExecutor extends EventEmitter {
  private executionContexts: Map<string, ExecutionContext> = new Map();
  private activeInstances: Map<string, AgentInstance> = new Map();
  private fileWatchers: Map<string, any> = new Map();
  
  constructor(
    private claudeService: any,
    private codexService: any,
    private worktreeManager: any
  ) {
    super();
  }

  /**
   * Execute a pipeline
   */
  async execute(pipeline: Pipeline): Promise<void> {
    // Initialize execution context
    const context: ExecutionContext = {
      pipeline,
      eventPath: path.join('.agent-events', pipeline.id),
      startTime: new Date(),
      logs: [],
      outputs: new Map(),
      activeInstances: new Map()
    };
    
    this.executionContexts.set(pipeline.id, context);
    
    try {
      // Create event directory structure
      await this.setupEventDirectory(context);
      
      // Create pipeline worktree if needed
      if (pipeline.worktreeStrategy === 'per-pipeline') {
        context.worktreePath = await this.createPipelineWorktree(pipeline);
      }
      
      // Initialize file watcher for event-driven execution
      await this.setupFileWatcher(context);
      
      // Emit pipeline started event
      this.emitPipelineEvent({
        type: 'pipeline:started',
        pipelineId: pipeline.id,
        timestamp: new Date()
      });
      
      // Start execution based on mode
      await this.executePipeline(context);
      
    } catch (error) {
      this.handlePipelineError(pipeline, error);
    }
  }

  /**
   * Setup event directory structure
   */
  private async setupEventDirectory(context: ExecutionContext): Promise<void> {
    const { eventPath, pipeline } = context;
    
    // Create base directories
    await fs.ensureDir(eventPath);
    await fs.ensureDir(path.join(eventPath, 'agents'));
    
    // Write pipeline manifest
    await fs.writeJson(path.join(eventPath, 'manifest.json'), {
      pipeline: {
        id: pipeline.id,
        name: pipeline.name,
        status: pipeline.status,
        agents: Array.from(pipeline.agents.values()).map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          role: a.role,
          dependencies: a.dependencies
        }))
      },
      startTime: context.startTime
    }, { spaces: 2 });
    
    // Create agent directories
    for (const agent of pipeline.agents.values()) {
      const agentPath = path.join(eventPath, 'agents', agent.id);
      await fs.ensureDir(agentPath);
      await fs.ensureDir(path.join(agentPath, 'logs'));
    }
  }

  /**
   * Setup file watcher for event-driven execution
   */
  private async setupFileWatcher(context: ExecutionContext): Promise<void> {
    const chokidar = await import('chokidar');
    const { eventPath, pipeline } = context;
    
    const watcher = chokidar.watch(
      path.join(eventPath, 'agents', '*', 'trigger.json'),
      {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      }
    );
    
    watcher.on('add', async (filePath) => {
      const agentId = path.basename(path.dirname(filePath));
      const agent = pipeline.agents.get(agentId);
      
      if (agent && agent.status === 'waiting') {
        await this.executeAgent(context, agent);
      }
    });
    
    watcher.on('change', async (filePath) => {
      const agentId = path.basename(path.dirname(filePath));
      await this.handleAgentStatusUpdate(context, agentId);
    });
    
    this.fileWatchers.set(pipeline.id, watcher);
  }

  /**
   * Execute pipeline based on execution mode
   */
  private async executePipeline(context: ExecutionContext): Promise<void> {
    const { pipeline } = context;
    
    // Get execution order using topological sort
    const executionOrder = this.topologicalSort(pipeline);
    
    switch (pipeline.executionMode) {
      case 'sequential':
        await this.executeSequential(context, executionOrder);
        break;
      
      case 'parallel':
        await this.executeParallel(context, executionOrder);
        break;
      
      case 'smart':
        await this.executeSmart(context, executionOrder);
        break;
    }
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(pipeline: Pipeline): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = pipeline.agents.get(nodeId);
      if (node) {
        // Visit dependencies first
        for (const depId of node.dependencies) {
          visit(depId);
        }
      }
      
      stack.push(nodeId);
    };
    
    // Visit all nodes
    for (const nodeId of pipeline.agents.keys()) {
      visit(nodeId);
    }
    
    return stack;
  }

  /**
   * Execute agents sequentially
   */
  private async executeSequential(context: ExecutionContext, order: string[]): Promise<void> {
    for (const agentId of order) {
      const agent = context.pipeline.agents.get(agentId);
      if (agent) {
        await this.executeAgent(context, agent);
        
        // Wait for completion
        await this.waitForAgentCompletion(context, agent);
        
        if (agent.status === 'failed' && !context.pipeline.continueOnFailure) {
          throw new Error(`Agent ${agent.name} failed`);
        }
      }
    }
  }

  /**
   * Execute agents in parallel where possible
   */
  private async executeParallel(context: ExecutionContext, order: string[]): Promise<void> {
    const executing = new Set<string>();
    const completed = new Set<string>();
    
    while (completed.size < order.length) {
      // Find agents ready to execute
      const ready = order.filter(agentId => {
        if (executing.has(agentId) || completed.has(agentId)) return false;
        
        const agent = context.pipeline.agents.get(agentId);
        if (!agent) return false;
        
        // Check if all dependencies are completed
        return agent.dependencies.every(depId => completed.has(depId));
      });
      
      // Execute ready agents
      for (const agentId of ready) {
        const agent = context.pipeline.agents.get(agentId);
        if (agent) {
          executing.add(agentId);
          this.executeAgent(context, agent).then(() => {
            executing.delete(agentId);
            completed.add(agentId);
          });
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Smart execution with automatic parallelization
   */
  private async executeSmart(context: ExecutionContext, order: string[]): Promise<void> {
    // Group agents by dependency level
    const levels = this.groupByDependencyLevel(context.pipeline);
    
    // Execute each level in parallel
    for (const level of levels) {
      const promises = level.map(agentId => {
        const agent = context.pipeline.agents.get(agentId);
        return agent ? this.executeAgent(context, agent) : Promise.resolve();
      });
      
      await Promise.all(promises);
      
      // Wait for all agents in this level to complete
      await Promise.all(level.map(agentId => {
        const agent = context.pipeline.agents.get(agentId);
        return agent ? this.waitForAgentCompletion(context, agent) : Promise.resolve();
      }));
    }
  }

  /**
   * Group agents by dependency level for smart execution
   */
  private groupByDependencyLevel(pipeline: Pipeline): string[][] {
    const levels: string[][] = [];
    const assigned = new Set<string>();
    
    while (assigned.size < pipeline.agents.size) {
      const currentLevel: string[] = [];
      
      for (const [agentId, agent] of pipeline.agents) {
        if (assigned.has(agentId)) continue;
        
        // Check if all dependencies are assigned
        if (agent.dependencies.every(depId => assigned.has(depId))) {
          currentLevel.push(agentId);
        }
      }
      
      if (currentLevel.length === 0) {
        // Circular dependency detected
        throw new Error('Circular dependency detected in pipeline');
      }
      
      currentLevel.forEach(id => assigned.add(id));
      levels.push(currentLevel);
    }
    
    return levels;
  }

  /**
   * Execute a single agent
   */
  private async executeAgent(context: ExecutionContext, agent: AgentNode): Promise<void> {
    try {
      // Update agent status
      agent.status = 'running';
      agent.execution.startTime = new Date();
      
      // Emit agent started event
      this.emitPipelineEvent({
        type: 'agent:started',
        pipelineId: context.pipeline.id,
        agentId: agent.id,
        timestamp: new Date()
      });
      
      // Create agent worktree if needed
      let workingDirectory = agent.config.workingDirectory || process.cwd();
      if (agent.config.useWorktree) {
        workingDirectory = await this.createAgentWorktree(context, agent);
        agent.worktreeId = workingDirectory;
      } else if (context.worktreePath) {
        workingDirectory = context.worktreePath;
      }
      
      // Spawn instance based on type
      const instance = await this.spawnInstance(agent, workingDirectory);
      this.activeInstances.set(agent.id, instance);
      
      // Setup output handling
      instance.onOutput((data) => {
        this.handleAgentOutput(context, agent, data);
      });
      
      instance.onExit((code) => {
        this.handleAgentExit(context, agent, code);
      });
      
      // Write trigger file
      await this.writeTriggerFile(context, agent);
      
      // Send initial prompt if configured
      if (agent.config.prompt) {
        await instance.send(agent.config.prompt);
      }
      
    } catch (error) {
      this.handleAgentError(context, agent, error);
    }
  }

  /**
   * Spawn instance for agent
   */
  private async spawnInstance(agent: AgentNode, workingDirectory: string): Promise<AgentInstance> {
    const instanceId = `agent-${agent.id}-${Date.now()}`;
    agent.instanceId = instanceId;
    
    if (agent.type === 'claude') {
      return await this.spawnClaudeInstance(agent, instanceId, workingDirectory);
    } else if (agent.type === 'codex') {
      return await this.spawnCodexInstance(agent, instanceId, workingDirectory);
    } else {
      throw new Error(`Unknown agent type: ${agent.type}`);
    }
  }

  /**
   * Spawn Claude instance
   */
  private async spawnClaudeInstance(agent: AgentNode, instanceId: string, workingDirectory: string): Promise<AgentInstance> {
    // Get personality if specified
    const personality = agent.config.personalityId
      ? await this.claudeService.getPersonality(agent.config.personalityId)
      : null;
    
    const spawnResult = await this.claudeService.spawn({
      instanceId,
      workingDirectory,
      instanceName: agent.name,
      config: {
        personalityId: agent.config.personalityId,
        personality: personality ? {
          name: personality.name,
          instructions: personality.instructions
        } : undefined,
        command: 'claude',
        args: ['--json-output']
      }
    });
    
    return {
      spawn: async () => instanceId,
      send: async (data: string) => {
        await this.claudeService.send({ instanceId, data });
      },
      onOutput: (callback) => {
        this.claudeService.on(`output:${instanceId}`, callback);
      },
      onExit: (callback) => {
        this.claudeService.on(`exit:${instanceId}`, callback);
      },
      kill: async () => {
        await this.claudeService.stop({ instanceId });
      },
      getBuffer: async () => {
        return await this.claudeService.getBuffer(instanceId);
      }
    };
  }

  /**
   * Spawn Codex instance
   */
  private async spawnCodexInstance(agent: AgentNode, instanceId: string, workingDirectory: string): Promise<AgentInstance> {
    const spawnResult = await this.codexService.spawn({
      instanceId,
      workingDirectory,
      instanceName: agent.name,
      config: {
        command: 'codex',
        args: [],
        environment: {
          AGENT_ROLE: agent.role,
          AGENT_NAME: agent.name
        }
      }
    });
    
    return {
      spawn: async () => instanceId,
      send: async (data: string) => {
        await this.codexService.send({ instanceId, data });
      },
      onOutput: (callback) => {
        this.codexService.on(`output:${instanceId}`, callback);
      },
      onExit: (callback) => {
        this.codexService.on(`exit:${instanceId}`, callback);
      },
      kill: async () => {
        await this.codexService.stop({ instanceId });
      },
      getBuffer: async () => {
        return await this.codexService.getBuffer(instanceId);
      }
    };
  }

  /**
   * Write trigger file for agent
   */
  private async writeTriggerFile(context: ExecutionContext, agent: AgentNode): Promise<void> {
    const { eventPath } = context;
    const agentPath = path.join(eventPath, 'agents', agent.id);
    
    // Gather inputs from dependencies
    const previousOutputs: Record<string, any> = {};
    for (const depId of agent.dependencies) {
      const output = context.outputs.get(depId);
      if (output) {
        previousOutputs[depId] = output.outputs;
      }
    }
    
    // Create trigger data
    const trigger: AgentTrigger = {
      agentId: agent.id,
      pipelineId: context.pipeline.id,
      inputs: {
        files: {},
        variables: {},
        previousOutputs
      },
      context: {
        workingDirectory: agent.worktreeId || agent.config.workingDirectory || process.cwd(),
        worktreePath: agent.worktreeId,
        environment: agent.config.environment
      }
    };
    
    // Load input files if specified
    if (agent.config.inputFiles) {
      for (const file of agent.config.inputFiles) {
        const filePath = path.join(trigger.context.workingDirectory, file);
        if (await fs.pathExists(filePath)) {
          trigger.inputs.files![file] = await fs.readFile(filePath, 'utf-8');
        }
      }
    }
    
    // Write trigger file
    await fs.writeJson(path.join(agentPath, 'trigger.json'), trigger, { spaces: 2 });
  }

  /**
   * Create worktree for pipeline
   */
  private async createPipelineWorktree(pipeline: Pipeline): Promise<string> {
    const worktreePath = path.join('.worktrees', `pipeline-${pipeline.id}`);
    const branchName = `pipeline/${pipeline.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    await execAsync(`git worktree add ${worktreePath} -b ${branchName} ${pipeline.baseBranch || 'HEAD'}`);
    
    this.emitPipelineEvent({
      type: 'worktree:created',
      pipelineId: pipeline.id,
      timestamp: new Date(),
      data: { worktreePath, branchName }
    });
    
    return worktreePath;
  }

  /**
   * Create worktree for agent
   */
  private async createAgentWorktree(context: ExecutionContext, agent: AgentNode): Promise<string> {
    const worktreePath = path.join('.worktrees', `agent-${agent.id}`);
    const branchName = `agent/${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    await execAsync(`git worktree add ${worktreePath} -b ${branchName} ${context.pipeline.baseBranch || 'HEAD'}`);
    
    return worktreePath;
  }

  /**
   * Handle agent output
   */
  private handleAgentOutput(context: ExecutionContext, agent: AgentNode, data: string): void {
    const { eventPath } = context;
    const agentPath = path.join(eventPath, 'agents', agent.id);
    
    // Append to logs
    if (!agent.execution.logs) {
      agent.execution.logs = [];
    }
    agent.execution.logs.push(data);
    
    // Write to log file
    const logFile = path.join(agentPath, 'logs', `${Date.now()}.log`);
    fs.appendFileSync(logFile, data);
    
    // Update output
    if (!agent.execution.output) {
      agent.execution.output = '';
    }
    agent.execution.output += data;
    
    // Emit output event
    this.emitPipelineEvent({
      type: 'agent:output',
      pipelineId: context.pipeline.id,
      agentId: agent.id,
      timestamp: new Date(),
      data: { output: data }
    });
  }

  /**
   * Handle agent exit
   */
  private async handleAgentExit(context: ExecutionContext, agent: AgentNode, code: number): Promise<void> {
    agent.execution.endTime = new Date();
    agent.execution.exitCode = code;
    agent.status = code === 0 ? 'completed' : 'failed';
    
    // Write output files if specified
    if (agent.config.outputFiles && agent.status === 'completed') {
      await this.writeOutputFiles(context, agent);
    }
    
    // Create output record
    const output: AgentOutput = {
      agentId: agent.id,
      pipelineId: context.pipeline.id,
      success: agent.status === 'completed',
      outputs: {
        files: {},
        variables: {},
        logs: agent.execution.logs
      },
      metrics: {
        duration: agent.execution.endTime.getTime() - agent.execution.startTime!.getTime(),
        retries: agent.execution.retryCount || 0
      }
    };
    
    if (agent.status === 'failed') {
      output.error = {
        message: `Agent exited with code ${code}`,
        code: code.toString()
      };
    }
    
    context.outputs.set(agent.id, output);
    
    // Write output file
    const { eventPath } = context;
    const agentPath = path.join(eventPath, 'agents', agent.id);
    await fs.writeJson(path.join(agentPath, 'output.json'), output, { spaces: 2 });
    
    // Update status file
    await fs.writeJson(path.join(agentPath, 'status.json'), {
      status: agent.status,
      exitCode: code,
      endTime: agent.execution.endTime
    }, { spaces: 2 });
    
    // Emit completion event
    this.emitPipelineEvent({
      type: agent.status === 'completed' ? 'agent:completed' : 'agent:failed',
      pipelineId: context.pipeline.id,
      agentId: agent.id,
      timestamp: new Date(),
      data: { exitCode: code }
    });
    
    // Clean up instance
    this.activeInstances.delete(agent.id);
    
    // Check if pipeline is complete
    await this.checkPipelineCompletion(context);
  }

  /**
   * Write output files for agent
   */
  private async writeOutputFiles(context: ExecutionContext, agent: AgentNode): Promise<void> {
    if (!agent.config.outputFiles) return;
    
    const workingDirectory = agent.worktreeId || agent.config.workingDirectory || process.cwd();
    
    for (const file of agent.config.outputFiles) {
      const filePath = path.join(workingDirectory, file);
      
      // For now, we'll save the agent's output to the file
      // In a real implementation, this would be more sophisticated
      if (agent.execution.output) {
        await fs.writeFile(filePath, agent.execution.output);
      }
    }
  }

  /**
   * Handle agent error
   */
  private handleAgentError(context: ExecutionContext, agent: AgentNode, error: any): void {
    agent.status = 'failed';
    agent.execution.endTime = new Date();
    agent.execution.error = error.message || error.toString();
    
    // Log error
    console.error(`Agent ${agent.name} error:`, error);
    
    // Emit error event
    this.emitPipelineEvent({
      type: 'agent:failed',
      pipelineId: context.pipeline.id,
      agentId: agent.id,
      timestamp: new Date(),
      data: { error: error.message }
    });
  }

  /**
   * Wait for agent completion
   */
  private async waitForAgentCompletion(context: ExecutionContext, agent: AgentNode): Promise<void> {
    const timeout = agent.config.timeout || context.pipeline.globalTimeout || 300000; // 5 minutes default
    const startTime = Date.now();
    
    while (agent.status === 'running' || agent.status === 'waiting') {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Agent ${agent.name} timed out`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Check if pipeline is complete
   */
  private async checkPipelineCompletion(context: ExecutionContext): Promise<void> {
    const { pipeline } = context;
    
    // Check if all agents are complete
    const allComplete = Array.from(pipeline.agents.values()).every(
      agent => agent.status === 'completed' || agent.status === 'failed' || agent.status === 'cancelled'
    );
    
    if (allComplete) {
      pipeline.status = 'completed';
      pipeline.completedAt = new Date();
      
      // Check if any failed
      const anyFailed = Array.from(pipeline.agents.values()).some(
        agent => agent.status === 'failed'
      );
      
      if (anyFailed && !pipeline.continueOnFailure) {
        pipeline.status = 'failed';
      }
      
      // Write final state
      const { eventPath } = context;
      await fs.writeJson(path.join(eventPath, 'state.json'), {
        status: pipeline.status,
        completedAt: pipeline.completedAt,
        agents: Array.from(pipeline.agents.values()).map(a => ({
          id: a.id,
          name: a.name,
          status: a.status,
          exitCode: a.execution.exitCode
        }))
      }, { spaces: 2 });
      
      // Emit completion event
      this.emitPipelineEvent({
        type: pipeline.status === 'completed' ? 'pipeline:completed' : 'pipeline:failed',
        pipelineId: pipeline.id,
        timestamp: new Date()
      });
      
      // Clean up
      this.cleanup(context);
    }
  }

  /**
   * Handle agent status update
   */
  private async handleAgentStatusUpdate(context: ExecutionContext, agentId: string): Promise<void> {
    const { eventPath } = context;
    const statusPath = path.join(eventPath, 'agents', agentId, 'status.json');
    
    if (await fs.pathExists(statusPath)) {
      const status = await fs.readJson(statusPath);
      const agent = context.pipeline.agents.get(agentId);
      
      if (agent) {
        agent.status = status.status;
        if (status.error) {
          agent.execution.error = status.error;
        }
      }
    }
  }

  /**
   * Handle pipeline error
   */
  private handlePipelineError(pipeline: Pipeline, error: any): void {
    pipeline.status = 'failed';
    pipeline.completedAt = new Date();
    
    console.error(`Pipeline ${pipeline.name} error:`, error);
    
    this.emitPipelineEvent({
      type: 'pipeline:failed',
      pipelineId: pipeline.id,
      timestamp: new Date(),
      data: { error: error.message }
    });
  }

  /**
   * Emit pipeline event
   */
  private emitPipelineEvent(event: PipelineEvent): void {
    this.emit('pipeline:event', event);
  }

  /**
   * Pause pipeline execution
   */
  async pause(pipelineId: string): Promise<void> {
    const context = this.executionContexts.get(pipelineId);
    if (!context) return;
    
    context.pipeline.status = 'paused';
    context.pipeline.pausedAt = new Date();
    
    // Kill all active instances
    for (const [agentId, instance] of this.activeInstances) {
      if (context.pipeline.agents.has(agentId)) {
        await instance.kill();
      }
    }
    
    this.emitPipelineEvent({
      type: 'pipeline:paused',
      pipelineId,
      timestamp: new Date()
    });
  }

  /**
   * Resume pipeline execution
   */
  async resume(pipelineId: string): Promise<void> {
    const context = this.executionContexts.get(pipelineId);
    if (!context || context.pipeline.status !== 'paused') return;
    
    context.pipeline.status = 'running';
    delete context.pipeline.pausedAt;
    
    // Resume execution
    await this.executePipeline(context);
  }

  /**
   * Stop pipeline execution
   */
  async stop(pipelineId: string): Promise<void> {
    const context = this.executionContexts.get(pipelineId);
    if (!context) return;
    
    context.pipeline.status = 'cancelled';
    context.pipeline.completedAt = new Date();
    
    // Kill all active instances
    for (const [agentId, instance] of this.activeInstances) {
      if (context.pipeline.agents.has(agentId)) {
        await instance.kill();
        const agent = context.pipeline.agents.get(agentId);
        if (agent) {
          agent.status = 'cancelled';
        }
      }
    }
    
    this.cleanup(context);
  }

  /**
   * Clean up resources
   */
  private cleanup(context: ExecutionContext): void {
    const { pipeline } = context;
    
    // Close file watcher
    const watcher = this.fileWatchers.get(pipeline.id);
    if (watcher) {
      watcher.close();
      this.fileWatchers.delete(pipeline.id);
    }
    
    // Remove execution context
    this.executionContexts.delete(pipeline.id);
  }

  /**
   * Get pipeline status
   */
  getStatus(pipelineId: string): ExecutionContext | undefined {
    return this.executionContexts.get(pipelineId);
  }
}