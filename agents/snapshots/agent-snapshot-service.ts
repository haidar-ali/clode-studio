/**
 * Agent Snapshot Service
 * Manages agent execution snapshots for rollback and recovery
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface AgentSnapshot {
  id: string;
  agentId: string;
  timestamp: string;
  state: any;
  files: Map<string, string>;
  metadata: {
    taskId: string;
    stepId: string;
    description?: string;
  };
}

export class AgentSnapshotService {
  private snapshotsDir: string;
  private maxSnapshots: number = 10;
  
  constructor(workspacePath: string) {
    this.snapshotsDir = path.join(workspacePath, '.clode', 'snapshots');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.snapshotsDir);
  }
  
  async createSnapshot(
    agentId: string,
    state: any,
    files: Map<string, string>,
    metadata: AgentSnapshot['metadata']
  ): Promise<AgentSnapshot> {
    const snapshot: AgentSnapshot = {
      id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      timestamp: new Date().toISOString(),
      state,
      files,
      metadata
    };
    
    const snapshotPath = path.join(this.snapshotsDir, `${snapshot.id}.json`);
    
    // Convert Map to object for serialization
    const serializable = {
      ...snapshot,
      files: Array.from(files.entries())
    };
    
    await fs.writeJson(snapshotPath, serializable, { spaces: 2 });
    
    // Clean up old snapshots
    await this.cleanupOldSnapshots();
    
    return snapshot;
  }
  
  async loadSnapshot(snapshotId: string): Promise<AgentSnapshot | null> {
    const snapshotPath = path.join(this.snapshotsDir, `${snapshotId}.json`);
    
    if (!await fs.pathExists(snapshotPath)) {
      return null;
    }
    
    const data = await fs.readJson(snapshotPath);
    
    // Convert array back to Map
    return {
      ...data,
      files: new Map(data.files)
    };
  }
  
  async listSnapshots(agentId?: string): Promise<AgentSnapshot[]> {
    if (!await fs.pathExists(this.snapshotsDir)) {
      return [];
    }
    
    const files = await fs.readdir(this.snapshotsDir);
    const snapshots: AgentSnapshot[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const snapshot = await this.loadSnapshot(file.replace('.json', ''));
        if (snapshot && (!agentId || snapshot.agentId === agentId)) {
          snapshots.push(snapshot);
        }
      }
    }
    
    // Sort by timestamp, newest first
    return snapshots.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  
  async rollbackToSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = await this.loadSnapshot(snapshotId);
    
    if (!snapshot) {
      return false;
    }
    
    // Apply file changes
    for (const [filePath, content] of snapshot.files) {
      await fs.writeFile(filePath, content, 'utf-8');
    }
    
    return true;
  }
  
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshotPath = path.join(this.snapshotsDir, `${snapshotId}.json`);
    await fs.remove(snapshotPath);
  }
  
  private async cleanupOldSnapshots(): Promise<void> {
    const snapshots = await this.listSnapshots();
    
    if (snapshots.length > this.maxSnapshots) {
      // Keep only the most recent snapshots
      const toDelete = snapshots.slice(this.maxSnapshots);
      
      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
  }
}