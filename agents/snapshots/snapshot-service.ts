/**
 * Agent Snapshot Service
 * 
 * Captures and persists agent execution states for:
 * - Debugging and analysis
 * - State recovery and resume
 * - Audit trails and compliance
 * - Performance profiling
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { diff } from 'diff';

export interface SnapshotMetadata {
  id: string;
  timestamp: string;
  agentId: string;
  pipelineId: string;
  taskId: string;
  type: 'input' | 'output' | 'error' | 'checkpoint';
  size: number;
  hash: string;
  parentId?: string;
  tags?: string[];
  retention?: 'temporary' | 'permanent' | 'archive';
}

export interface AgentSnapshot {
  metadata: SnapshotMetadata;
  context: {
    request: any;
    response?: any;
    error?: any;
    state?: any;
  };
  metrics: {
    tokensUsed?: number;
    cost?: number;
    latency?: number;
    retries?: number;
  };
  artifacts?: {
    files?: string[];
    worktree?: string;
    patch?: string;
    logs?: string[];
  };
  redacted?: string[];
}

export interface SnapshotQuery {
  agentId?: string;
  pipelineId?: string;
  taskId?: string;
  type?: string;
  startTime?: Date;
  endTime?: Date;
  tags?: string[];
  limit?: number;
}

export interface SnapshotDiff {
  added: string[];
  removed: string[];
  modified: Array<{
    path: string;
    changes: any;
  }>;
  summary: string;
}

export interface SnapshotIndex {
  snapshots: Map<string, SnapshotMetadata>;
  byAgent: Map<string, Set<string>>;
  byPipeline: Map<string, Set<string>>;
  byTask: Map<string, Set<string>>;
  byType: Map<string, Set<string>>;
  byDate: Map<string, Set<string>>;
}

export class SnapshotService {
  private snapshotDir: string;
  private index: SnapshotIndex;
  private redactionPatterns: RegExp[];
  private retentionPolicy: Map<string, number>; // Days to retain
  private compressionEnabled: boolean;
  private readonly MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly INDEX_FILE = 'snapshot-index.json';
  
  constructor(
    private workspacePath: string,
    compressionEnabled: boolean = true
  ) {
    this.snapshotDir = path.join(workspacePath, '.claude', 'snapshots');
    this.compressionEnabled = compressionEnabled;
    this.index = this.createEmptyIndex();
    this.redactionPatterns = this.initRedactionPatterns();
    this.retentionPolicy = this.initRetentionPolicy();
  }
  
  /**
   * Initialize the snapshot service
   */
  async initialize(): Promise<void> {
    // Ensure snapshot directory exists
    await fs.ensureDir(this.snapshotDir);
    
    // Load or create index
    await this.loadIndex();
    
    // Clean up old snapshots
    await this.cleanupExpiredSnapshots();
    
    console.log('[SnapshotService] Initialized with', this.index.snapshots.size, 'snapshots');
  }
  
  /**
   * Capture agent input snapshot
   */
  async captureInput(
    agentId: string,
    pipelineId: string,
    taskId: string,
    request: any,
    tags?: string[]
  ): Promise<string> {
    const snapshot: AgentSnapshot = {
      metadata: this.createMetadata(agentId, pipelineId, taskId, 'input', tags),
      context: {
        request: this.redactSensitive(request)
      },
      metrics: {},
      artifacts: {}
    };
    
    return this.saveSnapshot(snapshot);
  }
  
  /**
   * Capture agent output snapshot
   */
  async captureOutput(
    agentId: string,
    pipelineId: string,
    taskId: string,
    request: any,
    response: any,
    metrics?: any,
    artifacts?: any,
    tags?: string[]
  ): Promise<string> {
    const snapshot: AgentSnapshot = {
      metadata: this.createMetadata(agentId, pipelineId, taskId, 'output', tags),
      context: {
        request: this.redactSensitive(request),
        response: this.redactSensitive(response)
      },
      metrics: metrics || {},
      artifacts: artifacts || {}
    };
    
    // Link to input snapshot if exists
    const inputId = this.findInputSnapshot(agentId, pipelineId);
    if (inputId) {
      snapshot.metadata.parentId = inputId;
    }
    
    return this.saveSnapshot(snapshot);
  }
  
  /**
   * Capture error snapshot
   */
  async captureError(
    agentId: string,
    pipelineId: string,
    taskId: string,
    request: any,
    error: Error,
    state?: any,
    tags?: string[]
  ): Promise<string> {
    const snapshot: AgentSnapshot = {
      metadata: this.createMetadata(agentId, pipelineId, taskId, 'error', tags),
      context: {
        request: this.redactSensitive(request),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        state: state ? this.redactSensitive(state) : undefined
      },
      metrics: {},
      artifacts: {}
    };
    
    return this.saveSnapshot(snapshot);
  }
  
  /**
   * Capture checkpoint snapshot for recovery
   */
  async captureCheckpoint(
    agentId: string,
    pipelineId: string,
    taskId: string,
    state: any,
    tags?: string[]
  ): Promise<string> {
    const snapshot: AgentSnapshot = {
      metadata: this.createMetadata(agentId, pipelineId, taskId, 'checkpoint', tags),
      context: {
        request: {},
        state: this.redactSensitive(state)
      },
      metrics: {},
      artifacts: {}
    };
    
    snapshot.metadata.retention = 'permanent';
    
    return this.saveSnapshot(snapshot);
  }
  
  /**
   * Retrieve a snapshot by ID
   */
  async getSnapshot(snapshotId: string): Promise<AgentSnapshot | null> {
    const metadata = this.index.snapshots.get(snapshotId);
    if (!metadata) {
      return null;
    }
    
    const filePath = this.getSnapshotPath(snapshotId);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const snapshot = JSON.parse(content) as AgentSnapshot;
      
      // Verify integrity
      const hash = this.calculateHash(snapshot.context);
      if (hash !== metadata.hash) {
        console.warn(`[SnapshotService] Hash mismatch for snapshot ${snapshotId}`);
      }
      
      return snapshot;
    } catch (error) {
      console.error(`[SnapshotService] Failed to read snapshot ${snapshotId}:`, error);
      return null;
    }
  }
  
  /**
   * Query snapshots with filters
   */
  async querySnapshots(query: SnapshotQuery): Promise<AgentSnapshot[]> {
    let snapshotIds = new Set<string>();
    
    // Start with all snapshots
    if (!query.agentId && !query.pipelineId && !query.taskId && !query.type) {
      snapshotIds = new Set(this.index.snapshots.keys());
    }
    
    // Filter by agent
    if (query.agentId) {
      const agentSnapshots = this.index.byAgent.get(query.agentId) || new Set();
      if (snapshotIds.size === 0) {
        snapshotIds = agentSnapshots;
      } else {
        snapshotIds = new Set([...snapshotIds].filter(id => agentSnapshots.has(id)));
      }
    }
    
    // Filter by pipeline
    if (query.pipelineId) {
      const pipelineSnapshots = this.index.byPipeline.get(query.pipelineId) || new Set();
      snapshotIds = new Set([...snapshotIds].filter(id => pipelineSnapshots.has(id)));
    }
    
    // Filter by task
    if (query.taskId) {
      const taskSnapshots = this.index.byTask.get(query.taskId) || new Set();
      snapshotIds = new Set([...snapshotIds].filter(id => taskSnapshots.has(id)));
    }
    
    // Filter by type
    if (query.type) {
      const typeSnapshots = this.index.byType.get(query.type) || new Set();
      snapshotIds = new Set([...snapshotIds].filter(id => typeSnapshots.has(id)));
    }
    
    // Filter by date range
    if (query.startTime || query.endTime) {
      snapshotIds = new Set([...snapshotIds].filter(id => {
        const metadata = this.index.snapshots.get(id);
        if (!metadata) return false;
        const timestamp = new Date(metadata.timestamp);
        if (query.startTime && timestamp < query.startTime) return false;
        if (query.endTime && timestamp > query.endTime) return false;
        return true;
      }));
    }
    
    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      snapshotIds = new Set([...snapshotIds].filter(id => {
        const metadata = this.index.snapshots.get(id);
        if (!metadata || !metadata.tags) return false;
        return query.tags!.some(tag => metadata.tags!.includes(tag));
      }));
    }
    
    // Sort by timestamp (newest first)
    const sortedIds = Array.from(snapshotIds).sort((a, b) => {
      const metaA = this.index.snapshots.get(a)!;
      const metaB = this.index.snapshots.get(b)!;
      return metaB.timestamp.localeCompare(metaA.timestamp);
    });
    
    // Apply limit
    const limitedIds = query.limit ? sortedIds.slice(0, query.limit) : sortedIds;
    
    // Load snapshots
    const snapshots: AgentSnapshot[] = [];
    for (const id of limitedIds) {
      const snapshot = await this.getSnapshot(id);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
    
    return snapshots;
  }
  
  /**
   * Compare two snapshots
   */
  async compareSnapshots(
    snapshotId1: string,
    snapshotId2: string
  ): Promise<SnapshotDiff | null> {
    const snapshot1 = await this.getSnapshot(snapshotId1);
    const snapshot2 = await this.getSnapshot(snapshotId2);
    
    if (!snapshot1 || !snapshot2) {
      return null;
    }
    
    const diff: SnapshotDiff = {
      added: [],
      removed: [],
      modified: [],
      summary: ''
    };
    
    // Compare contexts
    const contextDiff = this.deepDiff(snapshot1.context, snapshot2.context);
    if (contextDiff.added.length > 0) {
      diff.added.push(...contextDiff.added.map(p => `context.${p}`));
    }
    if (contextDiff.removed.length > 0) {
      diff.removed.push(...contextDiff.removed.map(p => `context.${p}`));
    }
    if (contextDiff.modified.length > 0) {
      diff.modified.push(...contextDiff.modified.map(m => ({
        path: `context.${m.path}`,
        changes: m.changes
      })));
    }
    
    // Compare metrics
    const metricsDiff = this.deepDiff(snapshot1.metrics, snapshot2.metrics);
    if (metricsDiff.added.length > 0) {
      diff.added.push(...metricsDiff.added.map(p => `metrics.${p}`));
    }
    if (metricsDiff.removed.length > 0) {
      diff.removed.push(...metricsDiff.removed.map(p => `metrics.${p}`));
    }
    if (metricsDiff.modified.length > 0) {
      diff.modified.push(...metricsDiff.modified.map(m => ({
        path: `metrics.${m.path}`,
        changes: m.changes
      })));
    }
    
    // Generate summary
    diff.summary = this.generateDiffSummary(diff);
    
    return diff;
  }
  
  /**
   * Export snapshots for analysis
   */
  async exportSnapshots(
    query: SnapshotQuery,
    format: 'json' | 'csv' | 'html' = 'json'
  ): Promise<string> {
    const snapshots = await this.querySnapshots(query);
    
    switch (format) {
      case 'csv':
        return this.exportAsCSV(snapshots);
      case 'html':
        return this.exportAsHTML(snapshots);
      default:
        return JSON.stringify(snapshots, null, 2);
    }
  }
  
  /**
   * Clean up expired snapshots
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;
    
    for (const [id, metadata] of this.index.snapshots) {
      const age = now.getTime() - new Date(metadata.timestamp).getTime();
      const ageDays = age / (1000 * 60 * 60 * 24);
      
      const retentionDays = this.getRetentionDays(metadata);
      
      if (ageDays > retentionDays) {
        await this.deleteSnapshot(id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[SnapshotService] Cleaned up ${deletedCount} expired snapshots`);
      await this.saveIndex();
    }
    
    return deletedCount;
  }
  
  /**
   * Delete a snapshot
   */
  private async deleteSnapshot(snapshotId: string): Promise<void> {
    const metadata = this.index.snapshots.get(snapshotId);
    if (!metadata) {
      return;
    }
    
    // Remove from file system
    const filePath = this.getSnapshotPath(snapshotId);
    await fs.remove(filePath);
    
    // Remove from index
    this.index.snapshots.delete(snapshotId);
    this.index.byAgent.get(metadata.agentId)?.delete(snapshotId);
    this.index.byPipeline.get(metadata.pipelineId)?.delete(snapshotId);
    this.index.byTask.get(metadata.taskId)?.delete(snapshotId);
    this.index.byType.get(metadata.type)?.delete(snapshotId);
    
    const dateKey = metadata.timestamp.split('T')[0];
    this.index.byDate.get(dateKey)?.delete(snapshotId);
  }
  
  /**
   * Save a snapshot
   */
  private async saveSnapshot(snapshot: AgentSnapshot): Promise<string> {
    // Check size limit
    const size = JSON.stringify(snapshot).length;
    if (size > this.MAX_SNAPSHOT_SIZE) {
      console.warn(`[SnapshotService] Snapshot exceeds size limit: ${size} bytes`);
      snapshot = this.truncateSnapshot(snapshot);
    }
    
    // Calculate hash
    snapshot.metadata.hash = this.calculateHash(snapshot.context);
    snapshot.metadata.size = size;
    
    // Save to file
    const filePath = this.getSnapshotPath(snapshot.metadata.id);
    await fs.ensureDir(path.dirname(filePath));
    
    if (this.compressionEnabled) {
      // Would use compression library here
      await fs.writeFile(filePath, JSON.stringify(snapshot));
    } else {
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    }
    
    // Update index
    this.addToIndex(snapshot.metadata);
    await this.saveIndex();
    
    return snapshot.metadata.id;
  }
  
  /**
   * Create snapshot metadata
   */
  private createMetadata(
    agentId: string,
    pipelineId: string,
    taskId: string,
    type: 'input' | 'output' | 'error' | 'checkpoint',
    tags?: string[]
  ): SnapshotMetadata {
    return {
      id: this.generateSnapshotId(),
      timestamp: new Date().toISOString(),
      agentId,
      pipelineId,
      taskId,
      type,
      size: 0,
      hash: '',
      tags,
      retention: type === 'checkpoint' ? 'permanent' : 'temporary'
    };
  }
  
  /**
   * Generate unique snapshot ID
   */
  private generateSnapshotId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `snapshot-${timestamp}-${random}`;
  }
  
  /**
   * Calculate content hash
   */
  private calculateHash(content: any): string {
    const str = JSON.stringify(content);
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  }
  
  /**
   * Get snapshot file path
   */
  private getSnapshotPath(snapshotId: string): string {
    // Organize by date for better file system performance
    const date = snapshotId.split('-')[1];
    const dateStr = new Date(parseInt(date)).toISOString().split('T')[0];
    return path.join(this.snapshotDir, dateStr, `${snapshotId}.json`);
  }
  
  /**
   * Redact sensitive information
   */
  private redactSensitive(obj: any): any {
    if (!obj) return obj;
    
    const redacted = JSON.parse(JSON.stringify(obj));
    const redactedPaths: string[] = [];
    
    const redactValue = (value: any, path: string = ''): any => {
      if (typeof value === 'string') {
        for (const pattern of this.redactionPatterns) {
          if (pattern.test(value)) {
            redactedPaths.push(path);
            return '[REDACTED]';
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          value[key] = redactValue(val, path ? `${path}.${key}` : key);
        }
      }
      return value;
    };
    
    const result = redactValue(redacted);
    
    // Track redacted paths
    if (redactedPaths.length > 0) {
      result._redacted = redactedPaths;
    }
    
    return result;
  }
  
  /**
   * Initialize redaction patterns
   */
  private initRedactionPatterns(): RegExp[] {
    return [
      /api[_-]?key/i,
      /secret/i,
      /password/i,
      /token/i,
      /bearer\s+[\w-]+/i,
      /ssh-rsa\s+[\w+/=]+/i,
      /-----BEGIN\s+[\w\s]+-----/,
      /[a-f0-9]{40}/i, // SHA-1 hashes
      /sk-[a-zA-Z0-9]{48}/, // OpenAI keys
      /anthropic-[a-zA-Z0-9]+/ // Anthropic keys
    ];
  }
  
  /**
   * Initialize retention policy
   */
  private initRetentionPolicy(): Map<string, number> {
    return new Map([
      ['temporary', 7],    // 7 days
      ['permanent', 365],  // 1 year
      ['archive', 30],     // 30 days
      ['input', 3],        // 3 days
      ['output', 7],       // 7 days
      ['error', 14],       // 14 days
      ['checkpoint', 30]   // 30 days
    ]);
  }
  
  /**
   * Get retention days for a snapshot
   */
  private getRetentionDays(metadata: SnapshotMetadata): number {
    if (metadata.retention) {
      return this.retentionPolicy.get(metadata.retention) || 7;
    }
    return this.retentionPolicy.get(metadata.type) || 7;
  }
  
  /**
   * Create empty index
   */
  private createEmptyIndex(): SnapshotIndex {
    return {
      snapshots: new Map(),
      byAgent: new Map(),
      byPipeline: new Map(),
      byTask: new Map(),
      byType: new Map(),
      byDate: new Map()
    };
  }
  
  /**
   * Load index from disk
   */
  private async loadIndex(): Promise<void> {
    const indexPath = path.join(this.snapshotDir, this.INDEX_FILE);
    
    if (await fs.pathExists(indexPath)) {
      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const data = JSON.parse(content);
        
        // Reconstruct index
        this.index.snapshots = new Map(data.snapshots);
        this.index.byAgent = new Map(data.byAgent.map((entry: any) => 
          [entry[0], new Set(entry[1])]
        ));
        this.index.byPipeline = new Map(data.byPipeline.map((entry: any) => 
          [entry[0], new Set(entry[1])]
        ));
        this.index.byTask = new Map(data.byTask.map((entry: any) => 
          [entry[0], new Set(entry[1])]
        ));
        this.index.byType = new Map(data.byType.map((entry: any) => 
          [entry[0], new Set(entry[1])]
        ));
        this.index.byDate = new Map(data.byDate.map((entry: any) => 
          [entry[0], new Set(entry[1])]
        ));
      } catch (error) {
        console.error('[SnapshotService] Failed to load index:', error);
        this.index = this.createEmptyIndex();
      }
    }
  }
  
  /**
   * Save index to disk
   */
  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.snapshotDir, this.INDEX_FILE);
    
    const data = {
      snapshots: Array.from(this.index.snapshots.entries()),
      byAgent: Array.from(this.index.byAgent.entries()).map(([k, v]) => 
        [k, Array.from(v)]
      ),
      byPipeline: Array.from(this.index.byPipeline.entries()).map(([k, v]) => 
        [k, Array.from(v)]
      ),
      byTask: Array.from(this.index.byTask.entries()).map(([k, v]) => 
        [k, Array.from(v)]
      ),
      byType: Array.from(this.index.byType.entries()).map(([k, v]) => 
        [k, Array.from(v)]
      ),
      byDate: Array.from(this.index.byDate.entries()).map(([k, v]) => 
        [k, Array.from(v)]
      )
    };
    
    await fs.writeFile(indexPath, JSON.stringify(data));
  }
  
  /**
   * Add metadata to index
   */
  private addToIndex(metadata: SnapshotMetadata): void {
    this.index.snapshots.set(metadata.id, metadata);
    
    // Index by agent
    if (!this.index.byAgent.has(metadata.agentId)) {
      this.index.byAgent.set(metadata.agentId, new Set());
    }
    this.index.byAgent.get(metadata.agentId)!.add(metadata.id);
    
    // Index by pipeline
    if (!this.index.byPipeline.has(metadata.pipelineId)) {
      this.index.byPipeline.set(metadata.pipelineId, new Set());
    }
    this.index.byPipeline.get(metadata.pipelineId)!.add(metadata.id);
    
    // Index by task
    if (!this.index.byTask.has(metadata.taskId)) {
      this.index.byTask.set(metadata.taskId, new Set());
    }
    this.index.byTask.get(metadata.taskId)!.add(metadata.id);
    
    // Index by type
    if (!this.index.byType.has(metadata.type)) {
      this.index.byType.set(metadata.type, new Set());
    }
    this.index.byType.get(metadata.type)!.add(metadata.id);
    
    // Index by date
    const dateKey = metadata.timestamp.split('T')[0];
    if (!this.index.byDate.has(dateKey)) {
      this.index.byDate.set(dateKey, new Set());
    }
    this.index.byDate.get(dateKey)!.add(metadata.id);
  }
  
  /**
   * Find input snapshot for agent
   */
  private findInputSnapshot(agentId: string, pipelineId: string): string | undefined {
    const agentSnapshots = this.index.byAgent.get(agentId);
    const pipelineSnapshots = this.index.byPipeline.get(pipelineId);
    
    if (!agentSnapshots || !pipelineSnapshots) {
      return undefined;
    }
    
    // Find intersection
    const common = [...agentSnapshots].filter(id => pipelineSnapshots.has(id));
    
    // Find most recent input snapshot
    for (const id of common.reverse()) {
      const metadata = this.index.snapshots.get(id);
      if (metadata && metadata.type === 'input') {
        return id;
      }
    }
    
    return undefined;
  }
  
  /**
   * Truncate large snapshot
   */
  private truncateSnapshot(snapshot: AgentSnapshot): AgentSnapshot {
    const truncated = { ...snapshot };
    
    // Truncate large text fields
    if (truncated.context.request) {
      truncated.context.request = this.truncateObject(truncated.context.request);
    }
    if (truncated.context.response) {
      truncated.context.response = this.truncateObject(truncated.context.response);
    }
    
    return truncated;
  }
  
  /**
   * Truncate large object
   */
  private truncateObject(obj: any, maxLength: number = 1000): any {
    if (typeof obj === 'string' && obj.length > maxLength) {
      return obj.slice(0, maxLength) + '... [TRUNCATED]';
    }
    if (Array.isArray(obj) && obj.length > 10) {
      return [...obj.slice(0, 10), '[TRUNCATED]'];
    }
    if (typeof obj === 'object' && obj !== null) {
      const truncated: any = {};
      for (const [key, value] of Object.entries(obj)) {
        truncated[key] = this.truncateObject(value, maxLength);
      }
      return truncated;
    }
    return obj;
  }
  
  /**
   * Deep diff two objects
   */
  private deepDiff(obj1: any, obj2: any, path: string = ''): any {
    const diff = {
      added: [] as string[],
      removed: [] as string[],
      modified: [] as any[]
    };
    
    // Check additions and modifications
    for (const key in obj2) {
      const fullPath = path ? `${path}.${key}` : key;
      if (!(key in obj1)) {
        diff.added.push(fullPath);
      } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
        diff.modified.push({
          path: fullPath,
          changes: {
            old: obj1[key],
            new: obj2[key]
          }
        });
      }
    }
    
    // Check removals
    for (const key in obj1) {
      const fullPath = path ? `${path}.${key}` : key;
      if (!(key in obj2)) {
        diff.removed.push(fullPath);
      }
    }
    
    return diff;
  }
  
  /**
   * Generate diff summary
   */
  private generateDiffSummary(diff: SnapshotDiff): string {
    const parts: string[] = [];
    
    if (diff.added.length > 0) {
      parts.push(`${diff.added.length} additions`);
    }
    if (diff.removed.length > 0) {
      parts.push(`${diff.removed.length} removals`);
    }
    if (diff.modified.length > 0) {
      parts.push(`${diff.modified.length} modifications`);
    }
    
    return parts.length > 0 ? parts.join(', ') : 'No changes';
  }
  
  /**
   * Export as CSV
   */
  private exportAsCSV(snapshots: AgentSnapshot[]): string {
    const headers = [
      'ID', 'Timestamp', 'Agent', 'Pipeline', 'Task', 'Type',
      'Tokens Used', 'Cost', 'Latency', 'Size', 'Hash'
    ];
    
    const rows = snapshots.map(s => [
      s.metadata.id,
      s.metadata.timestamp,
      s.metadata.agentId,
      s.metadata.pipelineId,
      s.metadata.taskId,
      s.metadata.type,
      s.metrics.tokensUsed || '',
      s.metrics.cost || '',
      s.metrics.latency || '',
      s.metadata.size,
      s.metadata.hash
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
  
  /**
   * Export as HTML
   */
  private exportAsHTML(snapshots: AgentSnapshot[]): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Agent Snapshots</title>
  <style>
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:hover { background-color: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Agent Snapshots</h1>
  <table>
    <tr>
      <th>ID</th>
      <th>Timestamp</th>
      <th>Agent</th>
      <th>Type</th>
      <th>Tokens</th>
      <th>Cost</th>
    </tr>
    ${snapshots.map(s => `
    <tr>
      <td>${s.metadata.id}</td>
      <td>${s.metadata.timestamp}</td>
      <td>${s.metadata.agentId}</td>
      <td>${s.metadata.type}</td>
      <td>${s.metrics.tokensUsed || '-'}</td>
      <td>${s.metrics.cost ? '$' + s.metrics.cost.toFixed(2) : '-'}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>`;
    
    return html;
  }
}