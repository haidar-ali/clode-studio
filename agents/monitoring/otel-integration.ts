/**
 * OpenTelemetry Integration for Agent Orchestration
 * Tracks spans, metrics, and performance across all agent operations
 */

import { trace, metrics, Span, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';

export interface AgentSpanContext {
  agentId: string;
  taskId?: string;
  epicId?: string;
  storyId?: string;
  pipelineId?: string;
  phase: 'initialization' | 'planning' | 'execution' | 'validation' | 'completion';
  provider?: string;
  model?: string;
}

export interface AgentMetrics {
  executionTimeMs: number;
  tokensUsed: number;
  cost: number;
  success: boolean;
  retryCount: number;
  errorType?: string;
}

export class OTelIntegration {
  private tracer = trace.getTracer('clode-studio-agents', '1.0.0');
  private meter = metrics.getMeter('clode-studio-agents', '1.0.0');
  private sdk: NodeSDK | null = null;
  
  // Metrics collectors
  private executionCounter = this.meter.createCounter('agent_executions_total', {
    description: 'Total number of agent executions'
  });
  
  private executionDuration = this.meter.createHistogram('agent_execution_duration_ms', {
    description: 'Agent execution duration in milliseconds'
  });
  
  private tokenCounter = this.meter.createCounter('agent_tokens_total', {
    description: 'Total tokens consumed by agents'
  });
  
  private costCounter = this.meter.createCounter('agent_cost_total', {
    description: 'Total cost of agent executions in USD'
  });
  
  private errorCounter = this.meter.createCounter('agent_errors_total', {
    description: 'Total number of agent errors'
  });

  async initialize(): Promise<void> {
    try {
      // Initialize OpenTelemetry SDK
      this.sdk = new NodeSDK({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: 'clode-studio-agents',
          [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        }),
        traceExporter: new ConsoleSpanExporter(),
        metricReader: new PeriodicExportingMetricReader({
          exporter: new ConsoleMetricExporter(),
          exportIntervalMillis: 30000, // Export every 30 seconds
        }),
      });

      this.sdk.start();
      console.log('[OTel] OpenTelemetry SDK initialized successfully');
    } catch (error) {
      console.error('[OTel] Failed to initialize OpenTelemetry:', error);
    }
  }

  /**
   * Create a new span for agent execution
   */
  startAgentSpan(name: string, context: AgentSpanContext): Span {
    const span = this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'agent.id': context.agentId,
        'agent.phase': context.phase,
        'task.id': context.taskId || '',
        'epic.id': context.epicId || '',
        'story.id': context.storyId || '',
        'pipeline.id': context.pipelineId || '',
        'provider.name': context.provider || '',
        'model.name': context.model || '',
      }
    });

    return span;
  }

  /**
   * End a span and record metrics
   */
  endAgentSpan(span: Span, metrics: AgentMetrics, context: AgentSpanContext): void {
    try {
      // Set span attributes with execution metrics
      span.setAttributes({
        'execution.duration_ms': metrics.executionTimeMs,
        'execution.tokens_used': metrics.tokensUsed,
        'execution.cost_usd': metrics.cost,
        'execution.success': metrics.success,
        'execution.retry_count': metrics.retryCount,
        'execution.error_type': metrics.errorType || '',
      });

      // Set span status
      if (metrics.success) {
        span.setStatus({ code: SpanStatusCode.OK });
      } else {
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: metrics.errorType || 'Agent execution failed'
        });
      }

      // Record metrics
      const labels = {
        agent_id: context.agentId,
        phase: context.phase,
        provider: context.provider || 'unknown',
        model: context.model || 'unknown',
        success: metrics.success.toString(),
      };

      this.executionCounter.add(1, labels);
      this.executionDuration.record(metrics.executionTimeMs, labels);
      this.tokenCounter.add(metrics.tokensUsed, labels);
      this.costCounter.add(metrics.cost, labels);

      if (!metrics.success) {
        this.errorCounter.add(1, {
          ...labels,
          error_type: metrics.errorType || 'unknown'
        });
      }

      span.end();
    } catch (error) {
      console.error('[OTel] Error ending span:', error);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to record metrics' });
      span.end();
    }
  }

  /**
   * Create a child span for sub-operations
   */
  createChildSpan(parentSpan: Span, name: string, operation: string): Span {
    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'operation.type': operation,
      }
    }, trace.setSpan(trace.active(), parentSpan));
  }

  /**
   * Record custom metrics
   */
  recordCustomMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    try {
      const counter = this.meter.createCounter(`agent_custom_${name}`, {
        description: `Custom metric: ${name}`
      });
      counter.add(value, labels);
    } catch (error) {
      console.error(`[OTel] Failed to record custom metric ${name}:`, error);
    }
  }

  /**
   * Get current trace context for correlation
   */
  getCurrentTraceContext(): string | null {
    try {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        return activeSpan.spanContext().traceId;
      }
      return null;
    } catch (error) {
      console.error('[OTel] Failed to get trace context:', error);
      return null;
    }
  }

  /**
   * Shutdown OpenTelemetry SDK
   */
  async shutdown(): Promise<void> {
    try {
      if (this.sdk) {
        await this.sdk.shutdown();
        console.log('[OTel] OpenTelemetry SDK shutdown completed');
      }
    } catch (error) {
      console.error('[OTel] Error during OpenTelemetry shutdown:', error);
    }
  }
}

// Singleton instance
let otelInstance: OTelIntegration | null = null;

export function getOTelIntegration(): OTelIntegration {
  if (!otelInstance) {
    otelInstance = new OTelIntegration();
  }
  return otelInstance;
}

export async function initializeOTel(): Promise<OTelIntegration> {
  const otel = getOTelIntegration();
  await otel.initialize();
  return otel;
}

// Export types for use in other modules
export type { AgentSpanContext, AgentMetrics };