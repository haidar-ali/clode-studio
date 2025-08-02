/**
 * Local SQLite Database Service
 * Provides offline-first state management for Clode Studio
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
export class LocalDatabase {
    db;
    dbPath;
    constructor(workspacePath) {
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
    initSchema() {
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
    `);
    }
    // Claude session methods
    async saveClaudeSession(sessionData) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO claude_sessions 
      (id, instance_id, user_id, conversation_data, personality_id, working_directory, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(sessionData.id, sessionData.instanceId, sessionData.userId || null, JSON.stringify(sessionData.conversationData), sessionData.personalityId || null, sessionData.workingDirectory, Date.now());
    }
    async getClaudeSession(sessionId) {
        const stmt = this.db.prepare('SELECT * FROM claude_sessions WHERE id = ?');
        const row = stmt.get(sessionId);
        if (row) {
            return {
                ...row,
                conversationData: JSON.parse(row.conversation_data || '{}')
            };
        }
        return null;
    }
    async getClaudeSessionsByUser(userId) {
        const stmt = this.db.prepare('SELECT * FROM claude_sessions WHERE user_id = ? ORDER BY updated_at DESC');
        return stmt.all(userId);
    }
    // File cache methods (for remote mode)
    async cacheFile(filePath, content, hash) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO file_cache 
      (path, content, hash, size, modified, cached_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        stmt.run(filePath, content, hash, Buffer.byteLength(content), Date.now(), Date.now());
    }
    async getCachedFile(filePath) {
        const stmt = this.db.prepare('SELECT * FROM file_cache WHERE path = ?');
        return stmt.get(filePath);
    }
    async clearFileCache(olderThanMs) {
        if (olderThanMs) {
            const cutoff = Date.now() - olderThanMs;
            const stmt = this.db.prepare('DELETE FROM file_cache WHERE cached_at < ?');
            return stmt.run(cutoff);
        }
        else {
            const stmt = this.db.prepare('DELETE FROM file_cache');
            return stmt.run();
        }
    }
    // Workspace state methods
    async saveWorkspaceState(workspacePath, stateType, stateData) {
        const id = `${workspacePath}:${stateType}`;
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_state 
      (id, workspace_path, state_type, state_data, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(id, workspacePath, stateType, JSON.stringify(stateData), Date.now());
    }
    async getWorkspaceState(workspacePath, stateType) {
        if (stateType) {
            const stmt = this.db.prepare('SELECT * FROM workspace_state WHERE workspace_path = ? AND state_type = ?');
            const row = stmt.get(workspacePath, stateType);
            return row ? JSON.parse(row.state_data) : null;
        }
        else {
            const stmt = this.db.prepare('SELECT * FROM workspace_state WHERE workspace_path = ?');
            const rows = stmt.all(workspacePath);
            return rows.reduce((acc, row) => {
                acc[row.state_type] = JSON.parse(row.state_data);
                return acc;
            }, {});
        }
    }
    // Knowledge base methods
    async saveKnowledgeEntry(entry) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_entries 
      (id, title, content, tags, category, metadata, user_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(entry.id, entry.title, entry.content, JSON.stringify(entry.tags || []), entry.category || null, JSON.stringify(entry.metadata || {}), entry.userId || null, Date.now());
    }
    async searchKnowledge(query, userId) {
        let sql = `
      SELECT * FROM knowledge_entries 
      WHERE (title LIKE ? OR content LIKE ?)
    `;
        const params = [`%${query}%`, `%${query}%`];
        if (userId) {
            sql += ' AND user_id = ?';
            params.push(userId);
        }
        sql += ' ORDER BY updated_at DESC';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map((row) => ({
            ...row,
            tags: JSON.parse(row.tags || '[]'),
            metadata: JSON.parse(row.metadata || '{}')
        }));
    }
    // Sync queue methods
    async addToSyncQueue(actionType, actionData, priority = 50) {
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
        const row = stmt.get();
        return row ? {
            ...row,
            action_data: JSON.parse(row.action_data)
        } : null;
    }
    async updateSyncItemStatus(id, status) {
        const stmt = this.db.prepare(`
      UPDATE sync_queue 
      SET status = ?, processed_at = ?
      WHERE id = ?
    `);
        stmt.run(status, status === 'pending' ? null : Date.now(), id);
    }
    async getPendingSyncCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE status = "pending"');
        const result = stmt.get();
        return result.count;
    }
    // Settings methods
    async setSetting(key, value) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
        stmt.run(key, JSON.stringify(value), Date.now());
    }
    async getSetting(key) {
        const stmt = this.db.prepare('SELECT value FROM user_settings WHERE key = ?');
        const row = stmt.get(key);
        return row ? JSON.parse(row.value) : null;
    }
    async getAllSettings() {
        const stmt = this.db.prepare('SELECT * FROM user_settings');
        const rows = stmt.all();
        return rows.reduce((acc, row) => {
            acc[row.key] = JSON.parse(row.value);
            return acc;
        }, {});
    }
    // Utility methods
    async vacuum() {
        this.db.exec('VACUUM');
    }
    async getStats() {
        const stats = {
            claudeSessions: this.db.prepare('SELECT COUNT(*) as count FROM claude_sessions').get().count,
            cachedFiles: this.db.prepare('SELECT COUNT(*) as count FROM file_cache').get().count,
            knowledgeEntries: this.db.prepare('SELECT COUNT(*) as count FROM knowledge_entries').get().count,
            pendingSyncs: this.db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE status = "pending"').get().count,
            dbSizeMB: (fs.statSync(this.dbPath).size / 1024 / 1024).toFixed(2)
        };
        return stats;
    }
    close() {
        this.db.close();
    }
}
// Singleton instance management
let instance = null;
export function getLocalDatabase(workspacePath) {
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
