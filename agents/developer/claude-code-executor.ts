/**
 * ClaudeCodeExecutor - The heart of the Developer agent
 * Uses Claude Code SDK directly without API keys
 */

// Use dynamic imports for Node.js modules to avoid browser issues
import type { WorktreeManager } from '../worktrees/manager';
import type { AgentSnapshotService } from '../snapshots/agent-snapshot-service';

// These will be dynamically imported when needed
let query: any = null;
let path: any = null;
let fs: any = null;
let execa: any = null;
let createPatch: any = null;

// Dynamic import for electron modules
let ClaudeDetector: any = null;
async function loadClaudeDetector() {
  if (!ClaudeDetector) {
    try {
      const module = await import('../../electron/claude-detector');
      ClaudeDetector = module.ClaudeDetector;
    } catch (error) {
      console.warn('[ClaudeCodeExecutor] Could not load ClaudeDetector:', error);
    }
  }
  return ClaudeDetector;
}

export interface CodeExecRequest {
  planStepId: string;
  objective: string;
  repoSummary: string;
  targetFiles: string[];
  constraints?: string[];
  tests?: {
    command: string;
    successRegex?: string;
    timeoutMs?: number;
  }[];
  budget?: {
    maxTokens?: number;
    maxCostUSD?: number;
    timeoutMs?: number;
  };
  previousOutputs?: any[];
  kbEntries?: any[];
  maxIterations?: number;
}

export interface CodeExecResult {
  summary: string;
  patch?: string;
  createdFiles?: string[];
  modifiedFiles?: string[];
  deletedFiles?: string[];
  testRun?: {
    passed: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
  };
  routeDecision: {
    provider: string;
    model: string;
    reason: string;
  };
  decisions?: any[];
  worktreeChanges?: any;
}

export class ClaudeCodeExecutor {
  private worktreeManager: WorktreeManager;
  private snapshotService: AgentSnapshotService | null;
  private workspacePath: string;
  private claudePath: string | null = null;
  
  constructor(
    workspacePath: string,
    router: any, // Router not needed for Claude Code SDK
    worktreeManager: WorktreeManager,
    snapshotService: AgentSnapshotService | null,
    mode: 'sdk' | 'cli' | 'auto' = 'auto'
  ) {
    this.workspacePath = workspacePath;
    this.worktreeManager = worktreeManager;
    this.snapshotService = snapshotService;
  }
  
  async initialize(): Promise<void> {
    // Load required modules dynamically
    if (!query) {
      try {
        const claudeModule = await import('@anthropic-ai/claude-code');
        query = claudeModule.query;
      } catch (error) {
        console.error('[ClaudeCodeExecutor] Failed to load Claude Code SDK:', error);
        throw new Error('Claude Code SDK not available');
      }
    }
    
    if (!path) {
      path = await import('path');
      fs = await import('fs-extra');
      const execaModule = await import('execa');
      execa = execaModule.execa;
      const diffModule = await import('diff');
      createPatch = diffModule.createPatch;
    }
    
    // Detect Claude installation
    const Detector = await loadClaudeDetector();
    if (Detector) {
      try {
        const claudeInfo = await Detector.detectClaude(this.workspacePath);
        if (claudeInfo && claudeInfo.path) {
          this.claudePath = claudeInfo.path;
          console.log(`[ClaudeCodeExecutor] Using Claude at: ${this.claudePath}`);
        }
      } catch (error) {
        console.warn('[ClaudeCodeExecutor] Could not detect Claude:', error);
      }
    }
    
    // If no specific path found, use default
    if (!this.claudePath) {
      this.claudePath = 'claude';
      console.log('[ClaudeCodeExecutor] Using Claude from PATH');
    }
  }
  
  async execute(request: CodeExecRequest): Promise<CodeExecResult> {
    const startTime = Date.now();
    
    // Initialize if needed
    if (!this.claudePath) {
      await this.initialize();
    }
    
    try {
      // Create isolated worktree
      const worktree = await this.worktreeManager.createAgentWorktree(
        { id: 'developer', name: 'Developer', type: 'developer' },
        { id: request.planStepId }
      );
      
      console.log('[ClaudeCode] Executing in worktree:', worktree.path);
      
      // Build prompt from request
      const prompt = await this.buildPrompt(request);
      const systemPrompt = await this.getSystemPrompt();
      
      // Use Claude Code SDK query function (no API key needed)
      const response = query({
        prompt,
        systemPrompt,
        options: {
          cwd: worktree.path,
          model: 'claude-sonnet-4-20250514',
          maxTurns: request.maxIterations || 10,
          allowedTools: [
            'Read', 
            'Write', 
            'Edit', 
            'Bash', 
            'Grep', 
            'TodoWrite',
            'MultiEdit'
          ],
          permissionMode: 'auto',
          pathToClaudeCodeExecutable: this.claudePath || undefined,
          maxTokens: request.budget?.maxTokens || 32000
        }
      });
      
      const result: CodeExecResult = {
        summary: '',
        createdFiles: [],
        modifiedFiles: [],
        deletedFiles: [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUSD: 0
        },
        routeDecision: {
          provider: 'anthropic',
          model: 'claude-code',
          reason: 'Claude Code SDK'
        }
      };
      
      const fileChanges = new Set<string>();
      let fullResponse = '';
      let hasError = false;
      let errorMessage = '';
      
      // Process streaming response
      for await (const message of response) {
        if (message.type === 'assistant') {
          const content = message.message.content[0]?.text || '';
          fullResponse += content;
        } else if (message.type === 'tool_use') {
          // Track file changes
          if (message.name === 'Write' || message.name === 'Edit' || message.name === 'MultiEdit') {
            const filePath = message.input?.file_path || message.input?.path;
            if (filePath) {
              fileChanges.add(filePath);
              if (!result.modifiedFiles!.includes(filePath)) {
                result.modifiedFiles!.push(filePath);
              }
            }
          }
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            result.summary = this.extractSummary(fullResponse) || 'Development task completed';
          } else {
            hasError = true;
            errorMessage = message.error || 'Execution failed';
          }
          break;
        }
      }
      
      if (hasError) {
        throw new Error(errorMessage);
      }
      
      // Capture worktree changes
      const changes = await this.worktreeManager.captureChanges(worktree);
      result.worktreeChanges = changes;
      
      // Generate patch from changes
      if (changes.modified.length > 0 || changes.added.length > 0) {
        result.patch = await this.toUnifiedPatch(changes, worktree.path);
      }
      
      // Update file lists
      result.createdFiles = changes.added;
      result.modifiedFiles = changes.modified;
      result.deletedFiles = changes.deleted;
      
      // Run tests if specified
      if (request.tests && request.tests.length > 0) {
        result.testRun = await this.runTests(request.tests, worktree.path);
      }
      
      // Calculate execution time
      const executionTimeMs = Date.now() - startTime;
      
      // Estimate token usage (Claude Code SDK doesn't provide exact counts)
      result.usage.inputTokens = this.estimateTokens(prompt);
      result.usage.outputTokens = this.estimateTokens(fullResponse);
      result.usage.totalTokens = result.usage.inputTokens + result.usage.outputTokens;
      result.usage.costUSD = 0; // No cost with Claude Code
      
      return result;
      
    } catch (error: any) {
      console.error('[ClaudeCode] Execution failed:', error);
      
      return {
        summary: `Error: ${error.message}`,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUSD: 0
        },
        routeDecision: {
          provider: 'anthropic',
          model: 'claude-code',
          reason: 'error'
        }
      };
    } finally {
      // Clean up worktree
      try {
        await this.worktreeManager.cleanupWorktree('developer');
      } catch (error) {
        console.warn('[ClaudeCode] Failed to cleanup worktree:', error);
      }
    }
  }
  
  private async buildPrompt(request: CodeExecRequest): Promise<string> {
    const sections = [
      '# Development Task',
      '',
      `## Objective`,
      request.objective,
      '',
      '## Repository Context',
      request.repoSummary,
      ''
    ];
    
    if (request.targetFiles.length > 0) {
      sections.push(
        '## Target Files',
        ...request.targetFiles.map(f => `- ${f}`),
        ''
      );
    }
    
    if (request.constraints && request.constraints.length > 0) {
      sections.push(
        '## Constraints',
        ...request.constraints.map(c => `- ${c}`),
        ''
      );
    }
    
    if (request.previousOutputs && request.previousOutputs.length > 0) {
      sections.push(
        '## Previous Agent Outputs',
        ...request.previousOutputs.map(o => `### ${o.agent}\n${o.summary}`),
        ''
      );
    }
    
    if (request.kbEntries && request.kbEntries.length > 0) {
      sections.push(
        '## Relevant Knowledge',
        ...request.kbEntries.map(k => `### ${k.title}\n${k.content}`),
        ''
      );
    }
    
    sections.push(
      '## Instructions',
      '1. Analyze the objective and context',
      '2. Use the provided tools to explore and modify code',
      '3. Create minimal, focused changes',
      '4. Preserve existing code style and conventions',
      '5. Ensure all changes compile and pass tests',
      '6. Use TodoWrite to track your progress',
      ''
    );
    
    return sections.join('\n');
  }
  
  private async getSystemPrompt(): Promise<string> {
    const promptPath = path.join(__dirname, 'prompts', 'developer.system.md');
    if (await fs.pathExists(promptPath)) {
      return fs.readFile(promptPath, 'utf-8');
    }
    
    return `You are a skilled software developer working on a codebase using Claude Code.

Your role is to implement features, fix bugs, and improve code quality.

Guidelines:
- Write clean, maintainable code
- Follow existing patterns and conventions  
- Make minimal, focused changes
- Use the provided tools effectively:
  - Read: Read file contents
  - Write: Create or overwrite files
  - Edit: Modify existing files
  - MultiEdit: Make multiple edits to a file
  - Bash: Run shell commands
  - Grep: Search for patterns
  - TodoWrite: Track your progress
- Test your changes when possible
- Provide clear summaries of your work

Always:
- Read files before editing them
- Use Edit/MultiEdit for existing files instead of Write
- Run tests to verify changes
- Follow specified constraints
- Focus on the objective`;
  }
  
  private async runTests(
    tests: CodeExecRequest['tests'],
    workingDir: string
  ): Promise<CodeExecResult['testRun']> {
    if (!tests || tests.length === 0) {
      return { passed: true, stdout: '', stderr: '', exitCode: 0 };
    }
    
    for (const test of tests) {
      try {
        const { stdout, stderr, exitCode } = await execa.command(test.command, {
          timeout: test.timeoutMs || 30000,
          cwd: workingDir,
          reject: false
        });
        
        const passed = exitCode === 0 && 
          (!test.successRegex || new RegExp(test.successRegex).test(stdout));
        
        if (!passed) {
          return { passed: false, stdout, stderr, exitCode };
        }
      } catch (error: any) {
        return {
          passed: false,
          stdout: error.stdout || '',
          stderr: error.stderr || error.message,
          exitCode: error.exitCode || 1
        };
      }
    }
    
    return { passed: true, stdout: 'All tests passed', stderr: '', exitCode: 0 };
  }
  
  private async toUnifiedPatch(changes: any, worktreePath: string): Promise<string> {
    const patches: string[] = [];
    
    for (const file of changes.modified || []) {
      const originalPath = path.join(this.workspacePath, file);
      const modifiedPath = path.join(worktreePath, file);
      
      if (await fs.pathExists(originalPath) && await fs.pathExists(modifiedPath)) {
        const original = await fs.readFile(originalPath, 'utf-8');
        const modified = await fs.readFile(modifiedPath, 'utf-8');
        
        const patch = createPatch(file, original, modified, 'original', 'modified');
        patches.push(patch);
      }
    }
    
    for (const file of changes.added || []) {
      const filePath = path.join(worktreePath, file);
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const patch = createPatch(file, '', content, 'original', 'modified');
        patches.push(patch);
      }
    }
    
    return patches.join('\n');
  }
  
  private extractSummary(text: string): string {
    // Extract a summary from the response
    const lines = text.split('\n');
    
    // Look for summary patterns
    for (const line of lines) {
      if (line.toLowerCase().includes('summary:') || 
          line.toLowerCase().includes('completed:') ||
          line.toLowerCase().includes('finished:')) {
        return line.replace(/^.*?:\s*/, '').trim();
      }
    }
    
    // Return first non-empty line as summary
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
        return trimmed;
      }
    }
    
    return 'Development task completed';
  }
  
  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}