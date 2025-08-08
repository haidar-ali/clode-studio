import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const { file, staged } = query;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Get diff
    let command;
    if (staged === 'true') {
      command = file ? `git diff --cached "${file}"` : 'git diff --cached';
    } else {
      command = file ? `git diff "${file}"` : 'git diff';
    }

    const { stdout } = await execAsync(command, { cwd: workspacePath });

    return { 
      success: true,
      data: stdout 
    };
  } catch (error) {
    console.error('[API] /git/diff error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to get diff',
      data: null
    };
  }
});