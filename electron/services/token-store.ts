/**
 * Token store for validating remote connections
 * Stores valid tokens generated for QR codes and validates incoming connections
 */

export interface StoredToken {
  token: string;
  deviceId: string;
  deviceName: string;
  pairingCode: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsed?: Date;
  connectionCount: number;
}

export class TokenStore {
  private static instance: TokenStore;
  private tokens: Map<string, StoredToken> = new Map();
  private deviceTokens: Map<string, string[]> = new Map(); // deviceId -> tokens[]
  
  private constructor() {
    // Clean up expired tokens every 5 minutes
    setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
  }
  
  static getInstance(): TokenStore {
    if (!TokenStore.instance) {
      TokenStore.instance = new TokenStore();
    }
    return TokenStore.instance;
  }
  
  /**
   * Store a new token when QR code is generated
   */
  storeToken(
    token: string,
    deviceId: string,
    deviceName: string,
    pairingCode: string,
    expiresAt?: Date
  ): void {
    const storedToken: StoredToken = {
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
    
    
  }
  
  /**
   * Validate an incoming connection
   */
  validateConnection(
    token: string,
    deviceId: string,
    pairingCode?: string
  ): { valid: boolean; reason?: string; tokenInfo?: StoredToken } {
    
    
    
    
    
    
    // Check if token exists
    const storedToken = this.tokens.get(token);
    if (!storedToken) {
      
      for (const [key, value] of this.tokens.entries()) {
        
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
  getActiveConnections(): StoredToken[] {
    const now = new Date();
    return Array.from(this.tokens.values())
      .filter(token => token.lastUsed && now <= token.expiresAt)  // Changed > to <= to get NON-expired tokens
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
      recentConnections: tokens.filter(t => 
        t.lastUsed && (now.getTime() - t.lastUsed.getTime()) < 5 * 60 * 1000
      ).length
    };
  }
  
  /**
   * Revoke a token
   */
  revokeToken(token: string): boolean {
    const storedToken = this.tokens.get(token);
    if (!storedToken) return false;
    
    // Remove from main store
    this.tokens.delete(token);
    
    // Remove from device list
    const deviceTokens = this.deviceTokens.get(storedToken.deviceId);
    if (deviceTokens) {
      const filtered = deviceTokens.filter(t => t !== token);
      if (filtered.length > 0) {
        this.deviceTokens.set(storedToken.deviceId, filtered);
      } else {
        this.deviceTokens.delete(storedToken.deviceId);
      }
    }
    
    
    return true;
  }
  
  /**
   * Clean up expired tokens
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    let removed = 0;
    
    for (const [token, storedToken] of this.tokens.entries()) {
      if (now > storedToken.expiresAt) {
        this.revokeToken(token);
        removed++;
      }
    }
    
    if (removed > 0) {
      
    }
  }
  
  /**
   * Clear all tokens (for testing/reset)
   */
  clearAll(): void {
    this.tokens.clear();
    this.deviceTokens.clear();
    
  }
}