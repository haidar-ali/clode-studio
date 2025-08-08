/**
 * Session management for remote connections
 * Handles user sessions, authentication, and permissions
 */
import { randomBytes } from 'crypto';
import type { Socket } from 'socket.io';
import { Permission } from './remote-protocol.js';
import { TokenStore } from './token-store.js';

export interface RemoteSession {
  id: string;
  userId: string;
  socketId: string;
  workspaceId?: string;
  permissions: Permission[];
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, any>;
  deviceId?: string;
  deviceName?: string;
  token?: string;
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
    let deviceId: string | undefined;
    let deviceName: string | undefined;
    let token: string | undefined;
    
    if (authData && (authData.token || authData.deviceId)) {
      // Validate authentication with token store
      const validation = await this.validateAuth(authData);
      if (!validation.user) {
        throw new Error(validation.error || 'Authentication failed');
      }
      userId = validation.user.id;
      permissions = validation.user.permissions;
      deviceId = validation.deviceId;
      deviceName = validation.deviceName;
      token = validation.token;
    } else {
      // Anonymous user with default permissions (only if auth not required)
      if (this.authRequired) {
        throw new Error('Authentication required');
      }
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
      lastActivity: new Date(),
      deviceId,
      deviceName,
      token
    };
    
    // Store session
    this.sessions.set(sessionId, session);
    this.socketToSession.set(socket.id, sessionId);
    
    console.log(`[SessionManager] Created session for ${deviceName || userId} (${deviceId || 'anonymous'})`);
    
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
   * Get all sessions
   */
  getAllSessions(): RemoteSession[] {
    return Array.from(this.sessions.values());
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
  private async validateAuth(authData: any): Promise<{
    user: RemoteUser | null;
    error?: string;
    deviceId?: string;
    deviceName?: string;
    token?: string;
  }> {
    const tokenStore = TokenStore.getInstance();
    
    // Extract credentials from auth data
    const token = authData.token;
    const deviceId = authData.deviceId;
    const pairingCode = authData.pairing || authData.pairingCode;
    
    // Validate required fields
    if (!token || !deviceId) {
      return { 
        user: null, 
        error: 'Missing required authentication fields (token and deviceId)' 
      };
    }
    
    // Validate token with token store
    const validation = tokenStore.validateConnection(token, deviceId, pairingCode);
    
    if (!validation.valid) {
      console.log(`[SessionManager] Authentication failed: ${validation.reason}`);
      return { 
        user: null, 
        error: validation.reason 
      };
    }
    
    // Create user with appropriate permissions
    const user: RemoteUser = {
      id: `device-${deviceId}`,
      username: validation.tokenInfo?.deviceName || 'Remote Device',
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
    
    return {
      user,
      deviceId,
      deviceName: validation.tokenInfo?.deviceName,
      token
    };
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
    const sessions = Array.from(this.sessions.values());
    const now = Date.now();
    
    return {
      totalSessions: this.sessions.size,
      activeSessions: sessions.filter(
        s => now - s.lastActivity.getTime() < 300000 // Active in last 5 min
      ).length,
      users: new Set(sessions.map(s => s.userId)).size,
      devices: sessions.filter(s => s.deviceId).map(s => ({
        deviceId: s.deviceId,
        deviceName: s.deviceName,
        lastActivity: s.lastActivity,
        userId: s.userId
      }))
    };
  }
  
  /**
   * Get detailed connection info
   */
  getConnections(): Array<{
    sessionId: string;
    deviceName: string;
    deviceId: string;
    token?: string;
    connectedAt: Date;
    lastActivity: Date;
    isActive: boolean;
  }> {
    const now = Date.now();
    return Array.from(this.sessions.values())
      .filter(s => s.deviceId) // Only show authenticated connections
      .map(s => ({
        sessionId: s.id,
        deviceName: s.deviceName || 'Unknown Device',
        deviceId: s.deviceId || 'anonymous',
        token: s.token,
        connectedAt: s.createdAt,
        lastActivity: s.lastActivity,
        isActive: now - s.lastActivity.getTime() < 300000
      }));
  }
}