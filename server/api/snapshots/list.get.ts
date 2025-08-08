import path from 'path';
import fs from 'fs/promises';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const branch = query.branch as string;
    const allBranches = query.allBranches === 'true';
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { 
        success: false, 
        error: 'No workspace selected',
        data: []
      };
    }

    // Get snapshots directory
    const snapshotsDir = path.join(workspacePath, '.claude', 'snapshots');
    
    // Check if snapshots directory exists
    try {
      await fs.access(snapshotsDir);
    } catch {
      // Directory doesn't exist, return empty array
      return { success: true, data: [] };
    }

    // Read all snapshot files
    const files = await fs.readdir(snapshotsDir);
    const snapshots = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(snapshotsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const snapshot = JSON.parse(content);
        
        // Filter by branch if specified
        if (!allBranches && branch && snapshot.gitBranch !== branch) {
          continue;
        }
        
        snapshots.push(snapshot);
      } catch (error) {
        console.error(`Failed to read snapshot ${file}:`, error);
      }
    }

    // Sort by timestamp (newest first)
    snapshots.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return { 
      success: true, 
      data: snapshots 
    };
  } catch (error) {
    console.error('[API] /snapshots/list error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to list snapshots',
      data: []
    };
  }
});