/**
 * Singleton for managing the remote Socket.IO connection
 * Ensures only one connection is used across all services
 */
import { ref } from 'vue';
import type { Socket } from 'socket.io-client';

class RemoteConnectionSingleton {
  private static instance: RemoteConnectionSingleton;
  private socketRef = ref<Socket | null>(null);
  
  private constructor() {}
  
  static getInstance(): RemoteConnectionSingleton {
    if (!RemoteConnectionSingleton.instance) {
      RemoteConnectionSingleton.instance = new RemoteConnectionSingleton();
    }
    return RemoteConnectionSingleton.instance;
  }
  
  setSocket(socket: Socket | null) {
    // Don't override if we already have a connected socket
    if (this.socketRef.value?.connected && socket !== this.socketRef.value) {
      
      return;
    }
    this.socketRef.value = socket;
  }
  
  getSocket(): Socket | null {
    return this.socketRef.value;
  }
  
  isConnected(): boolean {
    return this.socketRef.value?.connected || false;
  }
}

export const remoteConnection = RemoteConnectionSingleton.getInstance();