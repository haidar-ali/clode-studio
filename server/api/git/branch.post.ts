import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { action, name, newName } = body;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    let command;
    switch (action) {
      case 'create':
        if (!name) {
          return { success: false, error: 'Branch name is required' };
        }
        command = `git branch ${name}`;
        break;
      case 'checkout':
        if (!name) {
          return { success: false, error: 'Branch name is required' };
        }
        command = `git checkout ${name}`;
        break;
      case 'delete':
        if (!name) {
          return { success: false, error: 'Branch name is required' };
        }
        command = `git branch -d ${name}`;
        break;
      case 'rename':
        if (!name || !newName) {
          return { success: false, error: 'Both current and new branch names are required' };
        }
        command = `git branch -m ${name} ${newName}`;
        break;
      default:
        return { success: false, error: 'Invalid branch action' };
    }

    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });

    return { 
      success: true,
      output: stdout || stderr 
    };
  } catch (error) {
    console.error('[API] /git/branch error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to perform branch operation' 
    };
  }
});