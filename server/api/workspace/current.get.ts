export default defineEventHandler(async (event) => {
  // Get workspace info from the global variable set by the desktop app
  try {
    const workspacePath = global.__currentWorkspace || null;
    const workspaceName = workspacePath ? workspacePath.split('/').pop() : null;
    
    // 
    
    return {
      path: workspacePath,
      name: workspaceName,
      type: 'normal'
    };
  } catch (error) {
    console.error('[API] Failed to get workspace:', error);
    return {
      path: null,
      name: null,
      type: 'normal',
      error: error.message
    };
  }
});