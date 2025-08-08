export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { workspacePath } = body;
  
  if (!workspacePath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Workspace path is required'
    });
  }
  
  // Store workspace path in global variable
  global.__currentWorkspace = workspacePath;
  
  // console.log('[API] Workspace set to:', workspacePath);
  
  return {
    success: true,
    workspace: workspacePath
  };
});