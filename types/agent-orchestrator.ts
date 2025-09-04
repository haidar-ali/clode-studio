/**
 * Agent Orchestrator Type Definitions
 * Core types for the visual pipeline system
 */

// Agent instance type
export type AgentInstanceType = 'claude' | 'codex';

// Agent role definitions
export type AgentRole = 'planner' | 'designer' | 'architect' | 'coder' | 'tester' | 'reviewer' | 'custom';

// Agent execution status
export type AgentStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';

// Pipeline execution status
export type PipelineStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

// Pipeline execution mode
export type ExecutionMode = 'sequential' | 'parallel' | 'smart';

// Worktree strategy
export type WorktreeStrategy = 'none' | 'per-pipeline' | 'per-agent';

/**
 * Agent Node - Represents a single agent in the pipeline
 */
export interface AgentNode {
  id: string;
  type: AgentInstanceType;
  name: string;
  role: AgentRole;
  position: {
    x: number;
    y: number;
  };
  
  config: {
    prompt?: string;
    personalityId?: string; // From Claude personality store
    workingDirectory?: string;
    useWorktree?: boolean;
    worktreeName?: string;
    inputFiles?: string[];
    outputFiles?: string[];
    timeout?: number; // milliseconds
    maxRetries?: number;
    environment?: Record<string, string>;
  };
  
  dependencies: string[]; // Agent IDs that must complete first
  status: AgentStatus;
  instanceId?: string; // Active Claude/Codex instance ID
  worktreeId?: string; // Associated worktree path
  
  execution: {
    startTime?: Date;
    endTime?: Date;
    output?: string;
    error?: string;
    exitCode?: number;
    retryCount?: number;
    logs?: string[];
  };
}

/**
 * Pipeline - Complete pipeline configuration
 */
export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  
  // Kanban Integration
  epicId?: string;
  storyId?: string;
  taskIds?: string[];
  
  // Graph Structure
  agents: Map<string, AgentNode>;
  edges: Array<{
    from: string;
    to: string;
    condition?: string; // Optional conditional execution
  }>;
  
  // Execution Configuration
  status: PipelineStatus;
  executionMode: ExecutionMode;
  
  // Worktree Configuration
  worktreeStrategy: WorktreeStrategy;
  baseBranch?: string;
  autoMerge?: boolean;
  
  // Runtime State
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  currentAgents: string[]; // Currently executing agent IDs
  completedAgents: string[]; // Successfully completed agent IDs
  failedAgents: string[]; // Failed agent IDs
  
  // Configuration
  maxConcurrentAgents?: number;
  globalTimeout?: number; // milliseconds
  continueOnFailure?: boolean;
}

/**
 * Agent Event - File-based event for triggering agents
 */
export interface AgentEvent {
  type: 'trigger' | 'status' | 'output' | 'error' | 'complete';
  agentId: string;
  pipelineId: string;
  timestamp: Date;
  data?: any;
}

/**
 * Agent Trigger - Input data for agent execution
 */
export interface AgentTrigger {
  agentId: string;
  pipelineId: string;
  inputs: {
    files?: Record<string, string>; // filename -> content
    variables?: Record<string, any>;
    previousOutputs?: Record<string, any>; // outputs from dependencies
  };
  context: {
    workingDirectory: string;
    worktreePath?: string;
    environment?: Record<string, string>;
  };
}

/**
 * Agent Output - Result of agent execution
 */
export interface AgentOutput {
  agentId: string;
  pipelineId: string;
  success: boolean;
  outputs: {
    files?: Record<string, string>; // filename -> content
    variables?: Record<string, any>;
    logs?: string[];
  };
  metrics: {
    duration: number; // milliseconds
    retries?: number;
  };
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Pipeline Template - Reusable pipeline configuration
 */
export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  agents: Omit<AgentNode, 'id' | 'status' | 'instanceId' | 'worktreeId' | 'execution'>[];
  edges: Array<{ from: number; to: number }>; // Indices into agents array
  defaultConfig?: {
    executionMode?: ExecutionMode;
    worktreeStrategy?: WorktreeStrategy;
    maxConcurrentAgents?: number;
  };
}

/**
 * Execution Context - Runtime context for pipeline execution
 */
export interface ExecutionContext {
  pipeline: Pipeline;
  eventPath: string; // Base path for event files
  worktreePath?: string; // Pipeline worktree if applicable
  startTime: Date;
  logs: string[];
  outputs: Map<string, AgentOutput>;
  activeInstances: Map<string, any>; // agentId -> instance handle
}

/**
 * Agent Instance Interface - Contract for Claude/Codex instances
 */
export interface AgentInstance {
  spawn(agent: AgentNode): Promise<string>;
  send(data: string): Promise<void>;
  onOutput(callback: (data: string) => void): void;
  onExit(callback: (code: number) => void): void;
  kill(): Promise<void>;
  getBuffer?(): Promise<string>;
}

/**
 * Pipeline Event - Events emitted during pipeline execution
 */
export interface PipelineEvent {
  type: 'pipeline:started' | 'pipeline:completed' | 'pipeline:failed' | 'pipeline:paused' | 
        'agent:started' | 'agent:completed' | 'agent:failed' | 'agent:output' |
        'worktree:created' | 'worktree:merged';
  pipelineId: string;
  agentId?: string;
  timestamp: Date;
  data?: any;
}

/**
 * Graph Node for UI representation
 */
export interface GraphNode {
  id: string;
  type: 'agent' | 'start' | 'end' | 'condition';
  data: AgentNode | any;
  position: { x: number; y: number };
  selected?: boolean;
  dragging?: boolean;
}

/**
 * Graph Edge for UI representation
 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: 'default' | 'conditional';
  label?: string;
  selected?: boolean;
}

/**
 * Pipeline Store State
 */
export interface PipelineStoreState {
  pipelines: Map<string, Pipeline>;
  templates: Map<string, PipelineTemplate>;
  activePipelineId: string | null;
  executionContexts: Map<string, ExecutionContext>;
  events: PipelineEvent[];
}