import { ref, readonly, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { remoteConnection } from '~/services/remote-client/RemoteConnectionSingleton';

interface ConnectionOptions {
  deviceToken: string;
  deviceId: string;
  pairingCode?: string;
}

export function useRemoteConnection() {
  // Check if we already have a socket in the singleton
  const existingSocket = remoteConnection.getSocket();
  
  const socket = ref<Socket | null>(existingSocket);
  const connected = ref(existingSocket?.connected || false);
  const connecting = ref(false);
  const error = ref<string | null>(null);
  const requestId = ref(0);
  const debugInfo = ref({
    serverUrl: '',
    transport: '',
    errorType: '',
    errorDetails: ''
  });
  
  async function connect(options: ConnectionOptions) {
    // Check if we already have a connection in the singleton
    const existingSocket = remoteConnection.getSocket();
    if (existingSocket && existingSocket.connected) {
      console.log('[useRemoteConnection] Reusing existing socket connection');
      socket.value = existingSocket;
      connected.value = true;
      connecting.value = false;
      return;
    }
    
    if (connecting.value || connected.value) {
      console.log('[useRemoteConnection] Already connecting or connected');
      return;
    }
    
    connecting.value = true;
    error.value = null;
    
    try {
      // Get server URL - use the same host as the web UI but on port 3789
      let serverUrl = import.meta.env.VITE_REMOTE_SERVER_URL;
      
      if (!serverUrl) {
        // If no env var, construct URL from current location
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        serverUrl = `${protocol}//${hostname}:3789`;
      }
      
     
      debugInfo.value.serverUrl = serverUrl;
      
      socket.value = io(serverUrl, {
        transports: ['polling', 'websocket'], // Start with polling for better mobile compatibility
        auth: {
          token: options.deviceToken,  // Server expects 'token' not 'deviceToken'
          deviceId: options.deviceId,
          pairing: options.pairingCode  // Include pairing code if available
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000, // Increase timeout for mobile networks
        // Don't force new connection - reuse if available
        forceNew: false,
        // Better compatibility with mobile
        upgrade: true,
        rememberUpgrade: true
      });
      
      // Store in singleton
      remoteConnection.setSocket(socket.value);
      
      // Set up event handlers
      socket.value.on('connect', () => {
        connected.value = true;
        connecting.value = false;
       
      });
      
      socket.value.on('connection:ready', async (data) => {
       
        
        // Check if socket still exists before making request
        if (!socket.value || !connected.value) {
          console.warn('Socket disconnected before workspace request');
          return;
        }
        
        // Request workspace information from desktop
        try {
          const workspace = await request('workspace:get', {});
         
          
          // Store workspace info in a way components can access
          // Since we can't emit to ourselves, we'll use a different approach
          if (workspace?.path) {
            // Store in window for immediate access
            (window as any).__remoteWorkspace = workspace;
          }
        } catch (err) {
          console.error('Failed to get workspace info:', err);
        }
      });
      
      socket.value.on('disconnect', () => {
        connected.value = false;
        console.log('Disconnected from remote server');
      });
      
      // Handle server-initiated disconnection
      socket.value.on('server:disconnected', (data: { reason: string; message: string }) => {
        console.log('Server disconnected:', data);
        error.value = data.message || 'Disconnected by server';
        
        // Show alert to user
        if (typeof window !== 'undefined') {
          alert(data.message || 'Your connection has been terminated by the server');
          
          // Reload the page to show the connection modal again
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      });
      
      socket.value.on('connect_error', (err) => {
        error.value = err.message;
        connecting.value = false;
        console.error('Connection error:', err);
        console.error('Error type:', err.type);
        
        // Update debug info
        debugInfo.value.errorType = err.type || 'Unknown';
        debugInfo.value.transport = socket.value?.io?.engine?.transport?.name || 'None';
        debugInfo.value.errorDetails = JSON.stringify({
          message: err.message,
          type: err.type,
          serverUrl: serverUrl,
          transport: socket.value?.io?.engine?.transport?.name
        });
        
        console.error('Error details:', debugInfo.value.errorDetails);
      });
      
      // Additional error handlers for mobile debugging
      socket.value.on('error', (err) => {
        console.error('Socket error:', err);
      });
      
      socket.value.io.on('reconnect_error', (err) => {
        console.error('Reconnect error:', err);
      });
      
      socket.value.io.on('reconnect_failed', () => {
        console.error('Reconnect failed after all attempts');
      });
      
    } catch (err) {
      error.value = (err as Error).message;
      connecting.value = false;
      console.error('Failed to create connection:', err);
    }
  }
  
  async function request(event: string, payload: any): Promise<any> {
    if (!socket.value || !connected.value) {
      throw new Error('Not connected');
    }
    
    return new Promise((resolve, reject) => {
      const request = {
        id: `req-${++requestId.value}`,
        payload
      };
      
      if (!socket.value) {
        reject(new Error('Socket has been destroyed'));
        return;
      }
      
      socket.value.emit(event, request, (response: any) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
  }
  
  function disconnect() {
    if (socket.value) {
      // Remove all listeners before disconnecting
      socket.value.removeAllListeners();
      socket.value.disconnect();
      socket.value = null;
      connected.value = false;
      // Don't clear the singleton socket - other components might still be using it
      // remoteConnection.setSocket(null);
    }
  }
  
  // Clean up on unmount - but don't disconnect the shared socket
  onUnmounted(() => {
    // Only clear local references, not the shared connection
    // The socket in the singleton should persist across component lifecycles
    socket.value = null;
    connected.value = false;
    connecting.value = false;
    error.value = null;
  });
  
  return {
    socket: readonly(socket),
    connected: readonly(connected),
    connecting: readonly(connecting),
    error: readonly(error),
    debugInfo: readonly(debugInfo),
    connect,
    request,
    disconnect
  };
}