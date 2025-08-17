/**
 * Provider abstraction layer for multi-LLM support
 * Normalized interfaces that hide vendor-specific implementations
 */

export interface LLMRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | any;
  }>;
  tools?: NormalizedToolSpec[];
  responseFormat?: {
    type: 'json' | 'text';
    schema?: object;
  };
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  meta?: {
    traceId?: string;
    agentId?: string;
    pipelineId?: string;
    taskId?: string;
  };
}

export interface LLMResponse {
  text?: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
    error?: string;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
  id: string;
  latencyMs: number;
  cached?: boolean;
  routeDecision?: RouteDecision;
}

export interface LLMProvider {
  name: string;
  supports: {
    tools: boolean;
    structuredJson: boolean;
    streaming: boolean;
    computerUse?: boolean;
    imageInput?: boolean;
    codeInterpreter?: boolean;
  };
  limits: {
    maxTokens: number;
    maxToolCalls?: number;
    maxImageSize?: number;
  };
  
  tokenize(text: string, model?: string): number;
  invoke(req: LLMRequest, cfg: ProviderConfig): Promise<LLMResponse>;
  validateTools(tools: NormalizedToolSpec[]): ValidationResult;
  stream?(req: LLMRequest, cfg: ProviderConfig, opts: StreamingOptions): Promise<void>;
}

export interface ProviderConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export interface NormalizedToolSpec {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface StreamingOptions {
  onToken?: (token: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onComplete?: (response: LLMResponse) => void;
}

export interface ToolCall {
  name: string;
  arguments: any;
  error?: string;
}

export interface RouteDecision {
  target: Target;
  reason: string;
  timestamp: Date;
  context: RouteContext;
}

export interface Target {
  provider: string;
  model: string;
  tier?: 'primary' | 'fallback' | 'emergency';
}

export interface RouteContext {
  agentId: string;
  taskKind: string;
  needs: string[];
  estimatedTokens?: number;
  priority?: 'low' | 'normal' | 'high';
  budget?: number;
  excludeTargets?: Target[];
  tags?: string[];
}

export interface PricingEntry {
  inputPer1K: number;
  outputPer1K: number;
}

export type ErrorType = 
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'budget_exceeded'
  | 'validation'
  | 'permission'
  | 'unknown';

export interface AgentOutput {
  content: string;
  summary?: string;
  decisions?: Decision[];
  tokensUsed?: number;
  cost?: number;
  executionTimeMs?: number;
  contextUsed?: {
    kbEntries: any[];
    previousOutputs: any[];
    projectContext?: any;
  };
  prompt?: string;
  worktreeChanges?: any;
  provider?: string;
  model?: string;
  routeDecision?: RouteDecision;
}

export interface Decision {
  id: string;
  type: 'action' | 'recommendation' | 'warning' | 'error';
  content: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  type: string;
  description: string;
  useWorktree?: boolean;
  maxTokens?: number;
  maxRetries?: number;
  timeout?: number;
  capabilities?: string[];
}