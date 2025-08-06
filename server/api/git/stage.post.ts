import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { files } = body;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'No files specified' };
    }

    // Stage files - properly escape file names
    // Remove any surrounding quotes first, then escape for shell
    const filePaths = files.map(f => {
      // Remove surrounding quotes if present
      const cleanPath = f.replace(/^["']|["']$/g, '');
      // Escape special characters for shell
      return `"${cleanPath.replace(/"/g, '\\"')}"`;
    }).join(' ');
    
    await execAsync(`git add ${filePaths}`, { cwd: workspacePath });

    return { success: true };
  } catch (error) {
    console.error('[API] /git/stage error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to stage files' 
    };
  }
});