/**
 * Desktop queue manager implementation
 * Handles offline operations using SQLite queue
 */
import type {
  IQueueManager,
  QueuedOperation,
  OperationType,
  QueuePriority,
  QueueConfig
} from '../../interfaces';
import type { IStorageService } from '../../interfaces';

export class DesktopQueueManager implements IQueueManager {
  private online: boolean = true;
  private statusListeners: Array<(online: boolean) => void> = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private config: Required<QueueConfig>;
  
  constructor(
    private storage: IStorageService,
    config?: QueueConfig
  ) {
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 5000,
      batchSize: config?.batchSize ?? 10,
      processInterval: config?.processInterval ?? 30000
    };
    
    // Start monitoring online status
    this.startOnlineMonitoring();
    
    // Start queue processing if online
    if (this.online) {
      this.startProcessing();
    }
  }
  
  async enqueue(operation: QueuedOperation): Promise<void> {
    // If online and high priority, try to execute immediately
    if (this.online && operation.priority >= QueuePriority.HIGH) {
      try {
        await this.executeOperation(operation);
        return;
      } catch (error) {
        // Fall through to queue it
       
      }
    }
    
    // Queue the operation
    await this.storage.addToSyncQueue({
      type: operation.type,
      data: operation.payload,
      priority: operation.priority
    });
  }
  
  async dequeue(): Promise<QueuedOperation | null> {
    const item = await this.storage.getNextSyncItem();
    if (!item) return null;
    
    return {
      id: item.id,
      type: item.action_type as OperationType,
      payload: item.action_data,
      priority: item.priority,
      retryCount: item.retry_count || 0,
      createdAt: new Date(item.created_at),
      lastAttempt: item.attempted_at ? new Date(item.attempted_at) : undefined,
      error: item.error_message
    };
  }
  
  async peek(): Promise<QueuedOperation | null> {
    // For now, we'll dequeue and re-queue
    // In a real implementation, we'd add a peek method to storage
    const item = await this.dequeue();
    if (item && item.id) {
      // Re-queue it
      await this.storage.updateSyncItemStatus(item.id, 'pending');
    }
    return item;
  }
  
  async getQueueSize(): Promise<number> {
    return await this.storage.getPendingSyncCount();
  }
  
  async getFailedOperations(): Promise<QueuedOperation[]> {
    // This would need a new storage method to get failed items
    // For now, return empty array
    return [];
  }
  
  async processQueue(): Promise<void> {
    if (!this.online) {
     
      return;
    }
    
    const queueSize = await this.getQueueSize();
    if (queueSize === 0) return;
    
   
    
    for (let i = 0; i < this.config.batchSize; i++) {
      const operation = await this.dequeue();
      if (!operation) break;
      
      try {
        await this.executeOperation(operation);
        
        // Successfully executed - mark as completed
        if (operation.id) {
          await this.storage.updateSyncItemStatus(operation.id, 'completed');
        }
      } catch (error) {
        console.error('Failed to process operation:', error);
        
        if (operation.id) {
          const retryCount = (operation.retryCount || 0) + 1;
          
          if (retryCount < this.config.maxRetries) {
            // Update retry count and re-queue
            await this.storage.updateSyncItemStatus(operation.id, 'pending');
          } else {
            // Mark as failed
            await this.storage.updateSyncItemStatus(operation.id, 'failed');
          }
        }
      }
    }
  }
  
  async retryOperation(operationId: number): Promise<void> {
    await this.storage.updateSyncItemStatus(operationId, 'pending');
    
    if (this.online) {
      await this.processQueue();
    }
  }
  
  async clearOperation(operationId: number): Promise<void> {
    // Mark as completed to remove from active queue
    await this.storage.updateSyncItemStatus(operationId, 'completed');
  }
  
  isOnline(): boolean {
    return this.online;
  }
  
  setOnlineStatus(online: boolean): void {
    if (this.online === online) return;
    
    this.online = online;
    
    // Notify listeners
    this.statusListeners.forEach(listener => listener(online));
    
    if (online) {
     
      this.startProcessing();
      // Process immediately
      this.processQueue().catch(console.error);
    } else {
     
      this.stopProcessing();
    }
  }
  
  onStatusChange(callback: (online: boolean) => void): void {
    this.statusListeners.push(callback);
  }
  
  private startOnlineMonitoring(): void {
    // Monitor network status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.setOnlineStatus(true));
      window.addEventListener('offline', () => this.setOnlineStatus(false));
      
      // Initial status
      this.online = navigator.onLine;
    }
  }
  
  private startProcessing(): void {
    if (this.processingInterval) return;
    
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(console.error);
    }, this.config.processInterval);
  }
  
  private stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
  
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    // This is where we'd execute the actual operation
    // For now, just log it
   
    
    // In the real implementation, this would:
    // 1. Route to the appropriate service based on operation type
    // 2. Execute the operation
    // 3. Handle the response
    
    switch (operation.type) {
      case 'file_upload':
        // await this.fileService.uploadToRemote(operation.payload);
        break;
      case 'claude_message':
        // await this.claudeService.sendToRemote(operation.payload);
        break;
      // etc...
    }
  }
  
  dispose(): void {
    this.stopProcessing();
    this.statusListeners = [];
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', () => this.setOnlineStatus(true));
      window.removeEventListener('offline', () => this.setOnlineStatus(false));
    }
  }
}