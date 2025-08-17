/**
 * OpenAI Provider - GPT API integration
 */

import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
  NormalizedToolSpec,
  ValidationResult,
  StreamingOptions
} from './types';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  supports = {
    tools: true,
    structuredJson: true,
    streaming: true,
    computerUse: false,
    imageInput: true,
    codeInterpreter: true
  };
  limits = {
    maxTokens: 128000,
    maxToolCalls: 128,
    maxImageSize: 20 * 1024 * 1024
  };

  private client: any; // Will be replaced with actual OpenAI SDK
  private tokenCache = new Map<string, number>();

  constructor(private config: ProviderConfig) {
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      // Dynamic import to avoid dependency issues
      const OpenAI = require('openai');
      this.client = new OpenAI.OpenAI({
        apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: this.config.baseUrl
      });
    } catch (error) {
      console.warn('[OpenAIProvider] SDK not available, using mock mode');
      this.client = null;
    }
  }

  tokenize(text: string, model?: string): number {
    const cacheKey = `${model || 'gpt-4'}:${text.slice(0, 100)}`;
    
    if (this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey)!;
    }

    // For accurate tokenization, we would use tiktoken
    // For now, use a rough estimate
    let tokensPerChar = 4;
    
    // Different models have different tokenization
    if (model?.includes('gpt-3.5')) {
      tokensPerChar = 4.5;
    } else if (model?.includes('gpt-4')) {
      tokensPerChar = 3.5;
    }
    
    const estimate = Math.ceil(text.length / tokensPerChar);
    
    // Cache management
    if (this.tokenCache.size > 1000) {
      this.tokenCache.clear();
    }
    this.tokenCache.set(cacheKey, estimate);
    
    return estimate;
  }

  async invoke(req: LLMRequest, cfg: ProviderConfig): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      if (!this.client) {
        return this.mockInvoke(req, cfg, startTime);
      }

      const openaiReq = this.transformRequest(req, cfg);
      const response = await this.callWithRetries(openaiReq, cfg);
      return this.transformResponse(response, cfg.model, startTime);
      
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  validateTools(tools: NormalizedToolSpec[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    tools.forEach(tool => {
      // OpenAI specific validations
      if (tool.name.length > 64) {
        errors.push(`Tool '${tool.name}' name exceeds 64 character limit`);
      }
      
      if (!tool.parameters.type || tool.parameters.type !== 'object') {
        errors.push(`Tool '${tool.name}' parameters must be of type 'object'`);
      }
      
      // Check for required array
      if (tool.parameters.required && !Array.isArray(tool.parameters.required)) {
        errors.push(`Tool '${tool.name}' required field must be an array`);
      }
      
      // Validate property definitions
      if (tool.parameters.properties) {
        for (const [propName, propDef] of Object.entries(tool.parameters.properties)) {
          if (typeof propDef !== 'object' || !propDef) {
            errors.push(`Tool '${tool.name}' property '${propName}' must be an object`);
          }
        }
      }
      
      // Warn about deeply nested schemas
      const depth = this.getSchemaDepth(tool.parameters);
      if (depth > 4) {
        warnings.push(`Tool '${tool.name}' has deeply nested schema (depth ${depth})`);
      }
    });
    
    return { valid: errors.length === 0, errors, warnings };
  }

  async stream?(
    req: LLMRequest,
    cfg: ProviderConfig,
    opts: StreamingOptions
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Streaming not available in mock mode');
    }
    
    const openaiReq = this.transformRequest(req, cfg);
    
    // OpenAI streaming implementation would go here
    throw new Error('Streaming not yet implemented');
  }

  private transformRequest(req: LLMRequest, cfg: ProviderConfig): any {
    const messages = req.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));

    const request: any = {
      model: cfg.model,
      messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.7,
      stop: req.stop
    };

    // Add tools if present
    if (req.tools && req.tools.length > 0) {
      request.tools = this.transformTools(req.tools);
      request.tool_choice = 'auto';
    }

    // Add response format if specified
    if (req.responseFormat?.type === 'json') {
      request.response_format = { type: 'json_object' };
    }

    return request;
  }

  private transformTools(tools: NormalizedToolSpec[]): any[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  private transformResponse(response: any, model: string, startTime: number): LLMResponse {
    const choice = response.choices?.[0];
    const message = choice?.message;
    
    const toolCalls = message?.tool_calls?.map((tc: any) => ({
      name: tc.function.name,
      arguments: this.parseToolArguments(tc.function.arguments)
    })) || [];

    return {
      text: message?.content || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      model: response.model || model,
      provider: 'openai',
      id: response.id || `openai-${Date.now()}`,
      latencyMs: Date.now() - startTime,
      cached: false // OpenAI doesn't provide caching info in the same way
    };
  }

  private parseToolArguments(args: string | any): any {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch (error) {
        console.error('[OpenAIProvider] Failed to parse tool arguments:', error);
        return { error: 'Failed to parse arguments' };
      }
    }
    return args;
  }

  private async callWithRetries(request: any, cfg: ProviderConfig): Promise<any> {
    const maxRetries = cfg.maxRetries || 3;
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (this.client?.chat?.completions?.create) {
          return await this.client.chat.completions.create(request);
        } else {
          throw new Error('OpenAI client not properly initialized');
        }
      } catch (error: any) {
        lastError = error;
        
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Handle rate limit with backoff
        const retryAfter = error?.headers?.['retry-after'];
        const delay = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : Math.min(1000 * Math.pow(2, attempt), 10000);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    const status = error?.status || error?.response?.status;
    
    // Rate limits and server errors are retryable
    if (status === 429 || status >= 500) {
      return true;
    }
    
    // Network errors are retryable
    if (error?.code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) {
      return true;
    }
    
    return false;
  }

  private normalizeError(error: any): Error {
    if (error?.error?.message) {
      return new Error(`OpenAI API error: ${error.error.message}`);
    }
    if (error?.message) {
      return error;
    }
    return new Error('Unknown OpenAI API error');
  }

  private getSchemaDepth(schema: any, depth: number = 0): number {
    if (depth > 10) return depth;
    
    let maxDepth = depth;
    
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        maxDepth = Math.max(maxDepth, this.getSchemaDepth(prop as any, depth + 1));
      }
    }
    
    if (schema.items) {
      maxDepth = Math.max(maxDepth, this.getSchemaDepth(schema.items, depth + 1));
    }
    
    if (schema.oneOf || schema.anyOf || schema.allOf) {
      const schemas = schema.oneOf || schema.anyOf || schema.allOf;
      for (const s of schemas) {
        maxDepth = Math.max(maxDepth, this.getSchemaDepth(s, depth + 1));
      }
    }
    
    return maxDepth;
  }

  private async mockInvoke(
    req: LLMRequest,
    cfg: ProviderConfig,
    startTime: number
  ): Promise<LLMResponse> {
    console.log('[OpenAIProvider] Using mock response (SDK not available)');
    
    const inputTokens = this.tokenize(JSON.stringify(req.messages), cfg.model);
    const outputTokens = 150;
    
    let mockText = `Mock response from OpenAI provider for model ${cfg.model}`;
    
    // Simulate tool calls if tools are provided
    const mockToolCalls = req.tools ? [{
      name: req.tools[0]?.name || 'mock_tool',
      arguments: { 
        result: 'This is a mock tool response',
        timestamp: new Date().toISOString()
      }
    }] : undefined;
    
    return {
      text: mockText,
      toolCalls: mockToolCalls,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      model: cfg.model,
      provider: 'openai',
      id: `mock-${Date.now()}`,
      latencyMs: Date.now() - startTime,
      cached: false
    };
  }
}