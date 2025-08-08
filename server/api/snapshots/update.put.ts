import path from 'path';
import fs from 'fs/promises';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { snapshot } = body;
    
    if (!snapshot || !snapshot.id) {
      return { success: false, error: 'Snapshot data with ID is required' };
    }
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Get snapshots directory
    const snapshotsDir = path.join(workspacePath, '.claude', 'snapshots');
    const filePath = path.join(snapshotsDir, `${snapshot.id}.json`);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return { success: false, error: 'Snapshot not found' };
    }
    
    // Update snapshot file
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return { 
      success: true,
      data: snapshot
    };
  } catch (error) {
    console.error('[API] /snapshots/update error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to update snapshot'
    };
  }
});