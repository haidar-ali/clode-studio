import { promises as fs } from 'fs';
import path from 'path';
import { useEditorStore } from '~/stores/editor';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const requestPath = (query.path as string) || '';
    
    // Get workspace path from the desktop app
    let workspacePath: string;
    
    // Try to get workspace from a global store or environment
    if (global.__currentWorkspace) {
      workspacePath = global.__currentWorkspace;
    } else if (process.env.WORKSPACE_PATH) {
      workspacePath = process.env.WORKSPACE_PATH;
    } else {
      // Default to the current project for testing
      workspacePath = '/Users/alihaidar/cc-studio/clode-studio';
    }
    
    // 
    // 
    
    const fullPath = path.join(workspacePath, requestPath);
    
    // Security check - ensure we're not going outside workspace
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(workspacePath)) {
      throw new Error('Access denied: Path outside workspace');
    }
    
    // Check if path exists
    try {
      await fs.access(fullPath);
    } catch {
      throw new Error('Path does not exist');
    }
    
    // Read directory
    const files = await fs.readdir(fullPath, { withFileTypes: true });
    
    // Filter and map entries
    const entries: FileEntry[] = await Promise.all(
      files
        .filter(dirent => {
          // Filter out hidden files and common ignore patterns
          const name = dirent.name;
          return !name.startsWith('.') && 
                 name !== 'node_modules' && 
                 name !== 'dist' &&
                 name !== 'build' &&
                 name !== '.nuxt' &&
                 name !== '.output';
        })
        .map(async (dirent) => {
          const filePath = path.join(fullPath, dirent.name);
          const relativePath = path.join(requestPath, dirent.name);
          
          let stats;
          try {
            stats = await fs.stat(filePath);
          } catch {
            stats = null;
          }
          
          return {
            name: dirent.name,
            path: relativePath,
            isDirectory: dirent.isDirectory(),
            size: stats?.size,
            modified: stats?.mtime?.toISOString()
          };
        })
    );
    
    // Sort directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    return {
      entries,
      currentPath: requestPath,
      workspacePath
    };
  } catch (error) {
    console.error('[API] /files/list error:', error);
    return {
      entries: [],
      error: error.message || 'Failed to read directory'
    };
  }
});