import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

interface SessionData {
  instanceId: string;
  sessionId?: string;
  previousSessionIds?: string[]; // Keep history of previous session IDs for fallback
  instanceName?: string;
  workingDirectory: string;
  lastActive: number;
  shouldAutoStart?: boolean;
  personalityId?: string;
  runConfig?: any;
}

export class ClaudeSessionService {
  private store: any; // electron-store instance
  private claudeSessions: Map<string, SessionData>;

  constructor(store: any) {
    this.store = store;
    this.claudeSessions = new Map();
  }

  // Save sessions to project-level .claude/sessions/
  saveSessionsToDisk(): void {
    try {
      const workspacePath = this.store.get('workspacePath') as string || process.cwd();
      const sessionsDir = join(workspacePath, '.claude', 'sessions');
      
      // Ensure directory exists
      if (!existsSync(sessionsDir)) {
        mkdirSync(sessionsDir, { recursive: true });
      }
      
      // Save each session to its own file
      this.claudeSessions.forEach((session) => {
        const sessionFile = join(sessionsDir, `${session.instanceId}.json`);
        writeFileSync(sessionFile, JSON.stringify(session, null, 2));
      });
      
      // Also save a manifest of active sessions
      const manifest = {
        sessions: Array.from(this.claudeSessions.keys()),
        lastUpdated: Date.now()
      };
      writeFileSync(join(sessionsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      
      console.log(`Saved ${this.claudeSessions.size} sessions to .claude/sessions/`);
    } catch (error) {
      console.error('Failed to save sessions to disk:', error);
    }
  }

  // Load sessions from project-level .claude/sessions/
  loadSessionsFromDisk(): void {
    try {
      const workspacePath = this.store.get('workspacePath') as string || process.cwd();
      const sessionsDir = join(workspacePath, '.claude', 'sessions');
      
      if (!existsSync(sessionsDir)) {
        return;
      }
      
      // Load manifest if it exists
      const manifestFile = join(sessionsDir, 'manifest.json');
      if (existsSync(manifestFile)) {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
        
        // Load each session file
        manifest.sessions.forEach((sessionId: string) => {
          const sessionFile = join(sessionsDir, `${sessionId}.json`);
          if (existsSync(sessionFile)) {
            try {
              const session = JSON.parse(readFileSync(sessionFile, 'utf-8')) as SessionData;
              // Load all sessions, no time limit
              this.claudeSessions.set(session.instanceId, session);
            } catch (err) {
              console.error(`Failed to load session ${sessionId}:`, err);
            }
          }
        });
        
        console.log(`Loaded ${this.claudeSessions.size} sessions from .claude/sessions/`);
      }
    } catch (error) {
      console.error('Failed to load sessions from disk:', error);
    }
  }

  // Clear sessions from disk
  clearSessionsFromDisk(): void {
    try {
      const workspacePath = this.store.get('workspacePath') as string || process.cwd();
      const sessionsDir = join(workspacePath, '.claude', 'sessions');
      
      if (!existsSync(sessionsDir)) {
        return;
      }
      
      // Remove all session files
      const files = readdirSync(sessionsDir);
      files.forEach(file => {
        try {
          unlinkSync(join(sessionsDir, file));
        } catch (error) {
          console.error(`Failed to delete session file ${file}:`, error);
        }
      });
      
      console.log('Cleared all sessions from disk');
    } catch (error) {
      console.error('Failed to clear sessions from disk:', error);
    }
  }

  // Check if session exists for an instance
  hasSession(instanceId: string): boolean {
    return this.claudeSessions.has(instanceId);
  }

  // Set a session (like Map.set)
  set(instanceId: string, sessionData: SessionData): void {
    this.claudeSessions.set(instanceId, sessionData);
  }

  // Get session data (like Map.get)
  get(instanceId: string): SessionData | undefined {
    return this.claudeSessions.get(instanceId);
  }

  // Delete a session (like Map.delete)
  delete(instanceId: string): boolean {
    return this.claudeSessions.delete(instanceId);
  }

  // Delete a session and its file
  deleteSessionAndFile(instanceId: string): boolean {
    const deleted = this.claudeSessions.delete(instanceId);
    if (deleted) {
      // Also remove the individual session file
      try {
        const workspacePath = this.store.get('workspacePath') as string || process.cwd();
        const sessionFile = join(workspacePath, '.claude', 'sessions', `${instanceId}.json`);
        if (existsSync(sessionFile)) {
          unlinkSync(sessionFile);
        }
      } catch (error) {
        console.error(`Failed to delete session file for ${instanceId}:`, error);
      }
      // Update manifest
      this.saveSessionsToDisk();
    }
    return deleted;
  }

  // Get preserved sessions that should auto-start
  getPreservedSessions(): SessionData[] {
    const preserved: SessionData[] = [];
    this.claudeSessions.forEach((session) => {
      if (session.shouldAutoStart) {
        preserved.push({ ...session });
      }
    });
    return preserved;
  }

  // Clear auto-start flag for a session
  clearAutoStart(instanceId: string): void {
    const session = this.claudeSessions.get(instanceId);
    if (session) {
      session.shouldAutoStart = false;
      this.saveSessionsToDisk();
    }
  }

  // Iterate over sessions (like Map.forEach)
  forEach(callback: (session: SessionData, instanceId: string) => void): void {
    this.claudeSessions.forEach(callback);
  }

  // Get size (like Map.size)
  get size(): number {
    return this.claudeSessions.size;
  }

  // Get all session keys
  keys(): IterableIterator<string> {
    return this.claudeSessions.keys();
  }

  // Mark sessions for auto-start
  markSessionsForAutoStart(instanceIds: Set<string>): void {
    instanceIds.forEach(instanceId => {
      const session = this.claudeSessions.get(instanceId);
      if (session) {
        session.shouldAutoStart = true;
        console.log(`Marked session ${instanceId} for auto-start`);
      }
    });
  }

  // Update session ID and maintain history
  updateSessionId(instanceId: string, newSessionId: string): void {
    const session = this.claudeSessions.get(instanceId);
    if (session) {
      // Initialize previousSessionIds if it doesn't exist
      if (!session.previousSessionIds) {
        session.previousSessionIds = [];
      }
      
      // Add current sessionId to history if it exists and is different
      if (session.sessionId && session.sessionId !== newSessionId) {
        // Add current session ID to the beginning
        session.previousSessionIds.unshift(session.sessionId);
        // Keep only the last 5 session IDs for fallback (remove oldest if needed)
        if (session.previousSessionIds.length > 5) {
          session.previousSessionIds.pop(); // Remove the oldest (last) element
        }
      }
      
      // Update to new session ID
      session.sessionId = newSessionId;
      this.saveSessionsToDisk();
      
      console.log(`Updated session ID for ${instanceId}: ${newSessionId} (history: ${session.previousSessionIds.length} previous IDs)`);
    }
  }

  // Get session with fallback IDs for restoration attempts
  getSessionWithFallbacks(instanceId: string): { current?: string; fallbacks: string[] } {
    const session = this.claudeSessions.get(instanceId);
    if (!session) {
      return { fallbacks: [] };
    }
    
    const fallbacks: string[] = [];
    
    // Add current session ID first
    if (session.sessionId) {
      fallbacks.push(session.sessionId);
    }
    
    // Add previous session IDs as fallbacks
    if (session.previousSessionIds && session.previousSessionIds.length > 0) {
      fallbacks.push(...session.previousSessionIds);
    }
    
    return {
      current: session.sessionId,
      fallbacks: fallbacks
    };
  }
}