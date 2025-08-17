/**
 * Provider Registry - Manages LLM provider instances
 */

import { LLMProvider, ProviderConfig, PricingEntry } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import * as yaml from 'js-yaml';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ProvidersConfig {
  providers: Record<string, {
    apiKeyEnv: string;
    baseUrl: string;
    models: Record<string, {
      tier: string;
      capabilities: string[];
      pricing: PricingEntry;
    }>;
  }>;
}

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private configs = new Map<string, ProviderConfig>();
  
  async initialize(configPath?: string): Promise<void> {
    // Load configuration
    const config = await this.loadConfig(configPath);
    
    // Initialize providers
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      try {
        const provider = await this.createProvider(name, providerConfig);
        if (provider) {
          this.providers.set(name, provider);
          console.log(`[Registry] Initialized provider: ${name}`);
        }
      } catch (error) {
        console.error(`[Registry] Failed to initialize provider ${name}:`, error);
      }
    }
    
    if (this.providers.size === 0) {
      throw new Error('No providers could be initialized');
    }
  }
  
  private async loadConfig(configPath?: string): Promise<ProvidersConfig> {
    const defaultPath = path.join(
      process.cwd(),
      '.claude',
      'agents',
      'config',
      'providers.yaml'
    );
    
    const filePath = configPath || defaultPath;
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Provider config not found: ${filePath}`);
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    return yaml.load(content) as ProvidersConfig;
  }
  
  private async createProvider(
    name: string,
    config: any
  ): Promise<LLMProvider | null> {
    // Get API key from environment
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      console.warn(`[Registry] No API key found for ${name} (${config.apiKeyEnv})`);
      return null;
    }
    
    const providerConfig: ProviderConfig = {
      model: '', // Will be set per request
      apiKey,
      baseUrl: config.baseUrl,
      timeout: 60000,
      maxRetries: 3
    };
    
    // Store config for later use
    this.configs.set(name, providerConfig);
    
    // Create provider instance
    switch (name) {
      case 'anthropic':
        return new AnthropicProvider(providerConfig);
      case 'openai':
        return new OpenAIProvider(providerConfig);
      default:
        console.warn(`[Registry] Unknown provider type: ${name}`);
        return null;
    }
  }
  
  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }
  
  getConfig(name: string): ProviderConfig | undefined {
    return this.configs.get(name);
  }
  
  getAllProviders(): Map<string, LLMProvider> {
    return this.providers;
  }
  
  async validateProvider(name: string): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) {
      return false;
    }
    
    try {
      // Simple health check
      const response = await provider.invoke(
        {
          messages: [{ role: 'user', content: 'Say "ok"' }],
          maxTokens: 10
        },
        this.configs.get(name)!
      );
      
      return response.text?.toLowerCase().includes('ok') || false;
    } catch (error) {
      console.error(`[Registry] Provider ${name} validation failed:`, error);
      return false;
    }
  }
  
  async validateAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const name of this.providers.keys()) {
      results.set(name, await this.validateProvider(name));
    }
    
    return results;
  }
  
  getProviderCapabilities(name: string): any {
    const provider = this.providers.get(name);
    return provider?.supports || {};
  }
  
  getProviderLimits(name: string): any {
    const provider = this.providers.get(name);
    return provider?.limits || {};
  }
}

// Singleton instance
let registryInstance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}