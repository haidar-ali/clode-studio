import path from 'path';
import fs from 'fs/promises';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const snapshotId = query.id as string;
    
    if (!snapshotId) {
      return { success: false, error: 'Snapshot ID is required' };
    }
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Get snapshots directory
    const snapshotsDir = path.join(workspacePath, '.claude', 'snapshots');
    const filePath = path.join(snapshotsDir, `${snapshotId}.json`);
    
    // Delete the snapshot file
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, consider it success
        return { success: true };
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('[API] /snapshots/delete error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to delete snapshot'
    };
  }
});