export default defineNitroPlugin((nitroApp) => {
  // Set workspace from environment variable if in headless mode
  if (process.env.CLODE_MODE === 'headless' && process.env.CLODE_WORKSPACE_PATH) {
    (global as any).__currentWorkspace = process.env.CLODE_WORKSPACE_PATH;
    
  }
});