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
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        throw new Error('Path is a directory, not a file');
      }
    } catch (error) {
      throw new Error('File does not exist');
    }
    
    // Read file content
    const content = await fs.readFile(fullPath, 'utf-8');
    
    return {
      content,
      path: filePath,
      encoding: 'utf-8'
    };
  } catch (error) {
    console.error('[API] /files/read error:', error);
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to read file'
    });
  }
});