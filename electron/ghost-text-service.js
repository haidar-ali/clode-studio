import { query } from '@anthropic-ai/claude-code';
import path from 'path';
import { promises as fs } from 'fs';

class GhostTextService {
  constructor() {
    this.isAvailable = false;
    this.projectInfo = null;
    this.currentRequest = null;
    this.abortController = null;
    this.partialResults = ''; // Store partial results in case of timeout
    this.systemPrompt = 'You are an intelligent code completion assistant. Provide natural code completions at the cursor position - from simple word completions to full functions. Output ONLY the code to insert, no explanations or markdown formatting.';
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      // Test the Claude Code SDK
      await this.checkHealth();
      
      console.log('[GhostTextService] Service initialized successfully');
    } catch (error) {
      console.error('[GhostTextService] Failed to initialize:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Check if Claude SDK is available
   */
  async checkHealth() {
    try {
      console.log('[GhostTextService] Checking Claude SDK health...');
      
      // Try a minimal query to test the SDK
      const testQuery = query({
        prompt: 'Test',
        systemPrompt: 'Reply with "OK"',
        options: {
          model: 'claude-sonnet-4-20250514',
          maxTurns: 1,
          allowedTools: [],
          maxTokens: 10
        }
      });
      
      // Just check if we can create the query
      if (testQuery) {
        this.isAvailable = true;
        console.log('[GhostTextService] Claude SDK is available');
        return { available: true, status: 'ready' };
      }
      
    } catch (error) {
      console.error('[GhostTextService] Health check failed:', error);
      this.isAvailable = false;
      return { 
        available: false, 
        status: 'error', 
        error: error.message 
      };
    }
  }

  /**
   * Initialize project context
   */
  async initializeProject(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      this.projectInfo = {
        name: packageJson.name || 'Unknown Project',
        description: packageJson.description || '',
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        type: this.detectProjectType(packageJson),
        framework: this.detectFramework(packageJson)
      };
      
      // Update system prompt with project context
      this.updateSystemPrompt();
      
      console.log('[GhostTextService] Project initialized:', this.projectInfo.name);
    } catch (error) {
      console.error('[GhostTextService] Failed to initialize project:', error);
    }
  }

  /**
   * Get ghost text suggestion
   */
  async getGhostTextSuggestion(prefix, suffix) {
    if (!this.isAvailable) {
      console.log('[GhostTextService] Service not available');
      return '';
    }

    // Cancel any pending request
    if (this.currentRequest) {
      this.currentRequest.cancel = true;
    }

    // Create a new request
    const request = { cancel: false };
    this.currentRequest = request;

    console.log('[GhostTextService] Ghost text suggestion requested');
    
    // Build context from prefix/suffix
    const context = {
      prefix: prefix.slice(-2000), // Last 2000 chars
      suffix: suffix.slice(0, 1000), // Next 1000 chars
      language: this.detectLanguageFromContent(prefix + suffix),
    };
    
    // Build a focused prompt for ghost text
    const prompt = `Complete the code at the cursor position (█). You can suggest anything from simple word completions to full functions or expressions.
${this.projectInfo ? `Project: ${this.projectInfo.name} (${this.projectInfo.type})` : ''}
Language: ${context.language}

Code context:
\`\`\`${context.language}
${context.prefix}█${context.suffix}
\`\`\`

Provide a natural, intelligent code completion. This could be:
- Completing a partial word (e.g., "consol" → "e.log")
- Completing a full line or expression
- Suggesting a complete function or code block
- Whatever makes the most sense in context

Output ONLY the code to insert at the cursor, no explanations or markdown.`;

    try {
      // Query Claude with longer timeout for quality suggestions
      const response = await this.queryWithTimeout(
        prompt,
        context,
        5000, // 5 second timeout for ghost text
        new AbortController().signal
      );
      
      // Clean up response
      const cleaned = response
        .replace(/```[a-z]*\n?/g, '')
        .replace(/\n?```/g, '')
        .trim();
      
      // Only return if it's actual code (not explanation)
      if (cleaned && !cleaned.toLowerCase().includes('here') && 
          !cleaned.toLowerCase().includes('would') &&
          !cleaned.toLowerCase().includes('this')) {
        return cleaned;
      }
      
      return '';
      
    } catch (error) {
      if (error.name === 'AbortError' || request.cancel) {
        console.log('[GhostTextService] Request aborted');
      } else {
        console.error('[GhostTextService] Query error:', error);
      }
      return '';
    } finally {
      if (this.currentRequest === request) {
        this.currentRequest = null;
      }
    }
  }

  /**
   * Query Claude with timeout
   */
  async queryWithTimeout(prompt, context, timeout, signal) {
    console.log('[GhostTextService] Starting query with timeout:', timeout);
    
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.log('[GhostTextService] Query timeout reached');
        reject(new Error('Timeout'));
      }, timeout);
    });
    
    const queryPromise = this.executeQuery(prompt, context, signal);
    
    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);
      clearTimeout(timeoutId); // Clear the timeout since query completed
      console.log('[GhostTextService] Query completed successfully');
      return result;
    } catch (error) {
      clearTimeout(timeoutId); // Clear the timeout on error too
      if (error.message === 'Timeout') {
        console.log('[GhostTextService] Query timed out, checking partial results');
        // Return partial results if available
        const partial = this.partialResults || '';
        if (partial) {
          console.log('[GhostTextService] Returning partial results:', partial.substring(0, 50) + '...');
        }
        return partial;
      }
      throw error;
    }
  }

  /**
   * Execute the actual Claude query
   */
  async executeQuery(prompt, context, signal) {
    let result = '';
    this.partialResults = ''; // Store partial results
    
    console.log('[GhostTextService] Starting Claude query...');
    
    try {
      const response = query({
        prompt,
        systemPrompt: this.systemPrompt,
        options: {
          model: 'claude-sonnet-4-20250514',
          maxTurns: 1,
          allowedTools: [],
          temperature: 0.3,
          maxTokens: 500,
          signal
        }
      });
      
      console.log('[GhostTextService] Claude query created, waiting for response...');
      
      for await (const message of response) {
        if (message.type === 'system') {
          console.log('[GhostTextService] Received message:', message.type);
        } else if (message.type === 'assistant' && message.message?.content?.[0]?.text) {
          const text = message.message.content[0].text;
          console.log('[GhostTextService] Got text:', text);
          result += text;
          this.partialResults = result; // Store partial results in case of timeout
        } else if (message.type === 'result') {
          console.log('[GhostTextService] Query complete');
        }
      }
      
      return result;
    } catch (error) {
      console.error('[GhostTextService] Query error:', error);
      throw error;
    }
  }

  /**
   * Detect language from code content
   */
  detectLanguageFromContent(content) {
    // Simple heuristics for language detection
    if (content.includes('import React') || content.includes('jsx')) return 'javascript';
    if (content.includes('interface ') || content.includes(': string') || content.includes(': number')) return 'typescript';
    if (content.includes('def ') || content.includes('import numpy')) return 'python';
    if (content.includes('#include') || content.includes('int main')) return 'cpp';
    if (content.includes('package ') || content.includes('public class')) return 'java';
    if (content.includes('func ') || content.includes('package main')) return 'go';
    if (content.includes('fn ') || content.includes('use std::')) return 'rust';
    
    return 'javascript'; // Default
  }

  /**
   * Detect project type from package.json
   */
  detectProjectType(packageJson) {
    const deps = { 
      ...packageJson.dependencies, 
      ...packageJson.devDependencies 
    };
    
    if (deps['next']) return 'Next.js';
    if (deps['nuxt']) return 'Nuxt';
    if (deps['@angular/core']) return 'Angular';
    if (deps['vue']) return 'Vue';
    if (deps['react']) return 'React';
    if (deps['svelte']) return 'Svelte';
    if (deps['express']) return 'Express';
    if (deps['fastify']) return 'Fastify';
    if (deps['@nestjs/core']) return 'NestJS';
    
    return 'JavaScript/TypeScript';
  }

  /**
   * Detect framework from package.json
   */
  detectFramework(packageJson) {
    const deps = { 
      ...packageJson.dependencies, 
      ...packageJson.devDependencies 
    };
    
    const frameworks = [];
    
    if (deps['typescript']) frameworks.push('TypeScript');
    if (deps['tailwindcss']) frameworks.push('Tailwind CSS');
    if (deps['@mui/material']) frameworks.push('Material-UI');
    if (deps['antd']) frameworks.push('Ant Design');
    if (deps['bootstrap']) frameworks.push('Bootstrap');
    
    return frameworks.join(', ') || 'Vanilla JS';
  }

  /**
   * Cancel current request
   */
  cancelRequest() {
    if (this.currentRequest) {
      this.currentRequest.cancel = true;
      this.currentRequest = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Update system prompt with project context
   */
  updateSystemPrompt() {
    if (!this.projectInfo) return;
    
    const basePrompt = 'You are an intelligent code completion assistant. Provide natural code completions at the cursor position - from simple word completions to full functions. Output ONLY the code to insert, no explanations or markdown formatting.';
    
    const projectContext = `

You are working on a ${this.projectInfo.type} project using ${this.projectInfo.framework}.
Project: ${this.projectInfo.name}${this.projectInfo.description ? `\nDescription: ${this.projectInfo.description}` : ''}

Key dependencies: ${this.projectInfo.dependencies.slice(0, 15).join(', ')}

When suggesting completions:
- Match this project's technology stack and patterns
- Use appropriate imports for ${this.projectInfo.type} (e.g., ${this.projectInfo.type === 'Vue' ? 'Vue 3 Composition API' : this.projectInfo.type})
- Follow the project's established conventions`;

    this.systemPrompt = basePrompt + projectContext;
    console.log('[GhostTextService] System prompt updated with project context');
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    this.cancelRequest();
    console.log('[GhostTextService] Service shut down');
  }
}

// Create singleton instance
const ghostTextService = new GhostTextService();

// Use ES module export
export { ghostTextService };