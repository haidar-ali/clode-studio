import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const dirPath = (query.path as string);
    
    if (!dirPath) {
      throw new Error('Directory path is required');
    }
    
    // Get workspace path
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      throw new Error('No workspace selected');
    }
    
    const fullPath = path.join(workspacePath, dirPath);
    
    // Debug logging
    
    
    
    
    // Security check - ensure we're not going outside workspace
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(workspacePath)) {
      throw new Error('Access denied: Path outside workspace');
    }
    
    try {
      // Ensure directory exists
      await fs.access(fullPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      const files = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        path: path.join(dirPath, entry.name)
      }));
      
      return { success: true, files };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist - create it and return empty
        await fs.mkdir(fullPath, { recursive: true });
        return { success: true, files: [] };
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[API] /files/readdir error:', error);
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to read directory'
    });
  }
});