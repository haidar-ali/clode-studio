export default defineEventHandler(async (event) => {
  try {
    // Get desktop features from the remote connection
    const remoteConnection = global.__remoteConnection;
    
    if (!remoteConnection || !remoteConnection.socket?.connected) {
      console.debug('[API] /commands/list - No remote connection available');
      return { commands: [] };
    }
    
    // Request desktop features from the remote server
    const features = await new Promise((resolve, reject) => {
      const request = {
        id: `commands-${Date.now()}`,
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
    
    // Extract commands from features
    const commandsData = (features as any)?.commands || {};
    const commands = [
      ...(commandsData.projectCommands || []),
      ...(commandsData.personalCommands || [])
    ];
    
    return {
      commands,
      workspacePath: global.__currentWorkspace
    };
  } catch (error) {
    console.error('[API] /commands/list error:', error);
    return { commands: [] };
  }
});