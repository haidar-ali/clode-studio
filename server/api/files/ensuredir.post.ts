import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { path: dirPath } = body;
    
    if (!dirPath) {
      throw new Error('Directory path is required');
    }
    
    // Get workspace path
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      throw new Error('No workspace selected');
    }
    
    const fullPath = path.join(workspacePath, dirPath);
    
    // Security check - ensure we're not going outside workspace
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(workspacePath)) {
      throw new Error('Access denied: Path outside workspace');
    }
    
    await fs.mkdir(fullPath, { recursive: true });
    
    return { success: true };
  } catch (error: any) {
    console.error('[API] /files/ensuredir error:', error);
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to create directory'
    });
  }
});