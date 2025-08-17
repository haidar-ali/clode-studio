/**
 * Context Budgeter - Intelligent token allocation and context management
 * 
 * Manages token budgets across agents and pipelines with:
 * - Pre-flight token estimation
 * - Sliding window management
 * - Context compression strategies
 * - Budget enforcement and alerts
 */

import { LLMRequest, AgentDefinition, PricingEntry } from '../providers/types';
import { ProviderRegistry } from '../providers/registry';
import * as crypto from 'crypto';

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  willExceedBudget: boolean;
  compressionSuggested: boolean;
  compressionRatio?: number;
}

export interface ContextWindow {
  messages: any[];
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  compressible: boolean;
}

export interface BudgetAllocation {
  agentId: string;
  allocated: number;
  used: number;
  remaining: number;
  percentage: number;
}

export interface CompressionStrategy {
  type: 'summarize' | 'truncate' | 'filter' | 'sample';
  targetReduction: number;
  preservePriority: 'recent' | 'relevant' | 'system';
}

export interface ContextStats {
  totalMessages: number;
  totalTokens: number;
  avgTokensPerMessage: number;
  systemTokens: number;
  userTokens: number;
  assistantTokens: number;
  compressionOpportunities: number;
}

export class ContextBudgeter {
  private tokenCache = new Map<string, number>();
  private contextWindows = new Map<string, ContextWindow>();
  private budgetAllocations = new Map<string, BudgetAllocation>();
  private compressionHistory = new Map<string, CompressionStrategy[]>();
  private readonly DEFAULT_OUTPUT_RATIO = 0.3; // Assume 30% of max tokens for output
  private readonly COMPRESSION_THRESHOLD = 0.7; // Suggest compression at 70% utilization
  
  constructor(
    private registry: ProviderRegistry,
    private pricing: Map<string, PricingEntry>
  ) {}
  
  /**
   * Estimate tokens for a request before sending
   */
  async estimateTokens(
    request: LLMRequest,
    provider: string,
    model: string,
    agent?: AgentDefinition
  ): Promise<TokenEstimate> {
    const providerImpl = this.registry.get(provider);
    if (!providerImpl) {
      throw new Error(`Provider ${provider} not found`);
    }
    
    // Calculate input tokens
    const inputTokens = this.calculateInputTokens(request, providerImpl, model);
    
    // Estimate output tokens
    const maxOutputTokens = request.maxTokens || agent?.maxTokens || 4096;
    const estimatedOutput = Math.floor(maxOutputTokens * this.DEFAULT_OUTPUT_RATIO);
    
    // Calculate cost
    const pricingKey = `${provider}:${model}`;
    const pricingEntry = this.pricing.get(pricingKey);
    if (!pricingEntry) {
      throw new Error(`No pricing found for ${pricingKey}`);
    }
    
    const inputCost = (inputTokens / 1000000) * pricingEntry.inputPer1M;
    const outputCost = (estimatedOutput / 1000000) * pricingEntry.outputPer1M;
    const totalCost = inputCost + outputCost;
    
    // Check budget if agent provided
    let willExceedBudget = false;
    if (agent) {
      const allocation = this.budgetAllocations.get(agent.id);
      if (allocation) {
        willExceedBudget = (allocation.used + totalCost) > allocation.allocated;
      }
    }
    
    // Check if compression needed
    const totalTokens = inputTokens + estimatedOutput;
    const modelLimits = this.getModelLimits(provider, model);
    const utilizationRatio = totalTokens / modelLimits.maxContext;
    const compressionSuggested = utilizationRatio > this.COMPRESSION_THRESHOLD;
    
    return {
      inputTokens,
      outputTokens: estimatedOutput,
      totalTokens,
      cost: totalCost,
      willExceedBudget,
      compressionSuggested,
      compressionRatio: compressionSuggested ? utilizationRatio : undefined
    };
  }
  
  /**
   * Allocate token budgets across agents
   */
  allocateBudgets(
    agents: AgentDefinition[],
    totalBudget: number,
    weights?: Map<string, number>
  ): Map<string, BudgetAllocation> {
    const allocations = new Map<string, BudgetAllocation>();
    
    // Calculate total weight
    let totalWeight = 0;
    for (const agent of agents) {
      const weight = weights?.get(agent.id) || 1;
      totalWeight += weight;
    }
    
    // Allocate proportionally
    for (const agent of agents) {
      const weight = weights?.get(agent.id) || 1;
      const percentage = weight / totalWeight;
      const allocated = totalBudget * percentage;
      
      allocations.set(agent.id, {
        agentId: agent.id,
        allocated,
        used: 0,
        remaining: allocated,
        percentage: percentage * 100
      });
      
      this.budgetAllocations.set(agent.id, allocations.get(agent.id)!);
    }
    
    return allocations;
  }
  
  /**
   * Update budget usage after API call
   */
  updateBudgetUsage(agentId: string, cost: number): BudgetAllocation | undefined {
    const allocation = this.budgetAllocations.get(agentId);
    if (!allocation) {
      return undefined;
    }
    
    allocation.used += cost;
    allocation.remaining = Math.max(0, allocation.allocated - allocation.used);
    
    // Emit warning if budget exhausted
    if (allocation.remaining === 0) {
      console.warn(`[ContextBudgeter] Agent ${agentId} has exhausted its budget`);
    } else if (allocation.remaining < allocation.allocated * 0.1) {
      console.warn(`[ContextBudgeter] Agent ${agentId} has less than 10% budget remaining`);
    }
    
    return allocation;
  }
  
  /**
   * Manage sliding context window
   */
  manageContextWindow(
    agentId: string,
    messages: any[],
    maxTokens: number,
    provider: string,
    model: string
  ): ContextWindow {
    const providerImpl = this.registry.get(provider);
    if (!providerImpl) {
      throw new Error(`Provider ${provider} not found`);
    }
    
    // Calculate total tokens
    let totalTokens = 0;
    for (const message of messages) {
      const text = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
      totalTokens += providerImpl.tokenize(text, model);
    }
    
    const window: ContextWindow = {
      messages,
      totalTokens,
      maxTokens,
      utilizationPercent: (totalTokens / maxTokens) * 100,
      compressible: totalTokens > maxTokens * this.COMPRESSION_THRESHOLD
    };
    
    this.contextWindows.set(agentId, window);
    
    // Apply sliding window if needed
    if (window.totalTokens > maxTokens) {
      return this.applySlidingWindow(window, maxTokens, providerImpl, model);
    }
    
    return window;
  }
  
  /**
   * Apply sliding window to reduce context size
   */
  private applySlidingWindow(
    window: ContextWindow,
    maxTokens: number,
    provider: any,
    model: string
  ): ContextWindow {
    const messages = [...window.messages];
    let currentTokens = window.totalTokens;
    
    // Keep system messages and recent messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    // Remove oldest messages until under limit
    while (currentTokens > maxTokens && otherMessages.length > 1) {
      const removed = otherMessages.shift();
      if (removed) {
        const text = typeof removed.content === 'string'
          ? removed.content
          : JSON.stringify(removed.content);
        currentTokens -= provider.tokenize(text, model);
      }
    }
    
    const newMessages = [...systemMessages, ...otherMessages];
    
    return {
      messages: newMessages,
      totalTokens: currentTokens,
      maxTokens,
      utilizationPercent: (currentTokens / maxTokens) * 100,
      compressible: false
    };
  }
  
  /**
   * Compress context using various strategies
   */
  async compressContext(
    agentId: string,
    strategy: CompressionStrategy
  ): Promise<ContextWindow> {
    const window = this.contextWindows.get(agentId);
    if (!window) {
      throw new Error(`No context window found for agent ${agentId}`);
    }
    
    let compressed: any[];
    
    switch (strategy.type) {
      case 'summarize':
        compressed = await this.summarizeMessages(window.messages, strategy);
        break;
      case 'truncate':
        compressed = this.truncateMessages(window.messages, strategy);
        break;
      case 'filter':
        compressed = this.filterMessages(window.messages, strategy);
        break;
      case 'sample':
        compressed = this.sampleMessages(window.messages, strategy);
        break;
      default:
        throw new Error(`Unknown compression strategy: ${strategy.type}`);
    }
    
    // Track compression history
    const history = this.compressionHistory.get(agentId) || [];
    history.push(strategy);
    this.compressionHistory.set(agentId, history);
    
    // Update window
    const newWindow = {
      ...window,
      messages: compressed
    };
    this.contextWindows.set(agentId, newWindow);
    
    return newWindow;
  }
  
  /**
   * Summarize messages to reduce tokens
   */
  private async summarizeMessages(
    messages: any[],
    strategy: CompressionStrategy
  ): Promise<any[]> {
    // Group consecutive messages by role
    const groups: any[][] = [];
    let currentGroup: any[] = [];
    let currentRole: string | null = null;
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        // Always preserve system messages
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([msg]);
        currentRole = null;
      } else if (msg.role === currentRole) {
        currentGroup.push(msg);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [msg];
        currentRole = msg.role;
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    // Summarize groups
    const summarized: any[] = [];
    for (const group of groups) {
      if (group[0].role === 'system' || group.length === 1) {
        summarized.push(...group);
      } else {
        // Combine multiple messages
        const combined = {
          role: group[0].role,
          content: `[Summarized ${group.length} messages]: ${
            group.map(m => 
              typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            ).join(' | ')
          }`
        };
        summarized.push(combined);
      }
    }
    
    return summarized;
  }
  
  /**
   * Truncate messages to reduce size
   */
  private truncateMessages(
    messages: any[],
    strategy: CompressionStrategy
  ): any[] {
    const targetCount = Math.floor(messages.length * (1 - strategy.targetReduction));
    
    if (strategy.preservePriority === 'recent') {
      return messages.slice(-targetCount);
    } else if (strategy.preservePriority === 'system') {
      const system = messages.filter(m => m.role === 'system');
      const others = messages.filter(m => m.role !== 'system');
      return [...system, ...others.slice(-(targetCount - system.length))];
    }
    
    return messages.slice(0, targetCount);
  }
  
  /**
   * Filter messages by relevance
   */
  private filterMessages(
    messages: any[],
    strategy: CompressionStrategy
  ): any[] {
    // Keep system and error messages
    const important = messages.filter(m => 
      m.role === 'system' ||
      (typeof m.content === 'string' && 
       (m.content.includes('error') || m.content.includes('failed')))
    );
    
    // Keep recent messages
    const recent = messages.slice(-5);
    
    // Combine and deduplicate
    const combined = new Set([...important, ...recent]);
    return Array.from(combined);
  }
  
  /**
   * Sample messages to reduce count
   */
  private sampleMessages(
    messages: any[],
    strategy: CompressionStrategy
  ): any[] {
    const system = messages.filter(m => m.role === 'system');
    const others = messages.filter(m => m.role !== 'system');
    
    // Sample every nth message
    const sampleRate = Math.floor(1 / (1 - strategy.targetReduction));
    const sampled = others.filter((_, i) => i % sampleRate === 0);
    
    return [...system, ...sampled];
  }
  
  /**
   * Get context statistics
   */
  getContextStats(agentId: string): ContextStats | undefined {
    const window = this.contextWindows.get(agentId);
    if (!window) {
      return undefined;
    }
    
    const stats: ContextStats = {
      totalMessages: window.messages.length,
      totalTokens: window.totalTokens,
      avgTokensPerMessage: Math.floor(window.totalTokens / window.messages.length),
      systemTokens: 0,
      userTokens: 0,
      assistantTokens: 0,
      compressionOpportunities: 0
    };
    
    // Calculate tokens by role
    for (const msg of window.messages) {
      const tokens = this.estimateMessageTokens(msg);
      switch (msg.role) {
        case 'system':
          stats.systemTokens += tokens;
          break;
        case 'user':
          stats.userTokens += tokens;
          break;
        case 'assistant':
          stats.assistantTokens += tokens;
          break;
      }
    }
    
    // Count compression opportunities
    if (window.compressible) {
      stats.compressionOpportunities++;
    }
    
    // Check for duplicate messages
    const seen = new Set();
    for (const msg of window.messages) {
      const hash = this.hashMessage(msg);
      if (seen.has(hash)) {
        stats.compressionOpportunities++;
      }
      seen.add(hash);
    }
    
    return stats;
  }
  
  /**
   * Get budget status for all agents
   */
  getBudgetStatus(): Map<string, BudgetAllocation> {
    return new Map(this.budgetAllocations);
  }
  
  /**
   * Reset budgets for new pipeline
   */
  resetBudgets(): void {
    this.budgetAllocations.clear();
    this.contextWindows.clear();
    this.compressionHistory.clear();
  }
  
  /**
   * Calculate input tokens for a request
   */
  private calculateInputTokens(
    request: LLMRequest,
    provider: any,
    model: string
  ): number {
    let total = 0;
    
    // Messages
    for (const msg of request.messages) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      total += provider.tokenize(text, model);
    }
    
    // Tools
    if (request.tools) {
      const toolsText = JSON.stringify(request.tools);
      total += provider.tokenize(toolsText, model);
    }
    
    // Response format schema
    if (request.responseFormat?.schema) {
      const schemaText = JSON.stringify(request.responseFormat.schema);
      total += provider.tokenize(schemaText, model);
    }
    
    return total;
  }
  
  /**
   * Get model context limits
   */
  private getModelLimits(provider: string, model: string): any {
    const limits: Record<string, any> = {
      'anthropic:claude-opus-4-1-20250805': { maxContext: 200000, maxOutput: 4096 },
      'anthropic:claude-sonnet-4-20250514': { maxContext: 200000, maxOutput: 8192 },
      'anthropic:claude-3-haiku': { maxContext: 200000, maxOutput: 4096 },
      'anthropic:claude-code': { maxContext: 200000, maxOutput: 8192 },
      'openai:gpt-4-turbo': { maxContext: 128000, maxOutput: 4096 },
      'openai:gpt-4': { maxContext: 8192, maxOutput: 4096 },
      'openai:gpt-3.5-turbo': { maxContext: 16384, maxOutput: 4096 }
    };
    
    const key = `${provider}:${model}`;
    return limits[key] || { maxContext: 8192, maxOutput: 4096 };
  }
  
  /**
   * Estimate tokens for a single message
   */
  private estimateMessageTokens(message: any): number {
    const text = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
    
    // Rough estimate: 4 chars per token
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Hash a message for deduplication
   */
  private hashMessage(message: any): string {
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
    
    return crypto
      .createHash('sha256')
      .update(`${message.role}:${content}`)
      .digest('hex')
      .slice(0, 8);
  }
  
  /**
   * Get compression recommendations
   */
  getCompressionRecommendations(agentId: string): CompressionStrategy[] {
    const window = this.contextWindows.get(agentId);
    if (!window || !window.compressible) {
      return [];
    }
    
    const recommendations: CompressionStrategy[] = [];
    const utilization = window.utilizationPercent / 100;
    
    if (utilization > 0.9) {
      // Aggressive compression needed
      recommendations.push({
        type: 'truncate',
        targetReduction: 0.5,
        preservePriority: 'recent'
      });
      recommendations.push({
        type: 'summarize',
        targetReduction: 0.6,
        preservePriority: 'relevant'
      });
    } else if (utilization > 0.8) {
      // Moderate compression
      recommendations.push({
        type: 'filter',
        targetReduction: 0.3,
        preservePriority: 'relevant'
      });
      recommendations.push({
        type: 'sample',
        targetReduction: 0.25,
        preservePriority: 'recent'
      });
    } else {
      // Light compression
      recommendations.push({
        type: 'filter',
        targetReduction: 0.2,
        preservePriority: 'relevant'
      });
    }
    
    return recommendations;
  }
}