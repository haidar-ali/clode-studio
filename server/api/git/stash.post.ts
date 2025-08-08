import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { message, action = 'save' } = body;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    let command;
    switch (action) {
      case 'save':
        command = message 
          ? `git stash save "${message.replace(/"/g, '\\"')}"`
          : 'git stash';
        break;
      case 'pop':
        command = 'git stash pop';
        break;
      case 'list':
        command = 'git stash list';
        break;
      default:
        return { success: false, error: 'Invalid stash action' };
    }

    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });

    // For list action, parse the output
    if (action === 'list') {
      const stashes = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/^(stash@\{(\d+)\}): (.+)$/);
          if (match) {
            return {
              id: match[1],
              index: parseInt(match[2]),
              message: match[3]
            };
          }
          return null;
        })
        .filter(Boolean);
      
      return { success: true, data: stashes };
    }

    return { 
      success: true,
      output: stdout || stderr 
    };
  } catch (error) {
    console.error('[API] /git/stash error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to perform stash operation' 
    };
  }
});