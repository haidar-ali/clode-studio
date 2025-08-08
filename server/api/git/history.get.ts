import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const limit = parseInt(query.limit as string) || 50;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { success: false, error: 'No workspace selected' };
    }

    // Get commit history
    const { stdout: logOutput } = await execAsync(
      `git log -${limit} --pretty=format:"%H|%ai|%s|%an|%ae"`,
      { cwd: workspacePath }
    );

    const commits = [];
    const lines = logOutput.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          date: parts[1],
          message: parts[2],
          author_name: parts[3],
          author_email: parts[4]
        });
      }
    }

    return {
      success: true,
      data: commits
    };
  } catch (error) {
    console.error('[API] /git/history error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to get commit history',
      data: [] // Return empty array on error
    };
  }
});