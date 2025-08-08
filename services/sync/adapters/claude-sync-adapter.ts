/**
 * Claude Sync Adapter
 * Synchronizes Claude conversation state
 */
import type { SyncableState } from '../sync-engine.js';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface ClaudeConversationState {
  conversationId: string;
  instanceId: string;
  messages: ClaudeMessage[];
  context: {
    workingDirectory: string;
    openFiles: string[];
    activeFile?: string;
  };
  metadata: {
    title?: string;
    personalityId?: string;
    createdAt: Date;
    lastActiveAt: Date;
  };
}

export class ClaudeSyncAdapter {
  private versionMap: Map<string, number> = new Map();
  
  /**
   * Convert Claude conversation to syncable format
   */
  toSyncable(conversation: ClaudeConversationState): SyncableState {
    const currentVersion = (this.versionMap.get(conversation.conversationId) || 0) + 1;
    this.versionMap.set(conversation.conversationId, currentVersion);
    
    return {
      id: conversation.conversationId,
      type: 'claude.conversation',
      version: currentVersion,
      lastModified: new Date(),
      data: conversation
    };
  }
  
  /**
   * Convert from syncable format
   */
  fromSyncable(syncable: SyncableState): ClaudeConversationState {
    const conversation = syncable.data as ClaudeConversationState;
    this.versionMap.set(conversation.conversationId, syncable.version);
    return conversation;
  }
  
  /**
   * Create checkpoint of conversation state
   */
  createCheckpoint(conversation: ClaudeConversationState): SyncableState {
    const checkpoint = this.toSyncable(conversation);
    checkpoint.type = 'claude.checkpoint';
    checkpoint.id = `checkpoint-${conversation.conversationId}-${Date.now()}`;
    return checkpoint;
  }
  
  /**
   * Merge conversation states (for conflict resolution)
   */
  merge(
    local: ClaudeConversationState,
    remote: ClaudeConversationState
  ): ClaudeConversationState {
    // Merge messages by timestamp
    const allMessages = [...local.messages, ...remote.messages];
    const uniqueMessages = this.deduplicateMessages(allMessages);
    
    return {
      conversationId: local.conversationId,
      instanceId: local.instanceId, // Keep local instance
      messages: uniqueMessages,
      context: {
        // Prefer local context as it reflects current state
        ...local.context,
        // But include any files from remote that we don't have
        openFiles: [...new Set([...local.context.openFiles, ...remote.context.openFiles])]
      },
      metadata: {
        ...remote.metadata, // Remote metadata might be more up-to-date
        lastActiveAt: new Date() // Update activity
      }
    };
  }
  
  /**
   * Deduplicate messages based on content and timestamp
   */
  private deduplicateMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
    const seen = new Set<string>();
    const unique: ClaudeMessage[] = [];
    
    // Sort by timestamp
    const sorted = messages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    for (const msg of sorted) {
      const key = `${msg.role}:${msg.content}:${new Date(msg.timestamp).getTime()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(msg);
      }
    }
    
    return unique;
  }
  
  /**
   * Get conversation summary for sync optimization
   */
  getSummary(conversation: ClaudeConversationState): {
    messageCount: number;
    lastMessageTime: Date;
    contextHash: string;
  } {
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    
    return {
      messageCount: conversation.messages.length,
      lastMessageTime: lastMessage ? new Date(lastMessage.timestamp) : new Date(0),
      contextHash: this.hashContext(conversation.context)
    };
  }
  
  /**
   * Hash context for comparison
   */
  private hashContext(context: ClaudeConversationState['context']): string {
    const contextString = JSON.stringify({
      workingDirectory: context.workingDirectory,
      openFiles: context.openFiles.sort(),
      activeFile: context.activeFile
    });
    
    // Simple hash function for demo
    let hash = 0;
    for (let i = 0; i < contextString.length; i++) {
      const char = contextString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}