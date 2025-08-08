import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Initialize git repository
    const { stdout, stderr } = await execAsync('git init', { cwd: workspacePath });

    return { 
      success: true,
      output: stdout || stderr 
    };
  } catch (error) {
    console.error('[API] /git/init error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to initialize repository' 
    };
  }
});