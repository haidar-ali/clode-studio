/**
 * Knowledge Validation Workflow
 * 
 * Extracts, validates, and persists learned patterns from agent executions:
 * - Pattern recognition and extraction
 * - Solution validation and testing
 * - Knowledge base updates
 * - Continuous learning and improvement
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { LLMRouter } from '../orchestrator/router';
import { SnapshotService } from '../snapshots/snapshot-service';

export interface Pattern {
  id: string;
  name: string;
  description: string;
  category: 'architecture' | 'implementation' | 'debugging' | 'optimization' | 'testing';
  tags: string[];
  problem: string;
  solution: string;
  context: {
    language?: string;
    framework?: string;
    tools?: string[];
    prerequisites?: string[];
  };
  examples: PatternExample[];
  metrics: PatternMetrics;
  validation: PatternValidation;
  metadata: {
    createdAt: string;
    updatedAt: string;
    sourceAgents: string[];
    sourceTasks: string[];
    confidence: number;
    usageCount: number;
  };
}

export interface PatternExample {
  title: string;
  code?: string;
  description: string;
  input?: any;
  output?: any;
  explanation?: string;
}

export interface PatternMetrics {
  successRate: number;
  avgExecutionTime: number;
  avgTokensUsed: number;
  avgCost: number;
  errorRate: number;
  adoptionRate: number;
}

export interface PatternValidation {
  status: 'pending' | 'validated' | 'rejected' | 'deprecated';
  validatedAt?: string;
  validatedBy?: string;
  testResults?: TestResult[];
  rejectionReason?: string;
  replacedBy?: string;
}

export interface TestResult {
  testId: string;
  passed: boolean;
  executionTime: number;
  error?: string;
  output?: any;
}

export interface LearningEvent {
  id: string;
  timestamp: string;
  type: 'success' | 'failure' | 'optimization' | 'discovery';
  agentId: string;
  taskId: string;
  description: string;
  pattern?: Pattern;
  impact: 'low' | 'medium' | 'high';
  automated: boolean;
}

export interface KnowledgeQuery {
  category?: string;
  tags?: string[];
  problem?: string;
  context?: any;
  minConfidence?: number;
  status?: string;
  limit?: number;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  validator: (pattern: Pattern) => Promise<boolean>;
  severity: 'error' | 'warning' | 'info';
}

export class KnowledgeValidationWorkflow {
  private patterns: Map<string, Pattern> = new Map();
  private learningEvents: LearningEvent[] = [];
  private validationRules: Map<string, ValidationRule> = new Map();
  private knowledgeDir: string;
  private indexPath: string;
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly MIN_EXAMPLES = 2;
  private readonly VALIDATION_BATCH_SIZE = 5;
  
  constructor(
    private workspacePath: string,
    private router: LLMRouter,
    private snapshotService: SnapshotService
  ) {
    this.knowledgeDir = path.join(workspacePath, '.claude', 'knowledge');
    this.indexPath = path.join(this.knowledgeDir, 'patterns-index.json');
    this.initializeValidationRules();
  }
  
  /**
   * Initialize the knowledge validation workflow
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.knowledgeDir);
    await this.loadPatterns();
    await this.loadLearningEvents();
    
    console.log('[KnowledgeValidation] Initialized with', this.patterns.size, 'patterns');
  }
  
  /**
   * Extract patterns from successful agent execution
   */
  async extractPatterns(
    agentId: string,
    taskId: string,
    snapshotId: string
  ): Promise<Pattern[]> {
    const snapshot = await this.snapshotService.getSnapshot(snapshotId);
    if (!snapshot) {
      return [];
    }
    
    // Analyze the execution for patterns
    const analysisRequest = {
      messages: [
        {
          role: 'system',
          content: `You are a pattern extraction specialist. Analyze the following agent execution and identify reusable patterns, best practices, and solutions that can be applied to similar problems.`
        },
        {
          role: 'user',
          content: `Extract patterns from this execution:
            Agent: ${agentId}
            Task: ${taskId}
            Request: ${JSON.stringify(snapshot.context.request, null, 2)}
            Response: ${JSON.stringify(snapshot.context.response, null, 2)}
            
            Identify:
            1. The problem being solved
            2. The solution approach
            3. Reusable patterns
            4. Best practices demonstrated
            5. Potential optimizations`
        }
      ],
      maxTokens: 2000
    };
    
    const routeContext = {
      agentId: 'kb-builder',
      pipelineId: `knowledge-extraction-${taskId}`,
      intent: 'pattern-extraction'
    };
    
    const response = await this.router.route(analysisRequest, routeContext);
    
    if (!response.text) {
      return [];
    }
    
    // Parse extracted patterns
    const patterns = this.parseExtractedPatterns(response.text, agentId, taskId);
    
    // Validate and store patterns
    const validPatterns: Pattern[] = [];
    for (const pattern of patterns) {
      if (await this.validatePattern(pattern)) {
        await this.storePattern(pattern);
        validPatterns.push(pattern);
        
        // Record learning event
        await this.recordLearningEvent({
          type: 'discovery',
          agentId,
          taskId,
          description: `Discovered pattern: ${pattern.name}`,
          pattern,
          impact: this.assessImpact(pattern),
          automated: true
        });
      }
    }
    
    return validPatterns;
  }
  
  /**
   * Learn from agent failure
   */
  async learnFromFailure(
    agentId: string,
    taskId: string,
    error: Error,
    context: any
  ): Promise<void> {
    const analysisRequest = {
      messages: [
        {
          role: 'system',
          content: `You are a failure analysis specialist. Analyze the following agent failure and identify lessons learned, anti-patterns to avoid, and potential solutions.`
        },
        {
          role: 'user',
          content: `Analyze this failure:
            Agent: ${agentId}
            Task: ${taskId}
            Error: ${error.message}
            Stack: ${error.stack}
            Context: ${JSON.stringify(context, null, 2)}
            
            Identify:
            1. Root cause of the failure
            2. Anti-patterns to avoid
            3. Potential solutions
            4. Preventive measures
            5. Similar failure patterns`
        }
      ],
      maxTokens: 1500
    };
    
    const routeContext = {
      agentId: 'kb-builder',
      pipelineId: `failure-analysis-${taskId}`,
      intent: 'failure-learning'
    };
    
    const response = await this.router.route(analysisRequest, routeContext);
    
    if (response.text) {
      // Extract anti-patterns and solutions
      const lessons = this.parseFailureAnalysis(response.text);
      
      // Update existing patterns with failure information
      for (const pattern of this.patterns.values()) {
        if (this.isRelatedPattern(pattern, lessons)) {
          pattern.metrics.errorRate = (pattern.metrics.errorRate || 0) + 0.1;
          pattern.metadata.confidence *= 0.95; // Reduce confidence slightly
          await this.updatePattern(pattern);
        }
      }
      
      // Record learning event
      await this.recordLearningEvent({
        type: 'failure',
        agentId,
        taskId,
        description: `Learned from failure: ${lessons.summary}`,
        impact: 'medium',
        automated: true
      });
    }
  }
  
  /**
   * Query knowledge base for relevant patterns
   */
  async queryPatterns(query: KnowledgeQuery): Promise<Pattern[]> {
    let results = Array.from(this.patterns.values());
    
    // Filter by category
    if (query.category) {
      results = results.filter(p => p.category === query.category);
    }
    
    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(p => 
        query.tags!.some(tag => p.tags.includes(tag))
      );
    }
    
    // Filter by confidence
    if (query.minConfidence) {
      results = results.filter(p => 
        p.metadata.confidence >= query.minConfidence
      );
    }
    
    // Filter by status
    if (query.status) {
      results = results.filter(p => 
        p.validation.status === query.status
      );
    }
    
    // Search by problem similarity
    if (query.problem) {
      results = await this.rankByRelevance(results, query.problem);
    }
    
    // Sort by confidence and usage
    results.sort((a, b) => {
      const scoreA = a.metadata.confidence * Math.log(a.metadata.usageCount + 1);
      const scoreB = b.metadata.confidence * Math.log(b.metadata.usageCount + 1);
      return scoreB - scoreA;
    });
    
    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }
  
  /**
   * Apply pattern to new problem
   */
  async applyPattern(
    patternId: string,
    problem: string,
    context: any
  ): Promise<any> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }
    
    // Increment usage count
    pattern.metadata.usageCount++;
    
    // Adapt pattern to specific problem
    const adaptationRequest = {
      messages: [
        {
          role: 'system',
          content: `Apply the following pattern to solve a specific problem.`
        },
        {
          role: 'user',
          content: `Pattern: ${JSON.stringify(pattern, null, 2)}
            
            Problem: ${problem}
            Context: ${JSON.stringify(context, null, 2)}
            
            Provide a specific solution based on this pattern.`
        }
      ],
      maxTokens: 2000
    };
    
    const routeContext = {
      agentId: 'kb-builder',
      pipelineId: `pattern-application-${patternId}`,
      intent: 'pattern-application'
    };
    
    const startTime = Date.now();
    const response = await this.router.route(adaptationRequest, routeContext);
    const executionTime = Date.now() - startTime;
    
    // Update pattern metrics
    pattern.metrics.avgExecutionTime = 
      (pattern.metrics.avgExecutionTime * (pattern.metadata.usageCount - 1) + executionTime) / 
      pattern.metadata.usageCount;
    
    await this.updatePattern(pattern);
    
    return {
      solution: response.text,
      patternUsed: pattern.name,
      confidence: pattern.metadata.confidence,
      executionTime
    };
  }
  
  /**
   * Validate pattern batch
   */
  async validatePatternBatch(): Promise<Map<string, boolean>> {
    const pendingPatterns = Array.from(this.patterns.values())
      .filter(p => p.validation.status === 'pending')
      .slice(0, this.VALIDATION_BATCH_SIZE);
    
    const results = new Map<string, boolean>();
    
    for (const pattern of pendingPatterns) {
      const isValid = await this.runValidationTests(pattern);
      results.set(pattern.id, isValid);
      
      if (isValid) {
        pattern.validation.status = 'validated';
        pattern.validation.validatedAt = new Date().toISOString();
        pattern.metadata.confidence = Math.min(1, pattern.metadata.confidence * 1.2);
      } else {
        pattern.validation.status = 'rejected';
        pattern.metadata.confidence *= 0.5;
      }
      
      await this.updatePattern(pattern);
    }
    
    return results;
  }
  
  /**
   * Optimize patterns based on usage
   */
  async optimizePatterns(): Promise<void> {
    for (const pattern of this.patterns.values()) {
      // Skip if not enough usage data
      if (pattern.metadata.usageCount < 10) {
        continue;
      }
      
      // Check if pattern needs optimization
      if (pattern.metrics.errorRate > 0.2 || pattern.metrics.avgExecutionTime > 10000) {
        await this.optimizePattern(pattern);
      }
      
      // Deprecate low-performing patterns
      if (pattern.metadata.confidence < 0.3 && pattern.metrics.successRate < 0.5) {
        pattern.validation.status = 'deprecated';
        await this.updatePattern(pattern);
      }
    }
  }
  
  /**
   * Export knowledge base
   */
  async exportKnowledge(format: 'json' | 'markdown' = 'json'): Promise<string> {
    const patterns = Array.from(this.patterns.values());
    
    if (format === 'markdown') {
      return this.exportAsMarkdown(patterns);
    }
    
    return JSON.stringify({
      patterns,
      learningEvents: this.learningEvents,
      statistics: this.getStatistics()
    }, null, 2);
  }
  
  /**
   * Validate a pattern
   */
  private async validatePattern(pattern: Pattern): Promise<boolean> {
    // Check minimum requirements
    if (pattern.examples.length < this.MIN_EXAMPLES) {
      return false;
    }
    
    if (pattern.metadata.confidence < this.CONFIDENCE_THRESHOLD) {
      return false;
    }
    
    // Run validation rules
    for (const rule of this.validationRules.values()) {
      try {
        const isValid = await rule.validator(pattern);
        if (!isValid && rule.severity === 'error') {
          return false;
        }
      } catch (error) {
        console.error(`[KnowledgeValidation] Rule ${rule.id} failed:`, error);
      }
    }
    
    return true;
  }
  
  /**
   * Run validation tests for a pattern
   */
  private async runValidationTests(pattern: Pattern): Promise<boolean> {
    const testResults: TestResult[] = [];
    
    for (const example of pattern.examples) {
      const testId = crypto.randomBytes(4).toString('hex');
      const startTime = Date.now();
      
      try {
        // Apply pattern to example
        const result = await this.applyPattern(pattern.id, example.description, {
          input: example.input
        });
        
        // Verify output matches expected
        const passed = this.verifyOutput(result.solution, example.output);
        
        testResults.push({
          testId,
          passed,
          executionTime: Date.now() - startTime,
          output: result.solution
        });
      } catch (error: any) {
        testResults.push({
          testId,
          passed: false,
          executionTime: Date.now() - startTime,
          error: error.message
        });
      }
    }
    
    pattern.validation.testResults = testResults;
    
    // Pattern is valid if >70% tests pass
    const passRate = testResults.filter(r => r.passed).length / testResults.length;
    return passRate >= 0.7;
  }
  
  /**
   * Optimize a pattern
   */
  private async optimizePattern(pattern: Pattern): Promise<void> {
    const optimizationRequest = {
      messages: [
        {
          role: 'system',
          content: `You are a pattern optimization specialist. Improve the following pattern based on usage metrics and failure analysis.`
        },
        {
          role: 'user',
          content: `Optimize this pattern:
            Pattern: ${JSON.stringify(pattern, null, 2)}
            
            Issues:
            - Error rate: ${pattern.metrics.errorRate}
            - Avg execution time: ${pattern.metrics.avgExecutionTime}ms
            - Success rate: ${pattern.metrics.successRate}
            
            Provide optimizations for:
            1. Reducing errors
            2. Improving performance
            3. Enhancing reliability
            4. Better examples`
        }
      ],
      maxTokens: 1500
    };
    
    const routeContext = {
      agentId: 'kb-builder',
      pipelineId: `pattern-optimization-${pattern.id}`,
      intent: 'pattern-optimization'
    };
    
    const response = await this.router.route(optimizationRequest, routeContext);
    
    if (response.text) {
      const optimizations = this.parseOptimizations(response.text);
      
      // Apply optimizations
      if (optimizations.solution) {
        pattern.solution = optimizations.solution;
      }
      if (optimizations.examples) {
        pattern.examples.push(...optimizations.examples);
      }
      
      pattern.metadata.updatedAt = new Date().toISOString();
      await this.updatePattern(pattern);
      
      // Record optimization event
      await this.recordLearningEvent({
        type: 'optimization',
        agentId: 'kb-builder',
        taskId: pattern.id,
        description: `Optimized pattern: ${pattern.name}`,
        pattern,
        impact: 'high',
        automated: true
      });
    }
  }
  
  /**
   * Store a pattern
   */
  private async storePattern(pattern: Pattern): Promise<void> {
    this.patterns.set(pattern.id, pattern);
    
    // Save to disk
    const patternPath = path.join(this.knowledgeDir, 'patterns', `${pattern.id}.json`);
    await fs.ensureDir(path.dirname(patternPath));
    await fs.writeFile(patternPath, JSON.stringify(pattern, null, 2));
    
    // Update index
    await this.saveIndex();
  }
  
  /**
   * Update a pattern
   */
  private async updatePattern(pattern: Pattern): Promise<void> {
    pattern.metadata.updatedAt = new Date().toISOString();
    await this.storePattern(pattern);
  }
  
  /**
   * Record learning event
   */
  private async recordLearningEvent(event: Omit<LearningEvent, 'id' | 'timestamp'>): Promise<void> {
    const learningEvent: LearningEvent = {
      ...event,
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: new Date().toISOString()
    };
    
    this.learningEvents.push(learningEvent);
    
    // Keep only recent events (last 1000)
    if (this.learningEvents.length > 1000) {
      this.learningEvents = this.learningEvents.slice(-1000);
    }
    
    // Save events
    const eventsPath = path.join(this.knowledgeDir, 'learning-events.json');
    await fs.writeFile(eventsPath, JSON.stringify(this.learningEvents, null, 2));
  }
  
  /**
   * Parse extracted patterns from text
   */
  private parseExtractedPatterns(
    text: string,
    agentId: string,
    taskId: string
  ): Pattern[] {
    // This would use more sophisticated parsing in production
    // For now, create a simple pattern
    const pattern: Pattern = {
      id: crypto.randomBytes(8).toString('hex'),
      name: `Pattern from ${agentId}`,
      description: text.slice(0, 200),
      category: 'implementation',
      tags: ['auto-extracted', agentId],
      problem: 'Extracted problem',
      solution: text,
      context: {},
      examples: [],
      metrics: {
        successRate: 1,
        avgExecutionTime: 0,
        avgTokensUsed: 0,
        avgCost: 0,
        errorRate: 0,
        adoptionRate: 0
      },
      validation: {
        status: 'pending'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sourceAgents: [agentId],
        sourceTasks: [taskId],
        confidence: 0.7,
        usageCount: 0
      }
    };
    
    return [pattern];
  }
  
  /**
   * Parse failure analysis
   */
  private parseFailureAnalysis(text: string): any {
    return {
      summary: text.slice(0, 100),
      rootCause: 'Parsed root cause',
      antiPatterns: [],
      solutions: []
    };
  }
  
  /**
   * Parse optimizations
   */
  private parseOptimizations(text: string): any {
    return {
      solution: text,
      examples: []
    };
  }
  
  /**
   * Check if pattern is related to lessons
   */
  private isRelatedPattern(pattern: Pattern, lessons: any): boolean {
    // Simple keyword matching for now
    return pattern.description.includes(lessons.summary) ||
           pattern.problem.includes(lessons.rootCause);
  }
  
  /**
   * Assess impact of pattern
   */
  private assessImpact(pattern: Pattern): 'low' | 'medium' | 'high' {
    if (pattern.category === 'architecture') return 'high';
    if (pattern.category === 'optimization') return 'medium';
    return 'low';
  }
  
  /**
   * Rank patterns by relevance
   */
  private async rankByRelevance(
    patterns: Pattern[],
    problem: string
  ): Promise<Pattern[]> {
    // Simple text similarity for now
    return patterns.sort((a, b) => {
      const simA = this.calculateSimilarity(a.problem, problem);
      const simB = this.calculateSimilarity(b.problem, problem);
      return simB - simA;
    });
  }
  
  /**
   * Calculate text similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Verify output matches expected
   */
  private verifyOutput(actual: any, expected: any): boolean {
    // Simple comparison for now
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  
  /**
   * Initialize validation rules
   */
  private initializeValidationRules(): void {
    this.validationRules.set('complete', {
      id: 'complete',
      name: 'Completeness Check',
      description: 'Ensure pattern has all required fields',
      validator: async (pattern) => {
        return !!(pattern.name && pattern.description && pattern.problem && pattern.solution);
      },
      severity: 'error'
    });
    
    this.validationRules.set('examples', {
      id: 'examples',
      name: 'Examples Check',
      description: 'Ensure pattern has sufficient examples',
      validator: async (pattern) => {
        return pattern.examples.length >= this.MIN_EXAMPLES;
      },
      severity: 'warning'
    });
    
    this.validationRules.set('confidence', {
      id: 'confidence',
      name: 'Confidence Check',
      description: 'Ensure pattern meets confidence threshold',
      validator: async (pattern) => {
        return pattern.metadata.confidence >= this.CONFIDENCE_THRESHOLD;
      },
      severity: 'warning'
    });
  }
  
  /**
   * Load patterns from disk
   */
  private async loadPatterns(): Promise<void> {
    const patternsDir = path.join(this.knowledgeDir, 'patterns');
    
    if (await fs.pathExists(patternsDir)) {
      const files = await fs.readdir(patternsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(patternsDir, file), 'utf-8');
            const pattern = JSON.parse(content) as Pattern;
            this.patterns.set(pattern.id, pattern);
          } catch (error) {
            console.error(`[KnowledgeValidation] Failed to load pattern ${file}:`, error);
          }
        }
      }
    }
  }
  
  /**
   * Load learning events from disk
   */
  private async loadLearningEvents(): Promise<void> {
    const eventsPath = path.join(this.knowledgeDir, 'learning-events.json');
    
    if (await fs.pathExists(eventsPath)) {
      try {
        const content = await fs.readFile(eventsPath, 'utf-8');
        this.learningEvents = JSON.parse(content);
      } catch (error) {
        console.error('[KnowledgeValidation] Failed to load learning events:', error);
        this.learningEvents = [];
      }
    }
  }
  
  /**
   * Save index to disk
   */
  private async saveIndex(): Promise<void> {
    const index = {
      patterns: Array.from(this.patterns.keys()),
      count: this.patterns.size,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }
  
  /**
   * Get statistics
   */
  private getStatistics(): any {
    const patterns = Array.from(this.patterns.values());
    
    return {
      totalPatterns: patterns.length,
      validatedPatterns: patterns.filter(p => p.validation.status === 'validated').length,
      pendingPatterns: patterns.filter(p => p.validation.status === 'pending').length,
      avgConfidence: patterns.reduce((sum, p) => sum + p.metadata.confidence, 0) / patterns.length,
      totalUsage: patterns.reduce((sum, p) => sum + p.metadata.usageCount, 0),
      categories: this.getCategoryDistribution(patterns),
      learningEvents: this.learningEvents.length
    };
  }
  
  /**
   * Get category distribution
   */
  private getCategoryDistribution(patterns: Pattern[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const pattern of patterns) {
      distribution[pattern.category] = (distribution[pattern.category] || 0) + 1;
    }
    
    return distribution;
  }
  
  /**
   * Export as markdown
   */
  private exportAsMarkdown(patterns: Pattern[]): string {
    let markdown = '# Knowledge Base\n\n';
    
    // Group by category
    const byCategory = new Map<string, Pattern[]>();
    for (const pattern of patterns) {
      if (!byCategory.has(pattern.category)) {
        byCategory.set(pattern.category, []);
      }
      byCategory.get(pattern.category)!.push(pattern);
    }
    
    // Generate markdown for each category
    for (const [category, categoryPatterns] of byCategory) {
      markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      
      for (const pattern of categoryPatterns) {
        markdown += `### ${pattern.name}\n\n`;
        markdown += `**Description:** ${pattern.description}\n\n`;
        markdown += `**Problem:** ${pattern.problem}\n\n`;
        markdown += `**Solution:** ${pattern.solution}\n\n`;
        
        if (pattern.examples.length > 0) {
          markdown += '**Examples:**\n';
          for (const example of pattern.examples) {
            markdown += `- ${example.title}: ${example.description}\n`;
          }
          markdown += '\n';
        }
        
        markdown += `**Confidence:** ${(pattern.metadata.confidence * 100).toFixed(1)}%\n`;
        markdown += `**Usage Count:** ${pattern.metadata.usageCount}\n\n`;
        markdown += '---\n\n';
      }
    }
    
    return markdown;
  }
}