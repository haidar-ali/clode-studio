/**
 * Anthropic Provider - Claude API integration
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

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  supports = {
    tools: true,
    structuredJson: true,
    streaming: true,
    computerUse: true,
    imageInput: true,
    codeInterpreter: false
  };
  limits = {
    maxTokens: 200000,
    maxToolCalls: 20,
    maxImageSize: 5 * 1024 * 1024
  };
  
  private client: any; // Will be replaced with actual Anthropic SDK
  private tokenCache = new Map<string, number>();
  
  constructor(private config: ProviderConfig) {
    // Initialize Anthropic client
    this.initializeClient();
  }
  
  private initializeClient(): void {
    // In production, this would initialize the actual Anthropic SDK
    // For now, we'll use a placeholder
    try {
      // Dynamic import to avoid dependency issues
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic.Anthropic({
        apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
        baseURL: this.config.baseUrl
      });
    } catch (error) {
      console.warn('[AnthropicProvider] SDK not available, using mock mode');
      this.client = null;
    }
  }
  
  tokenize(text: string, model?: string): number {
    // Cache key for tokenization
    const cacheKey = `${model || 'default'}:${text.slice(0, 100)}`;
    
    if (this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey)!;
    }
    
    // Anthropic's rough estimation: ~4 characters per token
    // More accurate tokenization would use tiktoken or Claude's tokenizer
    const estimate = Math.ceil(text.length / 4);
    
    // Cache the result
    if (this.tokenCache.size > 1000) {
      // Clear cache if it gets too large
      this.tokenCache.clear();
    }
    this.tokenCache.set(cacheKey, estimate);
    
    return estimate;
  }
  
  async invoke(req: LLMRequest, cfg: ProviderConfig): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      if (!this.client) {
        // Mock response for development
        return this.mockInvoke(req, cfg, startTime);
      }
      
      // Transform to Anthropic format
      const anthropicReq = this.transformRequest(req, cfg);
      
      // Call API with retries
      const response = await this.callWithRetries(anthropicReq, cfg);
      
      // Transform response
      return this.transformResponse(response, cfg.model, startTime);
      
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
  
  validateTools(tools: NormalizedToolSpec[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    tools.forEach(tool => {
      // Name validation
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) {
        errors.push(`Tool '${tool.name}': invalid name format (must be alphanumeric with _ or -, max 64 chars)`);
      }
      
      // Schema validation
      const schema = tool.parameters;
      if (schema.type !== 'object') {
        errors.push(`Tool '${tool.name}': parameters must be object type`);
      }
      
      // Check required fields are defined
      if (schema.required) {
        for (const field of schema.required) {
          if (!schema.properties?.[field]) {
            errors.push(`Tool '${tool.name}': required field '${field}' not in properties`);
          }
        }
      }
      
      // Warn about complex schemas
      const depth = this.getSchemaDepth(schema);
      if (depth > 3) {
        warnings.push(`Tool '${tool.name}': deeply nested schema (depth ${depth}) may cause issues`);
      }
      
      // Check for unsupported types
      const unsupportedTypes = this.findUnsupportedTypes(schema);
      if (unsupportedTypes.length > 0) {
        warnings.push(`Tool '${tool.name}': contains potentially unsupported types: ${unsupportedTypes.join(', ')}`);
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
    
    const anthropicReq = this.transformRequest(req, cfg);
    
    // Stream implementation would go here
    // This would use the Anthropic SDK's streaming capabilities
    throw new Error('Streaming not yet implemented');
  }
  
  private transformRequest(req: LLMRequest, cfg: ProviderConfig): any {
    // Extract system messages
    const systemMessages = req.messages.filter(m => m.role === 'system');
    const otherMessages = req.messages.filter(m => m.role !== 'system');
    
    return {
      model: cfg.model,
      system: systemMessages.map(m => m.content).join('\n\n'), // Native system field
      messages: otherMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      })),
      max_tokens: req.maxTokens || 4096,
      temperature: req.temperature ?? 0.7,
      tools: req.tools ? this.transformTools(req.tools) : undefined,
      tool_choice: req.tools ? 'auto' : undefined,
      stop_sequences: req.stop
    };
  }
  
  private transformTools(tools: NormalizedToolSpec[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }
  
  private transformResponse(response: any, model: string, startTime: number): LLMResponse {
    const toolCalls = response.content?.filter((c: any) => c.type === 'tool_use')
      ?.map((c: any) => ({
        name: c.name,
        arguments: c.input
      })) || [];
    
    const textContent = response.content?.filter((c: any) => c.type === 'text')
      ?.map((c: any) => c.text)
      ?.join('\n') || '';
    
    return {
      text: textContent || response.content?.[0]?.text,
      toolCalls,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      },
      model: response.model || model,
      provider: 'anthropic',
      id: response.id || `anthropic-${Date.now()}`,
      latencyMs: Date.now() - startTime,
      cached: response.usage?.cache_creation_input_tokens > 0
    };
  }
  
  private async callWithRetries(request: any, cfg: ProviderConfig): Promise<any> {
    const maxRetries = cfg.maxRetries || 3;
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (this.client?.messages?.create) {
          return await this.client.messages.create(request);
        } else {
          throw new Error('Anthropic client not properly initialized');
        }
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on non-retryable errors
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  private isRetryableError(error: any): boolean {
    const status = error?.status || error?.statusCode;
    return status === 429 || status >= 500;
  }
  
  private normalizeError(error: any): Error {
    if (error?.error?.message) {
      return new Error(`Anthropic API error: ${error.error.message}`);
    }
    if (error?.message) {
      return error;
    }
    return new Error('Unknown Anthropic API error');
  }
  
  private getSchemaDepth(schema: any, depth: number = 0): number {
    if (depth > 10) return depth; // Prevent infinite recursion
    
    let maxDepth = depth;
    
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        maxDepth = Math.max(maxDepth, this.getSchemaDepth(prop as any, depth + 1));
      }
    }
    
    if (schema.items) {
      maxDepth = Math.max(maxDepth, this.getSchemaDepth(schema.items, depth + 1));
    }
    
    return maxDepth;
  }
  
  private findUnsupportedTypes(schema: any): string[] {
    const unsupported: string[] = [];
    
    const checkType = (s: any) => {
      if (s.type === 'null') unsupported.push('null');
      if (s.format === 'binary') unsupported.push('binary');
      if (s.format === 'byte') unsupported.push('byte');
      
      if (s.properties) {
        Object.values(s.properties).forEach(p => checkType(p));
      }
      if (s.items) {
        checkType(s.items);
      }
    };
    
    checkType(schema);
    return [...new Set(unsupported)];
  }
  
  private async mockInvoke(
    req: LLMRequest, 
    cfg: ProviderConfig, 
    startTime: number
  ): Promise<LLMResponse> {
    // Mock response for development/testing
    console.log('[AnthropicProvider] Using mock response (SDK not available)');
    
    const inputTokens = this.tokenize(JSON.stringify(req.messages));
    const outputTokens = 100;
    
    return {
      text: `Mock response from Anthropic provider for model ${cfg.model}`,
      toolCalls: req.tools ? [{
        name: req.tools[0]?.name || 'mock_tool',
        arguments: { mock: true }
      }] : undefined,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      model: cfg.model,
      provider: 'anthropic',
      id: `mock-${Date.now()}`,
      latencyMs: Date.now() - startTime,
      cached: false
    };
  }
}