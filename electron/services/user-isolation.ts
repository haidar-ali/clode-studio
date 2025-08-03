/**
 * User Isolation Service for Claude Instances
 * Ensures each user has their own isolated Claude instances
 */
import type { RemoteSession } from '../../electron/services/remote-session-manager.js';

export interface UserClaudeInstance {
  instanceId: string;
  userId: string;
  sessionId: string;
  personalityId?: string;
  workingDirectory: string;
  instanceName?: string;
  createdAt: Date;
  lastActiveAt: Date;
  metadata?: Record<string, any>;
}

export interface UserQuota {
  maxInstances: number;
  maxConcurrentInstances: number;
  maxSessionDuration?: number; // in milliseconds
}

export class UserIsolationService {
  // User ID -> Set of instance IDs
  private userInstances: Map<string, Set<string>> = new Map();
  
  // Instance ID -> UserClaudeInstance
  private instanceRegistry: Map<string, UserClaudeInstance> = new Map();
  
  // User ID -> UserQuota
  private userQuotas: Map<string, UserQuota> = new Map();
  
  // Default quotas
  private defaultQuota: UserQuota = {
    maxInstances: 10,
    maxConcurrentInstances: 5,
    maxSessionDuration: 3600000 * 4 // 4 hours
  };
  
  constructor() {
    // Clean up expired instances periodically
    setInterval(() => this.cleanupExpiredInstances(), 60000); // Every minute
  }
  
  /**
   * Register a new Claude instance for a user
   */
  registerInstance(
    userId: string, 
    instanceId: string, 
    session: RemoteSession,
    metadata?: {
      personalityId?: string;
      workingDirectory: string;
      instanceName?: string;
      workspaceId?: string;
    }
  ): UserClaudeInstance {
    // Check quota
    const quota = this.getUserQuota(userId);
    const userInstanceSet = this.userInstances.get(userId) || new Set();
    
    if (userInstanceSet.size >= quota.maxConcurrentInstances) {
      throw new Error(`User ${userId} has reached maximum concurrent instances limit (${quota.maxConcurrentInstances})`);
    }
    
    // Create instance record
    const instance: UserClaudeInstance = {
      instanceId,
      userId,
      sessionId: session.id,
      personalityId: metadata?.personalityId,
      workingDirectory: metadata?.workingDirectory || process.env.HOME || '/',
      instanceName: metadata?.instanceName,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      metadata: metadata
    };
    
    // Register instance
    this.instanceRegistry.set(instanceId, instance);
    
    // Add to user's instances
    if (!this.userInstances.has(userId)) {
      this.userInstances.set(userId, new Set());
    }
    this.userInstances.get(userId)!.add(instanceId);
    
    console.log(`Registered Claude instance ${instanceId} for user ${userId}`);
    return instance;
  }
  
  /**
   * Unregister a Claude instance
   */
  unregisterInstance(instanceId: string): void {
    const instance = this.instanceRegistry.get(instanceId);
    if (!instance) return;
    
    // Remove from user's instances
    const userInstanceSet = this.userInstances.get(instance.userId);
    if (userInstanceSet) {
      userInstanceSet.delete(instanceId);
      if (userInstanceSet.size === 0) {
        this.userInstances.delete(instance.userId);
      }
    }
    
    // Remove from registry
    this.instanceRegistry.delete(instanceId);
    
    console.log(`Unregistered Claude instance ${instanceId} for user ${instance.userId}`);
  }
  
  /**
   * Get all instances for a user
   */
  getUserInstances(userId: string): UserClaudeInstance[] {
    const instanceIds = this.userInstances.get(userId);
    if (!instanceIds) return [];
    
    return Array.from(instanceIds)
      .map(id => this.instanceRegistry.get(id))
      .filter((inst): inst is UserClaudeInstance => inst !== undefined);
  }
  
  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): UserClaudeInstance | undefined {
    return this.instanceRegistry.get(instanceId);
  }
  
  /**
   * Check if user owns an instance
   */
  userOwnsInstance(userId: string, instanceId: string): boolean {
    const instance = this.instanceRegistry.get(instanceId);
    return instance?.userId === userId;
  }
  
  /**
   * Update instance activity
   */
  updateInstanceActivity(instanceId: string): void {
    const instance = this.instanceRegistry.get(instanceId);
    if (instance) {
      instance.lastActiveAt = new Date();
    }
  }
  
  /**
   * Get or set user quota
   */
  getUserQuota(userId: string): UserQuota {
    return this.userQuotas.get(userId) || this.defaultQuota;
  }
  
  setUserQuota(userId: string, quota: Partial<UserQuota>): void {
    const current = this.getUserQuota(userId);
    this.userQuotas.set(userId, { ...current, ...quota });
  }
  
  /**
   * Clean up all instances for a user
   */
  cleanupUserInstances(userId: string): string[] {
    const instanceIds = this.userInstances.get(userId);
    if (!instanceIds) return [];
    
    const cleaned: string[] = [];
    instanceIds.forEach(instanceId => {
      this.unregisterInstance(instanceId);
      cleaned.push(instanceId);
    });
    
    return cleaned;
  }
  
  /**
   * Clean up all instances for a session
   */
  cleanupSessionInstances(sessionId: string): string[] {
    const cleaned: string[] = [];
    
    this.instanceRegistry.forEach((instance, instanceId) => {
      if (instance.sessionId === sessionId) {
        this.unregisterInstance(instanceId);
        cleaned.push(instanceId);
      }
    });
    
    return cleaned;
  }
  
  /**
   * Clean up expired instances
   */
  private cleanupExpiredInstances(): void {
    const now = Date.now();
    const expired: string[] = [];
    
    this.instanceRegistry.forEach((instance, instanceId) => {
      const quota = this.getUserQuota(instance.userId);
      if (quota.maxSessionDuration) {
        const age = now - instance.createdAt.getTime();
        if (age > quota.maxSessionDuration) {
          expired.push(instanceId);
        }
      }
    });
    
    if (expired.length > 0) {
      console.log(`Cleaning up ${expired.length} expired Claude instances`);
      expired.forEach(id => this.unregisterInstance(id));
    }
  }
  
  /**
   * Get usage statistics
   */
  getStats() {
    const userStats = new Map<string, {
      totalInstances: number;
      activeInstances: number;
    }>();
    
    this.userInstances.forEach((instances, userId) => {
      const activeInstances = Array.from(instances)
        .map(id => this.instanceRegistry.get(id))
        .filter(inst => inst && (Date.now() - inst.lastActiveAt.getTime() < 300000)) // Active in last 5 min
        .length;
      
      userStats.set(userId, {
        totalInstances: instances.size,
        activeInstances
      });
    });
    
    return {
      totalUsers: this.userInstances.size,
      totalInstances: this.instanceRegistry.size,
      userStats: Object.fromEntries(userStats)
    };
  }
  
  /**
   * Migrate instance to new session (for device switching)
   */
  migrateInstance(instanceId: string, newSession: RemoteSession): void {
    const instance = this.instanceRegistry.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    
    // Verify user ownership
    if (instance.userId !== newSession.userId) {
      throw new Error(`User ${newSession.userId} does not own instance ${instanceId}`);
    }
    
    // Update session
    instance.sessionId = newSession.id;
    instance.lastActiveAt = new Date();
    
    console.log(`Migrated Claude instance ${instanceId} to new session ${newSession.id}`);
  }
  
  /**
   * Get workspace isolation info
   */
  getWorkspaceIsolation(workspaceId: string): {
    users: string[];
    instances: UserClaudeInstance[];
  } {
    const users = new Set<string>();
    const instances: UserClaudeInstance[] = [];
    
    this.instanceRegistry.forEach(instance => {
      if (instance.metadata?.workspaceId === workspaceId) {
        users.add(instance.userId);
        instances.push(instance);
      }
    });
    
    return {
      users: Array.from(users),
      instances
    };
  }
}

// Export singleton instance
export const userIsolation = new UserIsolationService();