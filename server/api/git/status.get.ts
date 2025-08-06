import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { 
        success: false,
        isRepo: false,
        error: 'No workspace selected' 
      };
    }

    // Check if it's a git repository
    try {
      await execAsync('git rev-parse --git-dir', { cwd: workspacePath });
    } catch {
      return { 
        success: false,
        isRepo: false,
        error: 'Not a git repository' 
      };
    }

    // Get git status
    const { stdout: statusOutput } = await execAsync('git status --porcelain=v1 -b', { 
      cwd: workspacePath 
    });

    // Parse status output
    const lines = statusOutput.split('\n').filter(line => line.trim());
    const status = {
      current: '',
      tracking: null as string | null,
      ahead: 0,
      behind: 0,
      staged: [] as any[],
      modified: [] as any[],
      deleted: [] as any[],
      renamed: [] as any[],
      untracked: [] as any[]
    };

    // Parse branch info from first line
    if (lines.length > 0 && lines[0].startsWith('##')) {
      const branchLine = lines[0].substring(3);
      const parts = branchLine.split('...');
      status.current = parts[0];
      
      if (parts.length > 1) {
        const trackingParts = parts[1].split(' ');
        status.tracking = trackingParts[0];
        
        // Parse ahead/behind
        const aheadMatch = parts[1].match(/ahead (\d+)/);
        const behindMatch = parts[1].match(/behind (\d+)/);
        
        if (aheadMatch) status.ahead = parseInt(aheadMatch[1]);
        if (behindMatch) status.behind = parseInt(behindMatch[1]);
      }
    }

    // Parse file changes
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);
      
      // Handle renamed files
      if (statusCode[0] === 'R' || statusCode[1] === 'R') {
        const parts = filePath.split(' -> ');
        const file = {
          path: parts[1] || filePath,
          oldPath: parts[0],
          status: 'renamed'
        };
        
        if (statusCode[0] === 'R') {
          status.staged.push(file);
        } else {
          status.renamed.push(file);
        }
        continue;
      }
      
      // Staged changes (first character)
      if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
        const file = { path: filePath, status: getStatusType(statusCode[0]) };
        status.staged.push(file);
      }
      
      // Unstaged changes (second character)
      if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
        const fileStatus = getStatusType(statusCode[1]);
        const file = { path: filePath, status: fileStatus };
        
        switch (fileStatus) {
          case 'modified':
            status.modified.push(file);
            break;
          case 'deleted':
            status.deleted.push(file);
            break;
          case 'added':
            status.modified.push(file);
            break;
        }
      }
      
      // Untracked files
      if (statusCode === '??') {
        status.untracked.push({ path: filePath, status: 'untracked' });
      }
    }

    // Get last commit
    let lastCommit = null;
    try {
      const { stdout: logOutput } = await execAsync(
        'git log -1 --pretty=format:"%H|%ai|%s|%an|%ae"',
        { cwd: workspacePath }
      );
      
      if (logOutput) {
        const parts = logOutput.split('|');
        lastCommit = {
          hash: parts[0],
          date: parts[1],
          message: parts[2],
          author_name: parts[3],
          author_email: parts[4]
        };
      }
    } catch {
      // No commits yet
    }

    return {
      success: true,
      isRepo: true,
      data: {
        ...status,
        lastCommit
      }
    };
  } catch (error) {
    console.error('[API] /git/status error:', error);
    return { 
      success: false,
      error: error.message || 'Failed to get git status' 
    };
  }
});

function getStatusType(code: string): string {
  switch (code) {
    case 'M': return 'modified';
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    case 'U': return 'unmerged';
    default: return 'modified';
  }
}