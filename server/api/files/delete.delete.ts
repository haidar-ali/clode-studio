import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const filePath = (query.path as string);
    
    if (!filePath) {
      throw new Error('File path is required');
    }
    
    // Get workspace path
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      throw new Error('No workspace selected');
    }
    
    const fullPath = path.join(workspacePath, filePath);
    
    // Security check - ensure we're not going outside workspace
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(workspacePath)) {
      throw new Error('Access denied: Path outside workspace');
    }
    
    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      throw new Error('File does not exist');
    }
    
    // Delete the file
    await fs.unlink(fullPath);
    
    return { success: true };
  } catch (error: any) {
    console.error('[API] /files/delete error:', error);
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to delete file'
    });
  }
});