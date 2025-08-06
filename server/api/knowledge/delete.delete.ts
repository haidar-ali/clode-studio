import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const id = query.id as string;
    
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Entry ID is required'
      });
    }
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No workspace selected'
      });
    }

    const filePath = path.join(workspacePath, '.claude', 'knowledge', `${id}.md`);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw createError({
        statusCode: 404,
        statusMessage: 'Knowledge entry not found'
      });
    }
    
    // Delete the file
    await fs.unlink(filePath);
    
    return { success: true, id };
  } catch (error) {
    console.error('[API] /knowledge/delete error:', error);
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to delete knowledge entry'
    });
  }
});