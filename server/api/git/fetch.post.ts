import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Fetch from remote
    const { stdout, stderr } = await execAsync('git fetch --all', { cwd: workspacePath });

    return { 
      success: true,
      output: stdout || stderr 
    };
  } catch (error) {
    console.error('[API] /git/fetch error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to fetch from remote' 
    };
  }
});