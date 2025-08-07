/**
 * Token store for validating remote connections
 * Stores valid tokens generated for QR codes and validates incoming connections
 */
export class TokenStore {
    static instance;
    tokens = new Map();
    deviceTokens = new Map(); // deviceId -> tokens[]
    constructor() {
        // Clean up expired tokens every 5 minutes
        setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
    }
    static getInstance() {
        if (!TokenStore.instance) {
            TokenStore.instance = new TokenStore();
        }
        return TokenStore.instance;
    }
    /**
     * Store a new token when QR code is generated
     */
    storeToken(token, deviceId, deviceName, pairingCode, expiresAt) {
        const storedToken = {
            token,
            deviceId,
            deviceName,
            pairingCode,
            createdAt: new Date(),
            expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
            connectionCount: 0
        };
        this.tokens.set(token, storedToken);
        // Track tokens by device
        const deviceTokenList = this.deviceTokens.get(deviceId) || [];
        deviceTokenList.push(token);
        this.deviceTokens.set(deviceId, deviceTokenList);
        console.log(`[TokenStore] Stored token for device ${deviceName} (${deviceId})`);
    }
    /**
     * Validate an incoming connection
     */
    validateConnection(token, deviceId, pairingCode) {
        console.log(`[TokenStore] Validating connection:`);
        console.log(`  Token: ${token?.substring(0, 8)}...`);
        console.log(`  DeviceId: ${deviceId}`);
        console.log(`  PairingCode: ${pairingCode}`);
        console.log(`  Stored tokens: ${this.tokens.size}`);
        // Check if token exists
        const storedToken = this.tokens.get(token);
        if (!storedToken) {
            console.log(`[TokenStore] Token not found in store. Available tokens:`);
            for (const [key, value] of this.tokens.entries()) {
                console.log(`  - ${key.substring(0, 8)}... for device ${value.deviceId}`);
            }
            return { valid: false, reason: 'Invalid token' };
        }
        // Check if token has expired
        if (new Date() > storedToken.expiresAt) {
            return { valid: false, reason: 'Token expired' };
        }
        // Check if deviceId matches
        if (storedToken.deviceId !== deviceId) {
            return { valid: false, reason: 'Device ID mismatch' };
        }
        // Check pairing code if provided
        if (pairingCode && storedToken.pairingCode !== pairingCode) {
            return { valid: false, reason: 'Invalid pairing code' };
        }
        // Update usage info
        storedToken.lastUsed = new Date();
        storedToken.connectionCount++;
        return { valid: true, tokenInfo: storedToken };
    }
    /**
     * Get all active connections
     */
    getActiveConnections() {
        const now = new Date();
        return Array.from(this.tokens.values())
            .filter(token => token.lastUsed && now <= token.expiresAt) // Changed > to <= to get NON-expired tokens
            .sort((a, b) => (b.lastUsed?.getTime() || 0) - (a.lastUsed?.getTime() || 0));
    }
    /**
     * Get connection stats
     */
    getStats() {
        const now = new Date();
        const tokens = Array.from(this.tokens.values());
        return {
            totalTokens: tokens.length,
            activeTokens: tokens.filter(t => t.lastUsed && now <= t.expiresAt).length,
            expiredTokens: tokens.filter(t => now > t.expiresAt).length,
            uniqueDevices: this.deviceTokens.size,
            recentConnections: tokens.filter(t => t.lastUsed && (now.getTime() - t.lastUsed.getTime()) < 5 * 60 * 1000).length
        };
    }
    /**
     * Revoke a token
     */
    revokeToken(token) {
        const storedToken = this.tokens.get(token);
        if (!storedToken)
            return false;
        // Remove from main store
        this.tokens.delete(token);
        // Remove from device list
        const deviceTokens = this.deviceTokens.get(storedToken.deviceId);
        if (deviceTokens) {
            const filtered = deviceTokens.filter(t => t !== token);
            if (filtered.length > 0) {
                this.deviceTokens.set(storedToken.deviceId, filtered);
            }
            else {
                this.deviceTokens.delete(storedToken.deviceId);
            }
        }
        console.log(`[TokenStore] Revoked token for device ${storedToken.deviceName}`);
        return true;
    }
    /**
     * Clean up expired tokens
     */
    cleanupExpiredTokens() {
        const now = new Date();
        let removed = 0;
        for (const [token, storedToken] of this.tokens.entries()) {
            if (now > storedToken.expiresAt) {
                this.revokeToken(token);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[TokenStore] Cleaned up ${removed} expired tokens`);
        }
    }
    /**
     * Clear all tokens (for testing/reset)
     */
    clearAll() {
        this.tokens.clear();
        this.deviceTokens.clear();
        console.log('[TokenStore] Cleared all tokens');
    }
}
