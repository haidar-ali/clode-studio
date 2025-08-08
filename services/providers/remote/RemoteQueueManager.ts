/**
 * Remote Queue Manager
 * Manages offline queue for remote operations
 */
import type { Socket } from 'socket.io-client';
import type { IQueueManager, QueuedOperation, QueuePriority } from '../../interfaces/IQueueManager.js';
import { ConnectionManager, ConnectionState } from '../../connection-manager.js';

export class RemoteQueueManager implements IQueueManager {
  private queue: QueuedOperation[] = [];
  private processing: boolean = false;
  
  constructor(
    private getSocket: () => Socket | null,
    private connectionManager: ConnectionManager
  ) {
    // Process queue when connection is restored
    this.connectionManager.on('state:connected', () => {
      this.processQueue();
    });
  }
  
  async enqueue(operation: QueuedOperation): Promise<void> {
    // If connected and high priority, try to execute immediately
    if (this.connectionManager.isConnected() && operation.priority >= 2) {
      try {
        await this.executeOperation(operation);
        return;
      } catch (error) {
        console.warn('Failed to execute operation immediately, queuing:', error);
      }
    }
    
    // Add to queue
    this.queue.push({
      ...operation,
      timestamp: Date.now()
    });
    
    // Sort by priority and timestamp
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.timestamp - b.timestamp; // Older first
    });
    
    // Try to process if connected
    if (this.connectionManager.isConnected()) {
      this.processQueue();
    }
  }
  
  async flush(): Promise<void> {
    if (!this.connectionManager.isConnected()) {
      throw new Error('Cannot flush queue while offline');
    }
    
    await this.processQueue();
  }
  
  async clear(): Promise<void> {
    this.queue = [];
  }
  
  getQueuedOperations(): QueuedOperation[] {
    return [...this.queue];
  }
  
  getQueueSize(): number {
    return this.queue.length;
  }
  
  async retryOperation(operationId: string): Promise<void> {
    const operation = this.queue.find(op => op.id === operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found in queue`);
    }
    
    if (!this.connectionManager.isConnected()) {
      throw new Error('Cannot retry while offline');
    }
    
    await this.executeOperation(operation);
    
    // Remove from queue on success
    this.queue = this.queue.filter(op => op.id !== operationId);
  }
  
  /**
   * Process queued operations
   */
  private async processQueue(): Promise<void> {
    if (this.processing || !this.connectionManager.isConnected() || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    try {
      // Process operations in order
      while (this.queue.length > 0 && this.connectionManager.isConnected()) {
        const operation = this.queue[0];
        
        try {
          await this.executeOperation(operation);
          // Remove successful operation
          this.queue.shift();
        } catch (error) {
          console.error(`Failed to execute queued operation ${operation.id}:`, error);
          
          // Increment retry count
          operation.retryCount = (operation.retryCount || 0) + 1;
          
          // Remove if max retries exceeded
          if (operation.retryCount >= (operation.maxRetries || 3)) {
            console.error(`Operation ${operation.id} exceeded max retries, removing from queue`);
            this.queue.shift();
          } else {
            // Move to end of queue with same priority
            this.queue.shift();
            this.queue.push(operation);
          }
          
          // Stop processing on error to avoid cascading failures
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }
  
  /**
   * Execute a single operation
   */
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    const socket = this.getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    
    // Execute based on operation type
    switch (operation.type) {
      case 'file:write':
        await this.executeFileWrite(socket, operation);
        break;
      case 'claude:send':
        await this.executeClaudeSend(socket, operation);
        break;
      // Add more operation types as needed
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
  
  /**
   * Execute file write operation
   */
  private executeFileWrite(socket: Socket, operation: QueuedOperation): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.emit('file:write', {
        id: operation.id,
        payload: operation.data
      }, (response: any) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error?.message || 'File write failed'));
        }
      });
    });
  }
  
  /**
   * Execute Claude send operation
   */
  private executeClaudeSend(socket: Socket, operation: QueuedOperation): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.emit('claude:send', {
        id: operation.id,
        payload: operation.data
      }, (response: any) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error?.message || 'Claude send failed'));
        }
      });
    });
  }
}