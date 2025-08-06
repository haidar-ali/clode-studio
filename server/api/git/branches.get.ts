import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Get all branches
    const { stdout: branchOutput } = await execAsync(
      'git branch -a --format="%(refname:short)|%(HEAD)|%(objectname)"',
      { cwd: workspacePath }
    );

    const branches = [];
    const lines = branchOutput.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const [name, isCurrent, commit] = line.split('|');
      if (name) {
        branches.push({
          name: name.trim(),
          current: isCurrent === '*',
          commit: commit?.trim() || '',
          label: name.includes('remotes/') ? 'remote' : 'local'
        });
      }
    }

    // Get remotes
    const remotes = [];
    try {
      const { stdout: remoteOutput } = await execAsync('git remote -v', { 
        cwd: workspacePath 
      });
      
      const remoteLines = remoteOutput.split('\n').filter(line => line.trim());
      const remoteMap = new Map();
      
      for (const line of remoteLines) {
        const [name, url] = line.split(/\s+/);
        if (name && url && !remoteMap.has(name)) {
          remoteMap.set(name, { name, url: url.replace(/\s+\(.*\)$/, '') });
        }
      }
      
      remotes.push(...remoteMap.values());
    } catch {
      // No remotes configured
    }

    return {
      success: true,
      data: {
        branches,
        remotes
      }
    };
  } catch (error) {
    console.error('[API] /git/branches error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to get branches' 
    };
  }
});