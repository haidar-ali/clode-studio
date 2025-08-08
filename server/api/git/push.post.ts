import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { remote = 'origin', branch } = body;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Push to remote
    const command = branch 
      ? `git push ${remote} ${branch}`
      : `git push ${remote}`;
    
    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });

    return { 
      success: true,
      output: stdout || stderr 
    };
  } catch (error) {
    console.error('[API] /git/push error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to push to remote' 
    };
  }
});