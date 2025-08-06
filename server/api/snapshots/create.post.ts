import path from 'path';
import fs from 'fs/promises';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { snapshot } = body;
    
    if (!snapshot) {
      return { success: false, error: 'Snapshot data is required' };
    }
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Get snapshots directory
    const snapshotsDir = path.join(workspacePath, '.claude', 'snapshots');
    
    // Create directory if it doesn't exist
    await fs.mkdir(snapshotsDir, { recursive: true });
    
    // Save snapshot file
    const fileName = `${snapshot.id}.json`;
    const filePath = path.join(snapshotsDir, fileName);
    
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return { 
      success: true,
      data: snapshot
    };
  } catch (error) {
    console.error('[API] /snapshots/create error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to create snapshot'
    };
  }
});