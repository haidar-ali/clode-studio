import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { files: [] };
    }

    const recentFiles: any[] = [];
    const maxFiles = 20;

    async function findRecentFiles(dir: string): Promise<void> {
      if (recentFiles.length >= maxFiles) return;
      
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          if (recentFiles.length >= maxFiles) break;
          
          // Skip node_modules and hidden directories
          if (item.name.startsWith('.') || item.name === 'node_modules') continue;
          
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            await findRecentFiles(fullPath);
          } else if (item.isFile()) {
            // Skip non-code files
            const ext = path.extname(item.name).toLowerCase();
            if (!isCodeFile(ext)) continue;
            
            try {
              const stats = await fs.stat(fullPath);
              const relativePath = path.relative(workspacePath, fullPath);
              
              recentFiles.push({
                path: relativePath,
                name: item.name,
                size: stats.size,
                language: getLanguageFromExtension(ext),
                lastModified: stats.mtime,
                isDirectory: false
              });
            } catch (e) {
              // Ignore stat errors
            }
          }
        }
      } catch (error) {
        // Ignore errors for individual directories
      }
    }

    await findRecentFiles(workspacePath);
    
    // Sort by last modified date
    recentFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return { files: recentFiles.slice(0, 10) };
  } catch (error) {
    console.error('[API] /context/recent-files error:', error);
    return { files: [] };
  }
});

function isCodeFile(ext: string): boolean {
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs',
    '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.vue', '.html',
    '.css', '.scss', '.sass', '.less', '.json', '.xml', '.yaml', '.yml',
    '.md', '.sql', '.sh', '.bash'
  ];
  return codeExtensions.includes(ext);
}

function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.py': 'Python',
    '.java': 'Java',
    '.c': 'C',
    '.cpp': 'C++',
    '.cs': 'C#',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.vue': 'Vue',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.sass': 'Sass',
    '.less': 'Less',
    '.json': 'JSON',
    '.xml': 'XML',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.sh': 'Shell',
    '.bash': 'Bash'
  };
  
  return languageMap[ext] || 'Unknown';
}