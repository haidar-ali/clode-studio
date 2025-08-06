export default defineEventHandler(async (event) => {
  try {
    // Get desktop features from the remote connection
    const remoteConnection = global.__remoteConnection;
    
    if (!remoteConnection || !remoteConnection.socket?.connected) {
      console.debug('[API] /hooks/list - No remote connection available');
      return { hooks: [] };
    }
    
    // Request desktop features from the remote server
    const features = await new Promise((resolve, reject) => {
      const request = {
        id: `hooks-${Date.now()}`,
        payload: {}
      };
      
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);
      
      remoteConnection.socket.emit('desktop:features:get', request, (response: any) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error?.message || 'Request failed'));
        }
      });
    });
    
    // Extract hooks from features
    const hooks = (features as any)?.hooks || [];
    
    return {
      hooks: hooks.map((hook: any) => ({
        id: hook.id || Math.random().toString(36).substr(2, 9),
        event: hook.event,
        matcher: hook.matcher,
        command: hook.command,
        disabled: hook.disabled || false,
        description: hook.description
      }))
    };
  } catch (error) {
    console.error('[API] /hooks/list error:', error);
    return { hooks: [] };
  }
});