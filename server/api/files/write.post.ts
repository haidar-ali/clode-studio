import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { path: filePath, content } = body;
    
    if (!filePath) {
      throw new Error('File path is required');
    }
    
    if (content === undefined) {
      throw new Error('File content is required');
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
    
    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
    
    // console.log('[API] File written:', filePath);
    
    return {
      success: true,
      path: filePath,
      size: Buffer.byteLength(content, 'utf-8')
    };
  } catch (error) {
    console.error('[API] /files/write error:', error);
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to write file'
    });
  }
});