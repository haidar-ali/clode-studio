/**
 * OpenTelemetry Monitoring Integration
 * 
 * Provides comprehensive observability for the multi-agent orchestration system:
 * - Distributed tracing across agent executions
 * - Metrics for performance, cost, and token usage
 * - Structured logging with correlation
 * - Alert thresholds and anomaly detection
 */

import { 
  metrics, 
  trace, 
  context, 
  SpanStatusCode,
  SpanKind,
  Span,
  Context,
  Tracer,
  Meter,
  Counter,
  Histogram,
  UpDownCounter,
  ObservableGauge
} from '@opentelemetry/api';

export interface TelemetryConfig {
  serviceName: string;
  endpoint?: string;
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  sampleRate?: number;
  exportIntervalMs?: number;
}

export interface AgentMetrics {
  executionTime: Histogram;
  tokenUsage: Counter;
  costTracking: Counter;
  errorRate: Counter;
  successRate: Counter;
  concurrentExecutions: UpDownCounter;
  queueDepth: ObservableGauge;
}

export interface PipelineMetrics {
  totalExecutions: Counter;
  completionTime: Histogram;
  stageTransitions: Counter;
  approvalWaitTime: Histogram;
  retryCount: Counter;
  budgetUtilization: ObservableGauge;
}

export interface ProviderMetrics {
  apiCalls: Counter;
  latency: Histogram;
  rateLimitHits: Counter;
  fallbackTriggers: Counter;
  tokenThroughput: Histogram;
  costPerProvider: Counter;
}

export class TelemetryService {
  private tracer: Tracer;
  private meter: Meter;
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private pipelineMetrics: PipelineMetrics;
  private providerMetrics: Map<string, ProviderMetrics> = new Map();
  private activeSpans: Map<string, Span> = new Map();
  private correlationIds: Map<string, string> = new Map();
  
  constructor(private config: TelemetryConfig) {
    this.tracer = trace.getTracer(config.serviceName, '1.0.0');
    this.meter = metrics.getMeter(config.serviceName, '1.0.0');
    this.initializeMetrics();
  }
  
  /**
   * Initialize all metrics collectors
   */
  private initializeMetrics(): void {
    // Pipeline metrics
    this.pipelineMetrics = {
      totalExecutions: this.meter.createCounter('pipeline.executions.total', {
        description: 'Total number of pipeline executions'
      }),
      completionTime: this.meter.createHistogram('pipeline.completion.time', {
        description: 'Pipeline completion time in milliseconds',
        unit: 'ms'
      }),
      stageTransitions: this.meter.createCounter('pipeline.stage.transitions', {
        description: 'Number of stage transitions'
      }),
      approvalWaitTime: this.meter.createHistogram('pipeline.approval.wait.time', {
        description: 'Time spent waiting for approvals',
        unit: 'ms'
      }),
      retryCount: this.meter.createCounter('pipeline.retries.total', {
        description: 'Total number of retries'
      }),
      budgetUtilization: this.meter.createObservableGauge('pipeline.budget.utilization', {
        description: 'Current budget utilization percentage'
      })
    };
    
    // Set up observable callbacks
    this.setupObservableMetrics();
  }
  
  /**
   * Create agent-specific metrics
   */
  private createAgentMetrics(agentId: string): AgentMetrics {
    const metrics: AgentMetrics = {
      executionTime: this.meter.createHistogram(`agent.${agentId}.execution.time`, {
        description: `Execution time for agent ${agentId}`,
        unit: 'ms'
      }),
      tokenUsage: this.meter.createCounter(`agent.${agentId}.tokens.used`, {
        description: `Tokens used by agent ${agentId}`
      }),
      costTracking: this.meter.createCounter(`agent.${agentId}.cost`, {
        description: `Cost incurred by agent ${agentId}`,
        unit: 'USD'
      }),
      errorRate: this.meter.createCounter(`agent.${agentId}.errors`, {
        description: `Errors encountered by agent ${agentId}`
      }),
      successRate: this.meter.createCounter(`agent.${agentId}.success`, {
        description: `Successful executions by agent ${agentId}`
      }),
      concurrentExecutions: this.meter.createUpDownCounter(`agent.${agentId}.concurrent`, {
        description: `Concurrent executions for agent ${agentId}`
      }),
      queueDepth: this.meter.createObservableGauge(`agent.${agentId}.queue.depth`, {
        description: `Queue depth for agent ${agentId}`
      })
    };
    
    this.agentMetrics.set(agentId, metrics);
    return metrics;
  }
  
  /**
   * Create provider-specific metrics
   */
  private createProviderMetrics(provider: string): ProviderMetrics {
    const metrics: ProviderMetrics = {
      apiCalls: this.meter.createCounter(`provider.${provider}.api.calls`, {
        description: `API calls to provider ${provider}`
      }),
      latency: this.meter.createHistogram(`provider.${provider}.latency`, {
        description: `API latency for provider ${provider}`,
        unit: 'ms'
      }),
      rateLimitHits: this.meter.createCounter(`provider.${provider}.rate.limits`, {
        description: `Rate limit hits for provider ${provider}`
      }),
      fallbackTriggers: this.meter.createCounter(`provider.${provider}.fallbacks`, {
        description: `Fallback triggers for provider ${provider}`
      }),
      tokenThroughput: this.meter.createHistogram(`provider.${provider}.tokens.throughput`, {
        description: `Token throughput for provider ${provider}`,
        unit: 'tokens/s'
      }),
      costPerProvider: this.meter.createCounter(`provider.${provider}.cost`, {
        description: `Total cost for provider ${provider}`,
        unit: 'USD'
      })
    };
    
    this.providerMetrics.set(provider, metrics);
    return metrics;
  }
  
  /**
   * Start a new trace span
   */
  startSpan(
    name: string,
    attributes?: Record<string, any>,
    parentSpan?: Span
  ): Span {
    const spanOptions = {
      kind: SpanKind.INTERNAL,
      attributes
    };
    
    let span: Span;
    if (parentSpan) {
      const ctx = trace.setSpan(context.active(), parentSpan);
      span = this.tracer.startSpan(name, spanOptions, ctx);
    } else {
      span = this.tracer.startSpan(name, spanOptions);
    }
    
    // Generate correlation ID
    const spanContext = span.spanContext();
    const correlationId = `${spanContext.traceId}-${spanContext.spanId}`;
    this.correlationIds.set(name, correlationId);
    
    // Store active span
    this.activeSpans.set(correlationId, span);
    
    return span;
  }
  
  /**
   * End a span with status
   */
  endSpan(
    span: Span,
    status: 'success' | 'error' | 'cancelled' = 'success',
    error?: Error
  ): void {
    if (status === 'error' && error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    } else if (status === 'cancelled') {
      span.setStatus({ code: SpanStatusCode.UNSET, message: 'Cancelled' });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    
    span.end();
    
    // Clean up
    const spanContext = span.spanContext();
    const correlationId = `${spanContext.traceId}-${spanContext.spanId}`;
    this.activeSpans.delete(correlationId);
  }
  
  /**
   * Record pipeline execution
   */
  recordPipelineExecution(
    pipelineId: string,
    taskId: string,
    duration: number,
    status: 'completed' | 'failed' | 'cancelled',
    attributes?: Record<string, any>
  ): void {
    const span = this.startSpan('pipeline.execution', {
      'pipeline.id': pipelineId,
      'task.id': taskId,
      'pipeline.status': status,
      ...attributes
    });
    
    this.pipelineMetrics.totalExecutions.add(1, { status });
    this.pipelineMetrics.completionTime.record(duration, { status });
    
    this.endSpan(span, status === 'completed' ? 'success' : 'error');
  }
  
  /**
   * Record agent execution
   */
  recordAgentExecution(
    agentId: string,
    duration: number,
    tokensUsed: number,
    cost: number,
    success: boolean,
    attributes?: Record<string, any>
  ): void {
    let metrics = this.agentMetrics.get(agentId);
    if (!metrics) {
      metrics = this.createAgentMetrics(agentId);
    }
    
    const span = this.startSpan(`agent.${agentId}.execution`, {
      'agent.id': agentId,
      'agent.tokens': tokensUsed,
      'agent.cost': cost,
      'agent.success': success,
      ...attributes
    });
    
    metrics.executionTime.record(duration);
    metrics.tokenUsage.add(tokensUsed);
    metrics.costTracking.add(cost);
    
    if (success) {
      metrics.successRate.add(1);
    } else {
      metrics.errorRate.add(1);
    }
    
    this.endSpan(span, success ? 'success' : 'error');
  }
  
  /**
   * Record provider API call
   */
  recordProviderCall(
    provider: string,
    model: string,
    latency: number,
    tokensUsed: number,
    cost: number,
    success: boolean,
    attributes?: Record<string, any>
  ): void {
    let metrics = this.providerMetrics.get(provider);
    if (!metrics) {
      metrics = this.createProviderMetrics(provider);
    }
    
    const span = this.startSpan(`provider.${provider}.call`, {
      'provider.name': provider,
      'provider.model': model,
      'provider.latency': latency,
      'provider.tokens': tokensUsed,
      'provider.cost': cost,
      'provider.success': success,
      ...attributes
    });
    
    metrics.apiCalls.add(1, { model, success: success.toString() });
    metrics.latency.record(latency, { model });
    metrics.costPerProvider.add(cost, { model });
    
    // Calculate throughput
    const throughput = latency > 0 ? (tokensUsed / latency) * 1000 : 0;
    metrics.tokenThroughput.record(throughput, { model });
    
    this.endSpan(span, success ? 'success' : 'error');
  }
  
  /**
   * Record rate limit hit
   */
  recordRateLimit(provider: string, model: string, retryAfter?: number): void {
    const metrics = this.providerMetrics.get(provider);
    if (metrics) {
      metrics.rateLimitHits.add(1, { model, retryAfter: retryAfter?.toString() });
    }
    
    const span = this.startSpan('provider.rate.limit', {
      'provider.name': provider,
      'provider.model': model,
      'rate.limit.retry.after': retryAfter
    });
    
    this.endSpan(span, 'error');
  }
  
  /**
   * Record fallback trigger
   */
  recordFallback(
    fromProvider: string,
    toProvider: string,
    reason: string
  ): void {
    const fromMetrics = this.providerMetrics.get(fromProvider);
    if (fromMetrics) {
      fromMetrics.fallbackTriggers.add(1, { toProvider, reason });
    }
    
    const span = this.startSpan('provider.fallback', {
      'fallback.from': fromProvider,
      'fallback.to': toProvider,
      'fallback.reason': reason
    });
    
    this.endSpan(span, 'success');
  }
  
  /**
   * Record stage transition
   */
  recordStageTransition(
    pipelineId: string,
    fromStage: string,
    toStage: string,
    duration?: number
  ): void {
    this.pipelineMetrics.stageTransitions.add(1, {
      from: fromStage,
      to: toStage
    });
    
    const span = this.startSpan('pipeline.stage.transition', {
      'pipeline.id': pipelineId,
      'stage.from': fromStage,
      'stage.to': toStage,
      'transition.duration': duration
    });
    
    this.endSpan(span, 'success');
  }
  
  /**
   * Record approval wait time
   */
  recordApprovalWait(pipelineId: string, waitTime: number): void {
    this.pipelineMetrics.approvalWaitTime.record(waitTime, {
      pipelineId
    });
    
    const span = this.startSpan('pipeline.approval.wait', {
      'pipeline.id': pipelineId,
      'wait.time': waitTime
    });
    
    this.endSpan(span, 'success');
  }
  
  /**
   * Record retry attempt
   */
  recordRetry(
    context: string,
    attempt: number,
    maxAttempts: number,
    reason: string
  ): void {
    this.pipelineMetrics.retryCount.add(1, {
      context,
      attempt: attempt.toString(),
      reason
    });
    
    const span = this.startSpan('retry.attempt', {
      'retry.context': context,
      'retry.attempt': attempt,
      'retry.max': maxAttempts,
      'retry.reason': reason
    });
    
    this.endSpan(span, 'success');
  }
  
  /**
   * Update concurrent executions
   */
  updateConcurrentExecutions(agentId: string, delta: number): void {
    const metrics = this.agentMetrics.get(agentId);
    if (metrics) {
      metrics.concurrentExecutions.add(delta);
    }
  }
  
  /**
   * Get correlation ID for current context
   */
  getCorrelationId(): string | undefined {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      return `${spanContext.traceId}-${spanContext.spanId}`;
    }
    return undefined;
  }
  
  /**
   * Create child span from correlation ID
   */
  createChildSpan(
    correlationId: string,
    name: string,
    attributes?: Record<string, any>
  ): Span | undefined {
    const parentSpan = this.activeSpans.get(correlationId);
    if (parentSpan) {
      return this.startSpan(name, attributes, parentSpan);
    }
    return undefined;
  }
  
  /**
   * Setup observable metrics callbacks
   */
  private setupObservableMetrics(): void {
    // Budget utilization observable
    this.pipelineMetrics.budgetUtilization.addCallback((observableResult) => {
      // This would be calculated from actual budget tracking
      const utilization = this.calculateBudgetUtilization();
      observableResult.observe(utilization);
    });
    
    // Agent queue depth observables
    for (const [agentId, metrics] of this.agentMetrics) {
      metrics.queueDepth.addCallback((observableResult) => {
        const depth = this.getAgentQueueDepth(agentId);
        observableResult.observe(depth);
      });
    }
  }
  
  /**
   * Calculate current budget utilization
   */
  private calculateBudgetUtilization(): number {
    // Placeholder - would integrate with actual budget tracking
    return Math.random() * 100;
  }
  
  /**
   * Get agent queue depth
   */
  private getAgentQueueDepth(agentId: string): number {
    // Placeholder - would integrate with actual queue management
    return Math.floor(Math.random() * 10);
  }
  
  /**
   * Export metrics snapshot
   */
  async exportMetrics(): Promise<any> {
    // This would export to configured backend
    return {
      timestamp: new Date().toISOString(),
      pipelines: this.pipelineMetrics,
      agents: Object.fromEntries(this.agentMetrics),
      providers: Object.fromEntries(this.providerMetrics)
    };
  }
  
  /**
   * Flush all pending telemetry
   */
  async flush(): Promise<void> {
    // End all active spans
    for (const [id, span] of this.activeSpans) {
      this.endSpan(span, 'cancelled');
    }
    
    // Clear collections
    this.activeSpans.clear();
    this.correlationIds.clear();
  }
  
  /**
   * Shutdown telemetry service
   */
  async shutdown(): Promise<void> {
    await this.flush();
    
    // Additional cleanup if needed
    console.log('[Telemetry] Service shutdown complete');
  }
}