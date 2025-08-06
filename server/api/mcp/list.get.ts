export default defineEventHandler(async (event) => {
  try {
    // Get desktop features from the remote connection
    const remoteConnection = global.__remoteConnection;
    
    if (!remoteConnection || !remoteConnection.socket?.connected) {
      console.debug('[API] /mcp/list - No remote connection available');
      return { servers: [] };
    }
    
    // Request desktop features from the remote server
    const features = await new Promise((resolve, reject) => {
      const request = {
        id: `mcp-${Date.now()}`,
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
    
    // Extract MCP servers from features
    const servers = (features as any)?.mcp?.servers || [];
    
    return { servers };
  } catch (error) {
    console.error('[API] /mcp/list error:', error);
    return { servers: [] };
  }
});