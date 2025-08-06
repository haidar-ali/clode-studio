import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { message } = body;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    if (!message || !message.trim()) {
      return { success: false, error: 'Commit message is required' };
    }

    // Escape commit message for shell
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    
    // Create commit
    const { stdout, stderr } = await execAsync(
      `git commit -m "${escapedMessage}"`,
      { cwd: workspacePath }
    );

    return { 
      success: true,
      output: stdout || stderr 
    };
  } catch (error) {
    console.error('[API] /git/commit error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to create commit' 
    };
  }
});