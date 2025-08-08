import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const filePath = (query.path as string);
    
    if (!filePath) {
      throw new Error('File path is required');
    }
    
    // For worktree files, we allow absolute paths
    // but ensure they're within reasonable bounds
    const normalizedPath = path.normalize(filePath);
    
    // Basic security check - don't allow accessing system files
    if (normalizedPath.includes('..') || 
        normalizedPath.startsWith('/etc/') || 
        normalizedPath.startsWith('/bin/') ||
        normalizedPath.startsWith('/usr/bin/') ||
        normalizedPath.startsWith('/System/')) {
      throw new Error('Access denied: Invalid path');
    }
    
    // Check if file exists
    try {
      const stats = await fs.stat(normalizedPath);
      if (stats.isDirectory()) {
        throw new Error('Path is a directory, not a file');
      }
    } catch (error) {
      throw new Error('File does not exist');
    }
    
    // Read file content
    const content = await fs.readFile(normalizedPath, 'utf-8');
    
    return {
      content,
      path: filePath,
      encoding: 'utf-8'
    };
  } catch (error) {
    console.error('[API] /worktree/files/read error:', error);
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to read file'
    });
  }
});