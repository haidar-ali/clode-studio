/**
 * Session management for remote connections
 * Handles user sessions, authentication, and permissions
 */
import { randomBytes } from 'crypto';
import { Permission } from './remote-protocol.js';
import { TokenStore } from './token-store.js';
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
        let deviceId;
        let deviceName;
        let token;
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
        }
        else {
            // Anonymous user with default permissions (only if auth not required)
            if (this.authRequired) {
                throw new Error('Authentication required');
            }
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
            lastActivity: new Date(),
            deviceId,
            deviceName,
            token
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
     * Get all sessions
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
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
        }
    }
    /**
     * Validate authentication data
     */
    async validateAuth(authData) {
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
            return {
                user: null,
                error: validation.reason
            };
        }
        // Create user with appropriate permissions
        const user = {
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
     * Get all sessions for a user
     */
    getSessionsForUser(userId) {
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
            activeSessions: sessions.filter(s => now - s.lastActivity.getTime() < 300000 // Active in last 5 min
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
    getConnections() {
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
