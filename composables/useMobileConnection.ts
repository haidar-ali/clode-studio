/**
 * Mobile-optimized connection handler
 * Uses polling as primary transport for better iOS compatibility
 */
import { ref, readonly } from 'vue';
import { io, Socket } from 'socket.io-client';
import { remoteConnection } from '~/services/remote-client/RemoteConnectionSingleton';

interface ConnectionOptions {
  deviceToken: string;
  deviceId: string;
}

// Singleton connection for mobile
let mobileSocket: Socket | null = null;
const connectionState = ref<'disconnected' | 'connecting' | 'connected'>('disconnected');
const lastError = ref<string | null>(null);

export function useMobileConnection() {
  const connected = ref(false);
  const connecting = ref(false);
  const error = ref<string | null>(null);
  
  async function request(event: string, payload: any): Promise<any> {
    if (!mobileSocket || !connected.value) {
      throw new Error('Not connected');
    }
    
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}`;
      
      mobileSocket!.emit(event, { id: requestId, payload }, (response: any) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
  }
  
  async function connect(options: ConnectionOptions): Promise<boolean> {
   
    
    // Clean up any existing connection
    if (mobileSocket) {
     
      mobileSocket.disconnect();
      mobileSocket = null;
    }
    
    return new Promise((resolve) => {
      try {
        const serverUrl = `http://${window.location.hostname}:3789`;
       
        
        connecting.value = true;
        connectionState.value = 'connecting';
        
        // Create socket with mobile-optimized settings
       
        mobileSocket = io(serverUrl, {
          // Try websocket first, fall back to polling
          transports: ['websocket', 'polling'],
          // Allow upgrade from polling to websocket
          upgrade: true,
          // Authentication
          auth: {
            deviceToken: options.deviceToken,
            deviceId: options.deviceId
          },
          // Shorter timeout for iOS Safari
          timeout: 10000,  // iOS Safari often fails with long timeouts
          // Quick reconnection for mobile
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          // Force new connection
          forceNew: true,
          // Path
          path: '/socket.io/',
          // Additional mobile settings for iOS Safari
          closeOnBeforeunload: false,
          withCredentials: false,
          // iOS Safari specific settings
          rejectUnauthorized: false,  // iOS Safari is strict about certs
          secure: false,  // We're using http not https
          autoUnref: false  // Prevent iOS from killing the connection
        });
        
       
        
        // Connection success handler
        mobileSocket.on('connect', () => {
         
         
          connected.value = true;
          connecting.value = false;
          connectionState.value = 'connected';
          error.value = null;
          lastError.value = null;
          
          // Store in singleton so services can use it
          remoteConnection.setSocket(mobileSocket);
         
          
          // Debug: Listen for terminal:data events globally
          mobileSocket.on('terminal:data', (event: any) => {
           
          });
          
          // Debug: Check all events
          mobileSocket.onAny((eventName: string, ...args: any[]) => {
            if (eventName === 'terminal:data') {
             
            }
          });
          
          resolve(true);
        });
        
        // Connection ready handler
        mobileSocket.on('connection:ready', async (data) => {
         
          
          // Store session ID for service provider
          (window as any).__remoteSessionId = data.sessionId;
          
          // Request workspace information from desktop
          try {
            const workspace = await request('workspace:get', {});
           
            
            // Store workspace info for components to access
            if (workspace?.path) {
              (window as any).__remoteWorkspace = workspace;
            }
          } catch (err) {
            console.error('[MobileConnection] Failed to get workspace info:', err);
          }
        });
        
        // Error handler
        mobileSocket.on('connect_error', (err) => {
          console.error('[MobileConnection] Connection error:', err.message);
          console.error('[MobileConnection] Error type:', err.type);
          console.error('[MobileConnection] Error details:', {
            type: err.type,
            message: err.message,
            transport: mobileSocket?.io?.engine?.transport?.name
          });
          error.value = err.message;
          lastError.value = err.message;
          connecting.value = false;
          connectionState.value = 'disconnected';
          
          // Don't resolve false immediately - let it retry
          if (err.type === 'TransportError') {
           
          }
        });
        
        // Disconnect handler
        mobileSocket.on('disconnect', (reason) => {
         
          connected.value = false;
          connectionState.value = 'disconnected';
          
          if (reason === 'io server disconnect') {
            // Server disconnected us
            error.value = 'Server disconnected';
          }
        });
        
        // Set a timeout for connection
        setTimeout(() => {
          if (!connected.value) {
            console.error('[MobileConnection] Connection timeout');
            console.error('[MobileConnection] Socket state:', {
              connected: mobileSocket?.connected,
              disconnected: mobileSocket?.disconnected,
              transport: mobileSocket?.io?.engine?.transport?.name
            });
            error.value = 'Connection timeout';
            connecting.value = false;
            connectionState.value = 'disconnected';
            resolve(false);
          }
        }, 35000);
        
      } catch (err) {
        console.error('[MobileConnection] Exception:', err);
        error.value = err.message;
        connecting.value = false;
        connectionState.value = 'disconnected';
        resolve(false);
      }
    });
  }
  
  function getSocket(): Socket | null {
    return mobileSocket;
  }
  
  function disconnect() {
    if (mobileSocket) {
      mobileSocket.disconnect();
      mobileSocket = null;
      connected.value = false;
      connectionState.value = 'disconnected';
    }
  }
  
  return {
    connected: readonly(connected),
    connecting: readonly(connecting),
    error: readonly(error),
    connectionState: readonly(connectionState),
    connect,
    disconnect,
    request,
    getSocket
  };
}