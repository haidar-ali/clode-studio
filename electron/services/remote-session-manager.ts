/**
 * Session management for remote connections
 * Handles user sessions, authentication, and permissions
 */
import { randomBytes } from 'crypto';
import type { Socket } from 'socket.io';
import { Permission } from './remote-protocol.js';

export interface RemoteSession {
  id: string;
  userId: string;
  socketId: string;
  workspaceId?: string;
  permissions: Permission[];
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, any>;
}

export interface RemoteUser {
  id: string;
  username?: string;
  permissions: Permission[];
  workspaces: string[];
}

export class RemoteSessionManager {
  private sessions: Map<string, RemoteSession> = new Map();
  private socketToSession: Map<string, string> = new Map();
  private users: Map<string, RemoteUser> = new Map();
  
  constructor(
    private readonly authRequired: boolean = false,
    private readonly sessionTimeout: number = 3600000 // 1 hour
  ) {
    // Clean up expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
  }
  
  /**
   * Create a new session for a socket connection
   */
  async createSession(socket: Socket, authData?: any): Promise<RemoteSession> {
    // Generate session ID
    const sessionId = this.generateSessionId();
    
    // Determine user and permissions
    let userId: string;
    let permissions: Permission[];
    
    if (this.authRequired && authData) {
      // Validate authentication
      const user = await this.validateAuth(authData);
      if (!user) {
        throw new Error('Authentication failed');
      }
      userId = user.id;
      permissions = user.permissions;
    } else {
      // Anonymous user with default permissions
      userId = `anonymous-${socket.id}`;
      permissions = this.getDefaultPermissions();
    }
    
    // Create session
    const session: RemoteSession = {
      id: sessionId,
      userId,
      socketId: socket.id,
      permissions,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    // Store session
    this.sessions.set(sessionId, session);
    this.socketToSession.set(socket.id, sessionId);
    
    return session;
  }
  
  /**
   * Get session by socket ID
   */
  getSessionBySocket(socketId: string): RemoteSession | null {
    const sessionId = this.socketToSession.get(socketId);
    if (!sessionId) return null;
    
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last activity
      session.lastActivity = new Date();
    }
    
    return session || null;
  }
  
  /**
   * Get session by session ID
   */
  getSession(sessionId: string): RemoteSession | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last activity
      session.lastActivity = new Date();
    }
    return session || null;
  }
  
  /**
   * Check if session has permission
   */
  hasPermission(session: RemoteSession, permission: Permission): boolean {
    return session.permissions.includes(Permission.ADMIN) || 
           session.permissions.includes(permission);
  }
  
  /**
   * Update session workspace
   */
  setSessionWorkspace(sessionId: string, workspaceId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.workspaceId = workspaceId;
      session.lastActivity = new Date();
    }
  }
  
  /**
   * Remove session
   */
  removeSession(socketId: string): void {
    const sessionId = this.socketToSession.get(socketId);
    if (sessionId) {
      this.sessions.delete(sessionId);
      this.socketToSession.delete(socketId);
    }
  }
  
  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expired: string[] = [];
    
    this.sessions.forEach((session, id) => {
      if (now - session.lastActivity.getTime() > this.sessionTimeout) {
        expired.push(id);
      }
    });
    
    expired.forEach(id => {
      const session = this.sessions.get(id);
      if (session) {
        this.socketToSession.delete(session.socketId);
        this.sessions.delete(id);
      }
    });
    
    if (expired.length > 0) {
     
    }
  }
  
  /**
   * Validate authentication data
   */
  private async validateAuth(authData: any): Promise<RemoteUser | null> {
    // TODO: Implement actual authentication
    // For now, accept any token and return test user
    if (authData.token || authData.apiKey) {
      return {
        id: 'test-user-' + Date.now(),
        username: authData.username || 'Remote User',
        permissions: [
          Permission.FILE_READ,
          Permission.FILE_WRITE,
          Permission.TERMINAL_CREATE,
          Permission.TERMINAL_WRITE,
          Permission.CLAUDE_SPAWN,
          Permission.CLAUDE_CONTROL,
          Permission.WORKSPACE_MANAGE
        ],
        workspaces: []
      };
    }
    
    return null;
  }
  
  /**
   * Get default permissions for anonymous users
   */
  private getDefaultPermissions(): Permission[] {
    // In non-auth mode, grant most permissions except admin
    return [
      Permission.FILE_READ,
      Permission.FILE_WRITE,
      Permission.TERMINAL_CREATE,
      Permission.TERMINAL_WRITE,
      Permission.CLAUDE_SPAWN,
      Permission.CLAUDE_CONTROL,
      Permission.WORKSPACE_MANAGE
    ];
  }
  
  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }
  
  /**
   * Get all sessions for a user
   */
  getSessionsForUser(userId: string): RemoteSession[] {
    return Array.from(this.sessions.values()).filter(session => session.userId === userId);
  }
  
  /**
   * Get session stats
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter(
        s => Date.now() - s.lastActivity.getTime() < 300000 // Active in last 5 min
      ).length,
      users: new Set(Array.from(this.sessions.values()).map(s => s.userId)).size
    };
  }
}