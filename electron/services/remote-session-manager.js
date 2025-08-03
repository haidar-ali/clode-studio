/**
 * Session management for remote connections
 * Handles user sessions, authentication, and permissions
 */
import { randomBytes } from 'crypto';
import { Permission } from './remote-protocol.js';
export class RemoteSessionManager {
    authRequired;
    sessionTimeout;
    sessions = new Map();
    socketToSession = new Map();
    users = new Map();
    constructor(authRequired = false, sessionTimeout = 3600000 // 1 hour
    ) {
        this.authRequired = authRequired;
        this.sessionTimeout = sessionTimeout;
        // Clean up expired sessions periodically
        setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
    }
    /**
     * Create a new session for a socket connection
     */
    async createSession(socket, authData) {
        // Generate session ID
        const sessionId = this.generateSessionId();
        // Determine user and permissions
        let userId;
        let permissions;
        if (this.authRequired && authData) {
            // Validate authentication
            const user = await this.validateAuth(authData);
            if (!user) {
                throw new Error('Authentication failed');
            }
            userId = user.id;
            permissions = user.permissions;
        }
        else {
            // Anonymous user with default permissions
            userId = `anonymous-${socket.id}`;
            permissions = this.getDefaultPermissions();
        }
        // Create session
        const session = {
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
    getSessionBySocket(socketId) {
        const sessionId = this.socketToSession.get(socketId);
        if (!sessionId)
            return null;
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
    getSession(sessionId) {
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
    hasPermission(session, permission) {
        return session.permissions.includes(Permission.ADMIN) ||
            session.permissions.includes(permission);
    }
    /**
     * Update session workspace
     */
    setSessionWorkspace(sessionId, workspaceId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.workspaceId = workspaceId;
            session.lastActivity = new Date();
        }
    }
    /**
     * Remove session
     */
    removeSession(socketId) {
        const sessionId = this.socketToSession.get(socketId);
        if (sessionId) {
            this.sessions.delete(sessionId);
            this.socketToSession.delete(socketId);
        }
    }
    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const expired = [];
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
            console.log(`Cleaned up ${expired.length} expired sessions`);
        }
    }
    /**
     * Validate authentication data
     */
    async validateAuth(authData) {
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
    getDefaultPermissions() {
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
    generateSessionId() {
        return randomBytes(32).toString('hex');
    }
    /**
     * Get session stats
     */
    getStats() {
        return {
            totalSessions: this.sessions.size,
            activeSessions: Array.from(this.sessions.values()).filter(s => Date.now() - s.lastActivity.getTime() < 300000 // Active in last 5 min
            ).length,
            users: new Set(Array.from(this.sessions.values()).map(s => s.userId)).size
        };
    }
}
