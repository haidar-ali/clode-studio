/**
 * LLM Router - Intelligent routing with deterministic fallback
 * Handles provider selection, rate limiting, circuit breaking, and cost optimization
 */

import { 
  LLMProvider, 
  LLMRequest, 
  LLMResponse, 
  Target, 
  RouteContext, 
  RouteDecision,
  PricingEntry
} from '../providers/types';
import { ProviderRegistry } from '../providers/registry';
import { DualRateLimiter } from './rate-limiter';
import { CircuitBreaker } from './circuit-breaker';

export type RoutePolicy = 
  | { type: 'byAgent'; map: Record<string, Target> }
  | { type: 'costCap'; primary: Target; fallback: Target; maxDollarPerExec: number }
  | { type: 'capability'; need: string[]; preferred: Target[]; fallback: Target }
  | { type: 'composite'; policies: RoutePolicy[] };

export interface RouterConfig {
  pricing: Map<string, PricingEntry>;
  limits: {
    perProvider: Record<string, {
      rpm: number;
      tpm: number;
      dailyBudgetUSD?: number;
    }>;
    perAgent: Record<string, {
      maxTokensPerRequest?: number;
      maxDailyRequests?: number;
      dailyBudgetUSD?: number;
    }>;
  };
  fallbacks: Record<string, Target[]>;
  maxFallbackAttempts?: number;
  providerConfigs: Record<string, any>;
}

export class NoValidProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoValidProviderError';
  }
}

export class AllProvidersFailedError extends Error {
  constructor(message: string, public lastError?: Error) {
    super(message);
    this.name = 'AllProvidersFailedError';
  }
}

export class LLMRouter {
  private rateLimiters = new Map<string, DualRateLimiter>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private costTracker = new Map<string, number>();
  private routeHistory: RouteDecision[] = [];
  private requestCounter = new Map<string, number>();
  
  constructor(
    private registry: ProviderRegistry,
    private policy: RoutePolicy,
    private config: RouterConfig
  ) {
    this.initializeRateLimiters();
    this.initializeCircuitBreakers();
  }
  
  async pick(ctx: RouteContext): Promise<RouteDecision> {
    const candidates = this.getCandidates(ctx);
    
    if (candidates.length === 0) {
      throw new NoValidProviderError(
        `No candidates available for agent ${ctx.agentId}`
      );
    }
    
    for (const target of candidates) {
      const provider = this.registry.get(target.provider);
      if (!provider) {
        console.warn(`[Router] Provider ${target.provider} not found in registry`);
        continue;
      }
      
      // Check capabilities
      if (!this.hasRequiredCapabilities(provider, ctx.needs)) {
        console.log(`[Router] ${target.provider} lacks capabilities: ${ctx.needs.join(', ')}`);
        continue;
      }
      
      // Check rate limits
      const rateLimiter = this.rateLimiters.get(target.provider);
      if (rateLimiter && !rateLimiter.tryAcquire(ctx.estimatedTokens || 1000, true)) {
        this.logRateLimitExceeded(target, ctx);
        continue;
      }
      
      // Check circuit breaker
      const circuitBreaker = this.circuitBreakers.get(target.provider);
      if (circuitBreaker && !circuitBreaker.allowRequest()) {
        this.logCircuitOpen(target, ctx);
        continue;
      }
      
      // Check budgets
      if (!this.withinBudget(target, ctx)) {
        this.logBudgetExceeded(target, ctx);
        continue;
      }
      
      // Valid candidate found
      const decision: RouteDecision = {
        target,
        reason: this.determineReason(target, candidates, ctx),
        timestamp: new Date(),
        context: ctx
      };
      
      this.routeHistory.push(decision);
      return decision;
    }
    
    throw new NoValidProviderError(
      `No provider available for agent ${ctx.agentId} with needs: ${ctx.needs.join(', ')}`
    );
  }
  
  async invokeWithFallback(
    request: LLMRequest,
    ctx: RouteContext
  ): Promise<LLMResponse & { routeDecision: RouteDecision }> {
    const maxAttempts = this.config.maxFallbackAttempts || 3;
    let lastError: Error | undefined;
    const excludeTargets: Target[] = [...(ctx.excludeTargets || [])];
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Pass accumulated exclusions
      const routeCtx = { ...ctx, excludeTargets };
      
      let decision: RouteDecision;
      try {
        decision = await this.pick(routeCtx);
      } catch (error) {
        if (error instanceof NoValidProviderError) {
          throw new AllProvidersFailedError(
            `All providers exhausted for agent ${ctx.agentId}`,
            lastError
          );
        }
        throw error;
      }
      
      const provider = this.registry.get(decision.target.provider);
      
      if (!provider) {
        lastError = new Error(`Provider ${decision.target.provider} not found`);
        excludeTargets.push(decision.target);
        continue;
      }
      
      try {
        // Acquire rate limit tokens
        const rateLimiter = this.rateLimiters.get(decision.target.provider);
        if (rateLimiter) {
          rateLimiter.tryAcquire(ctx.estimatedTokens || 1000);
        }
        
        // Execute request
        const startTime = Date.now();
        const response = await provider.invoke(request, {
          model: decision.target.model,
          ...this.config.providerConfigs[decision.target.provider]
        });
        
        // Success - update metrics
        this.recordSuccess(decision.target, response);
        
        // Update circuit breaker
        const cb = this.circuitBreakers.get(decision.target.provider);
        cb?.recordSuccess();
        
        return {
          ...response,
          routeDecision: decision
        };
        
      } catch (error: any) {
        lastError = error;
        this.recordFailure(decision.target, error);
        
        // Update circuit breaker
        const cb = this.circuitBreakers.get(decision.target.provider);
        cb?.recordFailure();
        
        // Add failed target to exclusions
        excludeTargets.push(decision.target);
        
        // Check if retryable
        if (!this.isRetryable(error)) {
          throw error;
        }
        
        // Apply retry delay if needed
        const delay = this.getRetryDelay(attempt, error);
        if (delay > 0) {
          await this.delay(delay);
        }
      }
    }
    
    throw new AllProvidersFailedError(
      `All providers failed for agent ${ctx.agentId} after ${maxAttempts} attempts`,
      lastError
    );
  }
  
  private getCandidates(ctx: RouteContext): Target[] {
    const raw = this.getRawCandidates(ctx);
    const deduped = this.deduplicateTargets(raw);
    
    // CRITICAL FIX: Filter out excluded targets
    return deduped.filter(t => 
      !(ctx.excludeTargets || []).some(excluded => 
        excluded.provider === t.provider && 
        excluded.model === t.model
      )
    );
  }
  
  private getRawCandidates(ctx: RouteContext): Target[] {
    switch (this.policy.type) {
      case 'byAgent':
        const target = this.policy.map[ctx.agentId];
        const fallbacks = this.config.fallbacks?.[ctx.agentId] || [];
        return target ? [target, ...fallbacks] : fallbacks;
        
      case 'costCap':
        const cost = this.estimateCost(this.policy.primary, ctx.estimatedTokens);
        if (cost <= this.policy.maxDollarPerExec) {
          return [this.policy.primary, this.policy.fallback];
        }
        return [this.policy.fallback];
        
      case 'capability':
        return [...this.policy.preferred, this.policy.fallback];
        
      case 'composite':
        // Compose without recursion
        const allCandidates: Target[] = [];
        for (const subPolicy of this.policy.policies) {
          allCandidates.push(...this.evaluatePolicy(subPolicy, ctx));
        }
        return allCandidates;
        
      default:
        return [];
    }
  }
  
  private evaluatePolicy(policy: RoutePolicy, ctx: RouteContext): Target[] {
    // Non-recursive policy evaluation
    switch (policy.type) {
      case 'byAgent':
        const target = policy.map[ctx.agentId];
        return target ? [target] : [];
        
      case 'costCap':
        const cost = this.estimateCost(policy.primary, ctx.estimatedTokens);
        if (cost <= policy.maxDollarPerExec) {
          return [policy.primary];
        }
        return [policy.fallback];
        
      case 'capability':
        return policy.preferred;
        
      default:
        return [];
    }
  }
  
  private deduplicateTargets(targets: Target[]): Target[] {
    const seen = new Set<string>();
    return targets.filter(t => {
      const key = `${t.provider}:${t.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private hasRequiredCapabilities(provider: LLMProvider, needs: string[]): boolean {
    for (const need of needs) {
      if (!provider.supports[need as keyof typeof provider.supports]) {
        return false;
      }
    }
    return true;
  }
  
  private withinBudget(target: Target, ctx: RouteContext): boolean {
    const estimatedCost = this.estimateCost(target, ctx.estimatedTokens);
    
    // Check per-request budget
    if (ctx.budget && estimatedCost > ctx.budget) {
      console.log(`[Router] Request budget exceeded: $${estimatedCost} > $${ctx.budget}`);
      return false;
    }
    
    // Check provider daily budget
    const dailyLimit = this.config.limits?.perProvider?.[target.provider]?.dailyBudgetUSD;
    if (dailyLimit) {
      const spentToday = this.costTracker.get(this.getCostKey(target)) || 0;
      if (spentToday + estimatedCost > dailyLimit) {
        console.log(`[Router] Provider daily budget exceeded: $${spentToday + estimatedCost} > $${dailyLimit}`);
        return false;
      }
    }
    
    // Check agent daily budget
    const agentLimit = this.config.limits?.perAgent?.[ctx.agentId]?.dailyBudgetUSD;
    if (agentLimit) {
      const agentKey = `agent:${ctx.agentId}:${this.getDateKey()}`;
      const agentSpent = this.costTracker.get(agentKey) || 0;
      if (agentSpent + estimatedCost > agentLimit) {
        console.log(`[Router] Agent daily budget exceeded: $${agentSpent + estimatedCost} > $${agentLimit}`);
        return false;
      }
    }
    
    return true;
  }
  
  private estimateCost(target: Target, estimatedTokens?: number): number {
    const tokens = estimatedTokens || 1000;
    const key = `${target.provider}:${target.model}`;
    const pricing = this.config.pricing.get(key);
    
    if (!pricing) {
      console.warn(`[Router] No pricing for ${key}`);
      return 0;
    }
    
    // Assume 30/70 input/output split
    const inputTokens = tokens * 0.3;
    const outputTokens = tokens * 0.7;
    
    return (
      (inputTokens / 1000) * pricing.inputPer1K +
      (outputTokens / 1000) * pricing.outputPer1K
    );
  }
  
  private determineReason(target: Target, candidates: Target[], ctx: RouteContext): string {
    if (target.tier === 'fallback') {
      const primary = candidates.find(c => c.tier === 'primary');
      if (primary) {
        // Check why primary was skipped
        const spentToday = this.costTracker.get(this.getCostKey(primary)) || 0;
        const dailyLimit = this.config.limits?.perProvider?.[primary.provider]?.dailyBudgetUSD;
        
        if (dailyLimit && spentToday >= dailyLimit) {
          return 'budget_exhausted';
        }
        
        const cb = this.circuitBreakers.get(primary.provider);
        if (cb && !cb.allowRequest()) {
          return 'circuit_open';
        }
        
        const rl = this.rateLimiters.get(primary.provider);
        if (rl && !rl.tryAcquire(ctx.estimatedTokens || 1000, true)) {
          return 'rate_limited';
        }
        
        if (ctx.excludeTargets?.some(t => t.provider === primary.provider && t.model === primary.model)) {
          return 'previous_failure';
        }
      }
      return 'fallback';
    }
    return 'primary';
  }
  
  private recordSuccess(target: Target, response: LLMResponse): void {
    // Update circuit breaker
    const cb = this.circuitBreakers.get(target.provider);
    cb?.recordSuccess();
    
    // Update cost tracking
    const key = `${target.provider}:${target.model}`;
    const pricing = this.config.pricing.get(key);
    if (pricing) {
      const cost = (
        (response.usage.inputTokens / 1000) * pricing.inputPer1K +
        (response.usage.outputTokens / 1000) * pricing.outputPer1K
      );
      
      const dailyKey = this.getCostKey(target);
      this.costTracker.set(dailyKey, (this.costTracker.get(dailyKey) || 0) + cost);
    }
    
    // Update request counter
    const countKey = `${target.provider}:${this.getDateKey()}`;
    this.requestCounter.set(countKey, (this.requestCounter.get(countKey) || 0) + 1);
  }
  
  private recordFailure(target: Target, error: any): void {
    console.error(`[Router] Provider ${target.provider} failed:`, error.message);
  }
  
  private isRetryable(error: any): boolean {
    // Extract status from various error formats
    const status = 
      error?.status ?? 
      error?.statusCode ?? 
      error?.response?.status ??
      error?.response?.statusCode;
    
    // Rate limits are always retryable
    if (status === 429) return true;
    
    // Server errors are retryable
    if (typeof status === 'number' && status >= 500) return true;
    
    // Network errors are retryable
    const retryableCodes = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'EPIPE',
      'ENOTFOUND'
    ];
    
    if (retryableCodes.includes(error?.code)) return true;
    
    // Check for specific provider errors
    if (error?.error?.type === 'overloaded_error') return true; // Anthropic
    if (error?.error?.code === 'context_length_exceeded') return false; // Not retryable
    
    return false;
  }
  
  private getRetryDelay(attempt: number, error: any): number {
    // Respect retry-after header
    const retryAfter = 
      error?.headers?.['retry-after'] ||
      error?.response?.headers?.['retry-after'];
    
    if (retryAfter) {
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
    
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 32000);
    const jitter = Math.random() * 0.1 * baseDelay;
    return baseDelay + jitter;
  }
  
  private getCostKey(target: Target): string {
    return `${target.provider}:${target.model}:${this.getDateKey()}`;
  }
  
  private getDateKey(): string {
    return new Date().toISOString().split('T')[0];
  }
  
  private initializeRateLimiters(): void {
    for (const [provider, limits] of Object.entries(this.config.limits.perProvider)) {
      this.rateLimiters.set(
        provider,
        new DualRateLimiter(limits.tpm, limits.rpm)
      );
    }
  }
  
  private initializeCircuitBreakers(): void {
    for (const provider of Object.keys(this.config.limits.perProvider)) {
      this.circuitBreakers.set(
        provider,
        new CircuitBreaker()
      );
    }
  }
  
  private logRateLimitExceeded(target: Target, ctx: RouteContext): void {
    console.log(`[Router] Rate limit exceeded for ${target.provider}:${target.model} (agent: ${ctx.agentId})`);
  }
  
  private logCircuitOpen(target: Target, ctx: RouteContext): void {
    console.log(`[Router] Circuit breaker open for ${target.provider}:${target.model} (agent: ${ctx.agentId})`);
  }
  
  private logBudgetExceeded(target: Target, ctx: RouteContext): void {
    console.log(`[Router] Budget exceeded for ${target.provider}:${target.model} (agent: ${ctx.agentId})`);
  }
  
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Public methods for monitoring
  async getProviderStats(provider: string): Promise<any> {
    const costKey = `${provider}:${this.getDateKey()}`;
    const countKey = `${provider}:${this.getDateKey()}`;
    
    return {
      dailyCost: this.costTracker.get(costKey) || 0,
      dailyRequests: this.requestCounter.get(countKey) || 0,
      circuitStatus: this.circuitBreakers.get(provider)?.getStatus() || 'unknown',
      rateLimitAvailable: this.rateLimiters.get(provider)?.getAvailableTokens() || 0
    };
  }
  
  async getDailyCost(): Promise<number> {
    const dateKey = this.getDateKey();
    let total = 0;
    
    for (const [key, cost] of this.costTracker) {
      if (key.includes(dateKey)) {
        total += cost;
      }
    }
    
    return total;
  }
  
  getRouteHistory(): RouteDecision[] {
    return this.routeHistory.slice(-100); // Last 100 decisions
  }
}