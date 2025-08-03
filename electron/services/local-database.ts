/**
 * Local SQLite Database Service
 * Provides offline-first state management for Clode Studio
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';

export class LocalDatabase {
  private db: Database.Database;
  private dbPath: string;
  
  constructor(workspacePath?: string) {
    // Create database in user data directory or workspace-specific location
    const userDataPath = app.getPath('userData');
    const dbDir = workspacePath 
      ? path.join(workspacePath, '.clode', 'db')
      : path.join(userDataPath, 'db');
    
    // Ensure directory exists
    fs.ensureDirSync(dbDir);
    
    this.dbPath = path.join(dbDir, 'clode-studio.db');
    this.db = new Database(this.dbPath);
    
    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    
    // Initialize schema
    this.initSchema();
  }
  
  /**
   * Initialize database schema
   */
  private initSchema() {
    // Create tables for different app components
    this.db.exec(`
      -- Claude sessions table
      CREATE TABLE IF NOT EXISTS claude_sessions (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        user_id TEXT,
        conversation_data TEXT,
        personality_id TEXT,
        working_directory TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      -- File cache table (for remote mode)
      CREATE TABLE IF NOT EXISTS file_cache (
        path TEXT PRIMARY KEY,
        content TEXT,
        hash TEXT,
        size INTEGER,
        modified INTEGER,
        cached_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      -- Workspace state table
      CREATE TABLE IF NOT EXISTS workspace_state (
        id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        state_type TEXT NOT NULL, -- 'editor', 'terminal', 'layout', etc.
        state_data TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      -- Knowledge base entries
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        tags TEXT, -- JSON array
        category TEXT,
        metadata TEXT, -- JSON object
        user_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      -- Sync queue for offline operations
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        action_data TEXT NOT NULL, -- JSON
        priority INTEGER DEFAULT 50,
        retry_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        processed_at INTEGER
      );
      
      -- User preferences and settings
      CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_claude_sessions_user ON claude_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_claude_sessions_instance ON claude_sessions(instance_id);
      CREATE INDEX IF NOT EXISTS idx_file_cache_modified ON file_cache(modified);
      CREATE INDEX IF NOT EXISTS idx_workspace_state_path ON workspace_state(workspace_path);
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_user ON knowledge_entries(user_id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, priority);
      
      -- Sync patches table
      CREATE TABLE IF NOT EXISTS sync_patches (
        id TEXT PRIMARY KEY,
        store_key TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        from_version INTEGER,
        to_version INTEGER,
        operations TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        source TEXT,
        user_id TEXT,
        session_id TEXT,
        received_at INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_patches_store ON sync_patches(store_key, timestamp);
      CREATE INDEX IF NOT EXISTS idx_patches_entity ON sync_patches(entity_id, entity_type);
    `);
  }
  
  // Claude session methods
  async saveClaudeSession(sessionData: {
    id: string;
    instanceId: string;
    userId?: string;
    conversationData: any;
    personalityId?: string;
    workingDirectory: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO claude_sessions 
      (id, instance_id, user_id, conversation_data, personality_id, working_directory, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      sessionData.id,
      sessionData.instanceId,
      sessionData.userId || null,
      JSON.stringify(sessionData.conversationData),
      sessionData.personalityId || null,
      sessionData.workingDirectory,
      Date.now()
    );
  }
  
  async getClaudeSession(sessionId: string) {
    const stmt = this.db.prepare('SELECT * FROM claude_sessions WHERE id = ?');
    const row = stmt.get(sessionId) as any;
    
    if (row) {
      return {
        ...row,
        conversationData: JSON.parse(row.conversation_data || '{}')
      };
    }
    return null;
  }
  
  async getClaudeSessionsByUser(userId: string) {
    const stmt = this.db.prepare('SELECT * FROM claude_sessions WHERE user_id = ? ORDER BY updated_at DESC');
    return stmt.all(userId);
  }
  
  // File cache methods (for remote mode)
  async cacheFile(filePath: string, content: string, hash: string) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO file_cache 
      (path, content, hash, size, modified, cached_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      filePath,
      content,
      hash,
      Buffer.byteLength(content),
      Date.now(),
      Date.now()
    );
  }
  
  async getCachedFile(filePath: string) {
    const stmt = this.db.prepare('SELECT * FROM file_cache WHERE path = ?');
    return stmt.get(filePath);
  }
  
  async clearFileCache(olderThanMs?: number) {
    if (olderThanMs) {
      const cutoff = Date.now() - olderThanMs;
      const stmt = this.db.prepare('DELETE FROM file_cache WHERE cached_at < ?');
      return stmt.run(cutoff);
    } else {
      const stmt = this.db.prepare('DELETE FROM file_cache');
      return stmt.run();
    }
  }
  
  // Workspace state methods
  async saveWorkspaceState(workspacePath: string, stateType: string, stateData: any) {
    const id = `${workspacePath}:${stateType}`;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_state 
      (id, workspace_path, state_type, state_data, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      workspacePath,
      stateType,
      JSON.stringify(stateData),
      Date.now()
    );
  }
  
  async getWorkspaceState(workspacePath: string, stateType?: string) {
    if (stateType) {
      const stmt = this.db.prepare('SELECT * FROM workspace_state WHERE workspace_path = ? AND state_type = ?');
      const row = stmt.get(workspacePath, stateType) as any;
      return row ? JSON.parse(row.state_data) : null;
    } else {
      const stmt = this.db.prepare('SELECT * FROM workspace_state WHERE workspace_path = ?');
      const rows = stmt.all(workspacePath);
      return rows.reduce((acc: any, row: any) => {
        acc[row.state_type] = JSON.parse(row.state_data);
        return acc;
      }, {});
    }
  }
  
  // Knowledge base methods
  async saveKnowledgeEntry(entry: {
    id: string;
    title: string;
    content: string;
    tags?: string[];
    category?: string;
    metadata?: any;
    userId?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_entries 
      (id, title, content, tags, category, metadata, user_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      entry.id,
      entry.title,
      entry.content,
      JSON.stringify(entry.tags || []),
      entry.category || null,
      JSON.stringify(entry.metadata || {}),
      entry.userId || null,
      Date.now()
    );
  }
  
  async searchKnowledge(query: string, userId?: string) {
    let sql = `
      SELECT * FROM knowledge_entries 
      WHERE (title LIKE ? OR content LIKE ?)
    `;
    const params: any[] = [`%${query}%`, `%${query}%`];
    
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map((row: any) => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }
  
  // Sync queue methods
  async addToSyncQueue(actionType: string, actionData: any, priority: number = 50) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_queue (action_type, action_data, priority)
      VALUES (?, ?, ?)
    `);
    
    return stmt.run(actionType, JSON.stringify(actionData), priority);
  }
  
  async getNextSyncItem() {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_queue 
      WHERE status = 'pending' 
      ORDER BY priority DESC, created_at ASC 
      LIMIT 1
    `);
    
    const row = stmt.get() as any;
    return row ? {
      ...row,
      action_data: JSON.parse(row.action_data)
    } : null;
  }
  
  async updateSyncItemStatus(id: number, status: string) {
    const stmt = this.db.prepare(`
      UPDATE sync_queue 
      SET status = ?, processed_at = ?
      WHERE id = ?
    `);
    
    stmt.run(status, status === 'pending' ? null : Date.now(), id);
  }
  
  async getPendingSyncCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE status = "pending"');
    const result = stmt.get() as any;
    return result.count;
  }
  
  // Settings methods
  async setSetting(key: string, value: any) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(key, JSON.stringify(value), Date.now());
  }
  
  async getSetting(key: string) {
    const stmt = this.db.prepare('SELECT value FROM user_settings WHERE key = ?');
    const row = stmt.get(key) as any;
    return row ? JSON.parse(row.value) : null;
  }
  
  async getAllSettings() {
    const stmt = this.db.prepare('SELECT * FROM user_settings');
    const rows = stmt.all();
    
    return rows.reduce((acc: any, row: any) => {
      acc[row.key] = JSON.parse(row.value);
      return acc;
    }, {});
  }
  
  // Utility methods
  async vacuum() {
    this.db.exec('VACUUM');
  }
  
  // Sync patches methods
  async addSyncPatches(storeKey: string, patches: any[]) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_patches 
      (id, store_key, entity_id, entity_type, from_version, to_version, operations, timestamp, source, user_id, session_id, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertMany = this.db.transaction((patches: any[]) => {
      for (const patch of patches) {
        stmt.run(
          patch.id,
          storeKey,
          patch.entityId,
          patch.entityType,
          patch.fromVersion,
          patch.toVersion,
          JSON.stringify(patch.operations),
          new Date(patch.timestamp).getTime(),
          patch.source || 'remote',
          patch.userId || null,
          patch.sessionId || null,
          patch.receivedAt ? new Date(patch.receivedAt).getTime() : Date.now()
        );
      }
    });
    
    insertMany(patches);
  }
  
  async getSyncPatches(storeKey: string, since?: Date | null, types?: string[]) {
    let sql = 'SELECT * FROM sync_patches WHERE store_key = ?';
    const params: any[] = [storeKey];
    
    if (since) {
      sql += ' AND timestamp > ?';
      params.push(new Date(since).getTime());
    }
    
    if (types && types.length > 0) {
      sql += ` AND entity_type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
    
    sql += ' ORDER BY timestamp ASC';
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map((row: any) => ({
      ...row,
      operations: JSON.parse(row.operations),
      timestamp: new Date(row.timestamp),
      receivedAt: row.received_at ? new Date(row.received_at) : null
    }));
  }
  
  async getSyncStats(storeKey: string) {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_patches,
        COUNT(DISTINCT entity_id) as unique_entities,
        COUNT(DISTINCT entity_type) as entity_types,
        MAX(timestamp) as last_sync_timestamp
      FROM sync_patches 
      WHERE store_key = ?
    `);
    
    return stmt.get(storeKey);
  }
  
  async getStats() {
    const stats = {
      claudeSessions: (this.db.prepare('SELECT COUNT(*) as count FROM claude_sessions').get() as any).count,
      cachedFiles: (this.db.prepare('SELECT COUNT(*) as count FROM file_cache').get() as any).count,
      knowledgeEntries: (this.db.prepare('SELECT COUNT(*) as count FROM knowledge_entries').get() as any).count,
      pendingSyncs: (this.db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE status = "pending"').get() as any).count,
      syncPatches: (this.db.prepare('SELECT COUNT(*) as count FROM sync_patches').get() as any).count,
      dbSizeMB: (fs.statSync(this.dbPath).size / 1024 / 1024).toFixed(2)
    };
    
    return stats;
  }
  
  close() {
    this.db.close();
  }
}

// Singleton instance management
let instance: LocalDatabase | null = null;

export function getLocalDatabase(workspacePath?: string): LocalDatabase {
  if (!instance) {
    instance = new LocalDatabase(workspacePath);
  }
  return instance;
}

export function closeLocalDatabase() {
  if (instance) {
    instance.close();
    instance = null;
  }
}