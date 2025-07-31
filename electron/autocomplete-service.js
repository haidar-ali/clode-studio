// Claude functionality has been moved to ghost-text-service.js
import { v4 as uuidv4 } from 'uuid';
import { lspManager } from './lsp-manager.js';

/**
 * Autocomplete Service using Claude Code SDK
 * Optimized for fast, single-turn completions with streaming support
 */
export class AutocompleteService {
  constructor() {
    // Increase max listeners to prevent memory leak warnings
    process.setMaxListeners(30);
    
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.activeRequests = new Map(); // Track active requests for cancellation
    
    // Project context (populated on initialization)
    this.projectInfo = null;
    this.projectPatterns = [];
    this.commonImports = [];
    this.codebaseEmbeddings = null; // For future semantic search
    
    // System prompt for autocomplete
    this.systemPrompt = `Output ONLY the code completion, nothing else. Do not explain. Do not use markdown.

EXAMPLES:
Input: console.lo█
Output: g

Input: function getUser█
Output: Data(id: string) {
  return fetch(\`/api/users/\${id}\`);
}

Input: expo█
Output: rt

FORBIDDEN: 
- "Looking at", "Based on", "Here", "This"
- Explanations, comments, markdown
- Code blocks with \`\`\`

ONLY output the exact characters to insert at █.`;
  }

  /**
   * Initialize the autocomplete service
   */
  async initialize() {
  
    // Initialize LSP manager if needed
    // No Claude initialization needed anymore - moved to ghost-text-service
  
  }

  /**
   * Initialize project context by analyzing key files
   */
  async initializeProject(projectPath) {
  
    
    try {
      // Initialize LSP manager
    
      const availableServers = await lspManager.getAvailableServers();
    
      
      const fs = await import('fs').then(m => m.promises);
      const path = await import('path').then(m => m.default);
      
      // Read package.json if it exists
      const packageJsonPath = path.join(projectPath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        this.projectInfo = {
          name: packageJson.name || 'unknown',
          type: this.detectProjectType(packageJson),
          framework: this.detectFramework(packageJson),
          dependencies: Object.keys(packageJson.dependencies || {}),
          devDependencies: Object.keys(packageJson.devDependencies || {})
        };
      
      } catch (e) {
      
      }
      
      // Read README for project description
      const readmePath = path.join(projectPath, 'README.md');
      try {
        const readme = await fs.readFile(readmePath, 'utf8');
        const firstParagraph = readme.split('\n\n')[0].replace(/^#.*\n/, '').trim();
        if (this.projectInfo) {
          this.projectInfo.description = firstParagraph;
        }
      } catch (e) {
      
      }
      
      // Analyze code patterns (sample a few files)
      await this.analyzeCodePatterns(projectPath);
      
      // Build enhanced system prompt with project context
      this.updateSystemPrompt();
      
    } catch (error) {
      console.error('[AutocompleteService] Project initialization error:', error);
    }
  }

  /**
   * Detect project type from package.json
   */
  detectProjectType(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (deps['next']) return 'Next.js';
    if (deps['nuxt']) return 'Nuxt';
    if (deps['@angular/core']) return 'Angular';
    if (deps['vue']) return 'Vue';
    if (deps['react']) return 'React';
    if (deps['svelte']) return 'Svelte';
    if (deps['express']) return 'Express';
    if (deps['fastify']) return 'Fastify';
    if (deps['electron']) return 'Electron';
    
    return 'Node.js';
  }

  /**
   * Detect framework from dependencies
   */
  detectFramework(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const frameworks = [];
    
    if (deps['typescript']) frameworks.push('TypeScript');
    if (deps['tailwindcss']) frameworks.push('Tailwind');
    if (deps['@mui/material']) frameworks.push('Material-UI');
    if (deps['bootstrap']) frameworks.push('Bootstrap');
    if (deps['jest'] || deps['vitest']) frameworks.push(deps['jest'] ? 'Jest' : 'Vitest');
    
    return frameworks.join(', ') || 'JavaScript';
  }

  /**
   * Analyze code patterns in the project
   */
  async analyzeCodePatterns(projectPath) {
    // This is a simplified version - in production, you'd want more sophisticated analysis
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path').then(m => m.default);
    
    try {
      // Look for common patterns in src directory
      const srcPath = path.join(projectPath, 'src');
      const files = await this.getJSFiles(srcPath, 5); // Sample 5 files
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        
        // Extract common imports
        const imports = content.match(/^import .* from ['"].*['"];?$/gm) || [];
        this.commonImports.push(...imports.slice(0, 3)); // Keep top 3 from each file
        
        // Look for patterns (error handling, state management, etc.)
        if (content.includes('try {') && content.includes('catch')) {
          this.projectPatterns.push('Uses try-catch for error handling');
        }
        if (content.includes('async') && content.includes('await')) {
          this.projectPatterns.push('Uses async/await patterns');
        }
        if (content.includes('useState') || content.includes('ref(')) {
          this.projectPatterns.push('Uses reactive state management');
        }
      }
      
      // Deduplicate patterns
      this.projectPatterns = [...new Set(this.projectPatterns)];
      this.commonImports = [...new Set(this.commonImports)].slice(0, 10);
      
    
    
      
    } catch (error) {
    
    }
  }

  /**
   * Get JS/TS files from directory (helper)
   */
  async getJSFiles(dir, limit = 10) {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path').then(m => m.default);
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (files.length >= limit) break;
        
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.getJSFiles(fullPath, limit - files.length);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.match(/\.(js|jsx|ts|tsx|vue)$/)) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Directory doesn't exist or no access
    }
    
    return files;
  }

  /**
   * Update system prompt with project context
   */
  updateSystemPrompt() {
    if (!this.projectInfo) return;
    
    this.systemPrompt = `You are a code completion assistant for a ${this.projectInfo.type} project using ${this.projectInfo.framework}.

Project: ${this.projectInfo.name}
${this.projectInfo.description ? `Description: ${this.projectInfo.description}` : ''}

Key dependencies: ${this.projectInfo.dependencies.slice(0, 10).join(', ')}

${this.projectPatterns.length > 0 ? `Coding patterns in this project:\n${this.projectPatterns.join('\n')}` : ''}

${this.commonImports.length > 0 ? `Common imports:\n${this.commonImports.slice(0, 5).join('\n')}` : ''}

Rules:
1. Output ONLY the completion text - no explanations, no markdown, no comments
2. Complete based on the cursor position (marked with █)
3. Match this project's specific patterns and conventions
4. Use the same import style and naming conventions as the project
5. For multi-line completions, maintain proper indentation
6. If no good completion exists, return empty string

Output format: Return only the raw completion text that should be inserted at the cursor position.`;
    
  
  }

  /**
   * Get code completion for the given context
   */
  async getCompletion(request) {
    const { context, timeout = 1000, providers = ['cache', 'lsp', 'claude'] } = request;
    
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[AutocompleteService] Received completion request:', {
        language: context.language,
        position: context.pos,
        filepath: context.filepath,
        providers: providers
      });
    }
    
    // Check cache first if enabled
    if (providers.includes('cache')) {
      const cacheKey = this.getCacheKey(context);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
      
        return {
          id: request.id,
          items: cached,
          duration: 0,
          provider: 'claude-cached'
        };
      }
    }
    
    // Collect completions from all providers
    const allCompletions = [];
    const startTime = Date.now();
    
    // Try LSP first if enabled (it's usually fastest)
    // Allow LSP even for unsaved files if we have a language
    if (providers.includes('lsp') && context.language !== 'text') {
      try {
        // Use a temporary filepath for unsaved files
        // Map language to proper file extension
        const extMap = {
          'typescript': 'ts',
          'javascript': 'js',
          'python': 'py',
          'rust': 'rs',
          'go': 'go',
          'cpp': 'cpp',
          'java': 'java',
          'vue': 'vue',
          'html': 'html',
          'css': 'css',
          'json': 'json'
        };
        const ext = extMap[context.language] || context.language;
        const lspFilepath = context.filepath || `/tmp/untitled.${ext}`;
      
        
        // Check if LSP server is available for this language
        const serverAvailable = await lspManager.checkServerAvailable(context.language);
        if (!serverAvailable) {
          console.log(`[AutocompleteService] No LSP server installed for ${context.language}. Install with:`, 
            lspManager.serverConfigs[context.language]?.install || 'No install info available');
        } else {
          // Detect trigger character and member access
          const lineUpToCursor = context.prefix.split('\n').pop() || '';
          const memberMatch = lineUpToCursor.match(/(\w+)\.(\w*)$/);
          let triggerChar = null;
          let adjustedPosition = { line: context.line, character: context.column };
          
          // If we have member access, we need to position cursor right after the dot
          if (memberMatch) {
            triggerChar = '.';
            // Position should be right after the dot for proper member completions
            // memberMatch[2] is the partial text after the dot
            const objectName = memberMatch[1];
            const partialMember = memberMatch[2];
            
            // Calculate position right after the dot
            const prefixLines = context.prefix.split('\n');
            const currentLine = prefixLines[prefixLines.length - 1];
            const dotIndex = currentLine.lastIndexOf('.');
            
            if (dotIndex >= 0) {
              adjustedPosition = { 
                line: context.line, 
                character: dotIndex + 1 // Position right after the dot
              };
            
            }
          } else if (lineUpToCursor.endsWith('.')) {
            triggerChar = '.';
          }
          
          // Build full file content for LSP context
          // Make sure the content is valid JavaScript/TypeScript
          let fullContent = context.prefix + context.suffix;
          
          // For member access, ensure we have complete context
          if (memberMatch) {
            // If we're doing member access, ensure content has proper structure
            const objectName = memberMatch[1];
          
            
            // Add common JavaScript objects if they're not defined
            if (objectName === 'console' && !fullContent.includes('console')) {
              fullContent = 'const console = globalThis.console;\n' + fullContent;
            }
          }
          
          const cursorPosition = {
            line: context.line,
            character: adjustedPosition ? adjustedPosition.character : context.column
          };
          
        
          
          const lspCompletions = await Promise.race([
            lspManager.getCompletions(
              lspFilepath,
              fullContent,
              cursorPosition,
              triggerChar
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('LSP timeout')), 800) // Fast timeout for instant response
            )
          ]);
          
          if (lspCompletions && lspCompletions.length > 0) {
            console.log('[AutocompleteService] Got', lspCompletions.length, 'LSP completions:', 
              lspCompletions.slice(0, 3).map(c => c.label));
            
            // Filter LSP completions to only relevant ones
            // Get the partial word being typed, including member access
            const lineUpToCursor = context.prefix.split('\n').pop() || '';
            
            // Check for member access (e.g., "console.lo")
            const memberMatch = lineUpToCursor.match(/(\w+)\.(\w*)$/);
            // Match partial word at end of line (may be incomplete)
            const partialWordMatch = lineUpToCursor.match(/(\w*)$/);
            
            let partialWord = '';
            let isMemberAccess = false;
            
            if (memberMatch) {
              // Member access: object.partial
              partialWord = memberMatch[2]; // The part after the dot
              isMemberAccess = true;
            
            } else if (partialWordMatch) {
              // Partial word completion (including empty string)
              partialWord = partialWordMatch[1];
            
            }
            
            // Filter and score LSP completions
            const relevantLspCompletions = lspCompletions
              .filter(c => {
                // For member access, be more permissive
                if (isMemberAccess && !partialWord) {
                  // After a dot with no characters typed yet
                  return true;
                }
                // Keep completions that match what's being typed
                if (partialWord) {
                  const label = c.label.toLowerCase();
                  const partial = partialWord.toLowerCase();
                  
                  // Check if completion starts with partial
                  if (label.startsWith(partial)) {
                    return true;
                  }
                  
                  // Check if partial matches anywhere in the label (less priority)
                  if (label.includes(partial)) {
                    c._partialMatch = true; // Mark for lower scoring
                    return true;
                  }
                  
                  // Fuzzy match: check if all characters appear in order
                  let partialIndex = 0;
                  for (let i = 0; i < label.length && partialIndex < partial.length; i++) {
                    if (label[i] === partial[partialIndex]) {
                      partialIndex++;
                    }
                  }
                  if (partialIndex === partial.length) {
                    c._fuzzyMatch = true; // Mark for even lower scoring
                    return true;
                  }
                  
                  return false;
                }
                return true;
              })
              .map(c => ({
                ...c,
                source: 'lsp',
                // Score based on relevance
                confidence: this.scoreLspCompletion(c, partialWord)
              }))
              .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
              .slice(0, 20); // Keep top 20 LSP completions
            
          
            if (relevantLspCompletions.length > 0) {
              console.log('[AutocompleteService] Top 5 LSP completions:', 
                relevantLspCompletions.slice(0, 5).map(c => `${c.label} (${c.kind}, score: ${c.confidence})`));
            }
            allCompletions.push(...relevantLspCompletions);
          } else {
          
          }
        }
      } catch (error) {
      
        if (error.message.includes('ENOENT')) {
        
        }
      }
    }
    
    // REMOVED: Claude is now handled by ghost text, not dropdown completions
    // Claude completions have been moved to getGhostTextSuggestion() method
    
    // Deduplicate and rank completions
    const finalCompletions = this.mergeAndRankCompletions(allCompletions);
    
    // Cache successful completions
    if (finalCompletions.length > 0 && providers.includes('cache')) {
      const cacheKey = this.getCacheKey(context);
      this.addToCache(cacheKey, finalCompletions);
    }
    
    return {
      id: request.id,
      items: finalCompletions,
      duration: Date.now() - startTime,
      provider: allCompletions.some(c => c.source === 'lsp') ? 'hybrid' : 'claude-streaming'
    };
  }

  
  /**
   * Detect language from code content
   */
  detectLanguageFromContent(content) {
    // Simple heuristics
    if (content.includes('import React') || content.includes('jsx')) return 'javascript';
    if (content.includes('import type') || content.includes(': string')) return 'typescript';
    if (content.includes('def ') || content.includes('import numpy')) return 'python';
    if (content.includes('fn ') || content.includes('let mut')) return 'rust';
    if (content.includes('package main')) return 'go';
    if (content.includes('<template>') || content.includes('defineComponent')) return 'vue';
    return 'javascript'; // default
  }

  /**
   * Stream code completion (for future real-time updates)
   */
  async *streamCompletion(request) {
    const { context } = request;
    const prompt = this.buildPrompt(context);
    
    try {
      const response = query({
        prompt,
        systemPrompt: this.systemPrompt,
        options: {
          model: 'claude-sonnet-4-20250514', // Fast model for completions
          maxTurns: 1,
          allowedTools: [], // No tools needed for completions
          outputFormat: 'stream-json',
          temperature: 0.3, // Lower temperature for more predictable completions
          maxTokens: 150 // Limit completion length
        }
      });
      
      let buffer = '';
      
      for await (const message of response) {
        if (message.type === 'assistant' && message.message?.content?.[0]?.text) {
          const text = message.message.content[0].text;
          buffer += text;
          
          // Yield incremental updates
          yield {
            id: request.id,
            delta: text,
            isComplete: false,
            confidence: 0.8
          };
        } else if (message.type === 'result') {
          // Final result
          yield {
            id: request.id,
            delta: '',
            isComplete: true,
            confidence: 0.8
          };
          break;
        }
      }
    } catch (error) {
      console.error('Stream completion error:', error);
      yield {
        id: request.id,
        delta: '',
        isComplete: true,
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Query Claude with timeout
   */
  async queryWithTimeout(prompt, context, timeout, signal) {
  
    
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
      
        reject(new Error('Timeout'));
      }, timeout);
    });
    
    const queryPromise = this.executeQuery(prompt, context, signal);
    
    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);
      clearTimeout(timeoutId); // Clear the timeout since query completed
    
      return result;
    } catch (error) {
      clearTimeout(timeoutId); // Clear the timeout on error too
      if (error.message === 'Timeout') {
      
        // Return partial results if available
        const partial = this.partialResults || '';
        if (partial) {
        
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
    
  
    
    try {
      const response = query({
        prompt,
        systemPrompt: this.systemPrompt,
        options: {
          model: 'claude-sonnet-4-20250514',
          maxTurns: 1,
          allowedTools: [],
          temperature: 0.3,
          maxTokens: 150,
          // Add file context if available
          cwd: context.filepath ? context.filepath.substring(0, context.filepath.lastIndexOf('/')) : process.cwd()
        }
      });
      
    
      
      for await (const message of response) {
        // Check for cancellation
        if (signal.aborted) {
        
          throw new Error('AbortError');
        }
        
      
        
        if (message.type === 'assistant' && message.message?.content?.[0]?.text) {
          result += message.message.content[0].text;
        
          this.partialResults = result; // Store partial results in case of timeout
        } else if (message.type === 'result') {
        
          break;
        }
      }
    } catch (error) {
      console.error('[AutocompleteService] Query error:', error);
      throw error;
    }
    
    return result.trim();
  }

  /**
   * Score LSP completion based on relevance
   */
  scoreLspCompletion(completion, partialWord) {
    let score = 50; // Base score
    
    // Handle different match types
    if (completion._fuzzyMatch) {
      // Fuzzy match gets lower score
      score = 30;
    } else if (completion._partialMatch) {
      // Partial match (substring) gets medium score
      score = 40;
    } else if (partialWord && completion.label === partialWord) {
      // Exact match gets highest score
      score = 100;
    } else if (partialWord && completion.label.toLowerCase() === partialWord.toLowerCase()) {
      // Case-insensitive exact match
      score = 95;
    } else if (partialWord && completion.label.toLowerCase().startsWith(partialWord.toLowerCase())) {
      // Starts with partial word - prioritize shorter completions
      const lengthDiff = completion.label.length - partialWord.length;
      score = 90 - Math.min(lengthDiff * 2, 40); // Max penalty of 40 for very long completions
    } else if (!partialWord) {
      // No partial word - score by kind
      score = 60;
    }
    
    // Boost certain completion kinds for member access
    const kindBoost = {
      'method': 25,      // Methods are very likely for member access
      'property': 20,    // Properties too
      'function': 15,
      'field': 15,
      'variable': 10,
      'parameter': 5,
      'constant': 5
    };
    
    if (completion.kind && kindBoost[completion.kind]) {
      score += kindBoost[completion.kind];
    }
    
    // Penalize certain kinds
    if (completion.kind === 'keyword' || completion.kind === 'module' || completion.kind === 'class') {
      score -= 30; // Stronger penalty for unlikely completions
    }
    
    // Special boost for common patterns
    if (partialWord && completion.label.length === partialWord.length + 1) {
      // Single character completion (like 'lo' -> 'log')
      score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Build prompt with LSP completions context
   */
  buildPromptWithLSP(context, lspCompletions) {
    const basePrompt = this.buildPrompt(context);
    
    // Don't add LSP suggestions to prompt - it confuses Claude
    // Claude should provide its own completions based on context
    return basePrompt;
  }

  /**
   * Merge and rank completions from multiple sources
   */
  mergeAndRankCompletions(completions) {
    // Remove exact duplicates
    const seen = new Map();
    const unique = [];
    
    for (const completion of completions) {
      const key = completion.text || completion.label;
      if (!seen.has(key)) {
        seen.set(key, completion);
        unique.push(completion);
      } else {
        // If we have duplicates, prefer LSP over Claude
        const existing = seen.get(key);
        if (completion.source === 'lsp' && existing.source !== 'lsp') {
          const index = unique.indexOf(existing);
          unique[index] = completion;
          seen.set(key, completion);
        }
      }
    }
    
    // Sort by confidence (not just source)
    const sorted = unique.sort((a, b) => {
      const confA = a.confidence || 50;
      const confB = b.confidence || 50;
      
      // If confidence is very close (within 10 points), prefer LSP
      if (Math.abs(confA - confB) < 10) {
        if (a.source === 'lsp' && b.source !== 'lsp') return -1;
        if (b.source === 'lsp' && a.source !== 'lsp') return 1;
      }
      
      return confB - confA;
    });
    
    // Mix LSP and Claude completions for diversity
    const lspCompletions = sorted.filter(c => c.source === 'lsp');
    const claudeCompletions = sorted.filter(c => c.source === 'claude-streaming');
    const otherCompletions = sorted.filter(c => c.source !== 'lsp' && c.source !== 'claude-streaming');
    
    const mixed = [];
    const maxEach = 5;
    
    // Interleave LSP and Claude completions
    for (let i = 0; i < Math.max(lspCompletions.length, claudeCompletions.length); i++) {
      if (i < lspCompletions.length && i < maxEach) {
        mixed.push(lspCompletions[i]);
      }
      if (i < claudeCompletions.length && i < maxEach) {
        mixed.push(claudeCompletions[i]);
      }
    }
    
    // Add other completions if space
    mixed.push(...otherCompletions.slice(0, 10 - mixed.length));
    
    return mixed.slice(0, 10); // Limit to 10 suggestions
  }

  /**
   * Build prompt for Claude with enhanced context
   */
  buildPrompt(context) {
    const { language, prefix, suffix, line, column, filepath } = context;
    
    // Get semantic context instead of just lines
    const semanticContext = this.extractSemanticContext(prefix, suffix, language);
    
    // Build a more comprehensive prompt
    let prompt = `You are completing code in a ${language} file.
Project context: ${this.getProjectContext()}
File: ${filepath || 'untitled'}
Position: Line ${line}, Column ${column}

`;

    // Add imports if available
    if (semanticContext.imports) {
      prompt += `File imports:\n${semanticContext.imports}\n\n`;
    }

    // Add type definitions if available
    if (semanticContext.types) {
      prompt += `Relevant types:\n${semanticContext.types}\n\n`;
    }

    // Add the main code context
    prompt += `Code context:\n\`\`\`${language}\n${semanticContext.code}\n\`\`\`\n\n`;
    
    // Add any relevant patterns from the project
    if (this.projectPatterns && this.projectPatterns.length > 0) {
      prompt += `Project patterns:\n${this.projectPatterns.slice(0, 3).join('\n')}\n\n`;
    }
    
    prompt += `Complete at █. Output ONLY the text to insert, no explanations.`;
    
    return prompt;
  }

  /**
   * Extract semantic context (functions, classes, etc.)
   */
  extractSemanticContext(prefix, suffix, language) {
    const fullText = prefix + '█' + suffix;
    const lines = fullText.split('\n');
    const cursorLineIndex = lines.findIndex(l => l.includes('█'));
    
    // Extract imports (usually at the top of the file)
    const imports = lines
      .filter(l => l.match(/^(import|from|require|using|include)/))
      .join('\n');
    
    // Find the containing function/method
    let functionStart = cursorLineIndex;
    let functionEnd = cursorLineIndex;
    let braceCount = 0;
    
    // Search backwards for function start
    for (let i = cursorLineIndex; i >= 0; i--) {
      const line = lines[i];
      braceCount -= (line.match(/\}/g) || []).length;
      braceCount += (line.match(/\{/g) || []).length;
      
      if (line.match(/^(function|class|interface|type|const|let|var|def|public|private|protected|static)/) && braceCount >= 0) {
        functionStart = i;
        break;
      }
    }
    
    // Search forwards for function end
    braceCount = 0;
    for (let i = cursorLineIndex; i < lines.length; i++) {
      const line = lines[i];
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      
      if (braceCount === 0 && i > cursorLineIndex) {
        functionEnd = i;
        break;
      }
    }
    
    // Get extended context (100 lines as configured)
    const contextRadius = 50; // 50 before + 50 after = 100 lines
    const contextStart = Math.max(0, cursorLineIndex - contextRadius);
    const contextEnd = Math.min(lines.length, cursorLineIndex + contextRadius);
    
    // Prefer semantic boundaries if they're within reasonable distance
    const semanticStart = Math.max(contextStart, functionStart - 10);
    const semanticEnd = Math.min(contextEnd, functionEnd + 10);
    
    const code = lines.slice(semanticStart, semanticEnd).join('\n');
    
    // Extract type definitions
    const types = lines
      .filter(l => l.match(/^(interface|type|class|struct|enum)/))
      .slice(0, 5) // Limit to 5 most relevant types
      .join('\n');
    
    return {
      code,
      imports,
      types,
      semanticBounds: {
        start: semanticStart,
        end: semanticEnd,
        functionStart,
        functionEnd
      }
    };
  }

  /**
   * Get project context (to be enhanced)
   */
  getProjectContext() {
    // TODO: This should be populated on project initialization
    if (this.projectInfo) {
      return `${this.projectInfo.name} - ${this.projectInfo.type} project using ${this.projectInfo.framework}`;
    }
    return 'General project';
  }

  /**
   * Parse Claude's response into completion items
   */
  parseCompletion(text, context) {
  
    
    if (!text || text.trim() === '') {
    
      return [];
    }
    
    // Check if Claude returned explanatory text (forbidden)
    const forbiddenPhrases = [
      'looking at', 'based on', 'here', 'this', 'likely', 'trying to',
      'would complete', 'matches the pattern', 'intelligent completion',
      'you\'re', 'context suggests', 'appears to be'
    ];
    
    const lowerText = text.toLowerCase();
    const hasExplanation = forbiddenPhrases.some(phrase => lowerText.includes(phrase));
    
    if (hasExplanation) {
    
      
      // Try to extract code blocks first
      const codeBlockMatch = text.match(/```[a-z]*\n?([^`]+)\n?```/s);
      if (codeBlockMatch) {
        text = codeBlockMatch[1].trim();
      } else {
        // Try to find the actual completion after common phrases
        const completionMatch = text.match(/(?:Output:|completion:|complete to:|insert:)\s*(.+?)(?:\n\n|$)/is);
        if (completionMatch) {
          text = completionMatch[1].trim();
        } else {
          // Last resort: skip everything before a code-like line
          const lines = text.split('\n');
          const codeLineIndex = lines.findIndex(line => 
            line.trim() && 
            !line.toLowerCase().includes('looking') &&
            !line.toLowerCase().includes('based') &&
            !line.toLowerCase().includes('here') &&
            (line.includes('(') || line.includes('{') || line.includes('=') || /^\w+\s+\w+/.test(line.trim()))
          );
          if (codeLineIndex >= 0) {
            text = lines.slice(codeLineIndex).join('\n').trim();
          } else {
            // Nothing useful found
          
            return [];
          }
        }
      }
    }
    
    // Remove any remaining markdown code blocks
    const cleanText = text.replace(/```[a-z]*\n?/g, '').replace(/\n?```/g, '').trim();
    
  
    
    // Skip if still contains explanation
    if (cleanText.toLowerCase().includes('looking at') || 
        cleanText.toLowerCase().includes('based on') ||
        cleanText.toLowerCase().includes('this would')) {
    
      return [];
    }
    
    // Create completion item
    const completion = {
      id: uuidv4(),
      text: cleanText,
      label: this.generateLabel(cleanText),
      detail: `AI completion (${context.language})`,
      source: 'claude-streaming',
      confidence: 80,
      insertText: cleanText
    };
    
    // For multi-line completions, also provide single-line option
    if (cleanText.includes('\n')) {
      const firstLine = cleanText.split('\n')[0];
      if (firstLine.trim()) {
        return [
          completion,
          {
            ...completion,
            id: uuidv4(),
            text: firstLine,
            label: this.generateLabel(firstLine),
            detail: 'AI completion (single line)',
            insertText: firstLine,
            confidence: 70
          }
        ];
      }
    }
    
    return [completion];
  }

  /**
   * Generate a display label for the completion
   */
  generateLabel(text) {
    // Truncate long completions
    const maxLength = 50;
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  }

  /**
   * Cache management
   */
  getCacheKey(context) {
    const { language, prefix, suffix } = context;
    // Use last 100 chars of prefix and first 100 of suffix for key
    const key = `${language}:${prefix.slice(-100)}:${suffix.slice(0, 100)}`;
    return Buffer.from(key).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.items;
  }

  addToCache(key, items) {
    // Limit cache size
    if (this.cache.size > 1000) {
      // Remove oldest entries
      const sortedEntries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      for (let i = 0; i < 100; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
    
    this.cache.set(key, {
      items,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Cancel a request
   */
  cancelRequest(requestId) {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Preload context for a file (for future optimization)
   */
  async preloadFileContext(filepath) {
    // TODO: Implement file analysis for better completions
    // This could analyze imports, types, patterns, etc.
  
  }

  /**
   * Health check to verify service is working
   */
  async checkHealth() {
    try {
    
      
      // Check if LSP manager is available
      if (lspManager) {
      
        return { available: true, status: 'ready' };
      } else {
        return { available: false, status: 'error', error: 'LSP manager not available' };
      }
      
      return { available: false, status: 'sdk-error' };
    } catch (error) {
      console.error('[AutocompleteService] Health check failed:', error);
      return { available: false, status: 'error', error: error.message };
    }
  }
  
  /**
   * Shutdown service and cleanup
   */
  async shutdown() {
  
    
    // Cancel any active requests
    for (const [id, controller] of this.activeRequests) {
      controller.abort();
    }
    this.activeRequests.clear();
    
    // Clear cache
    this.cache.clear();
    
    // Shutdown LSP servers
    await lspManager.shutdown();
    
  
  }
}

// Export singleton instance
export const autocompleteService = new AutocompleteService();